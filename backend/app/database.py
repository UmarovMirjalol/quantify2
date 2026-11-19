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
    from app.models import paper  # noqa: F401
    from app.models import stats  # noqa: F401
    from app.models import usage  # noqa: F401

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
        # Account billing columns (Hosted Pro + license)
        try:
            acct_cols = {c["name"] for c in inspect(engine).get_columns("accounts")}
        except Exception:  # noqa: BLE001
            acct_cols = set()
        acct_added = {
            "plan": "ALTER TABLE accounts ADD COLUMN plan VARCHAR(16) DEFAULT 'free'",
            "plan_status": "ALTER TABLE accounts ADD COLUMN plan_status VARCHAR(24) DEFAULT 'none'",
            "stripe_customer_id": "ALTER TABLE accounts ADD COLUMN stripe_customer_id VARCHAR(64)",
            "stripe_subscription_id": "ALTER TABLE accounts ADD COLUMN stripe_subscription_id VARCHAR(64)",
            "license_key_hint": "ALTER TABLE accounts ADD COLUMN license_key_hint VARCHAR(32)",
            "license_licensee": "ALTER TABLE accounts ADD COLUMN license_licensee VARCHAR(120)",
        }
        for name, ddl in acct_added.items():
            if acct_cols and name not in acct_cols:
                conn.execute(text(ddl))


def get_db() -> Generator[Session, None, None]:
    """Yield a database session for FastAPI dependencies."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
