"""
Custom event-driven backtesting engine.

Execution convention (documented):
    - Indicators and signals are computed using data available at the close of bar t.
    - A signal observed at the close of bar t is executed at the open of bar t+1.
    - This prevents look-ahead bias: we never trade on information that was not
      yet available at the decision time.
    - Stop-loss / take-profit are checked intrabar on the execution bar using
      high/low, with a conservative assumption when both are touched.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

import pandas as pd

from app.backtesting.orders import Order, OrderSide
from app.backtesting.portfolio import Portfolio
from app.backtesting.positions import PositionSide, TradeRecord
from app.llm.schemas import Side, StrategySpec
from app.metrics.monte_carlo import run_monte_carlo_simulation
from app.research.market import market_exposure
from app.research.regimes import classify_regimes
from app.metrics.performance import compute_performance_metrics
from app.risk.risk_engine import RiskEngine
from app.strategies.interpreter import generate_signals, validate_strategy_spec
from app.strategies.sandbox import CustomSignals, SandboxError, run_custom


class BacktestError(Exception):
    """Raised when a backtest cannot be run."""


class BacktestEngine:
    """Bar-by-bar backtesting engine for one long or one short position at a time."""

    def __init__(self, strategy: StrategySpec):
        errors = validate_strategy_spec(strategy)
        if errors:
            raise BacktestError("Invalid strategy: " + "; ".join(errors))
        self.strategy = strategy
        self.short = strategy.side == Side.SHORT
        self.risk_engine = RiskEngine(strategy)

    def run(self, data: pd.DataFrame, signals: CustomSignals | None = None) -> dict[str, Any]:
        """``signals`` lets callers pass precomputed Python-strategy output (batched or checked)."""
        if data is None or len(data) < 5:
            raise BacktestError("Dataset too short for backtesting (need at least 5 bars)")

        df = data.copy().reset_index(drop=True)
        required = {"date", "open", "high", "low", "close", "volume"}
        if not required.issubset(set(df.columns)):
            raise BacktestError(f"Data missing columns: {required - set(df.columns)}")

        sizes = None
        if self.strategy.is_custom:
            try:
                custom = signals or run_custom(self.strategy.custom_code or "", df)
            except SandboxError as exc:
                raise BacktestError(str(exc)) from exc
            entry_flags, exit_flags, sizes = custom.entry, custom.exit, custom.size
        else:
            entry_signals, exit_signals = generate_signals(df, self.strategy)
            entry_flags = entry_signals.to_numpy(dtype=bool)
            exit_flags = exit_signals.to_numpy(dtype=bool)
        portfolio = Portfolio(initial_capital=self.strategy.initial_capital)

        pending_order: Order | None = None
        entry_reason = ""
        markers: list[dict[str, Any]] = []

        n = len(df)
        dates = list(pd.to_datetime(df["date"]).dt.to_pydatetime())
        opens = df["open"].to_numpy(dtype=float)
        highs = df["high"].to_numpy(dtype=float)
        lows = df["low"].to_numpy(dtype=float)
        closes = df["close"].to_numpy(dtype=float)
        for i in range(n):
            bar_date = dates[i]
            o, h, l, c = float(opens[i]), float(highs[i]), float(lows[i]), float(closes[i])

            # 1) Execute pending order from previous bar's signal at today's open
            if pending_order is not None:
                self._execute_order(
                    portfolio,
                    pending_order,
                    fill_price_raw=o,
                    fill_bar_index=i,
                    fill_date=bar_date,
                    markers=markers,
                    entry_reason_ref={"value": entry_reason},
                )
                pending_order = None

            # 2) Intrabar stop / take-profit (checked after open execution)
            if portfolio.position.is_open:
                st_order = self.risk_engine.check_stop_take(portfolio, h, l, o)
                if st_order is not None:
                    # Execute immediately at stop/take price (or open if gapped)
                    fill_px = o
                    short = portfolio.position.side == PositionSide.SHORT
                    worse, better = (max, min) if short else (min, max)
                    if st_order.reason == "stop_loss" and portfolio.position.stop_loss_price:
                        fill_px = worse(o, portfolio.position.stop_loss_price)
                    elif st_order.reason == "take_profit" and portfolio.position.take_profit_price:
                        fill_px = better(o, portfolio.position.take_profit_price)
                    st_order.signal_bar_index = i
                    self._execute_order(
                        portfolio,
                        st_order,
                        fill_price_raw=fill_px,
                        fill_bar_index=i,
                        fill_date=bar_date,
                        markers=markers,
                        entry_reason_ref={"value": entry_reason},
                    )

            # 3) Generate new signal at close — queue for next bar open
            if i < n - 1:  # cannot execute after last bar
                fraction = float(sizes[i]) if sizes is not None else None
                if not portfolio.position.is_open and entry_flags[i] and fraction != 0.0:
                    decision = self.risk_engine.size_entry(
                        portfolio, c, short=self.short, fraction=fraction
                    )
                    if decision.allowed:
                        pending_order = Order(
                            side=OrderSide.SELL if self.short else OrderSide.BUY,
                            quantity=decision.quantity,
                            signal_bar_index=i,
                            reason="entry_signal",
                            opens_position=True,
                        )
                        # Stash stop/take on order via temporary attributes
                        pending_order.stop_loss_price = decision.stop_loss_price  # type: ignore[attr-defined]
                        pending_order.take_profit_price = decision.take_profit_price  # type: ignore[attr-defined]
                        entry_reason = "entry_signal"
                elif portfolio.position.is_open and exit_flags[i]:
                    pending_order = Order(
                        side=OrderSide.BUY if self.short else OrderSide.SELL,
                        quantity=portfolio.position.quantity,
                        signal_bar_index=i,
                        reason="exit_signal",
                    )

            # 4) Mark-to-market at close
            portfolio.record_equity(bar_date, c)

        metrics = compute_performance_metrics(
            equity_curve=portfolio.equity_curve,
            trades=portfolio.trades,
            initial_capital=self.strategy.initial_capital,
        )

        price_series = [
            {
                "date": pd.Timestamp(dates[i]).isoformat(),
                "open": float(opens[i]),
                "high": float(highs[i]),
                "low": float(lows[i]),
                "close": float(closes[i]),
            }
            for i in range(n)
        ]

        equity_series = [
            {
                "date": pt.date.isoformat(),
                "equity": pt.equity,
                "cash": pt.cash,
                "drawdown": None,  # filled below
            }
            for pt in portfolio.equity_curve
        ]

        # Attach drawdown series
        peak = self.strategy.initial_capital
        for pt in equity_series:
            peak = max(peak, pt["equity"])
            dd = (pt["equity"] / peak) - 1.0 if peak > 0 else 0.0
            pt["drawdown"] = dd

        trades_out = [
            {
                "entry_date": t.entry_date.isoformat(),
                "exit_date": t.exit_date.isoformat(),
                "entry_price": t.entry_price,
                "exit_price": t.exit_price,
                "quantity": t.quantity,
                "side": t.side,
                "pnl": t.pnl,
                "return_pct": t.return_pct,
                "commission": t.commission,
                "entry_reason": t.entry_reason,
                "exit_reason": t.exit_reason,
                "bars_held": t.bars_held,
            }
            for t in portfolio.trades
        ]

        monte_carlo_res = run_monte_carlo_simulation(
            portfolio.trades,
            initial_capital=self.strategy.initial_capital,
        )

        return {
            "strategy": self.strategy.model_dump(mode="json"),
            "metrics": metrics,
            "equity_curve": equity_series,
            "trades": trades_out,
            "markers": markers,
            "price_series": price_series,
            "total_commission": portfolio.total_commission,
            "total_slippage": portfolio.total_slippage,
            "monte_carlo": monte_carlo_res,
            "regimes": classify_regimes(price_series, trades_out),
            "market": market_exposure(
                [pt["equity"] for pt in equity_series],
                [float(x) for x in closes[: len(equity_series)]],
            ),
            "execution_convention": (
                "Signals are generated at bar close using only information available "
                "at that time. Orders are executed at the next bar's open. "
                "This prevents look-ahead bias."
            ),
        }

    def _execute_order(
        self,
        portfolio: Portfolio,
        order: Order,
        fill_price_raw: float,
        fill_bar_index: int,
        fill_date: datetime,
        markers: list[dict[str, Any]],
        entry_reason_ref: dict[str, str],
    ) -> None:
        fill_price = self.risk_engine.apply_slippage(fill_price_raw, order.side)
        commission = self.risk_engine.commission_cost(fill_price, order.quantity)
        slippage_cost = abs(fill_price - fill_price_raw) * order.quantity

        if order.opens_position:
            if portfolio.position.is_open:
                return
            short = order.side == OrderSide.SELL
            if short:
                portfolio.cash += fill_price * order.quantity - commission
            else:
                total_cost = fill_price * order.quantity + commission
                if total_cost > portfolio.cash + 1e-6:
                    return  # reject — insufficient cash
                portfolio.cash -= total_cost
            portfolio.total_commission += commission
            portfolio.total_slippage += slippage_cost
            stop = getattr(order, "stop_loss_price", None)
            take = getattr(order, "take_profit_price", None)
            if stop is None and take is None:
                stop, take = self.risk_engine.compute_stop_take(fill_price, short=short)
            portfolio.position.side = PositionSide.SHORT if short else PositionSide.LONG
            portfolio.position.quantity = order.quantity
            portfolio.position.entry_price = fill_price
            portfolio.position.entry_date = fill_date
            portfolio.position.entry_bar_index = fill_bar_index
            portfolio.position.stop_loss_price = stop
            portfolio.position.take_profit_price = take
            markers.append(
                {
                    "date": fill_date.isoformat(),
                    "price": fill_price,
                    "type": "entry",
                    "side": portfolio.position.side.value,
                    "reason": order.reason,
                }
            )
            return

        if not portfolio.position.is_open:
            return
        short = portfolio.position.side == PositionSide.SHORT
        qty = min(order.quantity, portfolio.position.quantity)
        entry_price = portfolio.position.entry_price
        if short:
            portfolio.cash -= fill_price * qty + commission
            pnl = (entry_price - fill_price) * qty - commission
            ret = (entry_price - fill_price) / entry_price if entry_price else 0.0
        else:
            portfolio.cash += fill_price * qty - commission
            pnl = (fill_price - entry_price) * qty - commission
            ret = (fill_price / entry_price - 1.0) if entry_price else 0.0
        portfolio.total_commission += commission
        portfolio.total_slippage += slippage_cost
        # Entry commission was already taken from cash; trade PnL carries only the exit commission.
        portfolio.realized_pnl += pnl
        bars_held = 0
        if portfolio.position.entry_bar_index is not None:
            bars_held = fill_bar_index - portfolio.position.entry_bar_index
        portfolio.trades.append(
            TradeRecord(
                entry_date=portfolio.position.entry_date or fill_date,
                exit_date=fill_date,
                entry_price=entry_price,
                exit_price=fill_price,
                quantity=qty,
                side=portfolio.position.side.value,
                pnl=pnl,
                return_pct=ret,
                commission=commission,
                entry_reason=entry_reason_ref.get("value", "entry_signal"),
                exit_reason=order.reason,
                bars_held=bars_held,
            )
        )
        markers.append(
            {
                "date": fill_date.isoformat(),
                "price": fill_price,
                "type": "exit",
                "side": portfolio.position.side.value,
                "reason": order.reason,
            }
        )
        portfolio.position.reset()
