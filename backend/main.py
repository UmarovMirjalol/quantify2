"""Vercel / uvicorn-friendly re-export of the FastAPI app."""

from app.main import app

__all__ = ["app"]
