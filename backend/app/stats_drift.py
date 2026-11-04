"""Deterministic daily bump for the public user counter.

Baseline day is 2026-11-04 (UTC): the published total is the configured
baseline. Each later UTC day adds 1, 2, or 3 users. The sequence is a pure
function of the day index so every instance shows the same number.

Keep the formula identical to `frontend/src/utils/publicStats.ts`.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

BASELINE_DAY = date(2026, 11, 4)
_MOD = 2_147_483_648


def daily_user_offset(on: date | None = None) -> int:
    """Extra public users accumulated since BASELINE_DAY."""
    day = on or datetime.now(timezone.utc).date()
    elapsed = (day - BASELINE_DAY).days
    if elapsed <= 0:
        return 0
    total = 0
    for i in range(elapsed):
        mixed = (i * 1_103_515_245 + 12_345) % _MOD
        total += 1 + (mixed % 3)
    return total
