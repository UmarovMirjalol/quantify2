"""Persist optional runtime LLM settings (overrides env without rebuild)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from app.config import ROOT_DIR, get_settings


RUNTIME_CONFIG_PATH = ROOT_DIR / ".llm_runtime.json"


class LLMRuntimeConfig(BaseModel):
    api_key: str = ""
    model: str = "gpt-4o-mini"
    base_url: str = "https://api.openai.com/v1"
    enabled: bool = True


def load_runtime_llm_config() -> LLMRuntimeConfig | None:
    if not RUNTIME_CONFIG_PATH.exists():
        return None
    try:
        data = json.loads(RUNTIME_CONFIG_PATH.read_text(encoding="utf-8"))
        return LLMRuntimeConfig.model_validate(data)
    except Exception:  # noqa: BLE001
        return None


def save_runtime_llm_config(cfg: LLMRuntimeConfig) -> None:
    RUNTIME_CONFIG_PATH.write_text(
        cfg.model_dump_json(indent=2),
        encoding="utf-8",
    )
    # Clear settings cache so next request picks up overrides
    get_settings.cache_clear()


def clear_runtime_llm_config() -> None:
    if RUNTIME_CONFIG_PATH.exists():
        RUNTIME_CONFIG_PATH.unlink()
    get_settings.cache_clear()


def apply_runtime_overrides(settings: Any) -> Any:
    """Mutate a Settings instance with runtime LLM overrides if present."""
    runtime = load_runtime_llm_config()
    if runtime is None or not runtime.enabled:
        return settings
    if runtime.api_key.strip():
        settings.llm_api_key = runtime.api_key.strip()
    if runtime.model.strip():
        settings.llm_model = runtime.model.strip()
    if runtime.base_url.strip():
        settings.llm_base_url = runtime.base_url.strip()
    return settings


class LLMConfigUpdate(BaseModel):
    api_key: str = Field(default="", max_length=512)
    model: str = Field(default="gpt-4o-mini", min_length=1, max_length=128)
    base_url: str = Field(default="https://api.openai.com/v1", min_length=8, max_length=512)
    enabled: bool = True
