"""Thin wrappers around the production backtesting stack."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd

from app.backtesting.engine import BacktestEngine
from app.backtesting.portfolio_engine import CapitalMode, PortfolioBacktestEngine
from app.data.loader import load_dataset
from app.data.validators import load_ohlcv_csv
from app.llm.parser import parse_builtin
from app.llm.schemas import StrategySpec
from app.research.farm import run_farm, run_playbook_farm
from app.research.paper import paper_bridge
from app.research.risk_stats import portfolio_risk_report


def load_csv(path: str | Path) -> pd.DataFrame:
    """Load a validated OHLCV CSV (split-adjusted when ``adj_close`` is present)."""
    return load_ohlcv_csv(path)


class Engine:
    """Look-ahead-safe backtester used by the Quantify web app."""

    def __init__(self, strategy: StrategySpec):
        self.strategy = strategy

    @classmethod
    def from_text(
        cls,
        text: str,
        *,
        initial_capital: float = 100_000.0,
        commission: float = 0.001,
        slippage: float = 0.0005,
        asset: str | None = None,
    ) -> "Engine":
        parsed = parse_builtin(
            text,
            initial_capital=initial_capital,
            commission=commission,
            slippage=slippage,
        )
        spec = parsed.strategy
        if asset:
            spec = spec.model_copy(update={"asset": asset.strip().upper()})
        return cls(spec)

    @classmethod
    def from_spec(cls, strategy: StrategySpec | dict[str, Any]) -> "Engine":
        if isinstance(strategy, dict):
            strategy = StrategySpec.model_validate(strategy)
        return cls(strategy)

    def run(self, data: pd.DataFrame | str, *, metrics_only: bool = False) -> dict[str, Any]:
        """Run on an OHLCV frame or a dataset id / CSV path known to the app."""
        if isinstance(data, str):
            path = Path(data)
            df = load_ohlcv_csv(path) if path.exists() else load_dataset(data)
        else:
            df = data
        return BacktestEngine(self.strategy).run(df, metrics_only=metrics_only)


def portfolio(
    strategy: StrategySpec | Engine | str,
    asset_data: dict[str, pd.DataFrame],
    *,
    initial_capital: float = 100_000.0,
    capital_mode: CapitalMode = "shared",
    max_positions: int | None = None,
) -> dict[str, Any]:
    """Multi-asset run. Default ``shared`` cash pool — signals compete for capital."""
    if isinstance(strategy, Engine):
        spec = strategy.strategy
    elif isinstance(strategy, str):
        spec = Engine.from_text(strategy, initial_capital=initial_capital).strategy
    else:
        spec = strategy
    return PortfolioBacktestEngine(
        spec,
        initial_capital=initial_capital,
        capital_mode=capital_mode,
        max_positions=max_positions,
    ).run(asset_data)


def farm(
    strategy: StrategySpec | Engine | str,
    *,
    universe: str | None = "etfs",
    tickers: list[str] | None = None,
    history: str = "5y",
) -> dict[str, Any]:
    if isinstance(strategy, Engine):
        spec = strategy.strategy
    elif isinstance(strategy, str):
        spec = Engine.from_text(strategy).strategy
    else:
        spec = strategy
    return run_farm(spec, universe=universe, tickers=tickers or [], history=history)


def playbook_farm(**kwargs: Any) -> dict[str, Any]:
    return run_playbook_farm(**kwargs)


def paper(strategy: StrategySpec | Engine | str, tickers: list[str], **kwargs: Any) -> dict[str, Any]:
    if isinstance(strategy, Engine):
        spec = strategy.strategy
    elif isinstance(strategy, str):
        spec = Engine.from_text(strategy).strategy
    else:
        spec = strategy
    return paper_bridge(spec, tickers, **kwargs)


def risk(equity_curve: list[dict[str, Any]]) -> dict[str, Any]:
    return portfolio_risk_report(equity_curve)
