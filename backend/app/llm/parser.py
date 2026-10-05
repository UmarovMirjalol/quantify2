"""Natural language strategy parser with OpenAI-compatible API and demo mode."""

from __future__ import annotations

import json
import re
from typing import Any

from app.config import get_settings
from app.llm.prompts import SYSTEM_PROMPT, build_user_prompt
from app.llm.schemas import ParseStrategyResponse, StrategySpec
from app.strategies.interpreter import validate_strategy_spec


class StrategyParseError(Exception):
    """Raised when strategy text cannot be parsed into a valid StrategySpec."""


# Deterministic demo patterns (order matters — first match wins)
DEMO_STRATEGIES: list[tuple[re.Pattern[str], dict[str, Any]]] = [
    (
        re.compile(
            r"20[-\s]?day.*(?:sma|moving average).*cross(?:es)?\s+above.*50|"
            r"sma.*20.*cross(?:es)?\s+above.*50|"
            r"buy when the 20.*50.*sell when",
            re.IGNORECASE,
        ),
        {
            "asset": "SPY",
            "timeframe": "1d",
            "initial_capital": 100000,
            "entry_conditions": [
                {
                    "indicator": "SMA",
                    "fast_period": 20,
                    "slow_period": 50,
                    "condition": "cross_above",
                }
            ],
            "exit_conditions": [
                {
                    "indicator": "SMA",
                    "fast_period": 20,
                    "slow_period": 50,
                    "condition": "cross_below",
                }
            ],
            "risk": {"risk_per_trade": 0.01},
            "stop_loss": None,
            "take_profit": None,
            "position_sizing": "risk_based",
        },
    ),
    (
        re.compile(
            r"rsi.*(?:below|falls?\s+below|under)\s*30|"
            r"buy when rsi.*30.*sell when rsi.*70",
            re.IGNORECASE,
        ),
        {
            "asset": "SPY",
            "timeframe": "1d",
            "initial_capital": 100000,
            "entry_conditions": [
                {
                    "indicator": "RSI",
                    "period": 14,
                    "condition": "less_than",
                    "threshold": 30,
                }
            ],
            "exit_conditions": [
                {
                    "indicator": "RSI",
                    "period": 14,
                    "condition": "greater_than",
                    "threshold": 70,
                }
            ],
            "risk": {"risk_per_trade": 0.01},
            "stop_loss": None,
            "take_profit": None,
            "position_sizing": "risk_based",
        },
    ),
    (
        re.compile(
            r"ema.*12.*cross(?:es)?\s+above.*26|"
            r"12[-\s]?day.*ema.*26|"
            r"macd.*cross(?:es)?\s+above",
            re.IGNORECASE,
        ),
        {
            "asset": "SPY",
            "timeframe": "1d",
            "initial_capital": 100000,
            "entry_conditions": [
                {
                    "indicator": "EMA",
                    "fast_period": 12,
                    "slow_period": 26,
                    "condition": "cross_above",
                }
            ],
            "exit_conditions": [
                {
                    "indicator": "EMA",
                    "fast_period": 12,
                    "slow_period": 26,
                    "condition": "cross_below",
                }
            ],
            "risk": {"risk_per_trade": 0.01},
            "stop_loss": 0.02,
            "take_profit": 0.05,
            "position_sizing": "risk_based",
        },
    ),
    (
        re.compile(
            r"bollinger|price.*below.*lower\s+band|touches?\s+lower\s+band",
            re.IGNORECASE,
        ),
        {
            "asset": "SPY",
            "timeframe": "1d",
            "initial_capital": 100000,
            "entry_conditions": [
                {
                    "indicator": "BOLLINGER",
                    "period": 20,
                    "condition": "less_than",
                    "component": "lower",
                }
            ],
            "exit_conditions": [
                {
                    "indicator": "BOLLINGER",
                    "period": 20,
                    "condition": "greater_than",
                    "component": "middle",
                }
            ],
            "risk": {"risk_per_trade": 0.01},
            "stop_loss": 0.03,
            "take_profit": None,
            "position_sizing": "risk_based",
        },
    ),
    (
        re.compile(
            r"macd",
            re.IGNORECASE,
        ),
        {
            "asset": "SPY",
            "timeframe": "1d",
            "initial_capital": 100000,
            "entry_conditions": [{"indicator": "MACD", "condition": "cross_above"}],
            "exit_conditions": [{"indicator": "MACD", "condition": "cross_below"}],
            "risk": {"risk_per_trade": 0.01},
            "stop_loss": 0.02,
            "take_profit": 0.04,
            "position_sizing": "risk_based",
        },
    ),
]


def _apply_overrides(raw: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    data = dict(raw)
    if overrides.get("initial_capital") is not None:
        data["initial_capital"] = overrides["initial_capital"]
    if overrides.get("asset"):
        data["asset"] = overrides["asset"]
    if overrides.get("commission") is not None:
        data["commission"] = overrides["commission"]
    if overrides.get("slippage") is not None:
        data["slippage"] = overrides["slippage"]
    if overrides.get("risk_per_trade") is not None:
        risk = dict(data.get("risk") or {})
        risk["risk_per_trade"] = overrides["risk_per_trade"]
        data["risk"] = risk
    return data


def parse_demo(
    text: str,
    *,
    initial_capital: float | None = None,
    risk_per_trade: float | None = None,
    commission: float | None = None,
    slippage: float | None = None,
    asset: str | None = None,
) -> ParseStrategyResponse:
    """Deterministic parsing for known demo strategies."""
    overrides = {
        "initial_capital": initial_capital,
        "risk_per_trade": risk_per_trade,
        "commission": commission,
        "slippage": slippage,
        "asset": asset,
    }
    for pattern, template in DEMO_STRATEGIES:
        if pattern.search(text):
            raw = _apply_overrides(template, overrides)
            strategy = StrategySpec.model_validate(raw)
            errors = validate_strategy_spec(strategy)
            if errors:
                raise StrategyParseError("; ".join(errors))
            return ParseStrategyResponse(
                strategy=strategy,
                demo_mode=True,
                raw_text=text,
                warnings=["Parsed in DEMO MODE (no LLM API key). Matching predefined pattern."],
            )

    # Fallback: try to extract SMA periods if mentioned
    sma_match = re.search(
        r"(\d+)[-\s]?day.*(?:sma|ma|moving).*(?:above|cross).*(?:(\d+)[-\s]?day)",
        text,
        re.IGNORECASE,
    )
    if sma_match:
        fast, slow = int(sma_match.group(1)), int(sma_match.group(2))
        if fast < slow:
            raw = _apply_overrides(
                {
                    "asset": asset or "SPY",
                    "timeframe": "1d",
                    "initial_capital": initial_capital or 100000,
                    "entry_conditions": [
                        {
                            "indicator": "SMA",
                            "fast_period": fast,
                            "slow_period": slow,
                            "condition": "cross_above",
                        }
                    ],
                    "exit_conditions": [
                        {
                            "indicator": "SMA",
                            "fast_period": fast,
                            "slow_period": slow,
                            "condition": "cross_below",
                        }
                    ],
                    "risk": {"risk_per_trade": risk_per_trade or 0.01},
                    "position_sizing": "risk_based",
                },
                overrides,
            )
            strategy = StrategySpec.model_validate(raw)
            return ParseStrategyResponse(
                strategy=strategy,
                demo_mode=True,
                raw_text=text,
                warnings=["Parsed in DEMO MODE using heuristic SMA crossover extraction."],
            )

    raise StrategyParseError(
        "Demo mode could not parse this strategy. Try one of the example strategies "
        "in the README, or set LLM_API_KEY to enable LLM parsing."
    )


def _extract_json(content: str) -> dict[str, Any]:
    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
    return json.loads(content)


async def parse_with_llm(
    text: str,
    *,
    initial_capital: float | None = None,
    risk_per_trade: float | None = None,
    commission: float | None = None,
    slippage: float | None = None,
    asset: str | None = None,
) -> ParseStrategyResponse:
    """Parse strategy text via an OpenAI-compatible chat completions API."""
    settings = get_settings()
    try:
        from openai import AsyncOpenAI
    except ImportError as exc:
        raise StrategyParseError("openai package not installed") from exc

    client = AsyncOpenAI(api_key=settings.llm_api_key, base_url=settings.llm_base_url)
    user_prompt = build_user_prompt(
        text,
        initial_capital=initial_capital,
        risk_per_trade=risk_per_trade,
        asset=asset,
    )
    try:
        response = await client.chat.completions.create(
            model=settings.llm_model,
            temperature=0,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content or "{}"
        raw = _extract_json(content)
    except Exception as exc:  # noqa: BLE001
        raise StrategyParseError(f"LLM parsing failed: {exc}") from exc

    overrides = {
        "initial_capital": initial_capital,
        "risk_per_trade": risk_per_trade,
        "commission": commission,
        "slippage": slippage,
        "asset": asset,
    }
    raw = _apply_overrides(raw, overrides)
    try:
        strategy = StrategySpec.model_validate(raw)
    except Exception as exc:  # noqa: BLE001
        raise StrategyParseError(f"LLM output failed validation: {exc}") from exc

    errors = validate_strategy_spec(strategy)
    if errors:
        raise StrategyParseError("; ".join(errors))

    return ParseStrategyResponse(
        strategy=strategy,
        demo_mode=False,
        raw_text=text,
        warnings=[],
    )


async def parse_strategy(
    text: str,
    *,
    initial_capital: float | None = None,
    risk_per_trade: float | None = None,
    commission: float | None = None,
    slippage: float | None = None,
    asset: str | None = None,
) -> ParseStrategyResponse:
    """Parse natural language into StrategySpec, using LLM or demo mode."""
    settings = get_settings()
    kwargs = dict(
        initial_capital=initial_capital,
        risk_per_trade=risk_per_trade,
        commission=commission,
        slippage=slippage,
        asset=asset,
    )
    if settings.llm_enabled:
        try:
            return await parse_with_llm(text, **kwargs)
        except StrategyParseError:
            # Fall back to demo if LLM fails on a known pattern
            try:
                return parse_demo(text, **kwargs)
            except StrategyParseError:
                raise
    return parse_demo(text, **kwargs)
