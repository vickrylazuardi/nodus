"""SQLAlchemy 2.0 ORM models.

Typed with Mapped[]/mapped_column so mypy and the IDE understand every field,
and so Alembic can autogenerate migrations from the model metadata.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.orm import relationship as orm_relationship

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class Figure(TimestampMixin, Base):
    """A political figure. `influence` drives node size in the relationship map."""

    __tablename__ = "figures"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    full_name: Mapped[str | None] = mapped_column(String(200))
    role: Mapped[str | None] = mapped_column(String(160))
    party: Mapped[str | None] = mapped_column(String(120), index=True)
    bloc: Mapped[str | None] = mapped_column(String(120), index=True)
    region: Mapped[str | None] = mapped_column(String(120))
    photo_url: Mapped[str | None] = mapped_column(String(500))
    bio: Mapped[str | None] = mapped_column(Text)
    # Comma separated rather than a join table: tags are display-only and
    # never queried individually, so a table would add joins for no benefit.
    tags: Mapped[str | None] = mapped_column(Text)
    influence: Mapped[int] = mapped_column(Integer, default=50)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    relationships: Mapped[list[Relationship]] = orm_relationship(
        back_populates="source",
        foreign_keys="Relationship.source_id",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    relationships_as_target: Mapped[list[Relationship]] = orm_relationship(
        back_populates="target",
        foreign_keys="Relationship.target_id",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Issue(TimestampMixin, Base):
    """A policy dimension that relationships are scored on."""

    __tablename__ = "issues"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    category: Mapped[str | None] = mapped_column(String(80), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    default_weight: Mapped[float] = mapped_column(Float, default=1.0)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    scores: Mapped[list[RelationshipIssue]] = orm_relationship(
        back_populates="issue", cascade="all, delete-orphan", passive_deletes=True
    )


class Relationship(TimestampMixin, Base):
    """An undirected tie between two figures.

    Stored once per pair; the API treats (A,B) and (B,A) as the same edge.
    """

    __tablename__ = "relationships"
    __table_args__ = (
        UniqueConstraint("source_id", "target_id", name="uq_relationship_pair"),
        CheckConstraint("source_id <> target_id", name="ck_relationship_distinct"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("figures.id", ondelete="CASCADE"), index=True)
    target_id: Mapped[int] = mapped_column(ForeignKey("figures.id", ondelete="CASCADE"), index=True)

    rel_type: Mapped[str] = mapped_column(String(40), default="political")
    status: Mapped[str] = mapped_column(String(40), default="active")

    # computed = derive from issues + modifiers; manual = use manual_score;
    # blended = mean of both.
    score_mode: Mapped[str] = mapped_column(String(20), default="computed")
    manual_score: Mapped[int] = mapped_column(Integer, default=0)

    since: Mapped[str | None] = mapped_column(String(40))
    notes: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(String(500))

    source: Mapped[Figure] = orm_relationship(back_populates="relationships", foreign_keys=[source_id])
    target: Mapped[Figure] = orm_relationship(
        back_populates="relationships_as_target", foreign_keys=[target_id]
    )
    issue_scores: Mapped[list[RelationshipIssue]] = orm_relationship(
        back_populates="relationship", cascade="all, delete-orphan", passive_deletes=True
    )
    modifiers: Mapped[list[Modifier]] = orm_relationship(
        back_populates="relationship", cascade="all, delete-orphan", passive_deletes=True
    )


class RelationshipIssue(TimestampMixin, Base):
    """One issue's score within one relationship, with its own weight."""

    __tablename__ = "relationship_issues"
    __table_args__ = (
        UniqueConstraint("relationship_id", "issue_id", name="uq_relationship_issue"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    relationship_id: Mapped[int] = mapped_column(
        ForeignKey("relationships.id", ondelete="CASCADE"), index=True
    )
    issue_id: Mapped[int] = mapped_column(ForeignKey("issues.id", ondelete="CASCADE"), index=True)

    score: Mapped[int] = mapped_column(Integer, default=0)
    weight: Mapped[float] = mapped_column(Float, default=1.0)
    stance: Mapped[str | None] = mapped_column(Text)
    evidence_url: Mapped[str | None] = mapped_column(String(500))

    relationship: Mapped[Relationship] = orm_relationship(back_populates="issue_scores")
    issue: Mapped[Issue] = orm_relationship(back_populates="scores")


class Modifier(TimestampMixin, Base):
    """A time-boxed event that shifts a relationship, mirroring Civ VI deals.

    `expires_at` makes it decay rather than vanish, so recent news bends the
    score and then fades.
    """

    __tablename__ = "modifiers"

    id: Mapped[int] = mapped_column(primary_key=True)
    relationship_id: Mapped[int] = mapped_column(
        ForeignKey("relationships.id", ondelete="CASCADE"), index=True
    )

    label: Mapped[str] = mapped_column(String(240))
    value: Mapped[int] = mapped_column(Integer, default=0)
    kind: Mapped[str] = mapped_column(String(40), default="event")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(Text)

    relationship: Mapped[Relationship] = orm_relationship(back_populates="modifiers")


class User(Base):
    """Admin user. Single-role for now, but modelled so roles can be added."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditLog(Base):
    """Append-only record of every mutation, for open-source accountability."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    actor: Mapped[str] = mapped_column(String(80), default="system")
    entity: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(String(40))
    detail: Mapped[str | None] = mapped_column(Text)