"""SQLAlchemy engine, session factory and declarative base."""

from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

IS_SQLITE = settings.database_url.startswith("sqlite")


def engine_kwargs(database_url: str) -> dict:
    """Connection-pool options for a database URL.

    Split out from the engine so the options are testable without a database.

    SQLite needs ``check_same_thread=False``: a file-backed database may be used
    from a different thread than the one that created the connection.

    Everything else gets ``pool_pre_ping`` and a 5-minute recycle, because of how
    the hosted Postgres behaves. Neon's free tier suspends the compute after 5
    minutes idle, which silently drops the TCP connections sitting in the pool
    while the API process stays up. Without a liveness check the next request
    checks out a dead socket and fails instantly, so the FIRST request after a
    quiet spell returned HTTP 500 while the second one succeeded. Measured on the
    deployed backend: a request 6.5 minutes after the last one returned 500 in
    0.1s, and the immediate retry returned 200 in 0.7s.

    That ordering is the worst possible one: the visitor who arrives when the
    site is quiet gets the error, and the one who arrives while it is warm gets
    the page. ``pool_pre_ping`` tests a connection before handing it out and
    transparently replaces it when it is dead. ``pool_recycle`` retires
    connections at the same age Neon suspends them, so most are replaced before
    they can go stale at all.
    """
    kwargs: dict = {"future": True}
    if database_url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    else:
        kwargs["pool_pre_ping"] = True
        kwargs["pool_recycle"] = 300
    return kwargs


engine = create_engine(settings.database_url, **engine_kwargs(settings.database_url))
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    """Declarative base for the ORM models."""


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
