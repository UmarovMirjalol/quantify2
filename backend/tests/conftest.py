"""Shared fixtures for backend tests."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[2]
SAMPLE = ROOT / "data" / "sample_data.csv"


@pytest.fixture
def sample_df() -> pd.DataFrame:
    if SAMPLE.exists():
        df = pd.read_csv(SAMPLE)
        df["date"] = pd.to_datetime(df["date"])
        return df
    # Fallback synthetic
    n = 200
    rng = np.random.default_rng(0)
    dates = pd.bdate_range("2022-01-03", periods=n)
    close = 100 + np.cumsum(rng.normal(0, 1, n))
    return pd.DataFrame(
        {
            "date": dates,
            "open": close,
            "high": close + 1,
            "low": close - 1,
            "close": close,
            "volume": rng.integers(1e6, 5e6, n),
        }
    )


@pytest.fixture
def trending_df() -> pd.DataFrame:
    """Down → up → down path so fast SMA crosses above then below slow SMA."""
    n = 150
    dates = pd.bdate_range("2023-01-02", periods=n)
    close = np.concatenate(
        [
            np.linspace(120, 90, 40),   # decline: fast below slow after warmup
            np.linspace(90, 140, 55),  # rally: produces cross_above
            np.linspace(140, 95, 55),  # selloff: produces cross_below
        ]
    )
    open_ = np.roll(close, 1)
    open_[0] = close[0]
    return pd.DataFrame(
        {
            "date": dates,
            "open": open_,
            "high": np.maximum(open_, close) + 0.5,
            "low": np.minimum(open_, close) - 0.5,
            "close": close,
            "volume": np.full(n, 1_000_000),
        }
    )
