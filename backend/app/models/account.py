"""User accounts: a username/password that owns a stable history id across devices."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    salt: Mapped[str] = mapped_column(String(64))
    # Backtests are scoped by client_id; an account's runs use this id on every device.
    client_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    # Hosted billing (model B)
    plan: Mapped[str] = mapped_column(String(16), default="free")
    plan_status: Mapped[str] = mapped_column(String(24), default="none")  # none|active|past_due|canceled
    stripe_customer_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Self-host / redeemed license (model A)
    license_key_hint: Mapped[str | None] = mapped_column(String(32), nullable=True)
    license_licensee: Mapped[str | None] = mapped_column(String(120), nullable=True)


class AccountSession(Base):
    __tablename__ = "account_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_used: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
