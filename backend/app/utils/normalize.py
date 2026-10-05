"""Normalize messy user-pasted inputs (tokens, keys, strategy text)."""

from __future__ import annotations

import re


_SMART_QUOTES = str.maketrans({
    "\u201c": '"',
    "\u201d": '"',
    "\u2018": "'",
    "\u2019": "'",
    "\u00ab": '"',
    "\u00bb": '"',
})


def normalize_strategy_text(text: str) -> str:
    """Strip wrapping quotes, smart quotes, and collapse whitespace."""
    if not text:
        return ""
    cleaned = text.translate(_SMART_QUOTES).strip()
    # Remove zero-width / BOM characters often introduced by paste
    cleaned = cleaned.replace("\ufeff", "").replace("\u200b", "")
    if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in {'"', "'"}:
        cleaned = cleaned[1:-1].strip()
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def normalize_secret(value: str) -> str:
    """Normalize pasted access tokens / API keys (trim, strip Bearer, drop whitespace)."""
    if not value:
        return ""
    cleaned = value.translate(_SMART_QUOTES).strip().replace("\ufeff", "")
    if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in {'"', "'"}:
        cleaned = cleaned[1:-1].strip()
    if cleaned.lower().startswith("bearer "):
        cleaned = cleaned[7:].strip()
    # Keys/tokens should not contain whitespace after paste
    cleaned = re.sub(r"\s+", "", cleaned)
    return cleaned


def normalize_fraction(value: float | None, *, field: str = "value") -> float | None:
    """
    Accept either fraction (0.01) or percent (1 meaning 1%).

    Values >= 1 are treated as percents and divided by 100
    (users almost always paste "1" for 1%, not 100%).
    """
    if value is None:
        return None
    if value < 0:
        raise ValueError(f"{field} must be non-negative")
    if value >= 1.0:
        return value / 100.0
    return value
