"""Deflated Sharpe, cost break-even, and the two-parameter heatmap."""

from app.llm.parser import parse_demo
from app.research.robustness import cost_breakeven, deflated_sharpe, parameter_heatmap

CROSS = (
    "Buy SPY when the 10-day SMA crosses above the 30-day SMA and sell when "
    "the 10-day SMA crosses below the 30-day SMA. Risk 1% per trade."
)


def test_more_trials_raise_the_luck_bar():
    rng_equity = [100_000.0]
    for i in range(400):
        rng_equity.append(rng_equity[-1] * (1.0 + (0.002 if i % 3 else -0.0025)))
    one = deflated_sharpe(rng_equity, [1.2])
    many = deflated_sharpe(rng_equity, [1.2, 0.1, -0.4, 0.9, 1.5, -0.2, 0.3, 0.8, 1.1, -0.6])
    assert one["trials"] == 1
    assert many["expected_max_sharpe"] > one["expected_max_sharpe"]
    assert many["probability"] <= one["probability"]


def test_cost_sweep_starts_at_zero_and_reports_current_cost(sample_df):
    strategy = parse_demo(CROSS, commission=0.001, slippage=0.0005).strategy
    report = cost_breakeven(strategy, sample_df)
    assert report["points"][0]["cost"] == 0.0
    assert abs(report["current_cost"] - 0.0015) < 1e-9
    assert report["verdict"] in {"no_edge", "room", "gone", "thin"}


def test_heatmap_marks_the_chosen_cell(sample_df):
    strategy = parse_demo(CROSS).strategy
    report = parameter_heatmap(strategy, sample_df)
    assert report["available"] is True
    chosen = [cell for cell in report["cells"] if cell["chosen"]]
    assert len(chosen) == 1
    assert (chosen[0]["fast"], chosen[0]["slow"]) == (10, 30)
    assert all(cell["fast"] < cell["slow"] for cell in report["cells"])


def test_heatmap_declines_non_crossover(sample_df):
    strategy = parse_demo("Buy when RSI falls below 30 and sell when RSI rises above 70.").strategy
    assert parameter_heatmap(strategy, sample_df)["available"] is False
