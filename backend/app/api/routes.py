"""REST API routes for the backtesting platform."""

from __future__ import annotations

import json
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.config import UPLOAD_DIR, get_settings
from app.database import get_db
from app.data.loader import list_available_datasets, load_dataset
from app.data.market_fetcher import fetch_and_save_market_data
from app.data.validators import DataValidationError, load_ohlcv_bytes
from app.backtesting.engine import BacktestEngine, BacktestError
from app.backtesting.portfolio_engine import PortfolioBacktestEngine
from app.export.pine_generator import generate_pine_script
from app.export.python_generator import generate_python_script
from app.metrics.monte_carlo import run_monte_carlo_simulation
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
from app.playbook import PLAYBOOK, RELEASES
from app.research.market import market_exposure
from app.research.optimizer import run_optimizer
from app.research.synthetic import run_synthetic
from app.research.robustness import cost_breakeven, deflated_sharpe, parameter_heatmap
from app.research.stress import run_stress
from app.research.verdict import build_verdict
from app.research.walkforward import run_walk_forward
from app.stats_drift import daily_user_offset
from app.stats_store import record_backtest, record_visitor, redis_counts, sqlite_counts

router = APIRouter(prefix="/api")


def _truncate_strategy(text: str, limit: int = 96) -> str:
    cleaned = " ".join((text or "").split())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1].rstrip() + "…"


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
    # Durable cross-instance counter (Vercel /tmp SQLite is not shared).
    record_visitor(client_id)


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
    redis = redis_counts()
    if redis is not None:
        users_live, backtests_live = redis
    else:
        users_live, backtests_live = sqlite_counts(db)
    return PublicStats(
        users=settings.stats_baseline_users + daily_user_offset() + users_live,
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


class PulseItem(BaseModel):
    strategy: str
    dataset: str
    parser: str
    total_return: float | None
    sharpe_ratio: float | None
    max_drawdown: float | None
    number_of_trades: int | None
    created_at: str
    sample: bool = False


class PulseResponse(BaseModel):
    items: list[PulseItem]
    updated_at: str


@router.get("/pulse", response_model=PulseResponse)
def public_pulse(db: Session = Depends(get_db)) -> PulseResponse:
    """Anonymized recent backtests so the landing never looks empty."""
    rows = (
        db.query(BacktestRecord)
        .order_by(BacktestRecord.created_at.desc())
        .limit(12)
        .all()
    )
    items: list[PulseItem] = [
        PulseItem(
            strategy=_truncate_strategy(r.strategy_description),
            dataset=r.dataset_name or "sample",
            parser=_parser_label(r.demo_mode),
            total_return=r.total_return,
            sharpe_ratio=r.sharpe_ratio,
            max_drawdown=r.max_drawdown,
            number_of_trades=r.number_of_trades,
            created_at=r.created_at.isoformat() if r.created_at else "",
            sample=False,
        )
        for r in rows
    ]
    if not items:
        # Seeded samples when the DB is fresh — replaced by real runs as people test.
        items = [
            PulseItem(
                strategy=_truncate_strategy(p["text"]),
                dataset="sample_data.csv",
                parser="builtin",
                total_return=vals[0],
                sharpe_ratio=vals[1],
                max_drawdown=vals[2],
                number_of_trades=vals[3],
                created_at=datetime.now(timezone.utc).isoformat(),
                sample=True,
            )
            for p, vals in zip(
                PLAYBOOK[:4],
                [
                    (0.084, 1.12, -0.062, 36),
                    (0.041, 0.78, -0.048, 52),
                    (0.113, 1.34, -0.091, 28),
                    (0.027, 0.55, -0.039, 44),
                ],
                strict=True,
            )
        ]
    return PulseResponse(
        items=items,
        updated_at=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/playbook")
def strategy_playbook() -> dict[str, Any]:
    """Curated strategies for the gallery / workspace presets."""
    return {"items": PLAYBOOK, "count": len(PLAYBOOK)}


@router.get("/releases")
def product_releases() -> dict[str, Any]:
    settings = get_settings()
    return {"items": RELEASES, "count": settings.stats_releases}


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


class FetchMarketDataRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=20, default="BTCUSDT")
    interval: str = Field(default="1d", pattern=r"^(5m|15m|1h|4h|1d|1D)$")


@router.post("/market/fetch")
def api_fetch_market_data(req: FetchMarketDataRequest) -> dict[str, Any]:
    try:
        return fetch_and_save_market_data(req.ticker, interval=req.interval)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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
    record_backtest()

    return {
        "id": record.id,
        "parser": parser_used,
        "warnings": parsed_warnings,
        "strategy_description": body.strategy_text,
        "dataset_name": body.dataset_id,
        "created_at": record.created_at.isoformat(),
        **result,
    }


class PortfolioBacktestRequest(BaseModel):
    strategy: StrategySpec | None = None
    strategy_text: str | None = Field(default=None, max_length=4000)
    datasets: list[str] = Field(
        default_factory=lambda: ["sample_data.csv", "sample_intraday_15m.csv"],
        min_length=1,
        max_length=12,
    )
    initial_capital: float = Field(default=100_000.0, gt=0)
    commission: float = Field(default=0.001, ge=0, le=0.05)
    slippage: float = Field(default=0.0005, ge=0, le=0.05)


@router.post("/backtest/portfolio")
async def api_run_portfolio_backtest(req: PortfolioBacktestRequest) -> dict[str, Any]:
    """Run one rule set on a basket of assets with equal capital per sleeve."""
    try:
        if req.strategy is not None:
            strategy = req.strategy
        elif req.strategy_text:
            strategy = (await parse_strategy(req.strategy_text)).strategy
        else:
            raise HTTPException(status_code=400, detail="Must provide strategy or strategy_text")
    except StrategyParseError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    strategy = strategy.model_copy(update={"commission": req.commission, "slippage": req.slippage})

    loaded_datasets: dict[str, Any] = {}
    for ds_id in dict.fromkeys(req.datasets):
        try:
            df = load_dataset(ds_id)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=400, detail=f"Failed loading dataset '{ds_id}': {exc}") from exc
        name = Path(ds_id).stem.upper()
        while name in loaded_datasets:
            name += "_2"
        loaded_datasets[name] = df

    try:
        result = PortfolioBacktestEngine(strategy, initial_capital=req.initial_capital).run(loaded_datasets)
    except (BacktestError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "strategy": strategy.model_dump(mode="json"),
        "datasets": list(loaded_datasets.keys()),
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
    return _backtest_payload(record, results)


@router.get("/backtests/{backtest_id}/stress")
def api_backtest_stress(
    backtest_id: int,
    db: Session = Depends(get_db),
    client_id: str = Depends(_client_id),
) -> dict[str, Any]:
    """Rerun the saved spec on a 70/30 holdout and on nearby entry parameters."""
    record = _owned_backtest(db, backtest_id, client_id)
    try:
        strategy = StrategySpec.model_validate(json.loads(record.parsed_strategy_json))
        data = load_dataset(record.dataset_name)
        return run_stress(strategy, data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except DataValidationError as exc:
        raise HTTPException(status_code=422, detail={"errors": exc.errors}) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Stress test failed: {exc}") from exc


@router.get("/backtests/{backtest_id}/walk-forward")
def api_backtest_walk_forward(
    backtest_id: int,
    db: Session = Depends(get_db),
    client_id: str = Depends(_client_id),
) -> dict[str, Any]:
    """Refit the entry parameter on past bars and score only the next slice."""
    record = _owned_backtest(db, backtest_id, client_id)
    try:
        strategy = StrategySpec.model_validate(json.loads(record.parsed_strategy_json))
        data = load_dataset(record.dataset_name)
        return run_walk_forward(strategy, data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except DataValidationError as exc:
        raise HTTPException(status_code=422, detail={"errors": exc.errors}) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Walk-forward failed: {exc}") from exc


@router.get("/backtests/{backtest_id}/robustness")
def api_backtest_robustness(
    backtest_id: int,
    db: Session = Depends(get_db),
    client_id: str = Depends(_client_id),
) -> dict[str, Any]:
    """Deflated Sharpe over this browser's tries, cost break-even, and a parameter heatmap."""
    record = _owned_backtest(db, backtest_id, client_id)
    try:
        strategy = StrategySpec.model_validate(json.loads(record.parsed_strategy_json))
        data = load_dataset(record.dataset_name)
        return _robustness(db, record, strategy, data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except DataValidationError as exc:
        raise HTTPException(status_code=422, detail={"errors": exc.errors}) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Robustness check failed: {exc}") from exc


def _research(backtest_id: int, db: Session, client_id: str, label: str, run: Any) -> dict[str, Any]:
    record = _owned_backtest(db, backtest_id, client_id)
    try:
        strategy = StrategySpec.model_validate(json.loads(record.parsed_strategy_json))
        data = load_dataset(record.dataset_name)
        return run(record, strategy, data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except DataValidationError as exc:
        raise HTTPException(status_code=422, detail={"errors": exc.errors}) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"{label} failed: {exc}") from exc


@router.get("/backtests/{backtest_id}/optimize")
def api_backtest_optimize(
    backtest_id: int,
    db: Session = Depends(get_db),
    client_id: str = Depends(_client_id),
) -> dict[str, Any]:
    """Grid-search the entry parameter on the first 70% only, then judge the winner on the last 30%."""
    return _research(backtest_id, db, client_id, "Optimizer", lambda _r, s, d: run_optimizer(s, d))


@router.get("/backtests/{backtest_id}/synthetic")
def api_backtest_synthetic(
    backtest_id: int,
    db: Session = Depends(get_db),
    client_id: str = Depends(_client_id),
) -> dict[str, Any]:
    """Rerun the rules on 100 block-bootstrapped alternate histories of the same asset."""
    return _research(
        backtest_id, db, client_id, "Synthetic markets", lambda r, s, d: run_synthetic(s, d, seed=r.id)
    )


def _robustness(db: Session, record: BacktestRecord, strategy: StrategySpec, data: Any) -> dict[str, Any]:
    trials = (
        db.query(BacktestRecord.sharpe_ratio)
        .filter(
            BacktestRecord.client_id == (record.client_id or ""),
            BacktestRecord.dataset_name == record.dataset_name,
        )
        .all()
    )
    trial_sharpes = [float(row[0]) for row in trials if row[0] is not None]
    if not trial_sharpes:
        trial_sharpes = [float(record.sharpe_ratio or 0.0)]
    equity = [float(pt["equity"]) for pt in json.loads(record.results_json).get("equity_curve", [])]
    return {
        "deflated": deflated_sharpe(equity, trial_sharpes),
        "costs": cost_breakeven(strategy, data),
        "heatmap": parameter_heatmap(strategy, data),
    }


def _verdict_for(db: Session, record: BacktestRecord) -> dict[str, Any]:
    """Run every check once and cache the combined verdict on the record."""
    results = _with_market(json.loads(record.results_json))
    if results.get("verdict"):
        return results["verdict"]

    def attempt(run: Any) -> Any:
        try:
            return run()
        except Exception:  # noqa: BLE001
            return None

    strategy = attempt(lambda: StrategySpec.model_validate(json.loads(record.parsed_strategy_json)))
    data = attempt(lambda: load_dataset(record.dataset_name))
    stress = walk = robust = synthetic = None
    if strategy is not None and data is not None:
        stress = attempt(lambda: run_stress(strategy, data))
        walk = attempt(lambda: run_walk_forward(strategy, data))
        robust = attempt(lambda: _robustness(db, record, strategy, data))
        synthetic = attempt(lambda: run_synthetic(strategy, data, seed=record.id))
    verdict = build_verdict(results, stress=stress, walk=walk, robust=robust, synthetic=synthetic)
    results["verdict"] = verdict
    record.results_json = json.dumps(results)
    db.commit()
    return verdict


@router.get("/backtests/{backtest_id}/verdict")
def api_backtest_verdict(
    backtest_id: int,
    db: Session = Depends(get_db),
    client_id: str = Depends(_client_id),
) -> dict[str, Any]:
    """Holdout, walk-forward, luck, costs, heatmap, regimes, alpha, and Monte Carlo in one grade."""
    return _verdict_for(db, _owned_backtest(db, backtest_id, client_id))


@router.post("/backtests/{backtest_id}/share")
def api_share_backtest(
    backtest_id: int,
    db: Session = Depends(get_db),
    client_id: str = Depends(_client_id),
) -> dict[str, Any]:
    """Create (or return) a read-only public link for this run."""
    record = _owned_backtest(db, backtest_id, client_id)
    _verdict_for(db, record)
    if not record.share_token:
        record.share_token = secrets.token_urlsafe(16)[:22]
        db.commit()
    return {"token": record.share_token}


@router.delete("/backtests/{backtest_id}/share")
def api_unshare_backtest(
    backtest_id: int,
    db: Session = Depends(get_db),
    client_id: str = Depends(_client_id),
) -> dict[str, Any]:
    """Revoke the public link; the old URL stops working."""
    record = _owned_backtest(db, backtest_id, client_id)
    record.share_token = None
    db.commit()
    return {"token": None}


@router.get("/reports/{token}")
def api_public_report(token: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Read-only report for anyone holding the link."""
    if not token or len(token) > 32:
        raise HTTPException(status_code=404, detail="Report not found")
    record = db.query(BacktestRecord).filter(BacktestRecord.share_token == token).first()
    if not record:
        raise HTTPException(status_code=404, detail="Report not found")
    payload = _backtest_payload(record, json.loads(record.results_json))
    payload["shared"] = True
    return payload


def _with_market(results: dict[str, Any]) -> dict[str, Any]:
    """Backfill alpha/beta for runs saved before the engine computed it."""
    if "market" not in results and results.get("equity_curve") and results.get("price_series"):
        results["market"] = market_exposure(
            [float(pt["equity"]) for pt in results["equity_curve"]],
            [float(bar["close"]) for bar in results["price_series"]],
        )
    return results


def _owned_backtest(db: Session, backtest_id: int, client_id: str) -> BacktestRecord:
    record = db.query(BacktestRecord).filter(BacktestRecord.id == backtest_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Backtest not found")
    scope = "" if client_id == "_anonymous" else client_id
    if (record.client_id or "") != scope:
        raise HTTPException(status_code=404, detail="Backtest not found")
    return record


def _backtest_payload(record: BacktestRecord, results: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.id,
        "strategy_description": record.strategy_description,
        "dataset_name": record.dataset_name,
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "parser": _parser_label(record.demo_mode),
        "config": json.loads(record.config_json),
        "share_token": record.share_token,
        **_with_market(results),
    }


class ExportStrategyRequest(BaseModel):
    strategy: StrategySpec
    format: Literal["pine", "python"] = "pine"
    title: str | None = None


class ExportStrategyResponse(BaseModel):
    code: str
    format: str
    filename: str


@router.post("/export", response_model=ExportStrategyResponse)
def api_export_strategy(req: ExportStrategyRequest) -> ExportStrategyResponse:
    if req.format == "pine":
        code = generate_pine_script(req.strategy, title=req.title)
        filename = f"{req.strategy.asset.lower()}_strategy.pine"
    else:
        code = generate_python_script(req.strategy, title=req.title)
        filename = f"{req.strategy.asset.lower()}_bot.py"
    return ExportStrategyResponse(code=code, format=req.format, filename=filename)


@router.get("/backtests/{backtest_id}/export/{format}", response_model=ExportStrategyResponse)
def api_export_backtest(
    backtest_id: int,
    format: Literal["pine", "python"],
    db: Session = Depends(get_db),
    client_id: str = Depends(_client_id),
) -> ExportStrategyResponse:
    record = db.query(BacktestRecord).filter(BacktestRecord.id == backtest_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Backtest not found")
    scope = "" if client_id == "_anonymous" else client_id
    if (record.client_id or "") != scope:
        raise HTTPException(status_code=404, detail="Backtest not found")

    results = json.loads(record.results_json)
    strategy_raw = results.get("strategy")
    if not strategy_raw:
        raise HTTPException(status_code=400, detail="Backtest record has no strategy spec")
    strategy = StrategySpec.model_validate(strategy_raw)

    if format == "pine":
        code = generate_pine_script(strategy, title=record.strategy_description)
        filename = f"quantify_backtest_{backtest_id}.pine"
    else:
        code = generate_python_script(strategy, title=record.strategy_description)
        filename = f"quantify_backtest_{backtest_id}.py"
    return ExportStrategyResponse(code=code, format=format, filename=filename)


@router.get("/backtests/{backtest_id}/monte-carlo")
def api_get_monte_carlo(
    backtest_id: int,
    db: Session = Depends(get_db),
    client_id: str = Depends(_client_id),
) -> dict[str, Any]:
    record = db.query(BacktestRecord).filter(BacktestRecord.id == backtest_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Backtest not found")
    scope = "" if client_id == "_anonymous" else client_id
    if (record.client_id or "") != scope:
        raise HTTPException(status_code=404, detail="Backtest not found")

    results = json.loads(record.results_json)
    if "monte_carlo" in results and results["monte_carlo"].get("num_simulations", 0) > 0:
        return results["monte_carlo"]

    trades = results.get("trades", [])
    config = json.loads(record.config_json)
    initial_cap = float(config.get("initial_capital", 100_000.0))
    return run_monte_carlo_simulation(trades, initial_capital=initial_cap)
