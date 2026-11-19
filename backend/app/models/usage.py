"""Daily usage counters for plan quotas."""

from __future__ import annotations

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UsageDay(Base):
    __tablename__ = "usage_days"

    client_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    day: Mapped[str] = mapped_column(String(10), primary_key=True)  # YYYY-MM-DD UTC
    backtests: Mapped[int] = mapped_column(Integer, default=0)
