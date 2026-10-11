"""ORM models for live public stats (visitors)."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Visitor(Base):
    """Unique browser client that hit the product (landing ping or backtest)."""

    __tablename__ = "visitors"

    client_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
