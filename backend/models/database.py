from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from config import settings

_sqlite = settings.database_url.startswith("sqlite")
engine = create_engine(
    settings.database_url,
    pool_pre_ping=not _sqlite,
    connect_args={"check_same_thread": False} if _sqlite else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_database():
    import models  # noqa: F401 — registers all ORM classes
    Base.metadata.create_all(bind=engine)
    _add_missing_columns()


# Columns added after the first release: create_all() does not alter existing tables.
_COLUMN_MIGRATIONS = {
    "grant_sources": {
        "failure_count": "INTEGER NOT NULL DEFAULT 0",
        "content_hash": "VARCHAR(64)",
    },
}


def _add_missing_columns():
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table, columns in _COLUMN_MIGRATIONS.items():
            existing = {c["name"] for c in inspector.get_columns(table)}
            for name, ddl in columns.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
