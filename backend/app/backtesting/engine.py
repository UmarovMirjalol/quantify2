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

import numpy as np
import pandas as pd

from app.backtesting.orders import Order, OrderSide
from app.backtesting.portfolio import Portfolio
from app.backtesting.positions import PositionSide, TradeRecord
from app.llm.schemas import Side, StrategySpec
from app.metrics.monte_carlo import run_monte_carlo_simulation
from app.research.market import market_exposure
from app.research.regimes import classify_regimes
from app.metrics.performance import compute_performance_metrics
from app.risk.risk_engine import RiskEngine, round_quantity
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

    def run(
        self,
        data: pd.DataFrame,
        signals: CustomSignals | None = None,
        *,
        metrics_only: bool = False,
        trade_from: int | None = None,
        join_at_start: bool = False,
    ) -> dict[str, Any]:
        """``signals`` lets callers pass precomputed Python-strategy output (batched or checked).

        ``metrics_only`` skips the chart series and side reports for research loops.
        ``trade_from`` ignores entry signals before that bar, so indicators warm up on
        older history while trading starts at a fixed date (forward tests).
        ``join_at_start`` also enters at that bar when the rules are already holding there.
        """
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
        if trade_from:
            k = min(trade_from, len(entry_flags) - 1)
            holding = join_at_start and self._holding_at(df, k, signals)
            entry_flags = np.array(entry_flags, dtype=bool, copy=True)
            entry_flags[:k] = False
            if holding and not exit_flags[k]:
                entry_flags[k] = True
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

            def fill(order: Order, raw: float) -> None:
                order.signal_bar_index = i
                self._execute_order(
                    portfolio,
                    order,
                    fill_price_raw=raw,
                    fill_bar_index=i,
                    fill_date=bar_date,
                    markers=markers,
                    entry_reason_ref={"value": entry_reason},
                )

            # 2) Intrabar exits, checked after the open fill: stop first (conservative),
            #    then partial exits, then the full take-profit.
            pos = portfolio.position
            if pos.is_open:
                short = pos.side == PositionSide.SHORT
                worse, better = (max, min) if short else (min, max)
                st_order = self.risk_engine.check_stop_take(portfolio, h, l, o)
                if st_order is not None and st_order.reason == "stop_loss":
                    fill(st_order, worse(o, pos.stop_loss_price))
                else:
                    self._scale_out(pos, short, h, l, o, fill)
                    if st_order is not None and pos.is_open:
                        fill(st_order, better(o, pos.take_profit_price))

            # 3) Generate new signal at close — queue for next bar open
            if i < n - 1:  # cannot execute after last bar
                fraction = float(sizes[i]) if sizes is not None else None
                if not pos.is_open and entry_flags[i] and fraction != 0.0:
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
                            stop_loss_price=decision.stop_loss_price,
                            take_profit_price=decision.take_profit_price,
                        )
                        entry_reason = "entry_signal"
                elif pos.is_open and exit_flags[i]:
                    pending_order = Order(
                        side=OrderSide.BUY if self.short else OrderSide.SELL,
                        quantity=pos.quantity,
                        signal_bar_index=i,
                        reason="exit_signal",
                    )
                elif (
                    pos.is_open
                    and entry_flags[i]
                    and fraction != 0.0
                    and pos.entries < self.strategy.max_entries
                ):
                    decision = self.risk_engine.size_entry(
                        portfolio, c, short=self.short, fraction=fraction, adding=True
                    )
                    if decision.allowed:
                        pending_order = Order(
                            side=OrderSide.SELL if self.short else OrderSide.BUY,
                            quantity=decision.quantity,
                            signal_bar_index=i,
                            reason="pyramid_add",
                            opens_position=True,
                            adds_to_position=True,
                        )

            # 4) Mark-to-market at close, then let the trailing stop follow this bar's extreme
            portfolio.record_equity(bar_date, c)
            if pos.is_open:
                short = pos.side == PositionSide.SHORT
                best = pos.best_price if pos.best_price is not None else pos.entry_price
                pos.best_price = min(best, l) if short else max(best, h)
                self._tighten_stop(pos, short)

        metrics = compute_performance_metrics(
            equity_curve=portfolio.equity_curve,
            trades=portfolio.trades,
            initial_capital=self.strategy.initial_capital,
        )
        live_signal = self._live_signal(
            portfolio.position, dates[-1], float(closes[-1]),
            bool(entry_flags[-1]), bool(exit_flags[-1]),
            float(sizes[-1]) if sizes is not None else None,
        )
        if metrics_only:
            return {"metrics": metrics, "live_signal": live_signal}

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
            "live_signal": live_signal,
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

    def _holding_at(self, df: pd.DataFrame, k: int, signals: CustomSignals | None) -> bool:
        """Whether an unrestricted run is in a position after bar ``k``'s close."""
        if signals is not None or k < 1:
            return False
        sig = BacktestEngine(self.strategy).run(df.iloc[: k + 1], metrics_only=True)["live_signal"]
        return bool(sig["in_position"] and sig["action"] != "exit")

    def _live_signal(
        self,
        pos: Any,
        last_date: Any,
        last_close: float,
        entry_now: bool,
        exit_now: bool,
        fraction: float | None,
    ) -> dict[str, Any]:
        """What the strategy says after the final bar: state plus the order for the next open."""
        side = "short" if self.short else "long"
        if pos.is_open:
            unrealized = pos.unrealized_pnl(last_close)
            cost = pos.entry_price * pos.quantity
            if exit_now:
                action = "exit"
            elif entry_now and fraction != 0.0 and pos.entries < self.strategy.max_entries:
                action = "add"
            else:
                action = "hold"
            return {
                "as_of": pd.Timestamp(last_date).isoformat(),
                "last_close": last_close,
                "side": side,
                "in_position": True,
                "action": action,
                "entry_date": pos.entry_date.isoformat() if pos.entry_date else None,
                "entry_price": pos.entry_price,
                "quantity": pos.quantity,
                "unrealized_pnl": unrealized,
                "unrealized_pct": unrealized / cost if cost > 0 else 0.0,
                "stop_loss_price": pos.stop_loss_price,
                "take_profit_price": pos.take_profit_price,
            }
        action = "enter" if entry_now and fraction != 0.0 else "wait"
        return {
            "as_of": pd.Timestamp(last_date).isoformat(),
            "last_close": last_close,
            "side": side,
            "in_position": False,
            "action": action,
            "entry_date": None,
            "entry_price": None,
            "quantity": 0.0,
            "unrealized_pnl": 0.0,
            "unrealized_pct": 0.0,
            "stop_loss_price": None,
            "take_profit_price": None,
        }

    def _scale_out(self, pos: Any, short: bool, h: float, l: float, o: float, fill: Any) -> None:
        """Close the configured slices whose profit target this bar reached (gaps fill at the open)."""
        levels = self.strategy.scale_out
        while pos.is_open and pos.scaled < len(levels):
            level = levels[pos.scaled]
            sign = -1.0 if short else 1.0
            target = pos.entry_price * (1.0 + sign * level.profit)
            if not (l <= target if short else h >= target):
                return
            if pos.scale_base is None:
                pos.scale_base = pos.quantity
            qty = min(pos.quantity, round_quantity(pos.scale_base * level.fraction))
            pos.scaled += 1
            if qty <= 0:
                continue
            if pos.quantity - qty < 1e-9:
                qty = pos.quantity
            order = Order(
                side=OrderSide.BUY if short else OrderSide.SELL,
                quantity=qty,
                signal_bar_index=-1,
                reason="scale_out",
            )
            fill(order, min(o, target) if short else max(o, target))
            if pos.is_open and self.strategy.breakeven_after_scale:
                self._tighten_stop(pos, short, floor_at=pos.entry_price)

    def _tighten_stop(self, pos: Any, short: bool, floor_at: float | None = None) -> None:
        """Move the stop toward profit only: trailing level from the best price, or a breakeven floor."""
        candidates = [floor_at]
        if self.strategy.trailing_stop and pos.best_price is not None:
            ts = self.strategy.trailing_stop
            candidates.append(pos.best_price * (1.0 + ts) if short else pos.best_price * (1.0 - ts))
        if self.strategy.breakeven_after_scale and pos.scaled > 0:
            candidates.append(pos.entry_price)
        for level in candidates:
            if level is None:
                continue
            current = pos.stop_loss_price
            if current is None:
                pos.stop_loss_price = level
            else:
                pos.stop_loss_price = min(current, level) if short else max(current, level)

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
            if portfolio.position.is_open != order.adds_to_position:
                return
            short = order.side == OrderSide.SELL
            if short:
                portfolio.cash += fill_price * order.quantity - commission
            else:
                total_cost = fill_price * order.quantity + commission
                if total_cost > portfolio.cash + 1e-6:
                    # Sized at the signal close; a gap up at the open would otherwise skip the trade.
                    affordable = round_quantity(order.quantity * portfolio.cash / total_cost)
                    if self.strategy.position_sizing.value == "fixed" or affordable <= 0:
                        return
                    order.quantity = affordable
                    commission = self.risk_engine.commission_cost(fill_price, order.quantity)
                    slippage_cost = abs(fill_price - fill_price_raw) * order.quantity
                    total_cost = fill_price * order.quantity + commission
                portfolio.cash -= total_cost
            portfolio.total_commission += commission
            portfolio.total_slippage += slippage_cost
            pos = portfolio.position
            if order.adds_to_position:
                # Fixed stop/take re-anchor to the new average entry; trailing and breakeven never loosen.
                total = pos.quantity + order.quantity
                pos.entry_price = (pos.entry_price * pos.quantity + fill_price * order.quantity) / total
                pos.quantity = total
                pos.entries += 1
                pos.stop_loss_price, pos.take_profit_price = self.risk_engine.compute_stop_take(
                    pos.entry_price, short=short
                )
                self._tighten_stop(pos, short)
            else:
                stop, take = order.stop_loss_price, order.take_profit_price
                if stop is None and take is None:
                    stop, take = self.risk_engine.compute_stop_take(fill_price, short=short)
                pos.side = PositionSide.SHORT if short else PositionSide.LONG
                pos.quantity = order.quantity
                pos.entry_price = fill_price
                pos.entry_date = fill_date
                pos.entry_bar_index = fill_bar_index
                pos.stop_loss_price = stop
                pos.take_profit_price = take
                pos.entries = 1
                pos.best_price = fill_price
                self._tighten_stop(pos, short)
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
        if portfolio.position.quantity - qty > 1e-9:
            portfolio.position.quantity -= qty
        else:
            portfolio.position.reset()
