"""Natural language strategy parser: built-in engine + optional OpenAI-compatible LLM."""

from __future__ import annotations

import json
import re
from typing import Any

from app.config import get_settings
from app.llm.clauses import count, parse_side, split_sides
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
        "SHORT", "COVER", "ADX", "DMI", "DI", "STOCH", "HIGH", "LOW",
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


_ALL_IN = re.compile(
    r"\ball[-\s]?in\b|\bfull\s+(?:capital|equity|size|position|account|balance)\b|"
    r"\b(?:entire|whole)\s+(?:capital|account|balance|equity|portfolio)\b|"
    r"\ball\s+(?:of\s+)?(?:my\s+|the\s+)?(?:capital|money|cash|equity|balance)\b|"
    r"(?:на\s+)?(?:весь|все)\s+(?:капитал|депозит|деньги|баланс)",
    re.I,
)
_CAPITAL_WORD = r"(?:capital|equity|account|portfolio|cash|balance|капитала|депозита|баланса)"
_SIZE_PCT = [
    re.compile(
        r"\b(?:use|using|invest|investing|allocate|allocating|put|deploy|buy\s+with|position(?:\s+size)?|size)"
        r"\s*(?:of|=|:|with)?\s*(\d+(?:[.,]\d+)?)\s*%",
        re.I,
    ),
    re.compile(r"(\d+(?:[.,]\d+)?)\s*%\s*(?:of\s+(?:my\s+|the\s+)?)?" + _CAPITAL_WORD, re.I),
    re.compile(r"(?:на|вход\w*|позици\w*|размер\w*)\s*(?:на\s+)?(\d+(?:[.,]\d+)?)\s*%\s*" + _CAPITAL_WORD, re.I),
]


def _extract_sizing(text: str) -> float | None:
    """Fraction of capital per trade when the text names a position size; risk phrases are not sizes."""
    if _ALL_IN.search(text):
        return 1.0
    for pattern in _SIZE_PCT:
        for m in pattern.finditer(text):
            before = text[max(0, m.start() - 12):m.start()].lower()
            if "risk" in before or "риск" in before or "risk" in m.group(0).lower():
                continue
            value = _percent(float(m.group(1).replace(",", ".")))
            if 0 < value <= 1:
                return value
    return None


def _is_russian(text: str) -> bool:
    return len(re.findall(r"[а-яё]", text, re.I)) > len(re.findall(r"[a-z]", text, re.I)) / 3


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
_SCALE_IN = [
    re.compile(r"(?:buy|enter|get\s+in|scale\s+in(?:to)?)\s+(?:the\s+position\s+)?in\s+(\d+)\s+(?:parts|tranches|steps|chunks|pieces|batches)", re.I),
    re.compile(r"scale\s+in\s+(?:up\s+to\s+)?(\d+)\s+times", re.I),
    re.compile(r"(?:в|на)\s+(\d+)\s+(?:част\w*|заход\w*|транш\w*|прием\w*|приём\w*)", re.I),
]
_FUNDING = re.compile(
    r"(?:funding(?:\s+rate)?|financing(?:\s+cost)?|borrow(?:ing)?\s+(?:cost|fee|rate)|margin\s+interest|"
    r"фандинг\w*|ставк\w+\s+финансирования|стоимост\w+\s+удержания)\s*(?:of|at|is|=|:|в|на)?\s*"
    + _PCT
    + r"(\s*(?:per|a|an|every|each|в|за)?\s*(?:8\s*h(?:ours?)?|8\s*час\w*|day|дн\w*|день|year|annual|yr|год\w*))?",
    re.I,
)
_FUNDING_PER_YEAR = {"8": 3 * 365, "day": 365, "дн": 365, "ден": 365}
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

    match = _FUNDING.search(text)
    if match:
        unit = (match.group(2) or "").strip().lower()
        times = next((n for key, n in _FUNDING_PER_YEAR.items() if key in unit), 1)
        out["funding_rate"] = min(5.0, _percent(float(match.group(1).replace(",", "."))) * times)
        text = text[: match.start()] + " " + text[match.end() :]

    for pattern in _PYRAMID + _SCALE_IN:
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


_UNIT = r"(?:day|bar|period|session|дн\w*|бар\w*|период\w*)s?"
_BREAKOUT_HIGH = [
    re.compile(r"(\d+)[-\s]?" + _UNIT + r"\s+(?:high|highs|max(?:imum)?)", re.I),
    re.compile(r"(?:high|max(?:imum)?)\s+of\s+(?:the\s+)?(?:last|past|previous|prior)\s+(\d+)", re.I),
    re.compile(r"максимум\w*\s+(?:за\s+)?(?:последни[хе]\s+)?(\d+)", re.I),
    re.compile(r"(\d+)[-\s]?дневн\w+\s+максимум", re.I),
]
_BREAKOUT_LOW = [
    re.compile(r"(\d+)[-\s]?" + _UNIT + r"\s+(?:low|lows|min(?:imum)?)", re.I),
    re.compile(r"(?:low|min(?:imum)?)\s+of\s+(?:the\s+)?(?:last|past|previous|prior)\s+(\d+)", re.I),
    re.compile(r"минимум\w*\s+(?:за\s+)?(?:последни[хе]\s+)?(\d+)", re.I),
    re.compile(r"(\d+)[-\s]?дневн\w+\s+минимум", re.I),
]
_DONCHIAN = re.compile(
    r"\b(?:donchian|дончиан\w*|turtle|черепах\w*)(?:\s+(?:channel|breakout|канал\w*|пробо\w*))?\s*\(?\s*(\d+)?", re.I
)
_STOCH = re.compile(r"\b(?:stoch\w*|стохастик\w*)|%\s*k\b", re.I)
_ADX_FILTER = re.compile(r"\badx\s*\(?\s*(\d+)?\s*\)?[^.;]*?(?:above|over|greater\s+than|>|exceeds|выше|больше)\s*(\d+(?:\.\d+)?)", re.I)
_DMI = re.compile(r"\+\s*di|\bdmi\b|directional\s+(?:movement|index)", re.I)


def _first_int(patterns: list[re.Pattern[str]], text: str) -> int | None:
    for pattern in patterns:
        match = pattern.search(text)
        if match and match.group(1):
            return int(match.group(1))
    return None


def _breakout_rules(text: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]] | None:
    """Donchian / N-day high breakout: enter above the prior N-bar high, exit below the prior M-bar low."""
    named = _DONCHIAN.search(text)
    high_n = _first_int(_BREAKOUT_HIGH, text)
    low_n = _first_int(_BREAKOUT_LOW, text)
    breaks_low = low_n is not None and re.search(r"break\w*\s+(?:down\s+)?below|пробо\w*\s+минимум|пробива\w*\s+минимум", text, re.I)
    if high_n is None and not named and not breaks_low:
        return None
    if high_n is None and not named:
        # Only a breakdown is named ("short when price breaks below the 20-day low"): that is the bearish rule.
        entry_n, exit_n = max(2, low_n // 2), low_n
    else:
        entry_n = high_n or (int(named.group(1)) if named and named.group(1) else 20)
        exit_n = low_n or max(2, entry_n // 2)
    close = {"indicator": "PRICE", "component": "close"}
    return (
        [{"left": close, "operator": "greater_than", "right": {"indicator": "DONCHIAN", "period": entry_n, "component": "upper"}}],
        [{"left": close, "operator": "less_than", "right": {"indicator": "DONCHIAN", "period": exit_n, "component": "lower"}}],
    )


def _stochastic_rules(text: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]] | None:
    if not _STOCH.search(text):
        return None
    period_m = re.search(r"(?:stoch\w*|стохастик\w*)\s*\(?\s*(\d+)", text, re.I)
    period = int(period_m.group(1)) if period_m else 14
    low = re.search(r"(?:stoch\w*|стохастик\w*|%k)[^.;]*?(?:below|under|less\s+than|<|ниже|меньше)\s*(\d+(?:\.\d+)?)", text, re.I)
    high = re.search(r"(?:stoch\w*|стохастик\w*|%k)[^;]*?(?:above|over|greater\s+than|>|выше|больше)\s*(\d+(?:\.\d+)?)", text, re.I)
    k = {"indicator": "STOCH", "period": period, "signal_period": 3, "component": "k"}
    d = {**k, "component": "d"}
    if re.search(r"%\s*k|%\s*d|\bk\s+cross|cross\w*\s+(?:above|over)\s+(?:the\s+)?(?:%\s*d|d\s+line|signal)|пересека", text, re.I):
        entry = [{"left": k, "operator": "cross_above", "right": d}]
        exit_ = [{"left": k, "operator": "cross_below", "right": d}]
        if low:
            entry.append({"left": k, "operator": "less_than", "right": float(low.group(1))})
        if high:
            exit_.append({"left": k, "operator": "greater_than", "right": float(high.group(1))})
        return entry, exit_
    return (
        [{"left": k, "operator": "less_than", "right": float(low.group(1)) if low else 20.0}],
        [{"left": k, "operator": "greater_than", "right": float(high.group(1)) if high else 80.0}],
    )


_DAY_INDEX = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4,
    "понедельник": 0, "вторник": 1, "среду": 2, "среда": 2, "четверг": 3, "пятницу": 4, "пятница": 4,
}
_DAY_WORD = r"(monday|tuesday|wednesday|thursday|friday|понедельник|вторник|среду|среда|четверг|пятницу|пятница)"
_CAL_ENTRY = re.compile(
    r"(?:\bbuy|\benter|\blong|\bpurchase|покупа\w*|купи\w*|вход\w*)[^.;]{0,40}?"
    r"(?:\b(?:on|every|each)\s+|\bв(?:о)?\s+(?:кажд\w+\s+)?)" + _DAY_WORD,
    re.I,
)
_CAL_EXIT = re.compile(
    r"(?:\bsell|\bexit|\bclose|прода\w*|выход\w*|выйти|закр\w*)[^.;]{0,40}?"
    r"(?:\b(?:on|every|each|by)\s+|\bв(?:о)?\s+(?:кажд\w+\s+)?)" + _DAY_WORD,
    re.I,
)
_OTHER_INDICATORS = re.compile(
    r"\b(?:sma|ema|rsi|macd|bollinger|stoch\w*|adx|vwap|obv|donchian|moving\s+average|скользящ\w*)\b", re.I
)
_DIP = re.compile(
    r"(?:\bdrops?|\bdropped|\bfalls?|\bfell|\bdeclines?|\bsinks?|\bplunges?|\bdips?|\bdown|"
    r"пада\w*|упад\w*|упал\w*|сниж\w*|снизи\w*|просед\w*|просел\w*|обвал\w*)"
    r"\s+(?:by\s+|more\s+than\s+|over\s+|at\s+least\s+|на\s+|более\s+чем\s+на\s+|больше\s+чем\s+на\s+)?"
    r"(\d+(?:[.,]\d+)?)\s*%"
    r"|(\d+(?:[.,]\d+)?)\s*%\s*(?:drop|dip|fall|decline|sell[-\s]?off|crash|падени\w*|просадк\w*|обвал\w*)",
    re.I,
)
_WINDOW = re.compile(
    r"^\s*(?:(?:in|over|within)\s+(?:a|one|the\s+last|the\s+past)?\s*|за\s+(?:последни[ехй]\s+)?)"
    r"(\d+)?\s*(days?|sessions?|weeks?|months?|день|дня|дней|сесси\w*|недел\w*|месяц\w*)",
    re.I,
)
_RISE = re.compile(
    r"(?:\brises?|\bgains?|\bjumps?|\brallies|\brally|\bbounces?|\bup|раст\w*|вырас\w*|вырос\w*|подним\w*|отскоч\w*)"
    r"\s+(?:by\s+|на\s+)?(\d+(?:[.,]\d+)?)\s*%",
    re.I,
)


def _window_bars(after: str) -> tuple[int, str]:
    match = _WINDOW.search(after)
    if not match:
        return 1, "day"
    n = int(match.group(1) or 1)
    unit = match.group(2).lower()
    if unit.startswith(("week", "недел")):
        return 5 * n, "week" if n == 1 else f"{n} weeks"
    if unit.startswith(("month", "месяц")):
        return 21 * n, "month" if n == 1 else f"{n} months"
    return n, "day" if n == 1 else f"{n} days"


def _calendar_rules(text: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]] | None:
    """'Buy on Monday, sell on Friday': trade at the open of the named sessions."""
    if _OTHER_INDICATORS.search(text):
        return None
    buy = _CAL_ENTRY.search(text)
    if not buy:
        return None
    day_in = _DAY_INDEX[buy.group(1).lower()]
    sell = _CAL_EXIT.search(text, buy.end())
    day_out = _DAY_INDEX[sell.group(1).lower()] if sell else (day_in + 1) % 5
    nxt = {"indicator": "WEEKDAY", "component": "next"}
    notes = ["Buys at the open of the named day and sells at the open of the exit day."]
    if not sell:
        notes.append("No exit day given, so each trade is held for one session.")
    return (
        [{"left": nxt, "operator": "equals", "right": float(day_in)}],
        [{"left": nxt, "operator": "equals", "right": float(day_out)}],
        notes,
    )


def _dip_rules(text: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str], float | None] | None:
    """'Buy when the price drops 5% in a day': enter after the drop, exit on the bounce back above the 20-day SMA."""
    if _OTHER_INDICATORS.search(text):
        return None
    dip = _DIP.search(text)
    if not dip:
        return None
    size = float((dip.group(1) or dip.group(2)).replace(",", "."))
    if not 0 < size < 100:
        return None
    bars, label = _window_bars(text[dip.end():])
    close = {"indicator": "PRICE", "component": "close"}
    entry = [{"left": {"indicator": "CHANGE", "period": bars}, "operator": "less_than", "right": -size}]
    exit_ = [{"left": close, "operator": "greater_than", "right": {"indicator": "SMA", "period": 20}}]
    notes = [f"Buys after the price falls {size:g}% or more in a {label}."]
    rise = _RISE.search(text, dip.end())
    take = float(rise.group(1).replace(",", ".")) / 100 if rise else None
    notes.append(
        f"Sells at a gain of {take * 100:g}% or when the price closes back above its 20-day average."
        if take else "Sells when the price closes back above its 20-day average."
    )
    return entry, exit_, notes, take


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

    # --- Channel breakout (Donchian / N-day high) and stochastic ---
    for rules in (_breakout_rules(text), _stochastic_rules(text)):
        if rules and entry is None:
            entry, exit_ = rules

    # --- Calendar ("buy on Monday") and buy-the-dip ("drops 5% in a day") ---
    dip_take: float | None = None
    calendar = None if entry is not None else _calendar_rules(text)
    if calendar:
        entry, exit_, notes = calendar
        warnings.extend(notes)
    dip = None if entry is not None else _dip_rules(text)
    if dip:
        entry, exit_, notes, dip_take = dip
        warnings.extend(notes)

    # --- SMA / EMA / MA crossover with captured periods ---
    ma = None if entry is not None else re.search(
        r"(\d+)\s*[-\s]?day\s*(sma|ema|ma|moving\s+average).*?"
        r"cross(?:es|ing)?\s+(?:above|over).*?"
        r"(\d+)\s*[-\s]?day",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if not ma and entry is None:
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
        period_m = re.search(
            r"(\d+)\s*[-\s]?(?:day|period|bar)\s*bollinger|bollinger\s*(?:bands?)?\s*\(?\s*(\d+)",
            text,
            re.IGNORECASE,
        )
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

    # --- DMI: +DI crossing -DI ---
    adx_only = re.search(r"\badx\b", text, re.I) and not re.search(
        r"\b(?:sma|ema|ma|moving\s+average|rsi|macd|bollinger|скользящ\w*)\b", text, re.I
    )
    if entry is None and (_DMI.search(text) or adx_only):
        period_m = re.search(r"\b(?:adx|dmi)\s*\(?\s*(\d+)", text, re.I)
        period = int(period_m.group(1)) if period_m else 14
        plus = {"indicator": "ADX", "period": period, "component": "plus"}
        minus = {**plus, "component": "minus"}
        entry = [{"left": plus, "operator": "cross_above", "right": minus}]
        exit_ = [{"left": plus, "operator": "cross_below", "right": minus}]
        warnings.append(f"Directional movement: +DI({period}) crossing -DI({period}).")

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

    adx_filter = _ADX_FILTER.search(text)
    if adx_filter:
        period = int(adx_filter.group(1)) if adx_filter.group(1) else 14
        entry = list(entry) + [
            {"left": {"indicator": "ADX", "period": period}, "operator": "greater_than", "right": float(adx_filter.group(2))}
        ]

    # Rules the reader understood clause by clause win over the templates above, which only
    # recognise one idea per strategy and would drop "... and price above the 200-day SMA".
    entry_logic = exit_logic = "AND"
    entry_any: list[dict[str, Any]] = []
    exit_any: list[dict[str, Any]] = []
    entry_text, exit_text = split_sides(text)
    read_entry = parse_side(entry_text) if entry_text else None
    read_exit = parse_side(exit_text) if exit_text else None
    if read_entry:
        entry, entry_logic, entry_any = read_entry
        warnings = [w for w in warnings if not w.startswith(("Short side", "Free parser"))]
    if read_exit:
        exit_, exit_logic, exit_any = read_exit
    if count(read_entry) + count(read_exit) > 2 or entry_any or exit_any:
        warnings.append(
            f"Read {count(read_entry) + count(read_exit)} separate rules; check them in the preview."
        )

    tf = "1d"
    if re.search(r"\b(?:5m|5[-\s]?min(?:ute)?s?|5[-\s]?мин\w*)\b", text, re.IGNORECASE):
        tf = "5m"
    elif re.search(r"\b(?:15m|15[-\s]?min(?:ute)?s?|15[-\s]?мин\w*)\b", text, re.IGNORECASE):
        tf = "15m"
    elif re.search(r"\b(?:1h|60m|1[-\s]?hour|hourly|часов\w*)\b", text, re.IGNORECASE):
        tf = "1h"
    elif re.search(r"\b(?:4h|4[-\s]?hours?|4[-\s]?часов\w*)\b", text, re.IGNORECASE):
        tf = "4h"
    elif re.search(r"\b(?:1w|weekly|недельн\w*)\b", text, re.IGNORECASE):
        tf = "1w"

    size = _extract_sizing(original_text)
    stop = raw_fields.get("stop_loss")
    risk_frac = risk_per_trade if risk_per_trade is not None else raw_fields.get("risk_per_trade", 0.01)
    if size is None and stop is None:
        size = 1.0
    ru = _is_russian(original_text)

    clarifications: list[str] = []
    if stop is None:
        clarifications.append(
            "Без стоп-лосса каждая сделка идёт на "
            f"{size * 100:.0f}% капитала. Добавьте «стоп-лосс 2%», чтобы считать размер по риску."
            if ru else
            f"No stop-loss, so each trade uses {size * 100:.0f}% of capital. "
            "Add “stop-loss 2%” to size positions by risk instead."
        )
    elif size is None:
        clarifications.append(
            f"Размер позиции по риску: {risk_frac * 100:g}% капитала на сделку при стопе {stop * 100:g}%. "
            "Напишите «use 100% of capital», чтобы входить на весь капитал."
            if ru else
            f"Sized by risk: {risk_frac * 100:g}% of capital at risk per trade with a {stop * 100:g}% stop. "
            "Write “use 100% of capital” to go all in instead."
        )
    if raw_fields.get("take_profit") is None and dip_take is not None:
        raw_fields["take_profit"] = dip_take
    if raw_fields.get("take_profit") is None:
        clarifications.append(
            "Можно добавить тейк-профит, например «тейк-профит 5%»."
            if ru else
            "You can add a take-profit, e.g. “take-profit 5%”."
        )

    spec: dict[str, Any] = {
        "asset": asset_name,
        "side": side,
        "timeframe": tf,
        "initial_capital": initial_capital or 100_000.0,
        "entry_conditions": entry,
        "exit_conditions": exit_,
        "entry_logic": entry_logic,
        "exit_logic": exit_logic,
        "entry_any": entry_any,
        "exit_any": exit_any,
        "risk": {"risk_per_trade": risk_frac}
        | ({"percent_capital": size} if size is not None else {}),
        "stop_loss": stop,
        "take_profit": raw_fields.get("take_profit"),
        "position_sizing": "percent_capital" if size is not None else "risk_based",
    }
    if commission is not None:
        spec["commission"] = commission
    if slippage is not None:
        spec["slippage"] = slippage
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
