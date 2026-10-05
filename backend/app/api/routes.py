"""REST API routes for the backtesting platform."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import UPLOAD_DIR, get_settings
from app.database import get_db
from app.data.loader import list_available_datasets, load_dataset
from app.data.validators import DataValidationError, load_ohlcv_bytes
from app.backtesting.engine import BacktestEngine, BacktestError
from app.llm.parser import StrategyParseError, parse_strategy
from app.llm.schemas import (
    BacktestConfig,
    ParseStrategyRequest,
    ParseStrategyResponse,
    StrategySpec,
)
from app.models.backtest import BacktestRecord

router = APIRouter(prefix="/api")


class BacktestRequest(BaseModel):
    strategy_text: str = Field(min_length=5, max_length=4000)
    dataset_id: str = Field(min_length=1)
    strategy: StrategySpec | None = None
    config: BacktestConfig = Field(default_factory=BacktestConfig)
    asset: str | None = None


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
    product: str = "QuantLLM Backtester"


@router.get("/health", response_model=StatusResponse)
def health() -> StatusResponse:
    settings = get_settings()
    return StatusResponse(
        status="ok",
        parser="llm" if settings.llm_enabled else "builtin",
        llm_enabled=settings.llm_enabled,
        llm_model=settings.llm_model,
    )


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
) -> dict[str, Any]:
    settings = get_settings()
    parser_used = "llm" if settings.llm_enabled else "builtin"
    parsed_warnings: list[str] = []

    try:
        if body.strategy is not None:
            strategy = body.strategy
            # Apply config overrides
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
        demo_mode=0 if parser_used == "llm" else 1,
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

    return {
        "id": record.id,
        "parser": parser_used,
        "warnings": parsed_warnings,
        "strategy_description": body.strategy_text,
        "dataset_name": body.dataset_id,
        "created_at": record.created_at.isoformat(),
        **result,
    }


@router.get("/backtests", response_model=list[BacktestSummary])
def api_list_backtests(db: Session = Depends(get_db)) -> list[BacktestSummary]:
    rows = (
        db.query(BacktestRecord)
        .order_by(BacktestRecord.created_at.desc())
        .limit(100)
        .all()
    )
    return [
        BacktestSummary(
            id=r.id,
            strategy_description=r.strategy_description,
            dataset_name=r.dataset_name,
            created_at=r.created_at.isoformat() if r.created_at else "",
            parser="builtin" if r.demo_mode else "llm",
            total_return=r.total_return,
            sharpe_ratio=r.sharpe_ratio,
            max_drawdown=r.max_drawdown,
            final_capital=r.final_capital,
            number_of_trades=r.number_of_trades,
        )
        for r in rows
    ]


@router.get("/backtests/{backtest_id}")
def api_get_backtest(backtest_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    record = db.query(BacktestRecord).filter(BacktestRecord.id == backtest_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Backtest not found")
    results = json.loads(record.results_json)
    return {
        "id": record.id,
        "strategy_description": record.strategy_description,
        "dataset_name": record.dataset_name,
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "parser": "builtin" if record.demo_mode else "llm",
        "config": json.loads(record.config_json),
        **results,
    }
