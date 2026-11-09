"""Holdout audit: unseen bars plus a nearby-parameter sweep."""

from __future__ import annotations

from app.llm.parser import parse_demo
from app.research.stress import run_stress


def test_stress_splits_and_marks_the_chosen_parameter(sample_df):
    text = (
        "Buy SPY when the 20-day SMA crosses above the 50-day SMA and sell when "
        "the 20-day SMA crosses below the 50-day SMA. Risk 1% per trade."
    )
    strategy = parse_demo(text, initial_capital=100000, risk_per_trade=0.01).strategy
    report = run_stress(strategy, sample_df)

    assert report["verdict"] in {"holds", "fragile", "overfit", "thin"}
    assert report["headline"]
    assert report["split"]["in_sample_bars"] + report["split"]["holdout_bars"] == len(sample_df)
    assert report["holdout"]["start_date"] >= report["in_sample"]["end_date"]
    assert report["parameter"]["label"].startswith("SMA")
    chosen = [row for row in report["neighbors"] if row["chosen"]]
    assert len(chosen) == 1
    assert chosen[0]["value"] == 20
    assert any(row["value"] != 20 for row in report["neighbors"])
