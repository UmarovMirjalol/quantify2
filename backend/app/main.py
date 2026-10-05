"""FastAPI application entrypoint."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config import get_settings
from app.database import init_db

settings = get_settings()

app = FastAPI(
    title="QuantLLM Backtester",
    description=(
        "LLM-powered quantitative backtesting platform. "
        "Natural language strategies → structured specs → custom engine."
    ),
    version="1.0.0",
    docs_url="/docs" if not settings.is_production else "/docs",
    redoc_url="/redoc",
)

cors_origins = settings.cors_origin_list
# In production behind same-origin nginx, "*" is fine for API clients
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

app.include_router(router)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/")
def root() -> dict[str, str]:
    return {
        "name": "QuantLLM Backtester",
        "env": settings.app_env,
        "docs": "/docs",
        "health": "/api/health",
    }
