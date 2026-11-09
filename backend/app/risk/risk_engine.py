"""Deterministic risk management and position sizing."""

from __future__ import annotations

from dataclasses import dataclass
from math import floor

from app.backtesting.orders import Order, OrderSide
from app.backtesting.portfolio import Portfolio
from app.llm.schemas import PositionSizing, StrategySpec


def round_quantity(quantity: float) -> float:
    """Whole units when at least one fits; otherwise fractional units (crypto, high-priced stocks)
    rounded down to 1e-6 so the size never exceeds the limits that produced it."""
    if quantity >= 1:
        return float(int(quantity))
    return floor(max(quantity, 0.0) * 1e6) / 1e6


@dataclass
class RiskDecision:
    """Result of risk checks for a proposed trade."""

    allowed: bool
    quantity: float
    reason: str
    stop_loss_price: float | None = None
    take_profit_price: float | None = None
    dollar_risk: float | None = None


class RiskEngine:
    """
    Applies position sizing, exposure limits, cash constraints, stops, and costs.

    All calculations are deterministic and side-effect free regarding portfolio
    mutation — the caller applies fills.
    """

    def __init__(self, strategy: StrategySpec):
        self.strategy = strategy
        self.commission = strategy.commission
        self.slippage = strategy.slippage
        self.risk = strategy.risk

    def apply_slippage(self, price: float, side: OrderSide) -> float:
        """Worsen the fill price by the configured slippage rate."""
        if side == OrderSide.BUY:
            return price * (1.0 + self.slippage)
        return price * (1.0 - self.slippage)

    def commission_cost(self, price: float, quantity: float) -> float:
        """Commission as a fraction of notional."""
        return abs(price * quantity) * self.commission

    def compute_stop_take(
        self, entry_price: float, short: bool = False
    ) -> tuple[float | None, float | None]:
        stop = None
        take = None
        sign = -1.0 if short else 1.0
        if self.strategy.stop_loss is not None:
            stop = entry_price * (1.0 - sign * self.strategy.stop_loss)
        if self.strategy.take_profit is not None:
            take = entry_price * (1.0 + sign * self.strategy.take_profit)
        return stop, take

    def size_long_entry(self, portfolio: Portfolio, raw_price: float) -> RiskDecision:
        return self.size_entry(portfolio, raw_price, short=False)

    def size_entry(
        self,
        portfolio: Portfolio,
        raw_price: float,
        short: bool = False,
        fraction: float | None = None,
        adding: bool = False,
    ) -> RiskDecision:
        """
        Calculate how many shares to buy (long) or sell short.

        ``fraction`` (0..1 of equity, from a Python strategy's size output) overrides the
        configured sizing mode; position, exposure and leverage limits still apply.
        ``adding`` sizes a pyramid unit: the limits count the units already held.

        Risk-based example:
            capital=100_000, risk_per_trade=1%, stop_loss=2%
            dollar_risk = 1_000
            per_share_risk = price * 0.02
            shares = floor(dollar_risk / per_share_risk)

        A short is sized against equity, not cash: sale proceeds are credited
        to cash but the position is a liability of the same size.
        """
        if portfolio.position.is_open and not adding:
            return RiskDecision(False, 0.0, "Position already open")
        held = portfolio.position.quantity * raw_price if adding else 0.0

        fill_price = self.apply_slippage(raw_price, OrderSide.SELL if short else OrderSide.BUY)
        if fill_price <= 0:
            return RiskDecision(False, 0.0, "Invalid fill price")

        equity = portfolio.equity(raw_price)
        if equity <= 0 or portfolio.cash <= 0:
            return RiskDecision(False, 0.0, "Insufficient capital")

        sizing = self.strategy.position_sizing
        quantity = 0.0
        dollar_risk = None

        if fraction is not None:
            quantity = (equity * max(0.0, min(1.0, fraction))) / (fill_price * (1.0 + self.commission))

        elif sizing == PositionSizing.FIXED:
            quantity = float(self.risk.fixed_shares or 100)

        elif sizing == PositionSizing.PERCENT_CAPITAL:
            pct = self.risk.percent_capital or 0.1
            budget = equity * pct
            # Leave room for commission
            quantity = budget / (fill_price * (1.0 + self.commission))

        else:  # RISK_BASED
            risk_frac = self.strategy.risk.risk_per_trade
            dollar_risk = equity * risk_frac
            stop_frac = self.strategy.stop_loss
            if stop_frac and stop_frac > 0:
                per_share_risk = fill_price * stop_frac
                quantity = dollar_risk / per_share_risk
            else:
                # Without stop-loss, use risk_per_trade as capital fraction
                quantity = (equity * risk_frac) / (fill_price * (1.0 + self.commission))

        # Max position as % of equity
        max_notional = equity * self.risk.max_position_pct - held
        max_qty_by_position = max_notional / (fill_price * (1.0 + self.commission))
        quantity = min(quantity, max_qty_by_position)

        # Max portfolio exposure
        max_exposure_notional = equity * self.risk.max_portfolio_exposure - held
        max_qty_by_exposure = max_exposure_notional / (fill_price * (1.0 + self.commission))
        quantity = min(quantity, max_qty_by_exposure)

        # Leverage limit (MVP: cash-only unless leverage > 1). A long's cash already paid for held units.
        backing = equity if short else portfolio.cash
        buying_power = backing * self.risk.max_leverage - (held if short else 0.0)
        max_qty_by_cash = buying_power / (fill_price * (1.0 + self.commission))
        quantity = min(quantity, max_qty_by_cash)

        quantity = round_quantity(quantity)
        if quantity <= 0:
            return RiskDecision(False, 0.0, "Position size rounded to zero under risk constraints")

        cost = fill_price * quantity * (1.0 + self.commission)
        if cost > buying_power + 1e-9:
            return RiskDecision(False, 0.0, "Insufficient cash after costs")

        stop, take = self.compute_stop_take(fill_price, short=short)
        return RiskDecision(
            allowed=True,
            quantity=quantity,
            reason="Sized by risk engine",
            stop_loss_price=stop,
            take_profit_price=take,
            dollar_risk=dollar_risk,
        )

    def check_stop_take(
        self,
        portfolio: Portfolio,
        bar_high: float,
        bar_low: float,
        bar_open: float,
    ) -> Order | None:
        """
        Check whether stop-loss or take-profit is hit on the current bar.

        Conservative assumption for longs:
        - If both stop and take could be hit in the same bar, assume stop is hit first
          (worse case) unless open gapped favorably through take.
        """
        pos = portfolio.position
        if not pos.is_open:
            return None
        if pos.side.value == "short":
            return self._check_short_stop_take(pos, bar_high, bar_low, bar_open)
        if pos.side.value != "long":
            return None

        stop = pos.stop_loss_price
        take = pos.take_profit_price

        hit_stop = stop is not None and bar_low <= stop
        hit_take = take is not None and bar_high >= take

        if hit_stop and hit_take:
            # Gap open beyond take without trading through stop
            if bar_open >= (take or 0) and (stop is None or bar_open > stop):
                return Order(
                    side=OrderSide.SELL,
                    quantity=pos.quantity,
                    signal_bar_index=-1,
                    reason="take_profit",
                )
            return Order(
                side=OrderSide.SELL,
                quantity=pos.quantity,
                signal_bar_index=-1,
                reason="stop_loss",
            )

        if hit_stop:
            return Order(
                side=OrderSide.SELL,
                quantity=pos.quantity,
                signal_bar_index=-1,
                reason="stop_loss",
            )
        if hit_take:
            return Order(
                side=OrderSide.SELL,
                quantity=pos.quantity,
                signal_bar_index=-1,
                reason="take_profit",
            )
        return None

    def _check_short_stop_take(
        self, pos: object, bar_high: float, bar_low: float, bar_open: float
    ) -> Order | None:
        """Mirror of the long check: a short stops out above, takes profit below."""
        stop = pos.stop_loss_price  # type: ignore[attr-defined]
        take = pos.take_profit_price  # type: ignore[attr-defined]
        quantity = pos.quantity  # type: ignore[attr-defined]
        hit_stop = stop is not None and bar_high >= stop
        hit_take = take is not None and bar_low <= take
        if hit_stop and hit_take:
            if bar_open <= (take or 0) and (stop is None or bar_open < stop):
                return Order(side=OrderSide.BUY, quantity=quantity, signal_bar_index=-1, reason="take_profit")
            return Order(side=OrderSide.BUY, quantity=quantity, signal_bar_index=-1, reason="stop_loss")
        if hit_stop:
            return Order(side=OrderSide.BUY, quantity=quantity, signal_bar_index=-1, reason="stop_loss")
        if hit_take:
            return Order(side=OrderSide.BUY, quantity=quantity, signal_bar_index=-1, reason="take_profit")
        return None
