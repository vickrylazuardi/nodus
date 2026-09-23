"""Application settings, loaded from the environment with sensible defaults."""

import secrets
import warnings
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PRISM_", env_file=".env", extra="ignore")

    app_name: str = "NODUS"
    environment: str = "development"

    database_url: str = "sqlite:///./prism.db"

    # Auth. The secret MUST be set in production. In development a random value
    # is generated per process, which invalidates tokens on restart but is far
    # safer than shipping a published constant that lets anyone forge a token.
    secret_key: str = ""
    access_token_expire_minutes: int = 60 * 24 * 7

    # CORS origins allowed to call the API (the Vite dev server by default).
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # Seed data is illustrative, not measured. Surfaced to the UI so the
    # disclaimer travels with the API response.
    data_is_illustrative: bool = True

    @model_validator(mode="after")
    def _ensure_secret(self) -> "Settings":
        """Refuse to run without a secret outside development.

        A published default secret lets anyone forge an admin token, so there is
        no safe fallback. Development generates a random per-process key, which
        invalidates tokens on restart but is not guessable.
        """
        if self.secret_key:
            return self
        if self.environment != "development":
            raise ValueError(
                "PRISM_SECRET_KEY must be set when PRISM_ENVIRONMENT is not 'development'. "
                "Generate one with: python -c 'import secrets; print(secrets.token_urlsafe(32))'"
            )
        self.secret_key = secrets.token_urlsafe(32)
        warnings.warn(
            "PRISM_SECRET_KEY is unset; generated a random key for this process. "
            "Tokens will not survive a restart. Set PRISM_SECRET_KEY before deploying.",
            RuntimeWarning,
            stacklevel=2,
        )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
