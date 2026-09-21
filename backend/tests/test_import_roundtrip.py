"""Round-trip test: export the dataset, import it back, assert nothing changed.

This is the strongest available check that the import format is real rather
than aspirational. If export and import disagree about any field, a contributor
who downloads the file, edits one row, and sends it back would silently change
something they did not touch.
"""

from __future__ import annotations

import json

import pytest
from sqlalchemy import select

from app.models import Figure, Issue, Modifier, Relationship, RelationshipIssue
from app.services import importer


def snapshot(db) -> dict:
    """Every field that the bundle claims to carry, in a comparable form."""
    return {
        "figures": sorted(
            (
                f.name,
                f.full_name,
                f.role,
                f.party,
                f.bloc,
                f.region,
                f.influence,
                f.bio,
                f.tags,
            )
            for f in db.scalars(select(Figure)).all()
        ),
        "issues": sorted(
            (i.name, i.category, i.description, i.default_weight, i.sort_order)
            for i in db.scalars(select(Issue)).all()
        ),
        "relationships": sorted(
            (
                r.source_id,
                r.target_id,
                r.rel_type,
                r.status,
                r.score_mode,
                r.manual_score,
                r.since,
                r.notes,
                r.source_url,
            )
            for r in db.scalars(select(Relationship)).all()
        ),
        "relationship_issues": sorted(
            (ri.relationship_id, ri.issue_id, ri.score, ri.weight, ri.stance, ri.evidence_url)
            for ri in db.scalars(select(RelationshipIssue)).all()
        ),
        "modifiers": sorted(
            (m.relationship_id, m.label, m.value, m.kind, m.active, m.note)
            for m in db.scalars(select(Modifier)).all()
        ),
    }


@pytest.fixture
def populated(db_session):
    """A small dataset that touches every field the bundle carries."""
    figures = [
        Figure(
            name="Alpha",
            full_name="Alpha Lengkap",
            role="Menteri",
            party="Partai A",
            bloc="Blok Satu",
            region="Nasional",
            influence=88,
            bio="Bio alpha.",
            tags="ekonomi,pertahanan",
        ),
        Figure(name="Beta", party="Partai A", bloc="Blok Satu", influence=70),
        Figure(name="Gamma", party="Partai B", bloc="Blok Dua", influence=60),
    ]
    issues = [
        Issue(name="Koalisi", category="Struktur", description="Desc.", default_weight=1.5),
        Issue(name="Hukum", category="Integritas", default_weight=1.0, sort_order=2),
    ]
    db_session.add_all(figures + issues)
    db_session.commit()

    rel = Relationship(
        source_id=figures[0].id,
        target_id=figures[1].id,
        rel_type="coalition",
        status="active",
        since="2024",
        notes="Catatan.",
        source_url="https://contoh.go.id",
    )
    rel2 = Relationship(source_id=figures[0].id, target_id=figures[2].id, rel_type="political")
    db_session.add_all([rel, rel2])
    db_session.commit()

    db_session.add_all(
        [
            RelationshipIssue(
                relationship_id=rel.id,
                issue_id=issues[0].id,
                score=80,
                weight=1.5,
                stance="Satu komando.",
                evidence_url="https://contoh.go.id/bukti",
            ),
            RelationshipIssue(relationship_id=rel.id, issue_id=issues[1].id, score=60, weight=1.0),
            RelationshipIssue(relationship_id=rel2.id, issue_id=issues[0].id, score=-70, weight=1.5),
            Modifier(
                relationship_id=rel2.id,
                label="Peristiwa uji",
                value=-20,
                kind="event",
                active=True,
                expires_at=None,
                note="Catatan peristiwa.",
            ),
        ]
    )
    db_session.commit()
    return figures


def test_export_then_import_changes_nothing(db_session, populated):
    before = snapshot(db_session)

    payload = importer.build_bundle(db_session)
    figures, issues, relationships, problems = importer.parse_bundle(json.dumps(payload))
    assert problems == [], [p.render() for p in problems]

    result = importer.run_import(
        db_session,
        figures=figures,
        issues=issues,
        relationships=relationships,
        parse_problems=problems,
        apply=True,
    )
    assert result.ok is True, [p.render() for p in result.problems]

    after = snapshot(db_session)
    assert after == before, "the round trip must be lossless"


def test_round_trip_updates_rather_than_duplicates(db_session, populated):
    """Re-importing must match existing rows, not create a second copy."""
    payload = importer.build_bundle(db_session)
    figures, issues, relationships, problems = importer.parse_bundle(json.dumps(payload))

    result = importer.run_import(
        db_session,
        figures=figures,
        issues=issues,
        relationships=relationships,
        parse_problems=problems,
        apply=True,
    )

    assert result.counts["figures"].created == 0
    assert result.counts["figures"].updated == 3
    assert result.counts["relationships"].created == 0
    assert result.counts["relationships"].updated == 2
    assert db_session.query(Figure).count() == 3
    assert db_session.query(Relationship).count() == 2


def test_exported_bundle_uses_names_not_ids(db_session, populated):
    """Ids are meaningless in another installation, so they must not appear."""
    payload = importer.build_bundle(db_session)

    assert {f["name"] for f in payload["figures"]} == {"Alpha", "Beta", "Gamma"}
    for rel in payload["relationships"]:
        assert rel["source"] in {"Alpha", "Beta", "Gamma"}
        assert rel["target"] in {"Alpha", "Beta", "Gamma"}
        assert not str(rel["source"]).isdigit()
    for rel in payload["relationships"]:
        for row in rel["issues"]:
            assert row["issue"] in {"Koalisi", "Hukum"}


def test_exported_bundle_carries_the_format_header(db_session, populated):
    payload = importer.build_bundle(db_session)

    assert payload["format"] == importer.BUNDLE_FORMAT
    assert payload["version"] == importer.BUNDLE_VERSION


def test_exported_bundle_preserves_tags_as_a_list(db_session, populated):
    payload = importer.build_bundle(db_session)
    alpha = next(f for f in payload["figures"] if f["name"] == "Alpha")

    assert alpha["tags"] == ["ekonomi", "pertahanan"]


def test_every_rel_type_used_by_the_dataset_is_accepted(db_session):
    """The dataset used a kind the validator rejected.

    `alliance` appears on 25 of the 150 seeded relationships, but REL_TYPES did
    not contain it, while listing `business` and `government` which never occur.
    A contributor who exported the data and sent it straight back got a
    validation error on a file this project produced itself.

    Asserting on the real values rather than a fixture, because the fixture is
    what hid the problem.
    """
    import sqlite3

    used = set()
    try:
        conn = sqlite3.connect("prism.db")
        used = {row[0] for row in conn.execute("select distinct rel_type from relationships")}
        conn.close()
    except sqlite3.Error:
        pytest.skip("seeded database not available")

    if not used:
        pytest.skip("seeded database has no relationships")

    unknown = used - set(importer.REL_TYPES)
    assert unknown == set(), (
        f"the dataset uses rel_type values the importer rejects: {sorted(unknown)}. "
        "A contributor could not re-import the project's own export."
    )


def test_importer_and_scoring_share_one_list():
    """Three copies of this list existed and had already drifted."""
    from app.services import scoring

    assert importer.REL_TYPES is scoring.REL_TYPES
    assert importer.MODIFIER_KINDS is scoring.MODIFIER_KINDS
