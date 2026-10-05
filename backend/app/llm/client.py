"""OpenAI-compatible LLM client abstraction."""

from __future__ import annotations

import json
from typing import Any

from app.config import Settings, get_settings


class LLMClientError(Exception):
    """Raised when the LLM provider call fails."""


class LLMClient:
    """
    Thin wrapper over an OpenAI-compatible Chat Completions API.

    Supports OpenAI, Azure OpenAI (via base_url), Groq, Together, Ollama, etc.
    Never executes model-generated code — callers must validate structured JSON.
    """

    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()

    @property
    def enabled(self) -> bool:
        return self.settings.llm_enabled

    @property
    def model(self) -> str:
        return self.settings.llm_model

    @property
    def base_url(self) -> str:
        return self.settings.llm_base_url

    async def chat_json(
        self,
        *,
        system: str,
        user: str,
        temperature: float = 0.0,
        timeout: float = 60.0,
    ) -> dict[str, Any]:
        """Send a chat request and parse the assistant message as JSON."""
        if not self.enabled:
            raise LLMClientError("LLM is not configured (set LLM_API_KEY)")

        try:
            from openai import AsyncOpenAI
        except ImportError as exc:
            raise LLMClientError("openai package is not installed") from exc

        client = AsyncOpenAI(
            api_key=self.settings.llm_api_key,
            base_url=self.settings.llm_base_url,
            timeout=timeout,
        )
        try:
            response = await client.chat.completions.create(
                model=self.settings.llm_model,
                temperature=temperature,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                response_format={"type": "json_object"},
            )
        except Exception as exc:  # noqa: BLE001
            raise LLMClientError(f"LLM request failed: {exc}") from exc

        content = (response.choices[0].message.content or "").strip()
        if not content:
            raise LLMClientError("LLM returned empty content")

        if content.startswith("```"):
            import re

            content = re.sub(r"^```(?:json)?\s*", "", content)
            content = re.sub(r"\s*```$", "", content)

        try:
            data = json.loads(content)
        except json.JSONDecodeError as exc:
            raise LLMClientError(f"LLM returned invalid JSON: {exc}") from exc

        if not isinstance(data, dict):
            raise LLMClientError("LLM JSON root must be an object")
        return data

    def status(self) -> dict[str, Any]:
        key = self.settings.llm_api_key or ""
        masked = ""
        if key:
            masked = (key[:3] + "…" + key[-4:]) if len(key) > 8 else "***"
        return {
            "enabled": self.enabled,
            "model": self.model,
            "base_url": self.base_url,
            "api_key_configured": bool(key.strip()),
            "api_key_masked": masked,
            "provider": "openai-compatible",
        }
