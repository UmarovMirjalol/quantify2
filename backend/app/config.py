"""Application configuration loaded from environment variables."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT_DIR / "data"
UPLOAD_DIR = ROOT_DIR / "uploads"
DB_PATH = ROOT_DIR / "backtests.db"


class Settings(BaseSettings):
    """Runtime settings for the backtesting platform."""

    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    llm_api_key: str = ""
    llm_model: str = "gpt-4o-mini"
    llm_base_url: str = "https://api.openai.com/v1"
    database_url: str = f"sqlite:///{DB_PATH}"
    cors_origins: str = "http://localhost:4173,http://127.0.0.1:4173,http://localhost:5173,http://127.0.0.1:5173"
    max_upload_size_mb: int = 25
    demo_mode_force: bool = False

    @property
    def llm_enabled(self) -> bool:
        """Return True when a real LLM API key is configured and demo mode is not forced."""
        if self.demo_mode_force:
            return False
        return bool(self.llm_api_key and self.llm_api_key.strip())

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return Settings()
