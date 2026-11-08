"""Multi-asset portfolio backtesting engine."""

from __future__ import annotations

from typing import Any
import numpy as np
import pandas as pd

from app.backtesting.engine import BacktestEngine
from app.backtesting.portfolio import EquityPoint
from app.backtesting.positions import TradeRecord
from app.llm.schemas import StrategySpec
from app.metrics.performance import compute_performance_metrics


class PortfolioBacktestEngine:
    """Simulates a strategy simultaneously across a basket of assets."""

    def __init__(self, strategy: StrategySpec, initial_capital: float = 100_000.0):
        self.strategy = strategy
        self.initial_capital = initial_capital

    def run(self, asset_data: dict[str, pd.DataFrame]) -> dict[str, Any]:
        if not asset_data:
            raise ValueError("No asset datasets provided for portfolio backtest")

        n_assets = len(asset_data)
        capital_per_asset = self.initial_capital / n_assets

        asset_runs: dict[str, dict[str, Any]] = {}
        all_trades: list[dict[str, Any]] = []

        # Run each asset with its allocated slice of capital
        for asset_name, df in asset_data.items():
            # Clone strategy with sliced capital
            sub_strat = self.strategy.model_copy(
                update={"initial_capital": capital_per_asset, "asset": asset_name}
            )
            engine = BacktestEngine(sub_strat)
            result = engine.run(df)
            asset_runs[asset_name] = result

            for t in result["trades"]:
                trade_dict = dict(t)
                trade_dict["asset"] = asset_name
                all_trades.append(trade_dict)

        # Aggregate equity curves by date
        equity_series_list: list[pd.DataFrame] = []
        for asset_name, res in asset_runs.items():
            eq = pd.DataFrame(res["equity_curve"])
            if not eq.empty and "date" in eq.columns and "equity" in eq.columns:
                sub = eq[["date", "equity"]].rename(columns={"equity": f"equity_{asset_name}"})
                sub["date"] = pd.to_datetime(sub["date"])
                equity_series_list.append(sub)

        if not equity_series_list:
            raise ValueError("Could not extract equity curves from backtest results")

        # Merge on date outer join, sort, and forward fill
        merged = equity_series_list[0]
        for other in equity_series_list[1:]:
            merged = pd.merge(merged, other, on="date", how="outer")
        merged = merged.sort_values("date").reset_index(drop=True)

        eq_cols = [c for c in merged.columns if c.startswith("equity_")]
        merged[eq_cols] = merged[eq_cols].ffill().bfill()
        merged["portfolio_equity"] = merged[eq_cols].sum(axis=1)

        # Calculate portfolio peak & drawdown
        peak = merged["portfolio_equity"].cummax()
        drawdown = (merged["portfolio_equity"] - peak) / peak.replace(0, np.nan)
        merged["drawdown"] = drawdown.fillna(0.0)

        # Portfolio metrics
        trade_records: list[TradeRecord] = []
        for t in all_trades:
            trade_records.append(
                TradeRecord(
                    entry_date=pd.to_datetime(t["entry_date"]).to_pydatetime(),
                    exit_date=pd.to_datetime(t["exit_date"]).to_pydatetime(),
                    entry_price=float(t["entry_price"]),
                    exit_price=float(t["exit_price"]),
                    quantity=float(t["quantity"]),
                    side=str(t["side"]),
                    pnl=float(t["pnl"]),
                    return_pct=float(t["return_pct"]),
                    commission=float(t["commission"]),
                    entry_reason=str(t.get("entry_reason", "")),
                    exit_reason=str(t.get("exit_reason", "")),
                    bars_held=int(t.get("bars_held", 0)),
                )
            )

        equity_points = [
            EquityPoint(
                date=pd.to_datetime(row["date"]).to_pydatetime(),
                equity=float(row["portfolio_equity"]),
                cash=float(row["portfolio_equity"]),
                market_value=0.0,
                unrealized_pnl=0.0,
                realized_pnl=0.0,
            )
            for _, row in merged.iterrows()
        ]

        metrics = compute_performance_metrics(
            equity_curve=equity_points,
            trades=trade_records,
            initial_capital=self.initial_capital,
        )

        equity_curve_out = [
            {
                "date": str(row["date"])[:10],
                "equity": round(float(row["portfolio_equity"]), 2),
                "drawdown": round(float(row["drawdown"]), 4),
            }
            for _, row in merged.iterrows()
        ]

        per_asset_summary = {
            name: {
                "total_return": res["metrics"].get("total_return"),
                "sharpe_ratio": res["metrics"].get("sharpe_ratio"),
                "max_drawdown": res["metrics"].get("max_drawdown"),
                "trades_count": len(res["trades"]),
            }
            for name, res in asset_runs.items()
        }

        return {
            "portfolio_metrics": metrics,
            "portfolio_equity_curve": equity_curve_out,
            "asset_results": per_asset_summary,
            "trades": sorted(all_trades, key=lambda x: str(x.get("entry_date", ""))),
        }
