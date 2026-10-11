"""Application configuration loaded from environment variables."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def _detect_root() -> Path:
    """Resolve project root for both local (`…/backend/app`) and Docker (`/app/app`)."""
    pkg = Path(__file__).resolve().parent  # …/app
    docker_or_backend = pkg.parent  # /app or …/backend
    repo = pkg.parents[1]  # /workspace or /
    if (docker_or_backend / "data").is_dir():
        return docker_or_backend
    if (repo / "data").is_dir():
        return repo
    if (repo / "backend").is_dir():
        return repo
    return docker_or_backend


ROOT_DIR = _detect_root()
DEFAULT_DATA_DIR = ROOT_DIR / "data"
DEFAULT_UPLOAD_DIR = ROOT_DIR / "uploads"
DB_PATH = ROOT_DIR / "backtests.db"


class Settings(BaseSettings):
    """Runtime settings for the backtesting platform."""

    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env") if (ROOT_DIR / ".env").exists() else str(Path.cwd() / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    app_name: str = "Quantify"
    # Shared access token for end users (required in docker compose production)
    app_access_token: str = ""
    # OpenAPI docs: off in production unless explicitly enabled
    enable_docs: bool | None = None
    # Allow saving LLM keys via UI (disable in public production; use env instead)
    allow_runtime_llm_config: bool | None = None
    rate_limit_per_minute: int = 60
    llm_api_key: str = ""
    llm_model: str = "gpt-4o-mini"
    llm_base_url: str = "https://api.openai.com/v1"
    database_url: str = f"sqlite:///{DB_PATH}"
    cors_origins: str = (
        "http://localhost:43127,http://127.0.0.1:43127,"
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:18080,http://127.0.0.1:18080,"
        "http://localhost:4173,http://127.0.0.1:4173,"
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:8080,http://127.0.0.1:8080"
    )
    max_upload_size_mb: int = 25
    force_builtin_parser: bool = False
    data_dir: str = str(DEFAULT_DATA_DIR)
    upload_dir: str = str(DEFAULT_UPLOAD_DIR)
    # Public live counters = baseline + real activity
    stats_baseline_users: int = 112
    stats_baseline_backtests: int = 525
    stats_releases: int = 3

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() in {"prod", "production"}

    @property
    def docs_enabled(self) -> bool:
        if self.enable_docs is not None:
            return bool(self.enable_docs)
        return not self.is_production

    @property
    def runtime_llm_config_allowed(self) -> bool:
        if self.allow_runtime_llm_config is not None:
            return bool(self.allow_runtime_llm_config)
        return not self.is_production

    @property
    def auth_required(self) -> bool:
        return bool(self.app_access_token and self.app_access_token.strip())

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
    from app.llm.runtime_config import apply_runtime_overrides

    settings = apply_runtime_overrides(settings)
    settings.resolved_upload_dir.mkdir(parents=True, exist_ok=True)
    settings.resolved_data_dir.mkdir(parents=True, exist_ok=True)
    return settings


def _dirs() -> tuple[Path, Path]:
    s = get_settings()
    return s.resolved_data_dir, s.resolved_upload_dir


DATA_DIR, UPLOAD_DIR = _dirs()
