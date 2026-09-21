"""FastAPI application factory.

Run with:  uv run uvicorn app.main:app --reload
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import admin, public
from app.core.config import settings
from app.core.database import Base, engine

# Importing the models package registers every table on Base.metadata, which is
# what Alembic autogenerate and create_all both read.
from app import models  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    # In development, create tables on boot so a fresh clone runs immediately.
    # In production, Alembic owns the schema: run `alembic upgrade head` first.
    if settings.environment == "development":
        Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="PRISM API",
    description=(
        "Relationship scoring for Indonesian political figures.\n\n"
        "Scores are **illustrative estimates** derived from publicly reported "
        "dynamics, not factual measurements."
    ),
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(public.router, prefix="/api")
app.include_router(admin.router, prefix="/api/admin")


@app.get("/api", include_in_schema=False)
def api_root() -> dict:
    return {
        "name": settings.app_name,
        "docs": "/api/docs",
        "public": "/api/health",
    }
