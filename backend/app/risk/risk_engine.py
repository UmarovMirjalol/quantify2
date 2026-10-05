"""Deterministic risk management and position sizing."""

from __future__ import annotations

from dataclasses import dataclass

from app.backtesting.orders import Order, OrderSide
from app.backtesting.portfolio import Portfolio
from app.llm.schemas import PositionSizing, StrategySpec


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

    def compute_stop_take(self, entry_price: float) -> tuple[float | None, float | None]:
        stop = None
        take = None
        if self.strategy.stop_loss is not None:
            stop = entry_price * (1.0 - self.strategy.stop_loss)
        if self.strategy.take_profit is not None:
            take = entry_price * (1.0 + self.strategy.take_profit)
        return stop, take

    def size_long_entry(
        self,
        portfolio: Portfolio,
        raw_price: float,
    ) -> RiskDecision:
        """
        Calculate how many shares to buy for a long entry.

        Risk-based example:
            capital=100_000, risk_per_trade=1%, stop_loss=2%
            dollar_risk = 1_000
            per_share_risk = price * 0.02
            shares = floor(dollar_risk / per_share_risk)
        """
        if portfolio.position.is_open:
            return RiskDecision(False, 0.0, "Position already open")

        fill_price = self.apply_slippage(raw_price, OrderSide.BUY)
        if fill_price <= 0:
            return RiskDecision(False, 0.0, "Invalid fill price")

        equity = portfolio.equity(raw_price)
        if equity <= 0 or portfolio.cash <= 0:
            return RiskDecision(False, 0.0, "Insufficient capital")

        sizing = self.strategy.position_sizing
        quantity = 0.0
        dollar_risk = None

        if sizing == PositionSizing.FIXED:
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
        max_notional = equity * self.risk.max_position_pct
        max_qty_by_position = max_notional / (fill_price * (1.0 + self.commission))
        quantity = min(quantity, max_qty_by_position)

        # Max portfolio exposure
        max_exposure_notional = equity * self.risk.max_portfolio_exposure
        max_qty_by_exposure = max_exposure_notional / (fill_price * (1.0 + self.commission))
        quantity = min(quantity, max_qty_by_exposure)

        # Leverage limit (MVP: cash-only unless leverage > 1)
        max_buying_power = portfolio.cash * self.risk.max_leverage
        max_qty_by_cash = max_buying_power / (fill_price * (1.0 + self.commission))
        quantity = min(quantity, max_qty_by_cash)

        # Integer shares for simplicity (MVP)
        quantity = float(int(quantity))
        if quantity < 1:
            return RiskDecision(False, 0.0, "Position size rounded to zero under risk constraints")

        cost = fill_price * quantity * (1.0 + self.commission)
        if cost > portfolio.cash * self.risk.max_leverage + 1e-9:
            return RiskDecision(False, 0.0, "Insufficient cash after costs")

        stop, take = self.compute_stop_take(fill_price)
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
        if not pos.is_open or pos.side.value != "long":
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
