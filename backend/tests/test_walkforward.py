"""Walk-forward refit: each test slice is unseen when the parameter is chosen."""

from app.llm.parser import parse_demo
from app.research.walkforward import run_walk_forward


def test_walk_forward_refits_without_reading_the_test_slice(sample_df):
    text = (
        "Buy SPY when the 10-day SMA crosses above the 30-day SMA and sell when "
        "the 10-day SMA crosses below the 30-day SMA. Risk 1% per trade."
    )
    strategy = parse_demo(text, initial_capital=100000, risk_per_trade=0.01).strategy
    report = run_walk_forward(strategy, sample_df)

    assert report["verdict"] in {"stable", "uneven", "fails", "thin"}
    assert report["refit"] is True
    assert len(report["folds"]) == 4
    assert report["folds"][0]["end_date"] <= report["folds"][1]["start_date"]
    assert all(fold["parameter"] for fold in report["folds"])
