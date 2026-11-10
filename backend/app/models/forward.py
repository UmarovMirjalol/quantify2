"""Forward tests: a saved rule set tracked on live bars from the day it was saved."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ForwardTest(Base):
    __tablename__ = "forward_tests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    client_id: Mapped[str] = mapped_column(String(64), default="", index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    ticker: Mapped[str] = mapped_column(String(32), nullable=False)
    strategy_text: Mapped[str] = mapped_column(Text, default="")
    strategy_json: Mapped[str] = mapped_column(Text, nullable=False)
    # Last bar known when saved; trading counts signals from this bar's close onward.
    start_date: Mapped[str] = mapped_column(String(10), nullable=False)
    start_close: Mapped[float] = mapped_column(Float, nullable=False)
    backtest_return: Mapped[float | None] = mapped_column(Float, nullable=True)
    backtest_sharpe: Mapped[float | None] = mapped_column(Float, nullable=True)
    snapshot_json: Mapped[str] = mapped_column(Text, default="")
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
