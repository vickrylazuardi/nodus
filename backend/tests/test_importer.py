"""Tests for the bulk importer.

The importer exists so an outside contributor can send data without knowing any
database id. The tests focus on the two properties that make it safe to hand to
a stranger: nothing is written unless everything validates, and an undirected
pair cannot be stored twice.
"""

from __future__ import annotations

import json

import pytest
from sqlalchemy import select

from app.models import Figure, Issue, Modifier, Relationship, RelationshipIssue
from app.services import importer


def bundle(**overrides) -> str:
    """A minimal valid bundle, with pieces replaced per test."""
    payload = {
        "format": "prism-bundle",
        "version": 1,
        "figures": [
            {"name": "Alpha", "party": "Partai A", "influence": 90},
            {"name": "Beta", "party": "Partai A", "influence": 70},
        ],
        "issues": [{"name": "Koalisi", "default_weight": 1.5}],
        "relationships": [
            {
                "source": "Alpha",
                "target": "Beta",
                "rel_type": "coalition",
                "issues": [{"issue": "Koalisi", "score": 80, "weight": 1.5}],
            }
        ],
    }
    payload.update(overrides)
    return json.dumps(payload)


def run(db, raw: str, apply: bool = True) -> importer.ImportResult:
    figures, issues, relationships, problems = importer.parse_bundle(raw)
    return importer.run_import(
        db, figures=figures, issues=issues, relationships=relationships, parse_problems=problems,
        apply=apply,
    )


# --------------------------------------------------------------------------- the traps


def test_reversed_pair_in_one_file_is_rejected(db_session):
    """The database cannot catch this, so the importer must.

    The unique constraint is on the ordered (source_id, target_id), so both
    (Alpha,Beta) and (Beta,Alpha) insert cleanly. Stored twice, the pair is
    counted twice in the matrix and drawn as two edges on the map.
    """
    raw = json.dumps(
        {
            "format": "prism-bundle",
            "version": 1,
            "figures": [{"name": "Alpha"}, {"name": "Beta"}],
            "relationships": [
                {"source": "Alpha", "target": "Beta"},
                {"source": "Beta", "target": "Alpha"},
            ],
        }
    )
    result = run(db_session, raw)

    assert result.ok is False
    messages = " ".join(p.message for p in result.problems)
    assert "urutannya dibalik" in messages

    # Both rows must be identifiable. The offending row is named by
    # problem.location and the row it collides with is named in the message, so
    # a contributor can find both without guessing.
    reversed_problem = next(p for p in result.problems if "urutannya dibalik" in p.message)
    assert reversed_problem.location == "bundle.relationships[1]"
    assert "bundle.relationships[0]" in reversed_problem.message


def test_reversed_pair_against_the_database_updates_instead_of_duplicating(db_session):
    """Uploading (B,A) when (A,B) exists must update the stored row."""
    db_session.add_all([Figure(name="Alpha"), Figure(name="Beta")])
    db_session.commit()
    alpha = db_session.scalar(select(Figure).where(Figure.name == "Alpha"))
    beta = db_session.scalar(select(Figure).where(Figure.name == "Beta"))
    db_session.add(
        Relationship(source_id=alpha.id, target_id=beta.id, rel_type="political")
    )
    db_session.commit()

    raw = json.dumps(
        {
            "format": "prism-bundle",
            "version": 1,
            "relationships": [
                {"source": "Beta", "target": "Alpha", "rel_type": "coalition"}
            ],
        }
    )
    result = run(db_session, raw)

    assert result.ok is True, [p.render() for p in result.problems]
    assert result.counts["relationships"].updated == 1
    assert result.counts["relationships"].created == 0

    rows = db_session.scalars(select(Relationship)).all()
    assert len(rows) == 1, "the pair must not be stored twice"
    assert rows[0].rel_type == "coalition"


def test_same_direction_duplicate_is_rejected(db_session):
    raw = json.dumps(
        {
            "format": "prism-bundle",
            "version": 1,
            "figures": [{"name": "Alpha"}, {"name": "Beta"}],
            "relationships": [
                {"source": "Alpha", "target": "Beta"},
                {"source": "Alpha", "target": "Beta"},
            ],
        }
    )
    result = run(db_session, raw)

    assert result.ok is False
    assert any("sudah ada di" in p.message for p in result.problems)


def test_self_relationship_is_rejected(db_session):
    raw = json.dumps(
        {
            "format": "prism-bundle",
            "version": 1,
            "figures": [{"name": "Alpha"}],
            "relationships": [{"source": "Alpha", "target": "Alpha"}],
        }
    )
    result = run(db_session, raw)

    assert result.ok is False
    assert any("dirinya sendiri" in p.message for p in result.problems)


# --------------------------------------------------------------------------- atomicity


def test_one_bad_row_prevents_the_whole_import(db_session):
    """A contributor's file usually has one typo. Nothing should be written."""
    raw = json.dumps(
        {
            "format": "prism-bundle",
            "version": 1,
            "figures": [{"name": "Alpha"}, {"name": "Beta"}],
            "issues": [{"name": "Koalisi"}],
            "relationships": [
                {
                    "source": "Alpha",
                    "target": "Beta",
                    "issues": [{"issue": "Koalisi", "score": 80}],
                },
                {
                    "source": "Alpha",
                    "target": "Gamma",  # does not exist
                },
            ],
        }
    )
    result = run(db_session, raw)

    assert result.ok is False
    assert db_session.query(Figure).count() == 0
    assert db_session.query(Relationship).count() == 0
    assert db_session.query(Issue).count() == 0


def test_dry_run_writes_nothing(db_session):
    result = run(db_session, bundle(), apply=False)

    assert result.ok is True
    assert result.applied is False
    assert db_session.query(Figure).count() == 0


def test_dry_run_reports_the_same_counts_as_apply(db_session):
    """The preview must be trustworthy, or it is worse than nothing."""
    preview = run(db_session, bundle(), apply=False)
    assert preview.counts["figures"].created == 2
    assert preview.counts["relationships"].created == 1


# --------------------------------------------------------------------------- validation


def test_missing_issue_is_reported_with_its_location(db_session):
    raw = json.dumps(
        {
            "format": "prism-bundle",
            "version": 1,
            "figures": [{"name": "Alpha"}, {"name": "Beta"}],
            "relationships": [
                {
                    "source": "Alpha",
                    "target": "Beta",
                    "issues": [{"issue": "Tidak Ada", "score": 10}],
                }
            ],
        }
    )
    result = run(db_session, raw)

    assert result.ok is False
    problem = next(p for p in result.problems if "Tidak Ada" in p.message)
    assert "bundle.relationships[0] issues[0]" in problem.location


def test_out_of_range_score_is_rejected(db_session):
    raw = json.dumps(
        {
            "format": "prism-bundle",
            "version": 1,
            "figures": [{"name": "Alpha"}, {"name": "Beta"}],
            "issues": [{"name": "Koalisi"}],
            "relationships": [
                {
                    "source": "Alpha",
                    "target": "Beta",
                    "issues": [{"issue": "Koalisi", "score": 150}],
                }
            ],
        }
    )
    result = run(db_session, raw)

    assert result.ok is False
    assert any("-100 sampai 100" in p.message for p in result.problems)


def test_unknown_rel_type_is_rejected(db_session):
    raw = json.dumps(
        {
            "format": "prism-bundle",
            "version": 1,
            "figures": [{"name": "Alpha"}, {"name": "Beta"}],
            "relationships": [
                {"source": "Alpha", "target": "Beta", "rel_type": "persahabatan"}
            ],
        }
    )
    result = run(db_session, raw)

    assert result.ok is False
    assert any("rel_type" in p.message for p in result.problems)


def test_bad_datetime_names_the_expected_format(db_session):
    raw = json.dumps(
        {
            "format": "prism-bundle",
            "version": 1,
            "figures": [{"name": "Alpha"}, {"name": "Beta"}],
            "relationships": [
                {
                    "source": "Alpha",
                    "target": "Beta",
                    "modifiers": [{"label": "X", "value": 5, "expires_at": "1 Januari 2027"}],
                }
            ],
        }
    )
    result = run(db_session, raw)

    assert result.ok is False
    problem = next(p for p in result.problems if "expires_at" in p.message)
    assert "2027-01-01T00:00:00Z" in problem.message


def test_wrong_bundle_version_stops_early(db_session):
    result = run(db_session, bundle(version=99))

    assert result.ok is False
    assert any("Versi 99" in p.message for p in result.problems)
    assert db_session.query(Figure).count() == 0


def test_wrong_format_key_stops_early(db_session):
    result = run(db_session, bundle(format="something-else"))

    assert result.ok is False
    assert any("prism-bundle" in p.message for p in result.problems)


def test_duplicate_figure_in_one_file_is_rejected(db_session):
    raw = json.dumps(
        {
            "format": "prism-bundle",
            "version": 1,
            "figures": [{"name": "Alpha"}, {"name": "alpha"}],
        }
    )
    result = run(db_session, raw)

    assert result.ok is False, "names differing only in case are the same figure"
    assert any("lebih dari sekali" in p.message for p in result.problems)


# --------------------------------------------------------------------------- name matching


def test_names_match_case_insensitively_and_ignore_extra_spaces(db_session):
    """Contributors copy names from different sources, so be forgiving."""
    db_session.add(Figure(name="Prabowo Subianto"))
    db_session.commit()

    raw = json.dumps(
        {
            "format": "prism-bundle",
            "version": 1,
            "figures": [{"name": "  prabowo   subianto  ", "party": "Gerindra"}],
        }
    )
    result = run(db_session, raw)

    assert result.ok is True, [p.render() for p in result.problems]
    assert result.counts["figures"].updated == 1
    assert result.counts["figures"].created == 0
    assert db_session.query(Figure).count() == 1

    stored = db_session.scalar(select(Figure))
    assert stored.party == "Gerindra"


def test_a_partial_row_does_not_erase_existing_fields(db_session):
    """A file that omits a column must leave that column alone."""
    db_session.add(Figure(name="Alpha", party="Partai Lama", role="Menteri"))
    db_session.commit()

    raw = json.dumps(
        {
            "format": "prism-bundle",
            "version": 1,
            "figures": [{"name": "Alpha", "influence": 80}],
        }
    )
    run(db_session, raw)

    stored = db_session.scalar(select(Figure))
    assert stored.party == "Partai Lama", "an absent column must not clear the value"
    assert stored.role == "Menteri"
    assert stored.influence == 80


# --------------------------------------------------------------------------- issues and modifiers


def test_existing_issue_score_is_updated_not_duplicated(db_session):
    db_session.add_all([Figure(name="Alpha"), Figure(name="Beta")])
    db_session.add(Issue(name="Koalisi"))
    db_session.commit()
    alpha = db_session.scalar(select(Figure).where(Figure.name == "Alpha"))
    beta = db_session.scalar(select(Figure).where(Figure.name == "Beta"))
    issue = db_session.scalar(select(Issue))
    rel = Relationship(source_id=alpha.id, target_id=beta.id)
    db_session.add(rel)
    db_session.commit()
    db_session.add(RelationshipIssue(relationship_id=rel.id, issue_id=issue.id, score=10))
    db_session.commit()

    raw = json.dumps(
        {
            "format": "prism-bundle",
            "version": 1,
            "relationships": [
                {"source": "Alpha", "target": "Beta", "issues": [{"issue": "Koalisi", "score": 75}]}
            ],
        }
    )
    result = run(db_session, raw)

    assert result.ok is True, [p.render() for p in result.problems]
    scores = db_session.scalars(select(RelationshipIssue)).all()
    assert len(scores) == 1
    assert scores[0].score == 75


def test_issues_not_mentioned_in_the_file_are_kept(db_session):
    db_session.add_all([Figure(name="Alpha"), Figure(name="Beta")])
    db_session.add_all([Issue(name="Koalisi"), Issue(name="Hukum")])
    db_session.commit()
    alpha = db_session.scalar(select(Figure).where(Figure.name == "Alpha"))
    beta = db_session.scalar(select(Figure).where(Figure.name == "Beta"))
    koalisi = db_session.scalar(select(Issue).where(Issue.name == "Koalisi"))
    hukum = db_session.scalar(select(Issue).where(Issue.name == "Hukum"))
    rel = Relationship(source_id=alpha.id, target_id=beta.id)
    db_session.add(rel)
    db_session.commit()
    db_session.add_all(
        [
            RelationshipIssue(relationship_id=rel.id, issue_id=koalisi.id, score=10),
            RelationshipIssue(relationship_id=rel.id, issue_id=hukum.id, score=20),
        ]
    )
    db_session.commit()

    raw = json.dumps(
        {
            "format": "prism-bundle",
            "version": 1,
            "relationships": [
                {"source": "Alpha", "target": "Beta", "issues": [{"issue": "Koalisi", "score": 50}]}
            ],
        }
    )
    run(db_session, raw)

    scores = {s.issue_id: s.score for s in db_session.scalars(select(RelationshipIssue)).all()}
    assert len(scores) == 2, "the untouched issue must survive"
    assert scores[koalisi.id] == 50
    assert scores[hukum.id] == 20


def test_modifier_is_created_with_its_expiry(db_session):
    raw = json.dumps(
        {
            "format": "prism-bundle",
            "version": 1,
            "figures": [{"name": "Alpha"}, {"name": "Beta"}],
            "relationships": [
                {
                    "source": "Alpha",
                    "target": "Beta",
                    "modifiers": [
                        {
                            "label": "Dukungan terbuka",
                            "value": 12,
                            "kind": "support",
                            "expires_at": "2027-01-01T00:00:00Z",
                        }
                    ],
                }
            ],
        }
    )
    result = run(db_session, raw)

    assert result.ok is True, [p.render() for p in result.problems]
    modifier = db_session.scalar(select(Modifier))
    assert modifier is not None
    assert modifier.value == 12
    assert modifier.expires_at is not None


# --------------------------------------------------------------------------- csv


def test_csv_round_trip(db_session):
    files = {
        "figures.csv": "name,party,influence\nAlpha,Partai A,90\nBeta,Partai A,70\n",
        "issues.csv": "name,default_weight\nKoalisi,1.5\n",
        "relationships.csv": "source,target,rel_type\nAlpha,Beta,coalition\n",
        "relationship_issues.csv": "source,target,issue,score,weight\nAlpha,Beta,Koalisi,80,1.5\n",
    }
    figures, issues, relationships, problems = importer.parse_csv_files(files)
    result = importer.run_import(
        db_session,
        figures=figures,
        issues=issues,
        relationships=relationships,
        parse_problems=problems,
        apply=True,
    )

    assert result.ok is True, [p.render() for p in result.problems]
    assert db_session.query(Figure).count() == 2
    assert db_session.query(Relationship).count() == 1
    score = db_session.scalar(select(RelationshipIssue))
    assert score is not None and score.score == 80


def test_csv_with_a_bom_is_read_correctly(db_session):
    """Excel writes a BOM; without handling it the first column name breaks."""
    files = {"figures.csv": "\ufeffname,party\nAlpha,Partai A\n"}
    figures, _issues, _rels, problems = importer.parse_csv_files(files)
    result = importer.run_import(
        db_session, figures=figures, issues=[], relationships=[], parse_problems=problems, apply=True
    )

    assert result.ok is True, [p.render() for p in result.problems]
    assert db_session.query(Figure).count() == 1


def test_csv_reversed_pair_is_rejected(db_session):
    """The same trap, through the CSV path."""
    files = {
        "figures.csv": "name\nAlpha\nBeta\n",
        "relationships.csv": "source,target\nAlpha,Beta\nBeta,Alpha\n",
    }
    figures, issues, relationships, problems = importer.parse_csv_files(files)
    result = importer.run_import(
        db_session,
        figures=figures,
        issues=issues,
        relationships=relationships,
        parse_problems=problems,
        apply=True,
    )

    assert result.ok is False
    assert any("urutannya dibalik" in p.message for p in result.problems)
    assert db_session.query(Relationship).count() == 0


def test_csv_blank_lines_are_skipped(db_session):
    files = {"figures.csv": "name\nAlpha\n\nBeta\n"}
    figures, _i, _r, problems = importer.parse_csv_files(files)
    result = importer.run_import(
        db_session, figures=figures, issues=[], relationships=[], parse_problems=problems, apply=True
    )

    assert result.ok is True, [p.render() for p in result.problems]
    assert db_session.query(Figure).count() == 2


def test_unknown_csv_filename_is_a_warning_not_a_failure(db_session):
    files = {
        "figures.csv": "name\nAlpha\n",
        "catatan.csv": "apa saja\n",
    }
    figures, issues, relationships, problems = importer.parse_csv_files(files)
    result = importer.run_import(
        db_session,
        figures=figures,
        issues=issues,
        relationships=relationships,
        parse_problems=problems,
        apply=True,
    )

    assert result.ok is True, "an extra file must not block the import"
    assert any(p.severity == "warning" for p in result.problems)


def test_tags_are_split_on_semicolons(db_session):
    files = {"figures.csv": "name,tags\nAlpha,ekonomi;pertahanan\n"}
    figures, _i, _r, problems = importer.parse_csv_files(files)
    importer.run_import(
        db_session, figures=figures, issues=[], relationships=[], parse_problems=problems, apply=True
    )

    stored = db_session.scalar(select(Figure))
    assert stored.tags == "ekonomi,pertahanan"


def test_empty_csv_set_is_reported_clearly(db_session):
    _f, _i, _r, problems = importer.parse_csv_files({"figures.csv": "name\n"})
    assert any("minimal figures.csv" in p.message for p in problems)


# --------------------------------------------------------------------------- normalisation


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Prabowo Subianto", "prabowo subianto"),
        ("  Prabowo   Subianto  ", "prabowo subianto"),
        ("PRABOWO SUBIANTO", "prabowo subianto"),
    ],
)
def test_normalize_name(raw, expected):
    assert importer.normalize_name(raw) == expected
