"""Synthetic markets and the no-peeking optimizer."""

import numpy as np
import pandas as pd

from app.llm.parser import parse_demo
from app.research.optimizer import run_optimizer, search_space
from app.research.synthetic import run_synthetic, synthetic_path

CROSSOVER = (
    "Buy SPY when the 10-day SMA crosses above the 30-day SMA and sell when "
    "the 10-day SMA crosses below the 30-day SMA."
)


def test_synthetic_path_keeps_bar_shape_and_length(sample_df):
    path = synthetic_path(sample_df, np.random.default_rng(3))
    assert len(path) == len(sample_df)
    assert (path["high"] >= path[["open", "close"]].max(axis=1) - 1e-9).all()
    assert (path["low"] <= path[["open", "close"]].min(axis=1) + 1e-9).all()
    assert path["close"].iloc[0] == sample_df["close"].iloc[0]
    assert not np.allclose(path["close"].to_numpy(), sample_df["close"].to_numpy())


def test_synthetic_report_is_reproducible(sample_df):
    strategy = parse_demo(CROSSOVER).strategy
    a = run_synthetic(strategy, sample_df, paths=20, seed=5)
    b = run_synthetic(strategy, sample_df, paths=20, seed=5)
    assert a == b
    assert a["paths"] == 20
    assert a["verdict"] in {"robust", "fragile", "history_only", "no_edge", "thin"}
    assert sum(a["histogram"]["counts"]) == 20
    assert 0.0 <= a["profitable_share"] <= 1.0


def test_crossover_search_space_covers_the_grid_and_marks_the_original():
    names, candidates = search_space(parse_demo(CROSSOVER).strategy)
    assert names == ["SMA fast", "SMA slow"]
    assert sum(c["original"] for c in candidates) == 1
    assert all(c["params"]["fast"] < c["params"]["slow"] for c in candidates)
    assert len(candidates) > 30


def test_rsi_search_space_tunes_period_and_threshold():
    strategy = parse_demo("Buy when RSI(14) falls below 30 and sell when RSI rises above 70.").strategy
    names, candidates = search_space(strategy)
    assert names == ["RSI period", "RSI threshold"]
    original = next(c for c in candidates if c["original"])
    assert original["params"] == {"period": 14, "threshold": 30.0}


def test_optimizer_never_scores_candidates_on_the_test_window(sample_df):
    strategy = parse_demo(CROSSOVER).strategy
    n = len(sample_df)
    poisoned = sample_df.copy()
    cut = int(n * 0.7)
    # Wreck the test window: if any candidate were ranked on it, training ranks would change.
    poisoned.loc[cut:, ["open", "high", "low", "close"]] *= np.linspace(1.0, 3.0, n - cut)[:, None]
    clean = run_optimizer(strategy, sample_df)
    dirty = run_optimizer(strategy, poisoned)
    assert [row["label"] for row in clean["top"]] == [row["label"] for row in dirty["top"]]
    assert clean["split"]["train_bars"] == cut
    assert clean["verdict"] in {"improves", "no_gain", "overfit", "already_best", "thin"}


def test_optimizer_returns_a_runnable_best_strategy(sample_df):
    report = run_optimizer(parse_demo(CROSSOVER).strategy, sample_df)
    if report["best"] is not None:
        assert report["best_strategy"]["entry_conditions"]
        assert report["trials"] >= report["eligible"]


def test_portfolio_reports_correlation_contribution_and_benchmark():
    from app.backtesting.portfolio_engine import PortfolioBacktestEngine

    dates = pd.date_range("2024-01-01", periods=120, freq="D")
    rng = np.random.default_rng(4)
    common = np.cumsum(rng.normal(0, 1, 120))
    assets = {}
    for name, noise in (("AAA", 0.2), ("BBB", 0.2), ("CCC", 3.0)):
        close = 100 + common + np.cumsum(rng.normal(0, noise, 120))
        assets[name] = pd.DataFrame(
            {"date": dates, "open": close, "high": close + 1, "low": close - 1, "close": close, "volume": 1000}
        )
    strategy = parse_demo("Buy when SMA 5 crosses above SMA 15 and sell when SMA 5 crosses below SMA 15.").strategy
    result = PortfolioBacktestEngine(strategy, initial_capital=90_000).run(assets)

    corr = result["correlation"]
    assert corr["assets"] == ["AAA", "BBB", "CCC"]
    assert len(corr["matrix"]) == 3 and corr["matrix"][0][0] == 1.0
    assert len(result["benchmark_equity_curve"]) == len(result["portfolio_equity_curve"])
    assert abs(result["benchmark_equity_curve"][0]["equity"] - 90_000) < 1e-6
    total = sum(a["pnl"] for a in result["asset_results"].values())
    assert abs(total - (result["portfolio_equity_curve"][-1]["equity"] - 90_000)) < 0.05
