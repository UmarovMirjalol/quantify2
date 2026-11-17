"""Multi-asset portfolio backtesting: shared-cash book or legacy equal sleeves."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

import numpy as np
import pandas as pd

from app.backtesting.engine import BacktestEngine
from app.backtesting.orders import Order, OrderSide, OrderType, resolve_pending_fill
from app.backtesting.portfolio import EquityPoint
from app.backtesting.positions import Position, PositionSide, TradeRecord
from app.llm.schemas import StrategySpec
from app.metrics.performance import compute_performance_metrics
from app.research.risk_stats import portfolio_risk_report
from app.risk.risk_engine import RiskEngine, round_quantity
from app.strategies.interpreter import generate_signals
from app.strategies.sandbox import SandboxError, run_custom


CapitalMode = Literal["shared", "sleeves"]


@dataclass
class _AssetState:
    name: str
    dates: list[datetime]
    opens: np.ndarray
    highs: np.ndarray
    lows: np.ndarray
    closes: np.ndarray
    entry_flags: np.ndarray
    exit_flags: np.ndarray
    by_date: dict[pd.Timestamp, int]
    position: Position = field(default_factory=Position)
    pending: Order | None = None
    entry_reason: str = ""
    sleeve_start: float = 0.0
    peak_equity: float = 0.0
    last_equity: float = 0.0


class PortfolioBacktestEngine:
    """Simulates one strategy across a basket of assets.

    ``capital_mode="shared"`` (default): one cash pool; signals compete for capital.
    ``capital_mode="sleeves"``: legacy equal-capital independent sleeves.
    """

    def __init__(
        self,
        strategy: StrategySpec,
        initial_capital: float = 100_000.0,
        *,
        capital_mode: CapitalMode = "shared",
        max_positions: int | None = None,
    ):
        self.strategy = strategy
        self.initial_capital = float(initial_capital)
        self.capital_mode = capital_mode
        self.max_positions = max_positions
        self.short = strategy.side.value == "short" if hasattr(strategy.side, "value") else strategy.side == "short"
        self.risk = RiskEngine(strategy)

    def run(self, asset_data: dict[str, pd.DataFrame]) -> dict[str, Any]:
        if not asset_data:
            raise ValueError("No asset datasets provided for portfolio backtest")
        if self.capital_mode == "sleeves":
            out = self._run_sleeves(asset_data)
            out["capital_mode"] = "sleeves"
            return out
        out = self._run_shared(asset_data)
        out["capital_mode"] = "shared"
        return out

    # ------------------------------------------------------------------ shared
    def _run_shared(self, asset_data: dict[str, pd.DataFrame]) -> dict[str, Any]:
        names = list(asset_data.keys())
        n = len(names)
        weight = 1.0 / n
        max_pos = self.max_positions or n
        states = [self._prepare_asset(name, asset_data[name]) for name in names]
        for st in states:
            st.sleeve_start = self.initial_capital / n
            st.peak_equity = st.sleeve_start
            st.last_equity = st.sleeve_start

        calendar = sorted({d.normalize() for st in states for d in (pd.Timestamp(x) for x in st.dates)})
        cash = self.initial_capital
        trades: list[dict[str, Any]] = []
        equity_rows: list[dict[str, Any]] = []
        sleeve_equity: dict[str, list[float]] = {name: [] for name in names}
        sleeve_dates: list[pd.Timestamp] = []

        for day in calendar:
            # 1) Fills + intrabar exits for every asset that trades today
            for st in states:
                idx = st.by_date.get(day)
                if idx is None:
                    continue
                o, h, l, c = float(st.opens[idx]), float(st.highs[idx]), float(st.lows[idx]), float(st.closes[idx])
                bar_date = st.dates[idx]

                if st.pending is not None:
                    raw = resolve_pending_fill(st.pending, open_=o, high=h, low=l)
                    if raw is not None:
                        cash = self._fill(st, st.pending, raw, bar_date, idx, cash, trades)
                        st.pending = None
                    elif st.pending.order_type == OrderType.MARKET:
                        st.pending = None

                if st.position.is_open:
                    cash = self._intrabar_exits(st, o, h, l, bar_date, idx, cash, trades)

            # 2) New signals at close
            open_count = sum(1 for st in states if st.position.is_open)
            marks = self._marks(states, day)
            equity_now = cash + sum(marks.values())

            for st in states:
                idx = st.by_date.get(day)
                if idx is None or idx >= len(st.closes) - 1:
                    continue
                c = float(st.closes[idx])
                pos = st.position

                if not pos.is_open and bool(st.entry_flags[idx]) and open_count < max_pos:
                    target_notional = equity_now * weight
                    # Cap by available cash so sleeves can share idle capital.
                    budget = min(target_notional, max(0.0, cash * 0.995))
                    fill_est = self.risk.apply_slippage(c, OrderSide.SELL if self.short else OrderSide.BUY)
                    qty = round_quantity(budget / (fill_est * (1.0 + self.risk.commission))) if fill_est > 0 else 0.0
                    if qty > 0:
                        stop, take = self.risk.compute_stop_take(fill_est, short=self.short)
                        st.pending = Order(
                            side=OrderSide.SELL if self.short else OrderSide.BUY,
                            quantity=qty,
                            signal_bar_index=idx,
                            reason="entry_signal",
                            opens_position=True,
                            stop_loss_price=stop,
                            take_profit_price=take,
                            order_type=OrderType.MARKET,
                        )
                        st.entry_reason = "entry_signal"
                        open_count += 1
                elif pos.is_open and bool(st.exit_flags[idx]):
                    st.pending = Order(
                        side=OrderSide.BUY if self.short else OrderSide.SELL,
                        quantity=pos.quantity,
                        signal_bar_index=idx,
                        reason="exit_signal",
                        order_type=OrderType.MARKET,
                    )

            # 3) Mark-to-market
            marks = self._marks(states, day)
            equity = cash + sum(marks.values())
            for st in states:
                mv = marks.get(st.name, 0.0)
                # Idle capital attributed equally so sleeve contribution stays meaningful.
                idle_share = cash / n
                st.last_equity = mv + idle_share
                st.peak_equity = max(st.peak_equity or st.last_equity, st.last_equity)
                sleeve_equity[st.name].append(st.last_equity)
            sleeve_dates.append(day)
            peak = max((r["equity"] for r in equity_rows), default=self.initial_capital)
            peak = max(peak, equity)
            equity_rows.append(
                {
                    "date": day.to_pydatetime() if hasattr(day, "to_pydatetime") else day,
                    "equity": equity,
                    "cash": cash,
                    "drawdown": (equity / peak) - 1.0 if peak > 0 else 0.0,
                }
            )

        return self._pack_result(
            asset_data=asset_data,
            names=names,
            equity_rows=equity_rows,
            sleeve_equity=sleeve_equity,
            sleeve_dates=sleeve_dates,
            trades=trades,
            capital_per_asset=self.initial_capital / n,
        )

    def _prepare_asset(self, name: str, df: pd.DataFrame) -> _AssetState:
        data = df.copy().reset_index(drop=True)
        if self.strategy.is_custom:
            try:
                custom = run_custom(self.strategy.custom_code or "", data)
            except SandboxError as exc:
                raise ValueError(str(exc)) from exc
            entry = np.asarray(custom.entry, dtype=bool)
            exit_ = np.asarray(custom.exit, dtype=bool)
        else:
            e, x = generate_signals(data, self.strategy)
            entry = e.to_numpy(dtype=bool)
            exit_ = x.to_numpy(dtype=bool)
        dates = list(pd.to_datetime(data["date"]).dt.to_pydatetime())
        by_date = {pd.Timestamp(d).normalize(): i for i, d in enumerate(dates)}
        return _AssetState(
            name=name,
            dates=dates,
            opens=data["open"].to_numpy(dtype=float),
            highs=data["high"].to_numpy(dtype=float),
            lows=data["low"].to_numpy(dtype=float),
            closes=data["close"].to_numpy(dtype=float),
            entry_flags=entry,
            exit_flags=exit_,
            by_date=by_date,
        )

    def _marks(self, states: list[_AssetState], day: pd.Timestamp) -> dict[str, float]:
        out: dict[str, float] = {}
        for st in states:
            idx = st.by_date.get(day)
            if idx is None or not st.position.is_open:
                out[st.name] = 0.0
                continue
            out[st.name] = st.position.market_value(float(st.closes[idx]))
        return out

    def _fill(
        self,
        st: _AssetState,
        order: Order,
        raw: float,
        bar_date: datetime,
        bar_index: int,
        cash: float,
        trades: list[dict[str, Any]],
    ) -> float:
        fill = self.risk.apply_slippage(raw, order.side)
        commission = self.risk.commission_cost(fill, order.quantity)
        if order.opens_position:
            if st.position.is_open:
                return cash
            if self.short:
                cash = cash + fill * order.quantity - commission
                st.position.side = PositionSide.SHORT
            else:
                cost = fill * order.quantity + commission
                if cost > cash + 1e-6:
                    qty = round_quantity(order.quantity * cash / cost)
                    if qty <= 0:
                        return cash
                    order.quantity = qty
                    commission = self.risk.commission_cost(fill, qty)
                    cost = fill * qty + commission
                cash -= cost
                st.position.side = PositionSide.LONG
            stop, take = order.stop_loss_price, order.take_profit_price
            if stop is None and take is None:
                stop, take = self.risk.compute_stop_take(fill, short=self.short)
            st.position.quantity = order.quantity
            st.position.entry_price = fill
            st.position.entry_date = bar_date
            st.position.entry_bar_index = bar_index
            st.position.stop_loss_price = stop
            st.position.take_profit_price = take
            st.position.entries = 1
            st.position.best_price = fill
            return cash

        if not st.position.is_open:
            return cash
        qty = min(order.quantity, st.position.quantity)
        entry = st.position.entry_price
        if self.short or st.position.side == PositionSide.SHORT:
            cash = cash - fill * qty - commission
            pnl = (entry - fill) * qty - commission
            ret = (entry - fill) / entry if entry else 0.0
            side = "short"
        else:
            cash = cash + fill * qty - commission
            pnl = (fill - entry) * qty - commission
            ret = (fill / entry - 1.0) if entry else 0.0
            side = "long"
        bars_held = bar_index - (st.position.entry_bar_index or bar_index)
        trades.append(
            {
                "asset": st.name,
                "entry_date": (st.position.entry_date or bar_date).isoformat(),
                "exit_date": bar_date.isoformat(),
                "entry_price": entry,
                "exit_price": fill,
                "quantity": qty,
                "side": side,
                "pnl": pnl,
                "return_pct": ret,
                "commission": commission,
                "entry_reason": st.entry_reason or "entry_signal",
                "exit_reason": order.reason,
                "bars_held": bars_held,
            }
        )
        st.position.reset()
        return cash

    def _intrabar_exits(
        self,
        st: _AssetState,
        o: float,
        h: float,
        l: float,
        bar_date: datetime,
        bar_index: int,
        cash: float,
        trades: list[dict[str, Any]],
    ) -> float:
        pos = st.position
        short = pos.side == PositionSide.SHORT
        stop = pos.stop_loss_price
        take = pos.take_profit_price
        if stop is not None:
            hit = h >= stop if short else l <= stop
            if hit:
                raw = max(o, stop) if short else min(o, stop)
                order = Order(
                    side=OrderSide.BUY if short else OrderSide.SELL,
                    quantity=pos.quantity,
                    signal_bar_index=bar_index,
                    reason="stop_loss",
                )
                return self._fill(st, order, raw, bar_date, bar_index, cash, trades)
        if take is not None:
            hit = l <= take if short else h >= take
            if hit:
                raw = min(o, take) if short else max(o, take)
                order = Order(
                    side=OrderSide.BUY if short else OrderSide.SELL,
                    quantity=pos.quantity,
                    signal_bar_index=bar_index,
                    reason="take_profit",
                )
                return self._fill(st, order, raw, bar_date, bar_index, cash, trades)
        best = pos.best_price if pos.best_price is not None else pos.entry_price
        pos.best_price = min(best, l) if short else max(best, h)
        return cash

    # ----------------------------------------------------------------- sleeves
    def _run_sleeves(self, asset_data: dict[str, pd.DataFrame]) -> dict[str, Any]:
        n_assets = len(asset_data)
        capital_per_asset = self.initial_capital / n_assets
        asset_runs: dict[str, dict[str, Any]] = {}
        all_trades: list[dict[str, Any]] = []

        for asset_name, df in asset_data.items():
            sub_strat = self.strategy.model_copy(
                update={"initial_capital": capital_per_asset, "asset": asset_name}
            )
            result = BacktestEngine(sub_strat).run(df)
            asset_runs[asset_name] = result
            for t in result["trades"]:
                trade_dict = dict(t)
                trade_dict["asset"] = asset_name
                all_trades.append(trade_dict)

        equity_series_list: list[pd.DataFrame] = []
        for asset_name, res in asset_runs.items():
            eq = pd.DataFrame(res["equity_curve"])
            if not eq.empty and "date" in eq.columns and "equity" in eq.columns:
                sub = eq[["date", "equity"]].rename(columns={"equity": f"equity_{asset_name}"})
                sub["date"] = pd.to_datetime(sub["date"])
                equity_series_list.append(sub)

        if not equity_series_list:
            raise ValueError("Could not extract equity curves from backtest results")

        merged = equity_series_list[0]
        for other in equity_series_list[1:]:
            merged = pd.merge(merged, other, on="date", how="outer")
        merged = merged.sort_values("date").reset_index(drop=True)
        eq_cols = [c for c in merged.columns if c.startswith("equity_")]
        merged[eq_cols] = merged[eq_cols].ffill().bfill()
        merged["portfolio_equity"] = merged[eq_cols].sum(axis=1)
        peak = merged["portfolio_equity"].cummax()
        merged["drawdown"] = ((merged["portfolio_equity"] - peak) / peak.replace(0, np.nan)).fillna(0.0)

        sleeve_equity = {
            c.removeprefix("equity_"): merged[c].astype(float).tolist() for c in eq_cols
        }
        equity_rows = [
            {
                "date": pd.to_datetime(row["date"]).to_pydatetime(),
                "equity": float(row["portfolio_equity"]),
                "cash": float(row["portfolio_equity"]),
                "drawdown": float(row["drawdown"]),
            }
            for _, row in merged.iterrows()
        ]
        names = [c.removeprefix("equity_") for c in eq_cols]
        return self._pack_result(
            asset_data=asset_data,
            names=names,
            equity_rows=equity_rows,
            sleeve_equity=sleeve_equity,
            sleeve_dates=[pd.Timestamp(d["date"]) for d in equity_rows],
            trades=all_trades,
            capital_per_asset=capital_per_asset,
            asset_runs=asset_runs,
        )

    def _pack_result(
        self,
        *,
        asset_data: dict[str, pd.DataFrame],
        names: list[str],
        equity_rows: list[dict[str, Any]],
        sleeve_equity: dict[str, list[float]],
        sleeve_dates: list[pd.Timestamp],
        trades: list[dict[str, Any]],
        capital_per_asset: float,
        asset_runs: dict[str, dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        trade_records = [
            TradeRecord(
                entry_date=pd.to_datetime(t["entry_date"]).to_pydatetime(),
                exit_date=pd.to_datetime(t["exit_date"]).to_pydatetime(),
                entry_price=float(t["entry_price"]),
                exit_price=float(t["exit_price"]),
                quantity=float(t["quantity"]),
                side=str(t["side"]),
                pnl=float(t["pnl"]),
                return_pct=float(t["return_pct"]),
                commission=float(t["commission"]),
                entry_reason=str(t.get("entry_reason", "")),
                exit_reason=str(t.get("exit_reason", "")),
                bars_held=int(t.get("bars_held", 0)),
            )
            for t in trades
        ]
        equity_points = [
            EquityPoint(
                date=row["date"],
                equity=float(row["equity"]),
                cash=float(row.get("cash", row["equity"])),
                market_value=0.0,
                unrealized_pnl=0.0,
                realized_pnl=0.0,
            )
            for row in equity_rows
        ]
        metrics = compute_performance_metrics(
            equity_curve=equity_points,
            trades=trade_records,
            initial_capital=self.initial_capital,
        )
        # Recompute drawdown cleanly from the series.
        peak = self.initial_capital
        equity_curve_out = []
        for row in equity_rows:
            peak = max(peak, float(row["equity"]))
            dd = (float(row["equity"]) / peak) - 1.0 if peak > 0 else 0.0
            equity_curve_out.append(
                {
                    "date": pd.Timestamp(row["date"]).isoformat(),
                    "equity": round(float(row["equity"]), 2),
                    "cash": round(float(row.get("cash", row["equity"])), 2),
                    "drawdown": round(dd, 4),
                }
            )

        frame = pd.DataFrame({"date": sleeve_dates})
        for name in names:
            frame[f"equity_{name}"] = sleeve_equity[name]
        eq_cols = [f"equity_{n}" for n in names]
        sleeve_returns = frame[eq_cols].pct_change().iloc[1:] if len(frame) > 1 else frame[eq_cols]
        corr = sleeve_returns.corr().fillna(0.0).to_numpy() if len(names) > 1 else np.ones((1, 1))
        off_diag = corr[~np.eye(len(names), dtype=bool)] if len(names) > 1 else np.array([])
        sleeve_vol = sleeve_returns.std().to_numpy() if len(sleeve_returns) else np.zeros(len(names))
        port_vol = float(pd.Series([r["equity"] for r in equity_rows]).pct_change().iloc[1:].std() or 0.0)
        weights = np.full(len(names), 1.0 / len(names))
        div_ratio = float(weights @ np.nan_to_num(sleeve_vol)) / port_vol if port_vol > 0 else None

        per_asset_summary = {}
        for name in names:
            series = sleeve_equity[name]
            final = float(series[-1]) if series else capital_per_asset
            start = capital_per_asset
            pnl = final - start
            if asset_runs and name in asset_runs:
                m = asset_runs[name]["metrics"]
                per_asset_summary[name] = {
                    "total_return": m.get("total_return"),
                    "sharpe_ratio": m.get("sharpe_ratio"),
                    "max_drawdown": m.get("max_drawdown"),
                    "trades_count": len(asset_runs[name]["trades"]),
                    "final_equity": round(final, 2),
                    "pnl": round(pnl, 2),
                    "contribution": round(pnl / self.initial_capital, 4),
                    "buy_hold_return": _buy_hold_return(asset_data[name]),
                }
            else:
                asset_trades = [t for t in trades if t.get("asset") == name]
                total_ret = (final / start - 1.0) if start else None
                per_asset_summary[name] = {
                    "total_return": None if total_ret is None else round(total_ret, 6),
                    "sharpe_ratio": None,
                    "max_drawdown": None,
                    "trades_count": len(asset_trades),
                    "final_equity": round(final, 2),
                    "pnl": round(pnl, 2),
                    "contribution": round(pnl / self.initial_capital, 4),
                    "buy_hold_return": _buy_hold_return(asset_data[name]),
                }

        dates = pd.Series(sleeve_dates)
        benchmark = self._benchmark(asset_data, dates, capital_per_asset)

        return {
            "portfolio_metrics": metrics,
            "portfolio_equity_curve": equity_curve_out,
            "benchmark_equity_curve": benchmark,
            "asset_results": per_asset_summary,
            "correlation": {
                "assets": names,
                "matrix": [[round(float(v), 3) for v in row] for row in corr],
                "average": round(float(off_diag.mean()), 3) if off_diag.size else None,
            },
            "diversification_ratio": None if div_ratio is None else round(div_ratio, 3),
            "risk": portfolio_risk_report(equity_curve_out),
            "trades": sorted(trades, key=lambda x: str(x.get("entry_date", ""))),
        }

    @staticmethod
    def _benchmark(
        asset_data: dict[str, pd.DataFrame], dates: pd.Series, capital_per_asset: float
    ) -> list[dict[str, Any]]:
        frame = pd.DataFrame({"date": pd.to_datetime(dates)})
        cols = []
        for name, df in asset_data.items():
            px = df[["date", "close"]].copy()
            px["date"] = pd.to_datetime(px["date"])
            first = float(px["close"].iloc[0]) or 1.0
            px[f"bh_{name}"] = capital_per_asset * px["close"] / first
            frame = frame.merge(px[["date", f"bh_{name}"]], on="date", how="left")
            cols.append(f"bh_{name}")
        frame[cols] = frame[cols].ffill().fillna(capital_per_asset)
        total = frame[cols].sum(axis=1)
        return [
            {"date": d.isoformat(), "equity": round(float(v), 2)}
            for d, v in zip(frame["date"], total)
        ]


def _buy_hold_return(df: pd.DataFrame) -> float | None:
    if df.empty:
        return None
    first = float(df["close"].iloc[0])
    return round(float(df["close"].iloc[-1]) / first - 1.0, 4) if first else None
