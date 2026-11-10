"""SQLAlchemy database setup and session management."""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    """Base class for ORM models."""


settings = get_settings()
if settings.database_url.startswith("sqlite"):
    engine = create_engine(settings.database_url, connect_args={"check_same_thread": False})
else:
    # Serverless Postgres (Neon, Supabase) drops idle connections; test each one before use.
    engine = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=300, pool_size=5, max_overflow=5)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    """Create all tables and apply lightweight migrations."""
    from sqlalchemy import inspect, text

    from app.models import account  # noqa: F401
    from app.models import backtest  # noqa: F401
    from app.models import forward  # noqa: F401
    from app.models import stats  # noqa: F401

    Base.metadata.create_all(bind=engine)
    cols = {c["name"] for c in inspect(engine).get_columns("backtests")}
    added = {
        "client_id": "ALTER TABLE backtests ADD COLUMN client_id VARCHAR(64) DEFAULT ''",
        "share_token": "ALTER TABLE backtests ADD COLUMN share_token VARCHAR(32)",
    }
    with engine.begin() as conn:
        for name, ddl in added.items():
            if cols and name not in cols:
                conn.execute(text(ddl))


def get_db() -> Generator[Session, None, None]:
    """Yield a database session for FastAPI dependencies."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
