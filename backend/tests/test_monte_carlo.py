"""Tests for Monte Carlo simulation engine."""

import numpy as np
import pytest

from app.metrics.monte_carlo import run_monte_carlo_simulation


def test_monte_carlo_insufficient_trades():
    res = run_monte_carlo_simulation([])
    assert res["num_simulations"] == 0
    assert "error" in res


def test_monte_carlo_with_trades():
    # 20 mock trades: alternating wins (+3%) and losses (-1.5%)
    trades = [
        {"return_pct": 0.03 if i % 2 == 0 else -0.015, "pnl": 300 if i % 2 == 0 else -150}
        for i in range(20)
    ]
    res = run_monte_carlo_simulation(trades, initial_capital=100_000.0, num_simulations=500)

    assert res["num_simulations"] == 500
    assert res["num_trades"] == 20
    assert 0.0 <= res["risk_of_ruin"] <= 1.0
    assert res["worst_drawdown_p95"] <= 0.0
    assert res["median_return"] > -1.0
    assert "fan_chart" in res
    assert len(res["fan_chart"]["p50"]) > 0
    assert len(res["fan_chart"]["steps"]) > 0
