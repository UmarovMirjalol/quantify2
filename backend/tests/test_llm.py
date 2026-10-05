"""Tests for LLM client path with mocked provider responses."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import get_settings
from app.llm.client import LLMClient, LLMClientError
from app.llm.parser import parse_with_llm
from app.llm.runtime_config import (
    LLMRuntimeConfig,
    clear_runtime_llm_config,
    save_runtime_llm_config,
)


@pytest.fixture(autouse=True)
def _clean_runtime(tmp_path, monkeypatch):
    # Point runtime config at temp file
    import app.llm.runtime_config as rc

    path = tmp_path / ".llm_runtime.json"
    monkeypatch.setattr(rc, "RUNTIME_CONFIG_PATH", path)
    clear_runtime_llm_config()
    get_settings.cache_clear()
    yield
    clear_runtime_llm_config()
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_parse_with_llm_mocked_openai():
    """LLM path: mock chat completion → validated StrategySpec."""
    save_runtime_llm_config(
        LLMRuntimeConfig(
            api_key="sk-test-key-1234567890",
            model="gpt-4o-mini",
            base_url="https://api.openai.com/v1",
            enabled=True,
        )
    )
    get_settings.cache_clear()

    payload = {
        "asset": "SPY",
        "timeframe": "1d",
        "initial_capital": 100000,
        "entry_conditions": [
            {
                "indicator": "SMA",
                "fast_period": 10,
                "slow_period": 30,
                "condition": "cross_above",
            }
        ],
        "exit_conditions": [
            {
                "indicator": "SMA",
                "fast_period": 10,
                "slow_period": 30,
                "condition": "cross_below",
            }
        ],
        "risk": {"risk_per_trade": 0.01},
        "position_sizing": "risk_based",
    }

    mock_message = MagicMock()
    mock_message.content = json.dumps(payload)
    mock_choice = MagicMock()
    mock_choice.message = mock_message
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]

    mock_create = AsyncMock(return_value=mock_response)
    mock_client = MagicMock()
    mock_client.chat.completions.create = mock_create

    with patch("openai.AsyncOpenAI", return_value=mock_client):
        result = await parse_with_llm(
            "Buy when 10 SMA crosses above 30 SMA",
            initial_capital=100000,
            risk_per_trade=0.01,
        )

    assert result.parser == "llm"
    assert result.strategy.entry_conditions[0].left.period == 10
    assert result.strategy.entry_conditions[0].right.period == 30
    mock_create.assert_awaited()
    # Ensure response_format json_object was requested
    kwargs = mock_create.await_args.kwargs
    assert kwargs.get("response_format") == {"type": "json_object"}
    assert kwargs.get("model") == "gpt-4o-mini"


@pytest.mark.asyncio
async def test_llm_client_disabled_without_key():
    clear_runtime_llm_config()
    get_settings.cache_clear()
    client = LLMClient()
    assert client.enabled is False
    with pytest.raises(LLMClientError):
        await client.chat_json(system="s", user="u")


def test_llm_status_masks_key():
    save_runtime_llm_config(
        LLMRuntimeConfig(api_key="sk-abcdefghijklmnop", model="gpt-4o-mini", enabled=True)
    )
    get_settings.cache_clear()
    status = LLMClient().status()
    assert status["enabled"] is True
    assert status["api_key_configured"] is True
    assert "sk-" in status["api_key_masked"] or "…" in status["api_key_masked"]
    assert "abcdefghijklmnop" not in status["api_key_masked"]
