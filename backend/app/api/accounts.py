"""Accounts: register, sign in, sign out. History follows the account to any device.

A signed-in browser sends the account's ``acct-…`` client id plus ``X-Session``; the
history routes refuse an ``acct-`` id without a matching session, so the id alone is
not a credential. Signing in also moves the browser's anonymous runs into the account.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.account import Account, AccountSession
from app.models.backtest import BacktestRecord
from app.models.forward import ForwardTest

router = APIRouter(prefix="/api/auth")

ACCOUNT_PREFIX = "acct-"
PBKDF2_ROUNDS = 240_000
USERNAME = re.compile(r"^[a-z0-9_.-]{3,32}$")


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=256)
    # The browser's anonymous id; its runs move into the account.
    claim_client_id: str | None = Field(default=None, max_length=64)


def _hash(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), PBKDF2_ROUNDS).hex()


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def is_account_id(client_id: str) -> bool:
    return client_id.startswith(ACCOUNT_PREFIX)


def account_for_session(db: Session, token: str | None) -> Account | None:
    if not token or len(token) > 128:
        return None
    session = db.get(AccountSession, _token_hash(token.strip()))
    if session is None:
        return None
    session.last_used = datetime.now(timezone.utc)
    db.commit()
    return db.get(Account, session.account_id)


def _claim(db: Session, account: Account, claim: str | None) -> int:
    """Move an anonymous browser's runs into the account; never touches another account."""
    if not claim:
        return 0
    cleaned = "".join(ch for ch in claim.strip()[:64] if ch.isalnum() or ch in "-_")
    if not cleaned or is_account_id(cleaned) or cleaned == account.client_id:
        return 0
    moved = (
        db.query(BacktestRecord)
        .filter(BacktestRecord.client_id == cleaned)
        .update({BacktestRecord.client_id: account.client_id}, synchronize_session=False)
    )
    db.query(ForwardTest).filter(ForwardTest.client_id == cleaned).update(
        {ForwardTest.client_id: account.client_id}, synchronize_session=False
    )
    db.commit()
    return int(moved)


def _start_session(db: Session, account: Account, moved: int) -> dict[str, object]:
    token = secrets.token_urlsafe(32)
    db.add(AccountSession(token_hash=_token_hash(token), account_id=account.id))
    db.commit()
    return {"token": token, "username": account.username, "client_id": account.client_id, "moved": moved}


@router.post("/register")
def register(body: Credentials, db: Session = Depends(get_db)) -> dict[str, object]:
    username = body.username.strip().lower()
    if not USERNAME.match(username):
        raise HTTPException(422, "Username: 3–32 characters, letters, digits, dot, dash or underscore.")
    if db.query(Account).filter(Account.username == username).first():
        raise HTTPException(409, "That username is taken.")
    salt = secrets.token_hex(16)
    account = Account(
        username=username,
        salt=salt,
        password_hash=_hash(body.password, salt),
        client_id=f"{ACCOUNT_PREFIX}{uuid.uuid4().hex}",
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return _start_session(db, account, _claim(db, account, body.claim_client_id))


@router.post("/login")
def login(body: Credentials, db: Session = Depends(get_db)) -> dict[str, object]:
    account = db.query(Account).filter(Account.username == body.username.strip().lower()).first()
    expected = account.password_hash if account else _hash("decoy", "00" * 16)
    provided = _hash(body.password, account.salt if account else "00" * 16)
    if account is None or not hmac.compare_digest(provided, expected):
        # 403, not 401: the frontend treats 401 as "server access token missing".
        raise HTTPException(403, "Wrong username or password.")
    return _start_session(db, account, _claim(db, account, body.claim_client_id))


@router.get("/me")
def me(
    x_session: str | None = Header(default=None, alias="X-Session"),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    account = account_for_session(db, x_session)
    if account is None:
        return {"signed_in": False}
    count = db.query(BacktestRecord).filter(BacktestRecord.client_id == account.client_id).count()
    return {
        "signed_in": True,
        "username": account.username,
        "client_id": account.client_id,
        "backtests": count,
        "created_at": account.created_at.isoformat() if account.created_at else None,
    }


@router.post("/logout")
def logout(
    x_session: str | None = Header(default=None, alias="X-Session"),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    if x_session:
        db.query(AccountSession).filter(AccountSession.token_hash == _token_hash(x_session.strip())).delete()
        db.commit()
    return {"signed_in": False}
