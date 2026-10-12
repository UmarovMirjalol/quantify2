"""Natural language strategy parser: built-in engine + optional OpenAI-compatible LLM."""

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


def _pct_to_frac(value: float) -> float:
    """Convert 2 or 0.02 style percentages into a fraction."""
    if value > 1.0:
        return value / 100.0
    return value


def _extract_asset(text: str, override: str | None) -> str:
    if override:
        return override.strip().upper()
    m = re.search(
        r"\b(?:ticker|symbol|asset)\s*[:=]?\s*([A-Za-z]{1,5})\b",
        text,
        re.IGNORECASE,
    )
    if m:
        return m.group(1).upper()
    m = re.search(r"\b(?:buy|sell|trade)\s+([A-Z]{2,5})\b", text)
    if m:
        return m.group(1).upper()
    tickers = re.findall(r"\b([A-Z]{2,5})\b", text)
    skip = {
        "SMA", "EMA", "RSI", "ATR", "MACD", "AND", "OR", "BUY", "SELL", "WHEN",
        "THE", "DAY", "FOR", "WITH", "FROM", "INTO", "OVER", "UNDER", "BELOW",
        "ABOVE", "CROSS", "RISK", "STOP", "TAKE", "BAND", "PRICE", "CLOSE",
    }
    for t in tickers:
        if t not in skip:
            return t
    return "SPY"


def _extract_risk_fields(text: str) -> dict[str, Any]:
    out: dict[str, Any] = {}
    risk = re.search(
        r"risk\s+(\d+(?:\.\d+)?)\s*%\s*(?:per\s+trade|of\s+capital)?",
        text,
        re.IGNORECASE,
    )
    if risk:
        out["risk_per_trade"] = _pct_to_frac(float(risk.group(1)))

    stop = re.search(
        r"(?:stop[-\s]?loss|sl)\s*(?:of|at|=|:)?\s*(\d+(?:\.\d+)?)\s*%",
        text,
        re.IGNORECASE,
    )
    if stop:
        out["stop_loss"] = _pct_to_frac(float(stop.group(1)))

    take = re.search(
        r"(?:take[-\s]?profit|tp)\s*(?:of|at|=|:)?\s*(\d+(?:\.\d+)?)\s*%",
        text,
        re.IGNORECASE,
    )
    if take:
        out["take_profit"] = _pct_to_frac(float(take.group(1)))

    return out


def _ma_crossover(
    indicator: str, fast: int, slow: int
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    entry = [
        {
            "indicator": indicator,
            "fast_period": fast,
            "slow_period": slow,
            "condition": "cross_above",
        }
    ]
    exit_ = [
        {
            "indicator": indicator,
            "fast_period": fast,
            "slow_period": slow,
            "condition": "cross_below",
        }
    ]
    return entry, exit_


def parse_builtin(
    text: str,
    *,
    initial_capital: float | None = None,
    risk_per_trade: float | None = None,
    commission: float | None = None,
    slippage: float | None = None,
    asset: str | None = None,
) -> ParseStrategyResponse:
    """
    Production built-in natural-language parser.

    Deterministically extracts MA crossovers, RSI bands, MACD, Bollinger, ATR,
    risk %, stop-loss, and take-profit from free-form English without an LLM.
    """
    raw_fields = _extract_risk_fields(text)
    asset_name = _extract_asset(text, asset)
    entry: list[dict[str, Any]] | None = None
    exit_: list[dict[str, Any]] | None = None
    warnings: list[str] = []

    # --- SMA / EMA / MA crossover with captured periods ---
    ma = re.search(
        r"(\d+)\s*[-\s]?day\s*(sma|ema|ma|moving\s+average).*?"
        r"cross(?:es|ing)?\s+(?:above|over).*?"
        r"(\d+)\s*[-\s]?day",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if not ma:
        ma = re.search(
            r"(sma|ema|ma)\s*\(?\s*(\d+)\s*\).*?"
            r"cross(?:es|ing)?\s+(?:above|over).*?"
            r"(sma|ema|ma)?\s*\(?\s*(\d+)\s*\)?",
            text,
            re.IGNORECASE | re.DOTALL,
        )
        if ma:
            ind = ma.group(1).upper()
            if ind == "MA":
                ind = "SMA"
            fast, slow = int(ma.group(2)), int(ma.group(4))
            if fast < slow:
                entry, exit_ = _ma_crossover(ind, fast, slow)

    if ma and entry is None:
        # First regex form: groups 1=fast, 2=type, 3=slow
        try:
            fast, ind_raw, slow = int(ma.group(1)), ma.group(2), int(ma.group(3))
            ind = ind_raw.upper().replace("MOVING AVERAGE", "SMA").replace(" ", "")
            if ind in ("MA", "MOVINGAVERAGE"):
                ind = "SMA"
            if ind in ("SMA", "EMA") and fast < slow:
                entry, exit_ = _ma_crossover(ind, fast, slow)
        except (IndexError, ValueError, AttributeError):
            pass

    # Generic "N-day ... M-day" SMA language
    if entry is None:
        generic = re.search(
            r"(\d+)[-\s]?day.*?(?:sma|moving average|ma).*?(?:above|cross).*?(\d+)[-\s]?day",
            text,
            re.IGNORECASE,
        )
        if generic:
            fast, slow = int(generic.group(1)), int(generic.group(2))
            if fast < slow:
                use_ema = bool(re.search(r"\bema\b", text, re.IGNORECASE))
                entry, exit_ = _ma_crossover("EMA" if use_ema else "SMA", fast, slow)

    # --- RSI ---
    if entry is None and re.search(r"\brsi\b", text, re.IGNORECASE):
        low = re.search(
            r"rsi.*?(?:below|under|falls?\s+below|less\s+than)\s*(\d+(?:\.\d+)?)",
            text,
            re.IGNORECASE,
        )
        high = re.search(
            r"rsi.*?(?:above|over|rises?\s+above|greater\s+than)\s*(\d+(?:\.\d+)?)",
            text,
            re.IGNORECASE,
        )
        # Also "sell when RSI rises above 70" after entry clause
        if not high:
            high = re.search(
                r"sell.*?rsi.*?(?:above|over|rises?\s+above)\s*(\d+(?:\.\d+)?)",
                text,
                re.IGNORECASE,
            )
        period_m = re.search(r"rsi\s*\(?\s*(\d+)\s*\)?", text, re.IGNORECASE)
        period = int(period_m.group(1)) if period_m else 14
        entry_thr = float(low.group(1)) if low else 30.0
        exit_thr = float(high.group(1)) if high else 70.0
        entry = [
            {
                "indicator": "RSI",
                "period": period,
                "condition": "less_than",
                "threshold": entry_thr,
            }
        ]
        exit_ = [
            {
                "indicator": "RSI",
                "period": period,
                "condition": "greater_than",
                "threshold": exit_thr,
            }
        ]

    # --- MACD ---
    if entry is None and re.search(r"\bmacd\b", text, re.IGNORECASE):
        entry = [{"indicator": "MACD", "condition": "cross_above"}]
        exit_ = [{"indicator": "MACD", "condition": "cross_below"}]

    # --- Bollinger ---
    if entry is None and re.search(r"bollinger|lower\s+band", text, re.IGNORECASE):
        period_m = re.search(r"(\d+)\s*[-\s]?day.*bollinger|bollinger.*?(\d+)", text, re.IGNORECASE)
        period = 20
        if period_m:
            period = int(period_m.group(1) or period_m.group(2) or 20)
        entry = [
            {
                "indicator": "BOLLINGER",
                "period": period,
                "condition": "less_than",
                "component": "lower",
            }
        ]
        exit_ = [
            {
                "indicator": "BOLLINGER",
                "period": period,
                "condition": "greater_than",
                "component": "middle",
            }
        ]

    # --- ATR filter as standalone is uncommon; skip unless paired ---
    if entry is None:
        raise StrategyParseError(
            "Could not interpret this strategy. Free mode understands SMA/EMA crossovers, "
            "RSI thresholds, MACD crosses, and Bollinger Bands — try a Playbook preset, or write "
            "something like: 'Buy when the 20-day SMA crosses above the 50-day SMA and sell when "
            "it crosses below. Risk 1% per trade.'"
        )

    assert exit_ is not None

    spec: dict[str, Any] = {
        "asset": asset_name,
        "timeframe": "1d",
        "initial_capital": initial_capital or 100_000.0,
        "entry_conditions": entry,
        "exit_conditions": exit_,
        "entry_logic": "AND",
        "exit_logic": "AND",
        "risk": {
            "risk_per_trade": risk_per_trade
            if risk_per_trade is not None
            else raw_fields.get("risk_per_trade", 0.01)
        },
        "stop_loss": raw_fields.get("stop_loss"),
        "take_profit": raw_fields.get("take_profit"),
        "position_sizing": "risk_based",
    }
    if commission is not None:
        spec["commission"] = commission
    if slippage is not None:
        spec["slippage"] = slippage

    # Default stops for risk-based sizing when user mentioned risk but no stop
    if (
        spec["position_sizing"] == "risk_based"
        and spec["stop_loss"] is None
        and re.search(r"stop", text, re.IGNORECASE) is None
    ):
        # leave null — risk engine falls back to capital fraction
        pass

    try:
        strategy = StrategySpec.model_validate(spec)
    except Exception as exc:  # noqa: BLE001
        raise StrategyParseError(f"Built-in parser produced invalid strategy: {exc}") from exc

    errors = validate_strategy_spec(strategy)
    if errors:
        raise StrategyParseError("; ".join(errors))

    return ParseStrategyResponse(
        strategy=strategy,
        parser="builtin",
        raw_text=text,
        warnings=warnings,
    )


# Backwards-compatible alias used by older tests / imports
parse_demo = parse_builtin


def _extract_json(content: str) -> dict[str, Any]:
    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
    return json.loads(content)


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


async def parse_with_llm(
    text: str,
    *,
    initial_capital: float | None = None,
    risk_per_trade: float | None = None,
    commission: float | None = None,
    slippage: float | None = None,
    asset: str | None = None,
) -> ParseStrategyResponse:
    """Parse strategy text via the OpenAI-compatible LLM client."""
    from app.llm.client import LLMClient, LLMClientError

    client = LLMClient()
    user_prompt = build_user_prompt(
        text,
        initial_capital=initial_capital,
        risk_per_trade=risk_per_trade,
        asset=asset,
    )
    try:
        raw = await client.chat_json(system=SYSTEM_PROMPT, user=user_prompt)
    except LLMClientError as exc:
        raise StrategyParseError(str(exc)) from exc

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
        parser="llm",
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
    """Parse natural language into StrategySpec via LLM (if configured) or built-in parser."""
    from app.utils.normalize import normalize_strategy_text

    text = normalize_strategy_text(text)
    if len(text) < 5:
        raise StrategyParseError("Strategy text is too short after cleaning paste input.")

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
            # Fall back to built-in parser if LLM fails
            try:
                result = parse_builtin(text, **kwargs)
                result.warnings = list(result.warnings) + [
                    "LLM parsing failed; used built-in parser."
                ]
                return result
            except StrategyParseError:
                raise
    return parse_builtin(text, **kwargs)
