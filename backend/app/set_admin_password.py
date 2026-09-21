"""Set the admin password without touching any other data.

The seed script can rotate the admin password, but only as part of a run that
may also wipe and reseed the dataset. This script changes the password and
nothing else, which is what you want on a live database where the figures and
relationships are real.

Passwords are stored as a one-way bcrypt hash, so an existing password cannot be
recovered or printed. It can only be replaced.

Usage
-----

    # Generate a random password and print it once.
    uv run python -m app.set_admin_password

    # Set a specific password.
    uv run python -m app.set_admin_password --password 'your-new-password'

    # Against a deployed database.
    PRISM_DATABASE_URL='postgresql+psycopg://...' \
      uv run python -m app.set_admin_password

If no password is given, one is generated and printed. It is not stored
anywhere in readable form, so copy it before the terminal scrolls.
"""

from __future__ import annotations

import argparse
import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import hash_password, verify_password
from app.models import User

# 12 bytes of urlsafe base64 is 16 characters. Long enough that guessing is not
# a concern for a single admin account, short enough to retype from a terminal.
PASSWORD_BYTES = 12


def generate_password() -> str:
    """A random password, independent of any setting.

    Deliberately not derived from settings.secret_key: that value has a
    published default in an open-source repo, so a derived password would be
    guessable. The old code did exactly that and shipped a working credential.
    """
    return secrets.token_urlsafe(PASSWORD_BYTES)


def apply_password(db: Session, username: str, password: str) -> User:
    """Set `username`'s password and commit. Returns the updated user.

    Raises SystemExit if the account does not exist. Creating it here would
    leave an operator with an account they did not expect, and a missing admin
    means the database was never seeded.
    """
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        raise SystemExit(f"No user named {username!r}. Run `python -m app.seed` first.")

    user.hashed_password = hash_password(password)
    db.commit()
    db.refresh(user)

    # Read back what was written, so a silent failure cannot be reported as
    # success.
    if not verify_password(password, user.hashed_password):
        raise SystemExit("Password was written but does not verify. Nothing changed.")

    return user


def main() -> None:
    parser = argparse.ArgumentParser(description="Set the PRISM admin password.")
    parser.add_argument(
        "--password",
        default=None,
        help="The new password. Omit to have a random one generated.",
    )
    parser.add_argument(
        "--username",
        default="admin",
        help="Which account to update (default: admin).",
    )
    args = parser.parse_args()

    supplied = args.password is not None
    password = args.password or generate_password()

    with SessionLocal() as db:
        apply_password(db, args.username, password)

    print(f"Password updated for {args.username!r}.")
    if supplied:
        print("The password you supplied is now active.")
    else:
        print(f"\n  {password}\n")
        print("Copy it now: only the hash is stored, so it cannot be shown again.")


if __name__ == "__main__":
    main()
