"""Portfolio state: cash, equity, and position book."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from app.backtesting.positions import Position, TradeRecord


@dataclass
class EquityPoint:
    date: datetime
    equity: float
    cash: float
    market_value: float
    unrealized_pnl: float
    realized_pnl: float


@dataclass
class Portfolio:
    """Tracks cash and a single-asset position for the MVP."""

    initial_capital: float
    cash: float = 0.0
    position: Position = field(default_factory=Position)
    realized_pnl: float = 0.0
    trades: list[TradeRecord] = field(default_factory=list)
    equity_curve: list[EquityPoint] = field(default_factory=list)
    total_commission: float = 0.0
    total_slippage: float = 0.0

    def __post_init__(self) -> None:
        self.cash = float(self.initial_capital)

    def equity(self, mark_price: float) -> float:
        return self.cash + self.position.market_value(mark_price)

    def exposure(self, mark_price: float) -> float:
        eq = self.equity(mark_price)
        if eq <= 0:
            return 0.0
        return abs(self.position.market_value(mark_price)) / eq

    def record_equity(self, date: datetime, mark_price: float) -> None:
        self.equity_curve.append(
            EquityPoint(
                date=date,
                equity=self.equity(mark_price),
                cash=self.cash,
                market_value=self.position.market_value(mark_price),
                unrealized_pnl=self.position.unrealized_pnl(mark_price),
                realized_pnl=self.realized_pnl,
            )
        )
