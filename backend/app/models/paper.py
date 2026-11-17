"""Paper desk journal: signal pulls + webhook deliveries."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class PaperJournalEntry(Base):
    __tablename__ = "paper_journal"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    client_id: Mapped[str] = mapped_column(String(64), default="", index=True)
    strategy_text: Mapped[str] = mapped_column(Text, default="")
    tickers_json: Mapped[str] = mapped_column(Text, default="[]")
    signals_json: Mapped[str] = mapped_column(Text, default="[]")
    actionable_json: Mapped[str] = mapped_column(Text, default="[]")
    errors_json: Mapped[str] = mapped_column(Text, default="[]")
    webhook_url: Mapped[str] = mapped_column(String(500), default="")
    webhook_json: Mapped[str] = mapped_column(Text, default="")
    history: Mapped[str] = mapped_column(String(8), default="1y")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
