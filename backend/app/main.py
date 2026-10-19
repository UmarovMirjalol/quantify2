"""FastAPI application entrypoint."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config import get_settings
from app.database import init_db
from app.security import AccessTokenMiddleware, RateLimitMiddleware

settings = get_settings()

docs_url = "/docs" if settings.docs_enabled else None
redoc_url = "/redoc" if settings.docs_enabled else None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Create SQLite schema on cold start (Vercel /tmp or local disk)."""
    init_db()
    _ensure_client_id_column()
    yield


app = FastAPI(
    title=settings.app_name,
    description=(
        "LLM-powered quantitative backtesting platform. "
        "Natural language strategies → structured specs → custom engine."
    ),
    version="1.0.0",
    docs_url=docs_url,
    redoc_url=redoc_url,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
    lifespan=lifespan,
)

cors_origins = settings.cors_origin_list
if cors_origins == ["*"] or "*" in cors_origins:
    allow_origins = ["*"]
    allow_credentials = False
else:
    allow_origins = cors_origins
    allow_credentials = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Order: last added runs first for request
app.add_middleware(RateLimitMiddleware)
app.add_middleware(AccessTokenMiddleware)

app.include_router(router)


def _ensure_client_id_column() -> None:
    """Lightweight migration: add client_id for per-browser isolation."""
    from sqlalchemy import text

    from app.database import engine

    if not settings.database_url.startswith("sqlite"):
        return
    with engine.begin() as conn:
        rows = conn.execute(text("PRAGMA table_info(backtests)")).fetchall()
        cols = {r[1] for r in rows}
        if "client_id" not in cols:
            conn.execute(
                text("ALTER TABLE backtests ADD COLUMN client_id VARCHAR(64) DEFAULT ''")
            )


@app.get("/")
def root() -> dict[str, object]:
    return {
        "name": settings.app_name,
        "env": settings.app_env,
        "health": "/api/health",
        "auth_required": settings.auth_required,
        "docs": "/docs" if settings.docs_enabled else None,
    }
