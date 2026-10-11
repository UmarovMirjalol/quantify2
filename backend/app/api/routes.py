"""REST API routes for the backtesting platform."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.config import UPLOAD_DIR, get_settings
from app.database import get_db
from app.data.loader import list_available_datasets, load_dataset
from app.data.validators import DataValidationError, load_ohlcv_bytes
from app.backtesting.engine import BacktestEngine, BacktestError
from app.llm.client import LLMClient
from app.llm.parser import StrategyParseError, parse_strategy
from app.llm.runtime_config import (
    LLMConfigUpdate,
    LLMRuntimeConfig,
    clear_runtime_llm_config,
    save_runtime_llm_config,
)
from app.llm.schemas import (
    BacktestConfig,
    ParseStrategyRequest,
    ParseStrategyResponse,
    StrategySpec,
)
from app.models.backtest import BacktestRecord
from app.models.stats import Visitor

router = APIRouter(prefix="/api")


def _touch_visitor(db: Session, client_id: str) -> None:
    """Upsert a visitor row so the users counter grows with real traffic."""
    if not client_id or client_id == "_anonymous":
        return
    now = datetime.now(timezone.utc)
    row = db.get(Visitor, client_id)
    if row is None:
        db.add(Visitor(client_id=client_id, first_seen=now, last_seen=now))
    else:
        row.last_seen = now
    db.commit()


def _client_id(x_client_id: str | None = Header(default=None, alias="X-Client-Id")) -> str:
    """Normalize per-browser client id for history isolation.

    Always returns a stable id. Missing headers get an anonymous sentinel so
    list/get never leak another client's history.
    """
    if not x_client_id:
        return "_anonymous"
    value = x_client_id.strip()[:64]
    cleaned = "".join(ch for ch in value if ch.isalnum() or ch in "-_")
    return cleaned or "_anonymous"


class BacktestRequest(BaseModel):
    strategy_text: str = Field(min_length=5, max_length=4000)
    dataset_id: str = Field(min_length=1)
    strategy: StrategySpec | None = None
    config: BacktestConfig = Field(default_factory=BacktestConfig)
    asset: str | None = None

    @field_validator("strategy_text", mode="before")
    @classmethod
    def _clean_strategy(cls, v: object) -> object:
        from app.utils.normalize import normalize_strategy_text

        if isinstance(v, str):
            return normalize_strategy_text(v)
        return v


class BacktestSummary(BaseModel):
    id: int
    strategy_description: str
    dataset_name: str
    created_at: str
    parser: str
    total_return: float | None
    sharpe_ratio: float | None
    max_drawdown: float | None
    final_capital: float | None
    number_of_trades: int | None


class StatusResponse(BaseModel):
    status: str
    parser: str
    llm_enabled: bool
    llm_model: str
    llm_base_url: str = ""
    product: str = "Quantify"
    auth_required: bool = False
    runtime_llm_config_allowed: bool = True


@router.get("/health", response_model=StatusResponse)
def health() -> StatusResponse:
    settings = get_settings()
    return StatusResponse(
        status="ok",
        parser="llm" if settings.llm_enabled else "builtin",
        llm_enabled=settings.llm_enabled,
        llm_model=settings.llm_model,
        llm_base_url=settings.llm_base_url,
        product=settings.app_name,
        auth_required=settings.auth_required,
        runtime_llm_config_allowed=settings.runtime_llm_config_allowed,
    )


class PublicStats(BaseModel):
    users: int
    backtests: int
    releases: int
    users_live: int
    backtests_live: int
    updated_at: str


@router.get("/stats", response_model=PublicStats)
def public_stats(db: Session = Depends(get_db)) -> PublicStats:
    """Live counters for the landing page (baseline + real activity)."""
    settings = get_settings()
    users_live = db.query(Visitor).count()
    # Also count distinct clients from backtests that never pinged the landing.
    from sqlalchemy import distinct, func

    bt_clients = (
        db.query(func.count(distinct(BacktestRecord.client_id)))
        .filter(BacktestRecord.client_id != "")
        .scalar()
        or 0
    )
    users_live = max(users_live, int(bt_clients))
    backtests_live = db.query(BacktestRecord).count()
    return PublicStats(
        users=settings.stats_baseline_users + users_live,
        backtests=settings.stats_baseline_backtests + backtests_live,
        releases=settings.stats_releases,
        users_live=users_live,
        backtests_live=backtests_live,
        updated_at=datetime.now(timezone.utc).isoformat(),
    )


@router.post("/stats/ping")
def stats_ping(
    db: Session = Depends(get_db),
    client_id: str = Depends(_client_id),
) -> dict[str, Any]:
    """Register this browser as a visitor — bumps the users counter."""
    _touch_visitor(db, client_id)
    return {"ok": True, "client_id": client_id if client_id != "_anonymous" else None}


@router.get("/llm/status")
def llm_status() -> dict[str, Any]:
    """Return LLM provider status (key masked)."""
    status = LLMClient().status()
    settings = get_settings()
    status["runtime_config_allowed"] = settings.runtime_llm_config_allowed
    return status


@router.put("/llm/config")
def update_llm_config(body: LLMConfigUpdate) -> dict[str, Any]:
    """
    Save runtime LLM credentials (OpenAI-compatible).

    Disabled in production by default — set ALLOW_RUNTIME_LLM_CONFIG=true to enable.
    Prefer LLM_API_KEY env var for public deployments.
    """
    settings = get_settings()
    if not settings.runtime_llm_config_allowed:
        raise HTTPException(
            status_code=403,
            detail=(
                "Runtime LLM config is disabled. Set LLM_API_KEY in the server environment "
                "or ALLOW_RUNTIME_LLM_CONFIG=true."
            ),
        )
    if body.enabled and not body.api_key.strip():
        from app.llm.runtime_config import load_runtime_llm_config

        existing = load_runtime_llm_config()
        if existing and existing.api_key.strip():
            api_key = existing.api_key
        else:
            api_key = settings.llm_api_key
        if not api_key.strip():
            raise HTTPException(
                status_code=422,
                detail="api_key is required to enable the LLM parser",
            )
    else:
        api_key = body.api_key.strip()

    cfg = LLMRuntimeConfig(
        api_key=api_key if body.enabled else "",
        model=body.model.strip() or "gpt-4o-mini",
        base_url=body.base_url.strip() or "https://api.openai.com/v1",
        enabled=body.enabled,
    )
    save_runtime_llm_config(cfg)
    return LLMClient().status()


@router.delete("/llm/config")
def delete_llm_config() -> dict[str, Any]:
    """Clear runtime LLM config and fall back to environment / built-in parser."""
    settings = get_settings()
    if not settings.runtime_llm_config_allowed:
        raise HTTPException(
            status_code=403,
            detail="Runtime LLM config is disabled on this server.",
        )
    clear_runtime_llm_config()
    return LLMClient().status()


@router.post("/parse-strategy", response_model=ParseStrategyResponse)
async def api_parse_strategy(body: ParseStrategyRequest) -> ParseStrategyResponse:
    try:
        return await parse_strategy(
            body.text,
            initial_capital=body.initial_capital,
            risk_per_trade=body.risk_per_trade,
            commission=body.commission,
            slippage=body.slippage,
            asset=body.asset,
        )
    except StrategyParseError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/datasets")
def api_list_datasets() -> list[dict[str, str]]:
    return list_available_datasets()


@router.post("/data/upload")
async def api_upload_data(file: UploadFile = File(...)) -> dict[str, Any]:
    settings = get_settings()
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted")

    content = await file.read()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"File exceeds maximum size of {settings.max_upload_size_mb} MB",
        )

    try:
        df, validation = load_ohlcv_bytes(content, file.filename)
    except DataValidationError as exc:
        raise HTTPException(status_code=422, detail={"errors": exc.errors}) from exc

    safe_name = Path(file.filename).name.replace(" ", "_")
    unique = f"{uuid.uuid4().hex[:8]}_{safe_name}"
    dest = UPLOAD_DIR / unique
    df.to_csv(dest, index=False)

    return {
        "dataset_id": unique,
        "filename": safe_name,
        "rows": len(df),
        "date_start": validation.date_start,
        "date_end": validation.date_end,
        "warnings": validation.warnings,
    }


@router.post("/backtest")
async def api_run_backtest(
    body: BacktestRequest,
    db: Session = Depends(get_db),
    client_id: str = Depends(_client_id),
) -> dict[str, Any]:
    settings = get_settings()
    parser_used = "llm" if settings.llm_enabled else "builtin"
    parsed_warnings: list[str] = []

    try:
        if body.strategy is not None:
            strategy = body.strategy
            strategy = strategy.model_copy(
                update={
                    "initial_capital": body.config.initial_capital,
                    "commission": body.config.commission,
                    "slippage": body.config.slippage,
                }
            )
            if body.config.risk_per_trade is not None:
                risk = strategy.risk.model_copy(
                    update={"risk_per_trade": body.config.risk_per_trade}
                )
                strategy = strategy.model_copy(update={"risk": risk})
            parser_used = "provided"
        else:
            parsed = await parse_strategy(
                body.strategy_text,
                initial_capital=body.config.initial_capital,
                risk_per_trade=body.config.risk_per_trade,
                commission=body.config.commission,
                slippage=body.config.slippage,
                asset=body.asset,
            )
            strategy = parsed.strategy
            parser_used = parsed.parser
            parsed_warnings = parsed.warnings
    except StrategyParseError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        data = load_dataset(body.dataset_id)
    except DataValidationError as exc:
        raise HTTPException(status_code=422, detail={"errors": exc.errors}) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail=f"Dataset not found: {exc}") from exc

    try:
        engine = BacktestEngine(strategy)
        result = engine.run(data)
    except BacktestError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Backtest failed: {exc}") from exc

    metrics = result["metrics"]
    record = BacktestRecord(
        strategy_description=body.strategy_text,
        parsed_strategy_json=json.dumps(strategy.model_dump(mode="json")),
        dataset_name=body.dataset_id,
        config_json=json.dumps(body.config.model_dump(mode="json")),
        metrics_json=json.dumps(metrics),
        results_json=json.dumps(result),
        # demo_mode: 0 = LLM parser, 1 = builtin (legacy column; keep mapping consistent)
        demo_mode=0 if parser_used == "llm" else 1,
        client_id=client_id if client_id != "_anonymous" else "",
        created_at=datetime.now(timezone.utc),
        total_return=metrics.get("total_return"),
        sharpe_ratio=metrics.get("sharpe_ratio"),
        max_drawdown=metrics.get("max_drawdown"),
        final_capital=metrics.get("final_capital"),
        number_of_trades=metrics.get("number_of_trades"),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    _touch_visitor(db, client_id)

    return {
        "id": record.id,
        "parser": parser_used,
        "warnings": parsed_warnings,
        "strategy_description": body.strategy_text,
        "dataset_name": body.dataset_id,
        "created_at": record.created_at.isoformat(),
        **result,
    }


def _parser_label(demo_mode: int | bool | None) -> str:
    """Map legacy demo_mode column → parser label (0=llm, nonzero=builtin)."""
    return "llm" if demo_mode == 0 else "builtin"


@router.get("/backtests", response_model=list[BacktestSummary])
def api_list_backtests(
    db: Session = Depends(get_db),
    client_id: str = Depends(_client_id),
) -> list[BacktestSummary]:
    query = db.query(BacktestRecord)
    # Always scope to this browser — never return the full table.
    scope = "" if client_id == "_anonymous" else client_id
    query = query.filter(BacktestRecord.client_id == scope)
    rows = query.order_by(BacktestRecord.created_at.desc()).limit(100).all()
    return [
        BacktestSummary(
            id=r.id,
            strategy_description=r.strategy_description,
            dataset_name=r.dataset_name,
            created_at=r.created_at.isoformat() if r.created_at else "",
            parser=_parser_label(r.demo_mode),
            total_return=r.total_return,
            sharpe_ratio=r.sharpe_ratio,
            max_drawdown=r.max_drawdown,
            final_capital=r.final_capital,
            number_of_trades=r.number_of_trades,
        )
        for r in rows
    ]


@router.get("/backtests/{backtest_id}")
def api_get_backtest(
    backtest_id: int,
    db: Session = Depends(get_db),
    client_id: str = Depends(_client_id),
) -> dict[str, Any]:
    record = db.query(BacktestRecord).filter(BacktestRecord.id == backtest_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Backtest not found")
    scope = "" if client_id == "_anonymous" else client_id
    # Deny cross-client reads; also deny when record has a client and caller is anonymous.
    if (record.client_id or "") != scope:
        raise HTTPException(status_code=404, detail="Backtest not found")
    results = json.loads(record.results_json)
    return {
        "id": record.id,
        "strategy_description": record.strategy_description,
        "dataset_name": record.dataset_name,
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "parser": _parser_label(record.demo_mode),
        "config": json.loads(record.config_json),
        **results,
    }
