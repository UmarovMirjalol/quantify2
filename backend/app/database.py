"""SQLAlchemy database setup and session management."""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    """Base class for ORM models."""


settings = get_settings()
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    """Create all tables and apply lightweight migrations."""
    from sqlalchemy import text

    from app.models import backtest  # noqa: F401

    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        rows = conn.execute(text("PRAGMA table_info(backtests)")).fetchall()
        cols = {r[1] for r in rows}
        if cols and "client_id" not in cols:
            conn.execute(
                text("ALTER TABLE backtests ADD COLUMN client_id VARCHAR(64) DEFAULT ''")
            )


def get_db() -> Generator[Session, None, None]:
    """Yield a database session for FastAPI dependencies."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
