"""Authentication: password hashing and JWT bearer tokens.

Uses bcrypt directly rather than passlib: passlib's last release was 2020 and it
breaks against bcrypt >= 4.1 (its backend probe reads `bcrypt.__about__`, which
was removed). Calling bcrypt ourselves is three lines and has no such coupling.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models import User

ALGORITHM = "HS256"

# bcrypt hashes at most 72 bytes and raises beyond that, so truncate explicitly
# rather than letting a long password become a 500.
BCRYPT_MAX_BYTES = 72

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/admin/auth/login", auto_error=False)


def _prepare(password: str) -> bytes:
    return password.encode("utf-8")[:BCRYPT_MAX_BYTES]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_prepare(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_prepare(plain), hashed.encode("utf-8"))
    except ValueError:
        # Malformed hash in the database: treat as a failed login, not a crash.
        return False


def create_access_token(subject: str, expires_minutes: int | None = None) -> tuple[str, int]:
    """Return (token, seconds_until_expiry)."""
    minutes = expires_minutes or settings.access_token_expire_minutes
    expire = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    payload = {"sub": subject, "exp": expire, "iat": datetime.now(timezone.utc)}
    token = jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)
    return token, minutes * 60


def authenticate(db: Session, username: str, password: str) -> User | None:
    user = db.scalars(select(User).where(User.username == username)).first()
    if user is None or not user.is_active:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_error
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise credentials_error
    except JWTError as exc:
        raise credentials_error from exc

    user = db.scalars(select(User).where(User.username == username)).first()
    if user is None or not user.is_active:
        raise credentials_error
    return user
