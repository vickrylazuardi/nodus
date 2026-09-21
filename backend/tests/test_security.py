"""Security regression tests.

These pin the two ways a fresh open-source checkout could ship an insecure
admin surface: a published default signing key, and a guessable admin password.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.config import Settings

PUBLISHED_DEFAULT = "change-me-in-production"


def test_development_generates_a_random_secret() -> None:
    """An unset secret must never resolve to a constant shipped in the repo."""
    settings = Settings(environment="development", secret_key="")
    assert settings.secret_key
    assert settings.secret_key != PUBLISHED_DEFAULT
    assert len(settings.secret_key) >= 32


def test_two_development_instances_do_not_share_a_secret() -> None:
    a = Settings(environment="development", secret_key="")
    b = Settings(environment="development", secret_key="")
    assert a.secret_key != b.secret_key


def test_production_refuses_to_start_without_a_secret() -> None:
    """A published signing key would let anyone forge an admin token."""
    with pytest.raises(ValidationError) as excinfo:
        Settings(environment="production", secret_key="")
    assert "PRISM_SECRET_KEY" in str(excinfo.value)


def test_production_starts_when_a_secret_is_supplied() -> None:
    settings = Settings(environment="production", secret_key="a-real-secret-value")
    assert settings.secret_key == "a-real-secret-value"


def test_seed_never_derives_password_from_the_secret_key() -> None:
    """The admin password must be random, not sliced out of the signing key.

    settings.secret_key once had a documented placeholder in the repo, so
    deriving a password from it gave every fresh install the same login. This
    checks the executable lines only, since the source mentions secret_key in a
    comment explaining why it is not used.
    """
    from app import seed

    with open(seed.__file__) as handle:
        lines = handle.readlines()

    code = [
        line for line in lines if line.strip() and not line.lstrip().startswith("#")
    ]
    code_text = "".join(code)

    assert "settings.secret_key" not in code_text, (
        "seed.py must not derive the admin password from settings.secret_key; "
        "use secrets.token_urlsafe() instead"
    )
    assert "token_urlsafe" in code_text, "seed.py should generate a random admin password"


def test_force_reseed_rotates_a_compromised_admin_password(db_session) -> None:
    """--force must not leave a hash of the published default in place.

    Databases created before the password fix hold a hash of
    secret_key[:16] == "change-me-in-pro". Reseeding is the operator's signal
    to reset, so that credential must be replaced.
    """
    from app import seed
    from app.core.security import hash_password, verify_password
    from app.models import User

    compromised = "change-me-in-pro"
    db_session.add(User(username="admin", hashed_password=hash_password(compromised)))
    db_session.commit()

    result = seed.seed(db_session, force=True)
    db_session.commit()

    admin = db_session.query(User).filter_by(username="admin").one()
    assert not verify_password(compromised, admin.hashed_password), (
        "the published default password survived a --force reseed"
    )
    assert result.get("admin_password"), "a new password should have been issued"


def test_force_reseed_keeps_a_custom_admin_password(db_session) -> None:
    """A deliberate password must not be clobbered by a routine reseed."""
    from app import seed
    from app.core.security import hash_password, verify_password
    from app.models import User

    custom = "my-own-strong-password"
    db_session.add(User(username="admin", hashed_password=hash_password(custom)))
    db_session.commit()

    result = seed.seed(db_session, force=True)
    db_session.commit()

    admin = db_session.query(User).filter_by(username="admin").one()
    assert verify_password(custom, admin.hashed_password), "a custom password was overwritten"
    assert not result.get("admin_password"), "no new password should be reported"
