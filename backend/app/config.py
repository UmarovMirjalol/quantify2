"""Application configuration loaded from environment variables."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DATA_DIR = ROOT_DIR / "data"
DEFAULT_UPLOAD_DIR = ROOT_DIR / "uploads"
DB_PATH = ROOT_DIR / "backtests.db"


class Settings(BaseSettings):
    """Runtime settings for the backtesting platform."""

    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    llm_api_key: str = ""
    llm_model: str = "gpt-4o-mini"
    llm_base_url: str = "https://api.openai.com/v1"
    database_url: str = f"sqlite:///{DB_PATH}"
    cors_origins: str = (
        "http://localhost:4173,http://127.0.0.1:4173,"
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:80,http://127.0.0.1:80,"
        "http://localhost:8080,http://127.0.0.1:8080"
    )
    max_upload_size_mb: int = 25
    force_builtin_parser: bool = False
    data_dir: str = str(DEFAULT_DATA_DIR)
    upload_dir: str = str(DEFAULT_UPLOAD_DIR)

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() in {"prod", "production"}

    @property
    def llm_enabled(self) -> bool:
        """Return True when a real LLM API key is configured and builtin force is off."""
        if self.force_builtin_parser:
            return False
        return bool(self.llm_api_key and self.llm_api_key.strip())

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def resolved_data_dir(self) -> Path:
        return Path(self.data_dir)

    @property
    def resolved_upload_dir(self) -> Path:
        return Path(self.upload_dir)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.resolved_upload_dir.mkdir(parents=True, exist_ok=True)
    settings.resolved_data_dir.mkdir(parents=True, exist_ok=True)
    return settings


# Module-level aliases used across the codebase
def _dirs() -> tuple[Path, Path]:
    s = get_settings()
    return s.resolved_data_dir, s.resolved_upload_dir


DATA_DIR, UPLOAD_DIR = _dirs()
