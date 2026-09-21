"""Tests for the admin password reset script.

The point of this script is that it changes exactly one row and nothing else, so
the tests assert both halves: the password changes, and the dataset does not.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app import set_admin_password
from app.core.config import settings
from app.core.security import verify_password
from app.models import Figure, Relationship, User


def test_sets_the_supplied_password(db_session, admin_user):
    new_password = "a-specific-new-password"

    set_admin_password.apply_password(db_session, "admin", new_password)

    db_session.refresh(admin_user)
    assert verify_password(new_password, admin_user.hashed_password)


def test_replaces_rather_than_appends(db_session, admin_user):
    """The old hash must be gone, not merely accompanied by a new one."""
    before = admin_user.hashed_password

    set_admin_password.apply_password(db_session, "admin", "another-password")

    db_session.refresh(admin_user)
    assert admin_user.hashed_password != before
    assert not verify_password("test-password-123", admin_user.hashed_password)


def test_leaves_the_dataset_untouched(db_session, admin_user, sample_graph):
    """The whole reason this script exists instead of using seed --force."""
    figures_before = db_session.query(Figure).count()
    relationships_before = db_session.query(Relationship).count()
    assert figures_before > 0, "the fixture should have created figures"

    set_admin_password.apply_password(db_session, "admin", "yet-another-password")

    assert db_session.query(Figure).count() == figures_before
    assert db_session.query(Relationship).count() == relationships_before


def test_does_not_create_a_missing_account(db_session):
    """A missing admin means the database was never seeded.

    Creating one here would leave an operator with an account they did not
    expect, so the script must refuse instead.
    """
    with pytest.raises(SystemExit):
        set_admin_password.apply_password(db_session, "does-not-exist", "irrelevant")


def test_generated_password_is_random_not_derived(db_session, admin_user):
    """A password derived from settings would be guessable in an open repo.

    The original bug was exactly this: the password was the first characters of
    a published default secret. Assert the generator is independent of it and
    that two calls differ.
    """
    first = set_admin_password.generate_password()
    second = set_admin_password.generate_password()

    assert len(first) >= 16
    assert first != second
    assert first != settings.secret_key[:16]
    assert first not in settings.secret_key


def test_rejects_a_password_that_does_not_verify(db_session, admin_user, monkeypatch):
    """If the write silently fails, the script must not report success.

    Simulated by making verification always fail, which is what a broken
    hashing configuration would look like from the outside.
    """
    monkeypatch.setattr(set_admin_password, "verify_password", lambda *_: False)

    with pytest.raises(SystemExit):
        set_admin_password.apply_password(db_session, "admin", "whatever")
