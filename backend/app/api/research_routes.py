"""Screener, strategy discovery, and forward tests."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.routes import _client_id
from app.backtesting.engine import BacktestEngine, BacktestError
from app.data.loader import load_dataset
from app.data.market_fetcher import fetch_market_frame, market_dataset_source
from app.database import get_db
from app.llm.parser import StrategyParseError, parse_strategy
from app.llm.schemas import PositionSizing, StrategySpec
from app.models.backtest import BacktestRecord
from app.models.forward import ForwardTest
from app.research.discovery import run_discovery
from app.research.forward import WARMUP_HISTORY, evaluate_forward
from app.research.screener import UNIVERSES, run_screener, universe_list

router = APIRouter(prefix="/api")

MAX_FORWARD_TESTS = 25
STALE_AFTER = timedelta(hours=6)


def _scope(client_id: str) -> str:
    return "" if client_id == "_anonymous" else client_id


def _full_size_without_stop(spec: StrategySpec) -> StrategySpec:
    """Risk-per-trade sizing needs a stop; without one, trade the full allocation like buy & hold."""
    if spec.position_sizing != PositionSizing.RISK_BASED or spec.stop_loss:
        return spec
    risk = spec.risk.model_copy(update={"percent_capital": spec.risk.max_position_pct})
    return spec.model_copy(update={"position_sizing": PositionSizing.PERCENT_CAPITAL, "risk": risk})


async def _strategy(text: str | None, spec: StrategySpec | None) -> tuple[StrategySpec, str]:
    if spec is not None:
        return _full_size_without_stop(spec), text or ""
    if not text or len(text.strip()) < 5:
        raise HTTPException(status_code=422, detail="Describe the strategy first.")
    try:
        parsed = await parse_strategy(text, initial_capital=100_000, commission=0.001, slippage=0.0005)
    except StrategyParseError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _full_size_without_stop(parsed.strategy), text


# --- Screener -----------------------------------------------------------------


class ScreenerRequest(BaseModel):
    strategy_text: str | None = Field(default=None, max_length=4000)
    strategy: StrategySpec | None = None
    universe: str | None = None
    tickers: list[str] = Field(default_factory=list, max_length=40)
    history: str = Field(default="5y", pattern=r"^(1y|5y|10y)$")


@router.get("/screener/universes")
def api_screener_universes() -> list[dict[str, Any]]:
    return universe_list()


@router.post("/screener")
async def api_screener(body: ScreenerRequest) -> dict[str, Any]:
    strategy, _ = await _strategy(body.strategy_text, body.strategy)
    symbols = list(body.tickers)
    if body.universe:
        if body.universe not in UNIVERSES:
            raise HTTPException(status_code=422, detail="Unknown universe.")
        symbols = UNIVERSES[body.universe]["tickers"] + symbols
    try:
        result = run_screener(strategy, symbols, history=body.history)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {**result, "strategy": strategy.model_dump(mode="json")}


# --- Discovery ----------------------------------------------------------------


class DiscoverRequest(BaseModel):
    dataset_id: str = Field(min_length=1, max_length=255)
    commission: float = Field(default=0.001, ge=0, le=0.05)
    slippage: float = Field(default=0.0005, ge=0, le=0.05)


@router.post("/discover")
def api_discover(body: DiscoverRequest) -> dict[str, Any]:
    try:
        data = load_dataset(body.dataset_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail=f"Dataset not found: {exc}") from exc
    source = market_dataset_source(body.dataset_id)
    asset = source[0] if source else body.dataset_id.split("_")[0].split(".")[0]
    try:
        result = run_discovery(data, asset=asset, commission=body.commission, slippage=body.slippage)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        **result,
        "dataset_id": body.dataset_id,
        "asset": asset.upper(),
        "live_ticker": source[0] if source else None,
    }


# --- Forward tests ------------------------------------------------------------


class ForwardCreate(BaseModel):
    backtest_id: int | None = None
    strategy_text: str | None = Field(default=None, max_length=4000)
    strategy: StrategySpec | None = None
    ticker: str | None = Field(default=None, max_length=20)
    name: str | None = Field(default=None, max_length=200)


def _owned(db: Session, forward_id: int, client_id: str) -> ForwardTest:
    row = db.get(ForwardTest, forward_id)
    if row is None or (row.client_id or "") != _scope(client_id):
        raise HTTPException(status_code=404, detail="Forward test not found")
    return row


def _fetch(ticker: str, start_date: str | None = None) -> Any:
    history = WARMUP_HISTORY
    if start_date and (datetime.now(timezone.utc).date() - datetime.fromisoformat(start_date).date()).days > 3 * 365:
        history = "10y"
    try:
        df, _ = fetch_market_frame(ticker, history=history)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Could not load {ticker}: {exc}") from exc
    return df


def _summary(row: ForwardTest) -> dict[str, Any]:
    snap = json.loads(row.snapshot_json) if row.snapshot_json else {}
    sig = snap.get("live_signal") or {}
    return {
        "id": row.id,
        "name": row.name,
        "ticker": row.ticker,
        "strategy_text": row.strategy_text,
        "start_date": row.start_date,
        "start_close": row.start_close,
        "backtest_cagr": row.backtest_return,
        "backtest_sharpe": row.backtest_sharpe,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "checked_at": row.checked_at.isoformat() if row.checked_at else None,
        "as_of": snap.get("as_of"),
        "days_live": snap.get("days_live", 0),
        "forward_return": snap.get("forward_return", 0.0),
        "hold_return": snap.get("hold_return", 0.0),
        "max_drawdown": snap.get("max_drawdown", 0.0),
        "closed_trades": snap.get("closed_trades", 0),
        "action": sig.get("action"),
        "in_position": sig.get("in_position", False),
    }


def _refresh(db: Session, row: ForwardTest) -> dict[str, Any]:
    df = _fetch(row.ticker, row.start_date)
    try:
        return evaluate_and_store(db, row, df)
    except (BacktestError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _detail(row: ForwardTest, snap: dict[str, Any]) -> dict[str, Any]:
    return {**_summary(row), **snap, "strategy": json.loads(row.strategy_json)}


@router.post("/forward")
async def api_forward_create(
    body: ForwardCreate,
    db: Session = Depends(get_db),
    client_id: str = Depends(_client_id),
) -> dict[str, Any]:
    scope = _scope(client_id)
    if db.query(ForwardTest).filter(ForwardTest.client_id == scope).count() >= MAX_FORWARD_TESTS:
        raise HTTPException(status_code=429, detail=f"Up to {MAX_FORWARD_TESTS} forward tests; delete one first.")

    ticker = (body.ticker or "").strip().upper()
    if body.backtest_id is not None:
        record = db.get(BacktestRecord, body.backtest_id)
        if record is None or (record.client_id or "") != scope:
            raise HTTPException(status_code=404, detail="Backtest not found")
        strategy = _full_size_without_stop(StrategySpec.model_validate(json.loads(record.parsed_strategy_json)))
        text = record.strategy_description
        source = market_dataset_source(record.dataset_name)
        if not ticker:
            if source is None:
                raise HTTPException(
                    status_code=422,
                    detail="Forward tests follow a live ticker. Load one with 1-Click Live Market and run it again.",
                )
            ticker = source[0]
    else:
        strategy, text = await _strategy(body.strategy_text, body.strategy)
    if not ticker:
        raise HTTPException(status_code=422, detail="Pick a ticker to follow.")
    if strategy.is_custom:
        raise HTTPException(status_code=422, detail="Forward tests run plain-English rules for now.")

    df = _fetch(ticker)
    try:
        metrics = BacktestEngine(strategy).run(df, metrics_only=True)["metrics"]
    except (BacktestError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    row = ForwardTest(
        client_id=scope,
        name=(body.name or text or ticker).strip()[:200] or ticker,
        ticker=ticker,
        strategy_text=text or "",
        strategy_json=json.dumps(strategy.model_dump(mode="json")),
        start_date=str(df["date"].iloc[-1])[:10],
        start_close=float(df["close"].iloc[-1]),
        backtest_return=metrics.get("cagr"),
        backtest_sharpe=metrics.get("sharpe_ratio"),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _detail(row, evaluate_and_store(db, row, df))


def evaluate_and_store(db: Session, row: ForwardTest, df: Any) -> dict[str, Any]:
    snap = evaluate_forward(StrategySpec.model_validate(json.loads(row.strategy_json)), df, row.start_date)
    row.snapshot_json = json.dumps(snap)
    row.checked_at = datetime.now(timezone.utc)
    db.commit()
    return snap


@router.get("/forward")
def api_forward_list(
    db: Session = Depends(get_db),
    client_id: str = Depends(_client_id),
) -> list[dict[str, Any]]:
    rows = (
        db.query(ForwardTest)
        .filter(ForwardTest.client_id == _scope(client_id))
        .order_by(ForwardTest.created_at.desc())
        .all()
    )
    return [_summary(r) for r in rows]


@router.get("/forward/{forward_id}")
def api_forward_get(
    forward_id: int,
    db: Session = Depends(get_db),
    client_id: str = Depends(_client_id),
) -> dict[str, Any]:
    row = _owned(db, forward_id, client_id)
    checked = row.checked_at
    if checked is not None and checked.tzinfo is None:
        checked = checked.replace(tzinfo=timezone.utc)
    if not row.snapshot_json or checked is None or datetime.now(timezone.utc) - checked > STALE_AFTER:
        try:
            return _detail(row, _refresh(db, row))
        except HTTPException:
            if not row.snapshot_json:
                raise
    return _detail(row, json.loads(row.snapshot_json))


@router.post("/forward/{forward_id}/refresh")
def api_forward_refresh(
    forward_id: int,
    db: Session = Depends(get_db),
    client_id: str = Depends(_client_id),
) -> dict[str, Any]:
    row = _owned(db, forward_id, client_id)
    return _detail(row, _refresh(db, row))


@router.delete("/forward/{forward_id}")
def api_forward_delete(
    forward_id: int,
    db: Session = Depends(get_db),
    client_id: str = Depends(_client_id),
) -> dict[str, bool]:
    row = _owned(db, forward_id, client_id)
    db.delete(row)
    db.commit()
    return {"deleted": True}
