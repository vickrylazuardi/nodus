"""Engine pooling options.

Why this file exists: the deployed backend returned HTTP 500 on the first
request after a quiet spell and HTTP 200 on the second. Neon suspends the
compute after 5 minutes idle and drops the pooled connections, while the API
process stays up, so the next request checked out a dead socket. Nothing in the
test suite could see it, because tests run against a fresh SQLite database that
never goes away.

These tests pin the options that fix it. They assert the *mechanism* rather than
a live 500, because reproducing the real failure needs a hosted database that
suspends on idle, which a unit test cannot do. The measurement is recorded in
the docstring of `engine_kwargs`.
"""

from app.core.database import engine_kwargs


def test_postgres_checks_connections_before_use():
    """pool_pre_ping is what turns a dead connection into a transparent retry.

    Without it, SQLAlchemy hands the stale connection to the request and the
    request fails. This is the whole fix, so it is asserted directly.
    """
    kwargs = engine_kwargs("postgresql+psycopg://user:pw@host/db")
    assert kwargs["pool_pre_ping"] is True


def test_postgres_recycles_connections_at_the_suspension_age():
    """Connections are retired at 300s, the age Neon suspends the compute.

    pre_ping alone would still make every first-request-after-idle pay a failed
    round trip. Recycling at the same age means most connections are replaced
    before they can go stale.
    """
    kwargs = engine_kwargs("postgresql+psycopg://user:pw@host/db")
    assert kwargs["pool_recycle"] == 300


def test_sqlite_keeps_check_same_thread_and_gets_no_server_pool_options():
    """SQLite is a local file: nothing suspends it, so the options are noise.

    check_same_thread=False must stay, or the file-backed database breaks when a
    session is used from another thread.
    """
    kwargs = engine_kwargs("sqlite:///./prism.db")
    assert kwargs["connect_args"] == {"check_same_thread": False}
    assert "pool_pre_ping" not in kwargs
    assert "pool_recycle" not in kwargs


def test_non_postgres_servers_are_treated_as_remote():
    """The rule keys on 'is it SQLite', not 'is it Postgres'.

    MySQL and others suspend or time out connections too, so they get the same
    protection rather than silently missing out.
    """
    kwargs = engine_kwargs("mysql+pymysql://user:pw@host/db")
    assert kwargs["pool_pre_ping"] is True
    assert kwargs["pool_recycle"] == 300


def test_future_flag_is_always_set():
    """SQLAlchemy 2.0 style is required everywhere in this codebase."""
    for url in ["sqlite:///./prism.db", "postgresql+psycopg://u:p@h/d"]:
        assert engine_kwargs(url)["future"] is True
