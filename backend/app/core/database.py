"""SQLAlchemy engine, session factory and declarative base."""

from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

IS_SQLITE = settings.database_url.startswith("sqlite")

# check_same_thread is required only for SQLite, which is the default dev
# database. A file-backed SQLite needs it because sessions may be used from a
# different thread than the connection was created on.
connect_args = {"check_same_thread": False} if IS_SQLITE else {}

engine = create_engine(settings.database_url, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


@event.listens_for(Engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, connection_record) -> None:
    """Turn on FK enforcement for every SQLite connection.

    SQLite ships with foreign key enforcement OFF, so ON DELETE CASCADE is
    silently inert without this: deleting a figure would leave its relationships
    orphaned in the database. Models use passive_deletes=True and therefore
    depend on the database to perform the cascade.
    """
    if not IS_SQLITE:
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a session that always closes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
