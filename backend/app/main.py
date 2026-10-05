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
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list + ["*"],
    allow_credentials=True,
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
        "docs": "/docs",
        "health": "/api/health",
    }
