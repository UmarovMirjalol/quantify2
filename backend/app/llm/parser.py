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
    m = re.search(r"\b(?:buy|sell|trade|short|[Ss]hort)\s+([A-Z]{2,5})\b", text)
    if m:
        return m.group(1).upper()
    tickers = re.findall(r"\b([A-Z]{2,5})\b", text)
    skip = {
        "SMA", "EMA", "RSI", "ATR", "MACD", "AND", "OR", "BUY", "SELL", "WHEN",
        "THE", "DAY", "FOR", "WITH", "FROM", "INTO", "OVER", "UNDER", "BELOW",
        "ABOVE", "CROSS", "RISK", "STOP", "TAKE", "BAND", "PRICE", "CLOSE",
        "SHORT", "COVER",
    }
    for t in tickers:
        if t not in skip:
            return t
    return "SPY"


def _percent(value: float) -> float:
    """A number written with a % sign: 1% is 0.01, never 1.0."""
    return value / 100.0


def _extract_risk_fields(text: str) -> dict[str, Any]:
    out: dict[str, Any] = {}
    risk = re.search(
        r"(?:risk|риск)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*%\s*(?:per\s+trade|of\s+capital|на\s+сделку)?",
        text,
        re.IGNORECASE,
    )
    if not risk:
        risk = re.search(r"(\d+(?:\.\d+)?)\s*%\s*(?:risk|риск)", text, re.IGNORECASE)
    if risk:
        out["risk_per_trade"] = _percent(float(risk.group(1)))

    stop = re.search(
        r"(?:stop[-\s]?loss|sl|стоп[-\s]?лосс|стоп)\s*(?:of|at|=|:)?\s*(\d+(?:\.\d+)?)\s*%",
        text,
        re.IGNORECASE,
    )
    if not stop:
        stop = re.search(
            r"(\d+(?:\.\d+)?)\s*%\s*(?:stop[-\s]?loss|sl|стоп[-\s]?лосс|стоп)",
            text,
            re.IGNORECASE,
        )
    if stop:
        out["stop_loss"] = _percent(float(stop.group(1)))

    take = re.search(
        r"(?:take[-\s]?profit|tp|тейк[-\s]?профит|тейк|профит)\s*(?:of|at|=|:)?\s*(\d+(?:\.\d+)?)\s*%",
        text,
        re.IGNORECASE,
    )
    if not take:
        take = re.search(
            r"(\d+(?:\.\d+)?)\s*%\s*(?:take[-\s]?profit|tp|тейк[-\s]?профит|тейк|профит)",
            text,
            re.IGNORECASE,
        )
    if take:
        out["take_profit"] = _percent(float(take.group(1)))

    return out


_PCT = r"\+?(\d+(?:[.,]\d+)?)\s*%"
_TRAILING = [
    re.compile(r"(?:trailing|trail)(?:[-\s]?stop)?(?:[-\s]?loss)?\s*(?:of|at|=|:)?\s*" + _PCT, re.I),
    re.compile(_PCT + r"\s*trailing(?:[-\s]?stop)?", re.I),
    re.compile(r"трейлинг\w*(?:[-\s]?стоп\w*)?\s*(?:на|в|=|:)?\s*" + _PCT, re.I),
    re.compile(r"скользящ\w+\s+стоп\w*\s*(?:на|в|=|:)?\s*" + _PCT, re.I),
]
_PORTION = (
    r"(half|a\s+third|one\s+third|a\s+quarter|one\s+quarter|\d+(?:[.,]\d+)?\s*%|"
    r"половин\w*|треть|четверть)"
)
_SCALE_OUT = re.compile(
    r"(?:take|close|sell|book|scale\s+out(?:\s+of)?|exit|cover|закр\w*|зафикс\w*|фикс\w*|прода\w*)\s+"
    + _PORTION
    + r"\s*(?:of\s+(?:the\s+)?position\s*|позиции\s*)?(?:profit\s+)?"
    r"(?:at|on|when\s+up|once\s+up|after|на|при)\s*(?:a\s+)?" + _PCT,
    re.I,
)
_BREAKEVEN = re.compile(r"break[-\s]?even|безубыт\w*", re.I)
_PYRAMID = [
    re.compile(r"pyramid\w*\s*(?:up\s+to|max(?:imum)?|of)?\s*(\d+)", re.I),
    re.compile(r"up\s+to\s+(\d+)\s+entries", re.I),
    re.compile(r"пирамид\w*\s*(?:до)?\s*(\d+)", re.I),
    re.compile(r"до\s+(\d+)\s+вход\w*", re.I),
]
_ADD_TIMES = re.compile(r"add\s+(?:to\s+(?:the\s+)?(?:position|winners?)\s+)?(?:up\s+to\s+)?(\d+)\s+times|доб\w+\s+(?:до\s+)?(\d+)\s+раз", re.I)
_PORTION_WORDS = {"half": 0.5, "third": 1 / 3, "quarter": 0.25, "половин": 0.5, "треть": 1 / 3, "четверть": 0.25}


def _portion(raw: str) -> float | None:
    raw = raw.lower().replace(",", ".")
    for word, value in _PORTION_WORDS.items():
        if word in raw:
            return value
    match = re.search(r"\d+(?:\.\d+)?", raw)
    return _percent(float(match.group())) if match else None


def _extract_management(text: str) -> tuple[dict[str, Any], str]:
    """Trailing stop, partial exits, breakeven and pyramiding. Matched phrases are removed
    from the returned text so the stop-loss and rule parsers do not read them twice."""
    out: dict[str, Any] = {}
    for pattern in _TRAILING:
        match = pattern.search(text)
        if match:
            out["trailing_stop"] = _percent(float(match.group(1).replace(",", ".")))
            text = text[: match.start()] + " " + text[match.end() :]
            break

    levels = []
    for match in list(_SCALE_OUT.finditer(text))[:3]:
        fraction = _portion(match.group(1))
        if fraction:
            levels.append({"profit": _percent(float(match.group(2).replace(",", "."))), "fraction": fraction})
    if levels:
        total = sum(level["fraction"] for level in levels)
        if total > 1.0:
            levels = [{**level, "fraction": level["fraction"] / total} for level in levels]
        out["scale_out"] = levels
        text = _SCALE_OUT.sub(" ", text)

    if _BREAKEVEN.search(text):
        out["breakeven_after_scale"] = True
        text = _BREAKEVEN.sub(" ", text)

    for pattern in _PYRAMID:
        match = pattern.search(text)
        if match:
            out["max_entries"] = max(1, min(10, int(match.group(1))))
            text = text[: match.start()] + " " + text[match.end() :]
            break
    else:
        match = _ADD_TIMES.search(text)
        if match:
            out["max_entries"] = max(1, min(10, 1 + int(match.group(1) or match.group(2))))
            text = text[: match.start()] + " " + text[match.end() :]
    return out, text


def _apply_management(spec: dict[str, Any], management: dict[str, Any]) -> dict[str, Any]:
    for key, value in management.items():
        if not spec.get(key):
            spec[key] = value
    return spec


_SHORT_PATTERN = re.compile(
    r"\b(?:sell\s+short|go\s+short|short[-\s]?sell\w*|shorting|"
    r"short\s+(?:when|if|on|after|once|the|it)\b|шорт\w*|продава\w+\s+в\s+шорт)"
    r"|(?:^|[.;!]\s*)short\b",
    re.IGNORECASE,
)


def _wants_short(text: str) -> bool:
    return bool(_SHORT_PATTERN.search(text) or re.search(r"\b[Ss]hort\s+[A-Z]{2,5}\b", text))


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
    original_text = text
    management, text = _extract_management(text)
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

    # --- Price vs moving average ---
    if entry is None:
        px = re.search(
            r"(?:price|close).*?(?:above|over|cross(?:es|ing)?\s+above).*?"
            r"(\d+)\s*[-\s]?day\s*(sma|ema|ma|moving\s+average)",
            text,
            re.IGNORECASE,
        )
        if not px:
            px = re.search(
                r"(?:above|over).*?(\d+)\s*[-\s]?day\s*(sma|ema|ma|moving\s+average)",
                text,
                re.IGNORECASE,
            )
        if px:
            period = int(px.group(1))
            ind = px.group(2).upper().replace("MOVING AVERAGE", "SMA").replace(" ", "")
            if ind in ("MA", "MOVINGAVERAGE"):
                ind = "SMA"
            if ind not in ("SMA", "EMA"):
                ind = "SMA"
            entry = [
                {
                    "left": {"indicator": "PRICE", "component": "close"},
                    "operator": "greater_than",
                    "right": {"indicator": ind, "period": period},
                }
            ]
            exit_ = [
                {
                    "left": {"indicator": "PRICE", "component": "close"},
                    "operator": "less_than",
                    "right": {"indicator": ind, "period": period},
                }
            ]

    # --- Golden / death cross shorthand ---
    if entry is None and re.search(r"golden\s+cross|death\s+cross", text, re.IGNORECASE):
        entry, exit_ = _ma_crossover("SMA", 50, 200)
        warnings.append("Interpreted golden/death cross as SMA(50)/SMA(200).")

    # --- Loose RSI language (oversold / overbought) ---
    if entry is None and re.search(r"oversold|overbought", text, re.IGNORECASE):
        entry = [
            {"indicator": "RSI", "period": 14, "condition": "less_than", "threshold": 30.0}
        ]
        exit_ = [
            {"indicator": "RSI", "period": 14, "condition": "greater_than", "threshold": 70.0}
        ]
        warnings.append("Interpreted oversold/overbought language as RSI 30/70.")

    # --- Price Action: Pin-bar ---
    if entry is None and re.search(r"\b(?:pin[-\s]?bar|пин[-\s]?бар)\b", text, re.IGNORECASE):
        entry = [
            {
                "left": {"indicator": "PINBAR", "component": "bullish"},
                "operator": "equals",
                "right": 1.0,
            }
        ]
        exit_ = [
            {
                "left": {"indicator": "PINBAR", "component": "bearish"},
                "operator": "equals",
                "right": 1.0,
            }
        ]
        warnings.append("Detected Price Action pattern: Bullish Pin-Bar entry / Bearish Pin-Bar exit.")

    # --- Price Action: Hammer ---
    if entry is None and re.search(r"\b(?:hammer|молот)\b", text, re.IGNORECASE):
        entry = [
            {
                "left": {"indicator": "HAMMER", "component": "bullish"},
                "operator": "equals",
                "right": 1.0,
            }
        ]
        exit_ = [
            {
                "left": {"indicator": "RSI", "period": 14},
                "operator": "greater_than",
                "right": 70.0,
            }
        ]
        warnings.append("Detected Price Action pattern: Hammer entry / RSI 70 exit.")

    # --- Price Action: Engulfing ---
    if entry is None and re.search(r"\b(?:engulfing|поглощени[ея]|бычье\s+поглощение)\b", text, re.IGNORECASE):
        entry = [
            {
                "left": {"indicator": "ENGULFING", "component": "bullish"},
                "operator": "equals",
                "right": 1.0,
            }
        ]
        exit_ = [
            {
                "left": {"indicator": "ENGULFING", "component": "bearish"},
                "operator": "equals",
                "right": 1.0,
            }
        ]
        warnings.append("Detected Price Action pattern: Bullish Engulfing entry / Bearish Engulfing exit.")

    # --- Volume: VWAP ---
    if entry is None and re.search(r"\b(?:vwap|ввап)\b", text, re.IGNORECASE):
        entry = [
            {
                "left": {"indicator": "PRICE", "component": "close"},
                "operator": "cross_above",
                "right": {"indicator": "VWAP"},
            }
        ]
        exit_ = [
            {
                "left": {"indicator": "PRICE", "component": "close"},
                "operator": "cross_below",
                "right": {"indicator": "VWAP"},
            }
        ]
        warnings.append("Detected Volume pattern: Price cross above VWAP entry.")

    # --- Volume: OBV ---
    if entry is None and re.search(r"\b(?:obv|on[-\s]?balance\s+volume)\b", text, re.IGNORECASE):
        entry = [
            {
                "left": {"indicator": "OBV"},
                "operator": "greater_than",
                "right": 0.0,
            }
        ]
        exit_ = [
            {
                "left": {"indicator": "OBV"},
                "operator": "less_than",
                "right": 0.0,
            }
        ]
        warnings.append("Detected Volume indicator: On-Balance Volume (OBV).")

    # --- Volume: Volume Spike / SMA ---
    if entry is None and re.search(r"\b(?:volume|объем)\b", text, re.IGNORECASE) and re.search(r"above|exceeds|spike|выше|всплеск", text, re.IGNORECASE):
        entry = [
            {
                "left": {"indicator": "VOLUME", "component": "value"},
                "operator": "greater_than",
                "right": {"indicator": "VOLUME", "component": "sma", "period": 20},
            }
        ]
        exit_ = [
            {
                "left": {"indicator": "VOLUME", "component": "value"},
                "operator": "less_than",
                "right": {"indicator": "VOLUME", "component": "sma", "period": 20},
            }
        ]
        warnings.append("Detected Volume condition: Volume > SMA(Volume, 20).")

    # --- Free-mode safety net: never block a runnable idea ---
    # Any non-empty strategy text falls back to a classic SMA cross so users can
    # always get a backtest without an API key.
    if entry is None:
        nums = [int(n) for n in re.findall(r"\b(\d{1,3})\b", text)]
        fast, slow = 20, 50
        if len(nums) >= 2:
            a, b = nums[0], nums[1]
            if 1 <= a < b <= 400:
                fast, slow = a, b
        entry, exit_ = _ma_crossover("SMA", fast, slow)
        warnings.append(
            f"Free parser could not match a specific pattern — ran SMA({fast})×SMA({slow}) "
            "crossover instead. Tip: mention RSI, MACD, Bollinger, or SMA/EMA for a closer match."
        )

    assert exit_ is not None

    side = "short" if _wants_short(text) else "long"
    if side == "short":
        # Every template above is written from the buyer's side: entry is the bullish
        # condition. A short enters on the bearish one and covers on the bullish one.
        entry, exit_ = exit_, entry
        warnings.append("Short side: entering on the bearish rule and covering on the bullish rule.")

    tf = "1d"
    if re.search(r"\b(?:5m|5[-\s]?мин\w*)\b", text, re.IGNORECASE):
        tf = "5m"
    elif re.search(r"\b(?:15m|15[-\s]?мин\w*)\b", text, re.IGNORECASE):
        tf = "15m"
    elif re.search(r"\b(?:1h|60m|часов\w*)\b", text, re.IGNORECASE):
        tf = "1h"
    elif re.search(r"\b(?:4h|4[-\s]?часов\w*)\b", text, re.IGNORECASE):
        tf = "4h"
    elif re.search(r"\b(?:1w|weekly|недельн\w*)\b", text, re.IGNORECASE):
        tf = "1w"

    clarifications: list[str] = []
    if raw_fields.get("stop_loss") is None:
        clarifications.append("Совет: укажите Stop-Loss (например: «стоп-лосс 2%») для четкого ограничения риска.")
    if raw_fields.get("take_profit") is None:
        clarifications.append("Совет: можно добавить Take-Profit (например: «тейк-профит 5%») для фиксации прибыли.")
    if raw_fields.get("risk_per_trade") is None:
        clarifications.append("Размер риска на сделку по умолчанию составляет 1%. Вы можете изменить его (например: «риск 1.5%»).")

    spec: dict[str, Any] = {
        "asset": asset_name,
        "side": side,
        "timeframe": tf,
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
    _apply_management(spec, management)

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
        raw_text=original_text,
        warnings=warnings,
        clarifications=clarifications,
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
    raw = _apply_management(_apply_overrides(raw, overrides), _extract_management(text)[0])
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
