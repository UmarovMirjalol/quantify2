"""Rule-by-rule reading of "buy when A and (B or C), sell when D".

Each clause must be a single comparison the reader fully understands; otherwise the
whole side returns None and the template parser keeps the strategy.
"""

from __future__ import annotations

import re
from typing import Any

_PRICE = {"indicator": "PRICE", "component": "close"}

_ENTRY_START = re.compile(
    r"\b(?:buy|go\s+long|long|enter|short|sell\s+short|покупа\w*|купи\w*|входи\w*|вход\w*|шорт\w*)\b"
    r"[^.;]*?\b(?:when|if|once|as\s+soon\s+as|когда|если)\b",
    re.I,
)
_EXIT_START = re.compile(
    r"(?:^|[.;,]\s*|\b(?:and|then|и|затем)\s+)"
    r"(?:sell|exit|close|cover|take\s+profit|прода\w*|выход\w*|выйти|закры\w*)\b[^.;,]*?"
    r"\b(?:when|if|once|as\s+soon\s+as|когда|если)\b",
    re.I,
)
_STOP_WORDS = re.compile(
    r"\b(?:stop[-\s]?loss|take[-\s]?profit|risk|trailing|стоп|тейк|риск)\b", re.I
)

_OPS = [
    ("cross_above", r"cross(?:es|ed|ing)?\s+(?:back\s+)?(?:above|over)|пересека\w*\s+(?:снизу\s+вверх|вверх)"),
    ("cross_below", r"cross(?:es|ed|ing)?\s+(?:back\s+)?(?:below|under)|пересека\w*\s+(?:сверху\s+вниз|вниз)"),
    (
        "greater_than",
        r"(?:is\s+|stays\s+|closes\s+|trades\s+|rises\s+|goes\s+|moves\s+|climbs\s+|gets\s+)?"
        r"(?:above|over|greater\s+than|higher\s+than|exceeds?|>)|выше|больше",
    ),
    (
        "less_than",
        r"(?:is\s+|stays\s+|closes\s+|trades\s+|falls\s+|drops\s+|goes\s+|moves\s+|dips\s+|gets\s+)?"
        r"(?:below|under|less\s+than|lower\s+than|<)|ниже|меньше",
    ),
]
_MA = re.compile(
    r"(\d+)\s*[-\s]?(?:day|bar|period|week|дн\w*)?\s*[-\s]?(sma|ema|ma\b|moving\s+average|скользящ\w*)"
    r"|\b(sma|ema|ma)\s*\(?\s*(\d+)",
    re.I,
)
_MOVE = re.compile(
    r"(drops?|falls?|declines?|loses|rises?|gains?|jumps?|climbs?|пада\w*|снижа\w*|раст\w*|вырос\w*)\s+"
    r"(?:by\s+|на\s+)?(?:more\s+than\s+|over\s+|at\s+least\s+|более\s+)?(\d+(?:[.,]\d+)?)\s*%"
    r"(?:\s*(?:in|over|within|за)\s+(?:a|one|1|(\d+)|один|одн\w*)?\s*(day|session|bar|week|month|дн\w*|день|недел\w*|месяц\w*))?",
    re.I,
)
_WINDOW = {"week": 5, "недел": 5, "month": 21, "месяц": 21}


def _num(raw: str) -> float | None:
    m = re.fullmatch(r"\s*(?:the\s+)?(?:level\s+(?:of\s+)?)?(-?\d+(?:[.,]\d+)?)\s*%?\s*(?:level)?\s*", raw, re.I)
    if m:
        return float(m.group(1).replace(",", "."))
    if re.fullmatch(r"\s*(?:zero|the\s+zero\s+line|нул\w*)\s*", raw, re.I):
        return 0.0
    return None


def _operand(raw: str, other: dict[str, Any] | None = None) -> dict[str, Any] | float | None:
    s = re.sub(r"\b(?:the|its|it's|a|an|current|daily|line|is)\b", " ", raw.lower()).strip(" ,()")
    s = re.sub(r"\s+", " ", s)
    value = _num(s)
    if value is not None:
        return value
    if s in ("", "price", "close", "closing price", "the close", "stock", "цена", "закрытие", "it"):
        return dict(_PRICE)
    ma = _MA.fullmatch(s) or _MA.search(s)
    if ma and len(s) <= len(ma.group(0)) + 6:
        kind = (ma.group(2) or ma.group(3) or "sma").lower()
        period = int(ma.group(1) or ma.group(4))
        return {"indicator": "EMA" if kind == "ema" else "SMA", "period": period}
    if re.search(r"\brsi\b", s):
        p = re.search(r"(\d+)", s)
        return {"indicator": "RSI", "period": int(p.group(1)) if p else 14}
    if re.fullmatch(r"(?:macd\s+)?signal|сигнальн\w*", s):
        return {"indicator": "MACD", "component": "signal"}
    if re.fullmatch(r"macd(?:\s+histogram)?", s):
        return {"indicator": "MACD", "component": "histogram" if "hist" in s else "macd"}
    band = re.search(r"(upper|lower|middle)\s+(?:bollinger\s+)?band|bollinger\s+(upper|lower|middle)", s)
    if band:
        p = re.search(r"(\d+)", s)
        return {"indicator": "BOLLINGER", "period": int(p.group(1)) if p else 20, "component": band.group(1) or band.group(2)}
    if re.search(r"(?:average|avg)\s+volume|volume\s+(?:average|avg|sma)", s):
        p = re.search(r"(\d+)", s)
        return {"indicator": "VOLUME", "component": "sma", "period": int(p.group(1)) if p else 20}
    if s in ("volume", "объем", "объём"):
        return {"indicator": "VOLUME", "component": "value"}
    if re.fullmatch(r"adx(?:\s*\d+)?", s):
        p = re.search(r"(\d+)", s)
        return {"indicator": "ADX", "period": int(p.group(1)) if p else 14}
    if re.fullmatch(r"(?:stochastic|stoch|%k)(?:\s*\d+)?", s):
        return {"indicator": "STOCH"}
    if s == "vwap":
        return {"indicator": "VWAP"}
    if other is not None and other.get("indicator") == "MACD" and s == "":
        return {"indicator": "MACD", "component": "signal"}
    return None


def _clause(raw: str) -> dict[str, Any] | None:
    text = raw.strip(" ,.;()")
    if not text:
        return None
    move = _MOVE.fullmatch(re.sub(r"^(?:the\s+)?(?:price|stock|it|цена)\s+", "", text, flags=re.I))
    if move and not move.group(4):
        # "sells when it rises 5%" means a gain from the entry price: a take-profit, not a rule.
        return None
    if move:
        down = bool(re.match(r"drop|fall|declin|lose|пада|снижа", move.group(1), re.I))
        unit = (move.group(4) or "day").lower()
        bars = int(move.group(3)) if move.group(3) else next((n for k, n in _WINDOW.items() if unit.startswith(k)), 1)
        size = float(move.group(2).replace(",", "."))
        return {
            "left": {"indicator": "CHANGE", "period": bars},
            "operator": "less_than" if down else "greater_than",
            "right": -size if down else size,
        }
    for op, pattern in _OPS:
        m = re.search(r"(?:^|\s)(?:" + pattern + r")(?:\s|$)", text, re.I)
        if not m:
            continue
        left_raw, right_raw = text[: m.start()], text[m.end():]
        left = _operand(left_raw)
        if not isinstance(left, dict) or re.fullmatch(r"\s*(?:it|this|that)\s*", left_raw, re.I):
            return None
        if not right_raw.strip():
            if left.get("indicator") != "MACD":
                return None
            right: dict[str, Any] | float | None = {"indicator": "MACD", "component": "signal"}
        else:
            right = _operand(right_raw, left)
        if right is None or right == left:
            return None
        return {"left": left, "operator": op, "right": right}
    return None


def _split_top(text: str, words: str) -> tuple[list[str], list[str]]:
    """Split on connectors outside parentheses; returns parts and the connectors between them."""
    parts, ops, depth, start = [], [], 0, 0
    pattern = re.compile(r"\(|\)|\s+(" + words + r")\s+|,\s*(" + words + r")\s+", re.I)
    for m in pattern.finditer(text):
        tok = m.group(0)
        if tok == "(":
            depth += 1
        elif tok == ")":
            depth = max(0, depth - 1)
        elif depth == 0:
            parts.append(text[start : m.start()])
            ops.append((m.group(1) or m.group(2)).lower())
            start = m.end()
    parts.append(text[start:])
    return parts, ops


_AND = {"and", "и", "а также"}


def parse_side(segment: str) -> tuple[list[dict[str, Any]], str, list[dict[str, Any]]] | None:
    """Conditions, their logic and an any-of group, or None when a clause is not understood."""
    seg = re.sub(r"\beither\s+(.+?)\s+or\s+(.+?)(?=(?:\s+and\s+|$))", r"(\1 or \2)", segment.strip(), flags=re.I)
    seg = re.sub(r"\s+", " ", seg).strip(" .,;")
    parts, ops = _split_top(seg, r"and|or|и|или")
    groups: list[list[dict[str, Any]]] = []
    plain: list[dict[str, Any]] = []
    for part in parts:
        p = part.strip()
        if p.startswith("(") and p.endswith(")"):
            inner, inner_ops = _split_top(p[1:-1], r"and|or|и|или")
            if any(o in _AND for o in inner_ops):
                return None
            conds = [_clause(x) for x in inner]
            if any(c is None for c in conds):
                return None
            groups.append(conds)  # type: ignore[arg-type]
        else:
            cond = _clause(p)
            if cond is None:
                return None
            plain.append(cond)
    if not ops:
        if groups:
            return groups[0], "OR", []
        return plain, "AND", []
    if all(o in _AND for o in ops):
        if len(groups) > 1:
            return None
        if groups and not plain:
            return groups[0], "OR", []
        return plain, "AND", groups[0] if groups else []
    if all(o not in _AND for o in ops) and not groups:
        return plain, "OR", []
    return None


def split_sides(text: str) -> tuple[str | None, str | None]:
    """Text of the entry rule and of the exit rule, without risk phrases."""
    exit_m = _EXIT_START.search(text)
    head = text[: exit_m.start()] if exit_m else text
    entry_m = _ENTRY_START.search(head)
    entry = None
    if entry_m:
        entry = re.split(r"[.;]", head[entry_m.end():])[0]
    exit_ = re.split(r"[.;]", text[exit_m.end():])[0] if exit_m else None

    def clean(seg: str | None) -> str | None:
        if seg is None:
            return None
        cut = _STOP_WORDS.search(seg)
        seg = seg[: cut.start()] if cut else seg
        seg = re.sub(r"(?:,|\band\b|\bwith\b|\bи\b)\s*$", "", seg.strip(), flags=re.I)
        return seg.strip(" ,") or None

    return clean(entry), clean(exit_)


def count(side: tuple[list[dict[str, Any]], str, list[dict[str, Any]]] | None) -> int:
    return 0 if side is None else len(side[0]) + len(side[2])
