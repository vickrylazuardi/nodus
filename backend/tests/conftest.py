"""Shared fixtures: an isolated in-memory database and a test client."""

from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import hash_password
from app.main import app
from app.models import Figure, Issue, Modifier, Relationship, RelationshipIssue, User

ADMIN_PASSWORD = "test-password-123"


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    """Fresh in-memory SQLite per test.

    StaticPool keeps the single connection alive so the schema created here is
    visible to every session the app opens during the test.

    The PRAGMA is required here as well: SQLite defaults foreign keys to OFF, so
    ON DELETE CASCADE is inert without it and cascade tests would pass or fail
    for the wrong reason.
    """
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_connection, connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def admin_user(db_session: Session) -> User:
    user = User(username="admin", hashed_password=hash_password(ADMIN_PASSWORD))
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def auth_headers(client: TestClient, admin_user: User) -> dict[str, str]:
    resp = client.post(
        "/api/admin/auth/login",
        json={"username": "admin", "password": ADMIN_PASSWORD},
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
def sample_graph(db_session: Session) -> dict:
    """Three figures, two issues, two relationships.

    Scores are chosen to exercise both a strongly allied pair and a hostile one.
    """
    issues = [
        Issue(name="Koalisi", category="Struktur Kekuasaan", default_weight=1.5),
        Issue(name="Hukum", category="Integritas", default_weight=1.0),
    ]
    figures = [
        Figure(name="Alpha", party="Partai A", bloc="Blok Satu", influence=90),
        Figure(name="Beta", party="Partai A", bloc="Blok Satu", influence=70),
        Figure(name="Gamma", party="Partai B", bloc="Blok Dua", influence=60),
    ]
    db_session.add_all(issues + figures)
    db_session.commit()

    allied = Relationship(source_id=figures[0].id, target_id=figures[1].id, rel_type="coalition")
    hostile = Relationship(source_id=figures[0].id, target_id=figures[2].id, rel_type="political")
    db_session.add_all([allied, hostile])
    db_session.commit()

    db_session.add_all(
        [
            RelationshipIssue(
                relationship_id=allied.id, issue_id=issues[0].id, score=80, weight=1.5,
                stance="Satu komando",
            ),
            RelationshipIssue(
                relationship_id=allied.id, issue_id=issues[1].id, score=60, weight=1.0
            ),
            RelationshipIssue(
                relationship_id=hostile.id, issue_id=issues[0].id, score=-70, weight=1.5,
                stance="Berada di kubu berbeda",
            ),
            RelationshipIssue(
                relationship_id=hostile.id, issue_id=issues[1].id, score=-50, weight=1.0
            ),
            Modifier(
                relationship_id=hostile.id,
                label="Peristiwa uji",
                value=-20,
                kind="event",
                expires_at=None,
            ),
        ]
    )
    db_session.commit()

    return {
        "issues": [i.id for i in issues],
        "figures": [f.id for f in figures],
        "allied": allied.id,
        "hostile": hostile.id,
    }
