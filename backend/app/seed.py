"""Seed the database with the illustrative dataset.

Usage:
    uv run python -m app.seed            # seed only if empty
    uv run python -m app.seed --force    # wipe and reseed
    uv run python -m app.seed --admin-password secret

The scores are ILLUSTRATIVE estimates derived from publicly reported dynamics.
They are not factual measurements and are not assessments of any person.
"""

from __future__ import annotations

import argparse
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password, verify_password
from app.models import AuditLog, Figure, Issue, Modifier, Relationship, RelationshipIssue, User

NOW = datetime.now(timezone.utc)


def _iso(days: int) -> datetime:
    return NOW + timedelta(days=days)


def _load_seed_data():
    """Import the dataset lazily so a missing file fails with a clear message."""
    try:
        from app import seed_data
    except ImportError as exc:  # pragma: no cover
        raise SystemExit(
            "app/seed_data.py not found. It must define ISSUES, FIGURES and RELATIONSHIPS."
        ) from exc
    return seed_data


def wipe(db: Session) -> None:
    """Clear the dataset.

    Users are deliberately excluded: --force reseeds the illustrative data, and
    silently deleting admin accounts would lock an operator out of their own
    deployment. The admin password is rotated separately when it was derived
    from the old insecure default.
    """
    # Order matters only for readability: ON DELETE CASCADE handles the rest.
    for model in (Modifier, RelationshipIssue, Relationship, Figure, Issue, AuditLog):
        db.execute(delete(model))
    db.commit()


def seed(db: Session, *, force: bool = False, admin_password: str | None = None) -> dict:
    existing = db.scalar(select(Figure).limit(1))
    if existing is not None and not force:
        return {"skipped": True, "reason": "database already has figures; pass --force"}

    if force:
        wipe(db)

    data = _load_seed_data()

    issue_ids: dict[str, int] = {}
    for order, (name, category, description, weight) in enumerate(data.ISSUES):
        issue = Issue(
            name=name,
            category=category,
            description=description,
            default_weight=weight,
            sort_order=order,
        )
        db.add(issue)
        db.flush()
        issue_ids[name] = issue.id

    figure_ids: dict[str, int] = {}
    for name, full_name, role, party, bloc, region, influence, tags, bio in data.FIGURES:
        figure = Figure(
            name=name,
            full_name=full_name,
            role=role,
            party=party,
            bloc=bloc,
            region=region,
            influence=influence,
            tags=",".join(tags),
            bio=bio,
            is_active=True,
        )
        db.add(figure)
        db.flush()
        figure_ids[name] = figure.id

    skipped_pairs: list[str] = []
    issue_warnings: set[str] = set()
    relationships_created = 0
    modifiers_created = 0
    scores_created = 0

    for entry in data.RELATIONSHIPS:
        (name_a, name_b), rel_type, notes, issue_map = entry[0], entry[1], entry[2], entry[3]
        modifiers = entry[4] if len(entry) > 4 else []

        if name_a not in figure_ids or name_b not in figure_ids:
            skipped_pairs.append(f"{name_a} / {name_b}")
            continue

        rel = Relationship(
            source_id=figure_ids[name_a],
            target_id=figure_ids[name_b],
            rel_type=rel_type,
            status="active",
            score_mode="computed",
            notes=notes,
        )
        db.add(rel)
        db.flush()
        relationships_created += 1

        for issue_name, triple in issue_map.items():
            if issue_name not in issue_ids:
                issue_warnings.add(issue_name)
                continue
            score, weight, stance = triple
            db.add(
                RelationshipIssue(
                    relationship_id=rel.id,
                    issue_id=issue_ids[issue_name],
                    score=score,
                    weight=weight,
                    stance=stance,
                )
            )
            scores_created += 1

        for spec in modifiers:
            label, value, kind, days = (list(spec) + [None])[:4]
            db.add(
                Modifier(
                    relationship_id=rel.id,
                    label=label,
                    value=value,
                    kind=kind,
                    active=True,
                    expires_at=_iso(int(days) if days is not None else 365),
                    note=f"Peristiwa tercatat: {label}.",
                    created_at=_iso(-30),
                )
            )
            modifiers_created += 1

    # Admin user.
    admin = db.scalar(select(User).where(User.username == "admin"))
    if admin is None:
        # Never derive the password from settings.secret_key: that value has a
        # published default in an open-source repo, so a fresh install would
        # ship with a guessable admin password. Generate a random one instead.
        password = admin_password or secrets.token_urlsafe(12)
        db.add(User(username="admin", hashed_password=hash_password(password)))
    else:
        password = None
        # Databases created before the password fix still hold a hash of the
        # published default. --force is the operator's signal to reset, so
        # rotate it rather than leaving a known credential in place.
        if force:
            compromised = {
                "change-me-in-pro",       # secret_key[:16] of the old default
                "change-me-in-production",
            }
            still_compromised = any(
                verify_password(candidate, admin.hashed_password) for candidate in compromised
            )
            if still_compromised or admin_password:
                password = admin_password or secrets.token_urlsafe(12)
                admin.hashed_password = hash_password(password)

    db.add(
        AuditLog(
            ts=NOW,
            actor="seed",
            entity="dataset",
            entity_id=None,
            action="seed",
            detail=(
                f"{len(figure_ids)} figures, {relationships_created} relationships, "
                f"{len(issue_ids)} issues"
            ),
        )
    )
    db.commit()

    return {
        "skipped": False,
        "figures": len(figure_ids),
        "relationships": relationships_created,
        "issues": len(issue_ids),
        "issue_scores": scores_created,
        "modifiers": modifiers_created,
        "admin_password": password,
        "skipped_pairs": skipped_pairs,
        "unknown_issues": sorted(issue_warnings),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the PRISM database.")
    parser.add_argument("--force", action="store_true", help="wipe and reseed")
    parser.add_argument("--admin-password", default=None, help="password for the admin user")
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        result = seed(db, force=args.force, admin_password=args.admin_password)

    if result.get("skipped"):
        print(f"Nothing to do: {result['reason']}")
        return

    print(
        f"Seeded {result['figures']} figures, {result['relationships']} relationships, "
        f"{result['issues']} issues, {result['issue_scores']} issue scores, "
        f"{result['modifiers']} modifiers."
    )
    if result["skipped_pairs"]:
        print(f"  ! skipped {len(result['skipped_pairs'])} pairs with unknown figures")
    if result["unknown_issues"]:
        print(f"  ! unknown issues: {', '.join(result['unknown_issues'])}")
    if result.get("admin_password"):
        print(f"\nAdmin user: admin / {result['admin_password']}")
        print("Change it immediately via POST /api/admin/auth/change-password")


if __name__ == "__main__":
    main()
