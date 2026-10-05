"""Tests for paste-normalization helpers."""

from __future__ import annotations

from app.llm.parser import parse_demo
from app.llm.schemas import BacktestConfig, ParseStrategyRequest
from app.utils.normalize import normalize_fraction, normalize_secret, normalize_strategy_text


def test_normalize_strategy_strips_quotes_and_smart_quotes():
    raw = '  “Buy when the 20-day SMA crosses above the 50-day SMA and sell when it crosses below.”  '
    cleaned = normalize_strategy_text(raw)
    assert not cleaned.startswith('"')
    assert "20-day SMA" in cleaned
    parsed = parse_demo(cleaned)
    assert parsed.strategy.asset == "SPY"


def test_normalize_secret_strips_bearer_and_whitespace():
    assert normalize_secret('  Bearer  sk-abc 123 \n') == "sk-abc123"
    assert normalize_secret('"tok_value"') == "tok_value"


def test_normalize_fraction_accepts_percent():
    assert normalize_fraction(1) == 0.01
    assert normalize_fraction(0.01) == 0.01
    assert normalize_fraction(2.5) == 0.025


def test_backtest_config_accepts_percent_risk():
    cfg = BacktestConfig(risk_per_trade=1, commission=1, slippage=1)
    assert cfg.risk_per_trade == 0.01
    assert cfg.commission == 0.01
    assert cfg.slippage == 0.01


def test_parse_request_cleans_pasted_text():
    req = ParseStrategyRequest(
        text='  "Buy when RSI falls below 30 and sell when RSI rises above 70."  '
    )
    assert req.text.startswith("Buy when RSI")
