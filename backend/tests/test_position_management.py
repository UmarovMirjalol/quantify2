"""Trailing stops, partial exits, breakeven and pyramiding: engine, standalone export, Pine."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.backtesting.engine import BacktestEngine
from app.data.loader import load_dataset
from app.export.pine_generator import generate_pine_script
from app.export.python_generator import generate_python_script
from app.llm.schemas import StrategySpec

ALWAYS = [{"left": {"indicator": "PRICE"}, "operator": "greater_than", "right": 0}]
NEVER = [{"left": {"indicator": "PRICE"}, "operator": "less_than", "right": 0}]
BASE = {
    "asset": "TEST",
    "initial_capital": 100000,
    "commission": 0.0,
    "slippage": 0.0,
    "position_sizing": "percent_capital",
    "risk": {"percent_capital": 0.3},
    "entry_conditions": ALWAYS,
    "exit_conditions": NEVER,
}


def _bars(closes: list[float]) -> pd.DataFrame:
    close = np.array(closes, dtype=float)
    return pd.DataFrame(
        {
            "date": pd.date_range("2024-01-01", periods=len(close), freq="D"),
            "open": close,
            "high": close,
            "low": close,
            "volume": 1_000,
            "close": close,
        }
    )


def _run(data: pd.DataFrame, **extra):
    return BacktestEngine(StrategySpec.model_validate({**BASE, **extra})).run(data)


def test_trailing_stop_follows_the_high_and_never_loosens():
    data = _bars([100, 100, 110, 120, 115, 113, 100, 100])
    trades = _run(data, trailing_stop=0.05, max_entries=1)["trades"]
    first = trades[0]
    assert first["exit_reason"] == "stop_loss"
    # Best price 120, so the stop sits at 114; bar 5 opens at 113, below it, and fills there.
    assert first["exit_price"] == pytest.approx(113)
    assert first["entry_price"] == pytest.approx(100)


def test_scale_out_closes_part_and_breakeven_protects_the_rest():
    data = _bars([100, 100, 104, 106, 103, 99, 98, 98])
    trades = _run(
        data,
        stop_loss=0.1,
        scale_out=[{"profit": 0.05, "fraction": 0.5}],
        breakeven_after_scale=True,
    )["trades"]
    partial, rest = trades[0], trades[1]
    assert partial["exit_reason"] == "scale_out"
    assert partial["exit_price"] == pytest.approx(106)
    assert partial["quantity"] == pytest.approx(rest["quantity"])
    # Without breakeven the 10% stop would wait for 90; with it the remainder leaves at the entry.
    assert rest["exit_reason"] == "stop_loss"
    assert rest["exit_price"] == pytest.approx(99)


def test_scale_out_fractions_must_fit_in_one_position():
    with pytest.raises(ValueError):
        StrategySpec.model_validate({**BASE, "scale_out": [{"profit": 0.05, "fraction": 0.7}, {"profit": 0.1, "fraction": 0.7}]})


def test_pyramiding_adds_units_up_to_the_limit():
    data = _bars([100 + i for i in range(15)])
    exit_high = [{"left": {"indicator": "PRICE"}, "operator": "greater_than", "right": 110}]
    single = _run(data, exit_conditions=exit_high)
    stacked = _run(data, exit_conditions=exit_high, max_entries=3)
    assert stacked["metrics"]["final_capital"] > single["metrics"]["final_capital"]
    assert stacked["trades"][0]["quantity"] == pytest.approx(3 * single["trades"][0]["quantity"], rel=0.05)
    assert stacked["trades"][0]["entry_price"] == pytest.approx(102, rel=1e-3)


@pytest.fixture(scope="module")
def sample():
    return load_dataset("sample_data.csv")


MANAGED = [
    {"trailing_stop": 0.04},
    {"stop_loss": 0.06, "scale_out": [{"profit": 0.03, "fraction": 0.3}, {"profit": 0.08, "fraction": 0.4}], "breakeven_after_scale": True},
    {"stop_loss": 0.05, "take_profit": 0.15, "max_entries": 3, "trailing_stop": 0.07},
    {"side": "short", "trailing_stop": 0.05, "scale_out": [{"profit": 0.04, "fraction": 0.5}], "max_entries": 2},
]


@pytest.mark.parametrize("extra", MANAGED)
def test_standalone_export_matches_managed_positions(sample, extra):
    spec = {
        **BASE,
        "commission": 0.001,
        "slippage": 0.0005,
        "entry_conditions": [
            {"left": {"indicator": "SMA", "period": 10}, "operator": "greater_than", "right": {"indicator": "SMA", "period": 30}}
        ],
        "exit_conditions": [
            {"left": {"indicator": "SMA", "period": 10}, "operator": "cross_below", "right": {"indicator": "SMA", "period": 30}}
        ],
        **extra,
    }
    strategy = StrategySpec.model_validate(spec)
    expected = BacktestEngine(strategy).run(sample)
    assert len(expected["trades"]) > 0
    namespace: dict = {"__name__": "exported"}
    exec(compile(generate_python_script(strategy, "test"), "exported.py", "exec"), namespace)  # noqa: S102
    trades, equity, stats = namespace["run"](sample.copy())
    assert len(trades) == len(expected["trades"])
    assert stats["final_equity"] == pytest.approx(expected["metrics"]["final_capital"], rel=1e-9)
    assert equity[-1] == pytest.approx(expected["equity_curve"][-1]["equity"], rel=1e-9)


def test_pine_export_includes_management():
    strategy = StrategySpec.model_validate(
        {**BASE, "stop_loss": 0.05, "trailing_stop": 0.03, "scale_out": [{"profit": 0.05, "fraction": 0.5}], "breakeven_after_scale": True, "max_entries": 3}
    )
    pine = generate_pine_script(strategy, "managed")
    assert "pyramiding=3" in pine
    assert "trail_level" in pine
    assert 'strategy.exit("Part 1"' in pine
    assert "qty_percent = 50" in pine
