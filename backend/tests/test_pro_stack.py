"""Research farm pieces, VaR, sessions, factors — offline where possible."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.data.sessions import filter_session
from app.llm.parser import parse_builtin
from app.research.factors import ols_beta_alpha
from app.research.risk_stats import historical_var_es, portfolio_risk_report
from app.backtesting.portfolio_engine import PortfolioBacktestEngine


def test_session_filter_keeps_rth_only():
    dates = pd.date_range("2024-01-02 09:00", periods=20, freq="30min")
    df = pd.DataFrame(
        {
            "date": dates.strftime("%Y-%m-%d %H:%M:%S"),
            "open": 1.0,
            "high": 1.1,
            "low": 0.9,
            "close": 1.0,
            "volume": 100,
        }
    )
    out = filter_session(df, session="rth")
    assert len(out) < len(df)
    mins = pd.to_datetime(out["date"]).dt.hour * 60 + pd.to_datetime(out["date"]).dt.minute
    assert mins.min() >= 9 * 60 + 30
    assert mins.max() < 16 * 60


def test_var_es_and_portfolio_risk():
    rng = np.random.default_rng(0)
    rets = rng.normal(0.0005, 0.01, 400)
    stats = historical_var_es(rets, 0.95)
    assert stats["var"] is not None and stats["var"] < 0
    assert stats["es"] is not None and stats["es"] <= stats["var"]
    equity = 100_000 * np.cumprod(1 + rets)
    curve = [{"date": f"2020-01-{i+1:02d}", "equity": float(e), "cash": float(e) * 0.4} for i, e in enumerate(equity[:28])]
    # pad dates properly via period index
    idx = pd.date_range("2020-01-01", periods=len(equity), freq="D")
    curve = [{"date": d.isoformat(), "equity": float(e), "cash": float(e) * 0.35} for d, e in zip(idx, equity)]
    report = portfolio_risk_report(curve)
    assert report["tails"]["0.95"]["var"] is not None
    assert report["margin"]["avg_invested"] == pytest.approx(0.65, abs=0.05)


def test_ols_beta():
    x = np.random.default_rng(1).normal(0, 0.01, 200)
    y = 0.0002 + 1.2 * x + np.random.default_rng(2).normal(0, 0.002, 200)
    out = ols_beta_alpha(y, x)
    assert out["beta"] == pytest.approx(1.2, abs=0.15)
    assert out["r2"] is not None and out["r2"] > 0.7


def test_multi_factor_report():
    from app.research.factors import multi_factor_report

    dates = pd.date_range("2020-01-01", periods=120, freq="D")
    rng = np.random.default_rng(4)
    equity = 100_000 * np.cumprod(1 + rng.normal(0.0004, 0.01, len(dates)))
    curve = [{"date": d.isoformat(), "equity": float(e)} for d, e in zip(dates, equity)]
    spy = pd.DataFrame({"date": dates, "close": 100 * np.cumprod(1 + rng.normal(0.0003, 0.009, len(dates)))})
    qqq = pd.DataFrame({"date": dates, "close": 100 * np.cumprod(1 + rng.normal(0.0005, 0.012, len(dates)))})
    out = multi_factor_report(curve, {"SPY": spy, "QQQ": qqq})
    assert out["count"] == 2
    assert len(out["rows"]) == 2


def test_shared_portfolio_includes_risk(two_assets_pro):
    spec = parse_builtin("Buy when SMA 5 crosses above SMA 15 and sell when it crosses below.").strategy
    out = PortfolioBacktestEngine(spec, capital_mode="shared").run(two_assets_pro)
    assert "risk" in out
    assert "tails" in out["risk"]


def test_single_engine_includes_risk(two_assets_pro):
    from app.backtesting.engine import BacktestEngine

    spec = parse_builtin("Buy when SMA 5 crosses above SMA 15 and sell when it crosses below.").strategy
    out = BacktestEngine(spec).run(two_assets_pro["AAA"])
    assert "risk" in out
    assert out["risk"]["tails"]["0.95"]["var"] is not None or out["metrics"]["number_of_trades"] == 0


@pytest.fixture
def two_assets_pro():
    dates = pd.date_range("2023-01-01", periods=120, freq="D")
    rng = np.random.default_rng(3)
    def mk(start):
        c = start + np.cumsum(rng.normal(0.05, 0.7, len(dates)))
        return pd.DataFrame(
            {"date": dates, "open": c - 0.1, "high": c + 0.4, "low": c - 0.4, "close": c, "volume": 1000}
        )
    return {"AAA": mk(100), "BBB": mk(80)}
