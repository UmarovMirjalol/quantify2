"""'What if I had bought X' on a synthetic price path, no network."""

from datetime import date

import pandas as pd
import pytest

from app.research import whatif


@pytest.fixture
def prices(monkeypatch):
    idx = pd.bdate_range("2020-01-01", "2021-12-31")
    path = pd.Series([100.0 + i * 0.1 for i in range(len(idx))], index=idx)
    monkeypatch.setattr(whatif, "_closes", lambda ticker: (path, "test"))
    return path


def test_lump_sum_tracks_the_price_ratio(prices):
    r = whatif.what_if("XYZ", date(2020, 1, 1), 1000, 0)
    assert r["invested"] == pytest.approx(1000)
    assert r["value"] == pytest.approx(1000 * prices.iloc[-1] / prices.iloc[0])
    assert r["series"][-1]["date"] == "2021-12-31"


def test_monthly_only_buys_every_month_including_the_first(prices):
    r = whatif.what_if("XYZ", date(2020, 1, 1), 0, 100)
    assert r["invested"] == pytest.approx(24 * 100)


def test_lump_plus_monthly_adds_from_the_next_month(prices):
    r = whatif.what_if("XYZ", date(2020, 1, 1), 1000, 100)
    assert r["invested"] == pytest.approx(1000 + 23 * 100)


def test_start_before_history_is_clipped(prices):
    r = whatif.what_if("XYZ", date(1990, 1, 1), 1000, 0)
    assert r["clipped"] is True
    assert r["start_date"] == "2020-01-01"


def test_nothing_to_invest_is_rejected(prices):
    with pytest.raises(ValueError):
        whatif.what_if("XYZ", date(2020, 1, 1), 0, 0)
