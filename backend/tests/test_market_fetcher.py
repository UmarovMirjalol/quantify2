"""Tests for market data fetcher helper functions."""

from app.data.market_fetcher import _normalize_symbol


def test_normalize_symbol():
    assert _normalize_symbol("BTC") == ("BTCUSDT", "BTC-USD")
    assert _normalize_symbol("ETH") == ("ETHUSDT", "ETH-USD")
    assert _normalize_symbol("SOLUSDT") == ("SOLUSDT", "SOL-USD")
    assert _normalize_symbol("SPY") == ("SPYUSDT", "SPY")
    assert _normalize_symbol("AAPL") == ("AAPLUSDT", "AAPL")
