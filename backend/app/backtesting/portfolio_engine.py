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
                "date": pd.Timestamp(row["date"]).isoformat(),
                "equity": round(float(row["portfolio_equity"]), 2),
                "drawdown": round(float(row["drawdown"]), 4),
            }
            for _, row in merged.iterrows()
        ]

        per_asset_summary = {}
        for name, res in asset_runs.items():
            final = float(merged[f"equity_{name}"].iloc[-1])
            pnl = final - capital_per_asset
            per_asset_summary[name] = {
                "total_return": res["metrics"].get("total_return"),
                "sharpe_ratio": res["metrics"].get("sharpe_ratio"),
                "max_drawdown": res["metrics"].get("max_drawdown"),
                "trades_count": len(res["trades"]),
                "final_equity": round(final, 2),
                "pnl": round(pnl, 2),
                "contribution": round(pnl / self.initial_capital, 4),
                "buy_hold_return": _buy_hold_return(asset_data[name]),
            }

        sleeve_returns = merged[eq_cols].pct_change().iloc[1:]
        names = [c.removeprefix("equity_") for c in eq_cols]
        corr = sleeve_returns.corr().fillna(0.0).to_numpy() if len(eq_cols) > 1 else np.ones((1, 1))
        off_diag = corr[~np.eye(len(names), dtype=bool)] if len(names) > 1 else np.array([])
        sleeve_vol = sleeve_returns.std().to_numpy()
        port_vol = float(merged["portfolio_equity"].pct_change().iloc[1:].std())
        weights = np.full(len(names), 1.0 / len(names))
        div_ratio = float(weights @ np.nan_to_num(sleeve_vol)) / port_vol if port_vol > 0 else None

        benchmark = self._benchmark(asset_data, merged["date"], capital_per_asset)

        return {
            "portfolio_metrics": metrics,
            "portfolio_equity_curve": equity_curve_out,
            "benchmark_equity_curve": benchmark,
            "asset_results": per_asset_summary,
            "correlation": {
                "assets": names,
                "matrix": [[round(float(v), 3) for v in row] for row in corr],
                "average": round(float(off_diag.mean()), 3) if off_diag.size else None,
            },
            "diversification_ratio": None if div_ratio is None else round(div_ratio, 3),
            "trades": sorted(all_trades, key=lambda x: str(x.get("entry_date", ""))),
        }

    @staticmethod
    def _benchmark(
        asset_data: dict[str, pd.DataFrame], dates: pd.Series, capital_per_asset: float
    ) -> list[dict[str, Any]]:
        frame = pd.DataFrame({"date": pd.to_datetime(dates)})
        cols = []
        for name, df in asset_data.items():
            px = df[["date", "close"]].copy()
            px["date"] = pd.to_datetime(px["date"])
            first = float(px["close"].iloc[0]) or 1.0
            px[f"bh_{name}"] = capital_per_asset * px["close"] / first
            frame = frame.merge(px[["date", f"bh_{name}"]], on="date", how="left")
            cols.append(f"bh_{name}")
        frame[cols] = frame[cols].ffill().fillna(capital_per_asset)
        total = frame[cols].sum(axis=1)
        return [
            {"date": d.isoformat(), "equity": round(float(v), 2)}
            for d, v in zip(frame["date"], total)
        ]


def _buy_hold_return(df: pd.DataFrame) -> float | None:
    if df.empty:
        return None
    first = float(df["close"].iloc[0])
    return round(float(df["close"].iloc[-1]) / first - 1.0, 4) if first else None
