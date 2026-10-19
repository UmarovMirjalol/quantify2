"""Tests for durable counter helpers."""

from __future__ import annotations

from app.stats_store import redis_configured


def test_redis_configured_false_without_env(monkeypatch):
    monkeypatch.delenv("UPSTASH_REDIS_REST_URL", raising=False)
    monkeypatch.delenv("UPSTASH_REDIS_REST_TOKEN", raising=False)
    assert redis_configured() is False


def test_redis_configured_needs_both(monkeypatch):
    monkeypatch.setenv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io")
    monkeypatch.delenv("UPSTASH_REDIS_REST_TOKEN", raising=False)
    assert redis_configured() is False
    monkeypatch.setenv("UPSTASH_REDIS_REST_TOKEN", "tok")
    assert redis_configured() is True
