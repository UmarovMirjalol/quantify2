"""Process-local instance plan override (self-host license unlock)."""

from __future__ import annotations

_OVERRIDE: str | None = None


def set_instance_plan(plan: str | None) -> None:
    global _OVERRIDE
    _OVERRIDE = plan if plan in {"pro", "self_host"} else None


def get_instance_plan_override() -> str | None:
    return _OVERRIDE
