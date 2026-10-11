"""Security middleware: access token auth + simple rate limiting."""

from __future__ import annotations

import secrets
import time
from collections import defaultdict, deque
from typing import Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings

# Paths that stay public (health probes, root)
PUBLIC_PATHS = {
    "/api/health",
    "/api/stats",
    "/api/stats/ping",
    "/healthz",
    "/",
}


from app.utils.normalize import normalize_secret


class AccessTokenMiddleware(BaseHTTPMiddleware):
    """Require Bearer / X-API-Key when APP_ACCESS_TOKEN is configured."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        settings = get_settings()
        path = request.url.path

        if not settings.auth_required:
            return await call_next(request)

        if path in PUBLIC_PATHS or path.startswith("/assets"):
            return await call_next(request)

        # Allow CORS preflight
        if request.method == "OPTIONS":
            return await call_next(request)

        expected = normalize_secret(settings.app_access_token)
        auth = request.headers.get("authorization", "")
        api_key = request.headers.get("x-api-key", "")
        provided = ""
        if auth.lower().startswith("bearer "):
            provided = normalize_secret(auth[7:])
        elif api_key:
            provided = normalize_secret(api_key)

        if not provided or not secrets.compare_digest(provided, expected):
            return JSONResponse(
                status_code=401,
                content={
                    "detail": "Unauthorized. Provide Authorization: Bearer <APP_ACCESS_TOKEN> or X-API-Key.",
                },
            )
        return await call_next(request)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-IP sliding window rate limiter."""

    def __init__(self, app, requests_per_minute: int | None = None):
        super().__init__(app)
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._override = requests_per_minute

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        settings = get_settings()
        limit = self._override if self._override is not None else settings.rate_limit_per_minute
        if limit <= 0 or request.url.path in {"/api/health", "/healthz"}:
            return await call_next(request)

        # Prefer edge-forwarded IP
        forwarded = request.headers.get("x-forwarded-for", "")
        client_ip = forwarded.split(",")[0].strip() if forwarded else (
            request.client.host if request.client else "unknown"
        )
        # Combine with client id for fair multi-user behind NAT
        client_id = request.headers.get("x-client-id", "")
        bucket_key = f"{client_ip}:{client_id}" if client_id else client_ip

        now = time.time()
        window = 60.0
        q = self._hits[bucket_key]
        while q and now - q[0] > window:
            q.popleft()
        if len(q) >= limit:
            return JSONResponse(
                status_code=429,
                content={"detail": f"Rate limit exceeded ({limit} requests/minute). Try again shortly."},
                headers={"Retry-After": "60"},
            )
        q.append(now)
        return await call_next(request)
