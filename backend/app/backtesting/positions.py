"""Position tracking for long (and future short) trades."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class PositionSide(str, Enum):
    FLAT = "flat"
    LONG = "long"
    SHORT = "short"  # reserved for future use


@dataclass
class Position:
    """Current open position state."""

    side: PositionSide = PositionSide.FLAT
    quantity: float = 0.0
    entry_price: float = 0.0
    entry_date: datetime | None = None
    entry_bar_index: int | None = None
    stop_loss_price: float | None = None
    take_profit_price: float | None = None
    realized_pnl: float = 0.0

    @property
    def is_open(self) -> bool:
        return self.side != PositionSide.FLAT and self.quantity > 0

    def market_value(self, price: float) -> float:
        if not self.is_open:
            return 0.0
        if self.side == PositionSide.LONG:
            return self.quantity * price
        # Short: liability
        return -self.quantity * price

    def unrealized_pnl(self, price: float) -> float:
        if not self.is_open:
            return 0.0
        if self.side == PositionSide.LONG:
            return (price - self.entry_price) * self.quantity
        return (self.entry_price - price) * self.quantity

    def reset(self) -> None:
        self.side = PositionSide.FLAT
        self.quantity = 0.0
        self.entry_price = 0.0
        self.entry_date = None
        self.entry_bar_index = None
        self.stop_loss_price = None
        self.take_profit_price = None


@dataclass
class TradeRecord:
    """Closed trade record for reporting."""

    entry_date: datetime
    exit_date: datetime
    entry_price: float
    exit_price: float
    quantity: float
    side: str
    pnl: float
    return_pct: float
    commission: float
    entry_reason: str
    exit_reason: str
    bars_held: int
