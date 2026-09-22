"""Bulk import from a JSON bundle or a set of CSV files.

Written for outside contributors: someone with better data should be able to
send it without knowing a single database id. Every reference is by name.

Two properties matter more than speed here.

**Nothing is written until everything validates.** A contributor's file usually
has one typo in it. Reporting that typo and changing nothing is a far better
outcome than importing 90 percent of a dataset.

**Undirected pairs are normalised.** Relationships are stored once per pair, but
the unique constraint is on the ordered (source_id, target_id), so the database
will happily accept both (A,B) and (B,A). That would double-count the pair in the
matrix and draw two edges on the map. This module detects reversed duplicates and
refuses them rather than guessing which row the contributor meant.
"""

from __future__ import annotations

import csv
import io
import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Figure, Issue, Modifier, Relationship, RelationshipIssue
from app.services import scoring

# --------------------------------------------------------------------------- constants

BUNDLE_FORMAT = "prism-bundle"
BUNDLE_VERSION = 1

# Imported from the scoring module rather than repeated here. There were three
# copies of this list before (scoring, this file, and a hardcoded array in the
# admin dropdown) and they had already drifted: `alliance` was missing from all
# three while being used by 25 rows of the real dataset.
REL_TYPES = scoring.REL_TYPES
MODIFIER_KINDS = scoring.MODIFIER_KINDS
SCORE_MODES = ("computed", "manual", "blended")

MAX_NAME = 120
MAX_ISSUE_NAME = 160
MAX_LABEL = 240

Severity = Literal["error", "warning"]


@dataclass
class Problem:
    """One thing wrong with the upload, located as precisely as possible."""

    severity: Severity
    location: str  # "figures.csv baris 4" or "bundle.relationships[2]"
    message: str

    def render(self) -> str:
        return f"{self.location}: {self.message}"


@dataclass
class Counts:
    created: int = 0
    updated: int = 0

    def as_dict(self) -> dict[str, int]:
        return {"created": self.created, "updated": self.updated}


@dataclass
class ImportResult:
    ok: bool
    problems: list[Problem] = field(default_factory=list)
    counts: dict[str, Counts] = field(default_factory=dict)
    applied: bool = False

    def as_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "applied": self.applied,
            "problems": [
                {"severity": p.severity, "location": p.location, "message": p.message}
                for p in self.problems
            ],
            "counts": {k: v.as_dict() for k, v in self.counts.items()},
        }


# --------------------------------------------------------------------------- helpers


def normalize_name(value: str) -> str:
    """Fold a name for matching: case and runs of whitespace do not matter.

    Contributors copy names out of different sources, so "prabowo  subianto" and
    "Prabowo Subianto" should be the same figure. The stored spelling is never
    changed by this; it is only used to match.
    """
    return re.sub(r"\s+", " ", (value or "").strip()).casefold()


def _clean(value: Any) -> str | None:
    """Trim a string, and treat an empty cell as absent rather than as ""."""
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _to_int(value: Any, default: int | None = None) -> int | None:
    text = _clean(value)
    if text is None:
        return default
    try:
        return int(float(text))
    except (TypeError, ValueError):
        return None


def _to_float(value: Any, default: float | None = None) -> float | None:
    text = _clean(value)
    if text is None:
        return default
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def _to_bool(value: Any, default: bool = True) -> bool:
    text = _clean(value)
    if text is None:
        return default
    return text.casefold() in {"1", "true", "ya", "yes", "y", "t"}


def _parse_datetime(value: Any) -> datetime | None:
    """ISO 8601 only, with a clear message when it is not."""
    text = _clean(value)
    if text is None:
        return None
    # Accept a trailing Z, which datetime.fromisoformat rejects before 3.11.
    candidate = text.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(candidate)
    except ValueError:
        return None


# --------------------------------------------------------------------------- parsing


@dataclass
class Row:
    """One record plus where it came from, so errors can point at a line."""

    data: dict[str, Any]
    location: str


def parse_bundle(raw: str) -> tuple[list[Row], list[Row], list[Row], list[Problem]]:
    """Parse a JSON bundle into figures, issues and relationships.

    Returns empty lists plus a problem if the JSON itself is unusable.
    """
    problems: list[Problem] = []
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        return [], [], [], [
            Problem("error", "bundle", f"JSON tidak bisa dibaca: {exc.msg} (baris {exc.lineno})")
        ]

    if not isinstance(payload, dict):
        return [], [], [], [
            Problem("error", "bundle", "Isi file harus objek JSON dengan kunci figures/issues.")
        ]

    fmt = payload.get("format")
    if fmt != BUNDLE_FORMAT:
        problems.append(
            Problem(
                "error",
                "bundle",
                f"Kunci 'format' harus berisi \"{BUNDLE_FORMAT}\", bukan {fmt!r}.",
            )
        )
    version = payload.get("version")
    if version != BUNDLE_VERSION:
        problems.append(
            Problem(
                "error",
                "bundle",
                f"Versi {version!r} tidak dikenal. Versi yang didukung: {BUNDLE_VERSION}.",
            )
        )
    if problems:
        return [], [], [], problems

    def rows(key: str) -> list[Row]:
        items = payload.get(key) or []
        if not isinstance(items, list):
            problems.append(Problem("error", f"bundle.{key}", "Harus berupa array."))
            return []
        out = []
        for index, item in enumerate(items):
            if not isinstance(item, dict):
                problems.append(
                    Problem("error", f"bundle.{key}[{index}]", "Setiap entri harus berupa objek.")
                )
                continue
            out.append(Row(item, f"bundle.{key}[{index}]"))
        return out

    figures = rows("figures")
    issues = rows("issues")
    relationships = rows("relationships")

    if not figures and not relationships:
        problems.append(
            Problem("error", "bundle", "Tidak ada figures dan tidak ada relationships untuk diimpor.")
        )

    return figures, issues, relationships, problems


def parse_csv_files(files: dict[str, str]) -> tuple[list[Row], list[Row], list[Row], list[Problem]]:
    """Parse the CSV set. Keys are filenames, values are file contents.

    Only the four known names are read; anything else is reported as a warning
    so a contributor is not left wondering why their file did nothing.
    """
    problems: list[Problem] = []
    figures: list[Row] = []
    issues: list[Row] = []
    relationships: list[Row] = []

    known = {
        "figures.csv",
        "issues.csv",
        "relationships.csv",
        "relationship_issues.csv",
        "modifiers.csv",
    }
    for name in files:
        if name.casefold() not in known:
            problems.append(
                Problem(
                    "warning",
                    name,
                    "Nama file tidak dikenal dan diabaikan. Yang dikenal: "
                    + ", ".join(sorted(known))
                    + ".",
                )
            )

    by_name = {name.casefold(): content for name, content in files.items()}

    def read(filename: str) -> list[Row]:
        content = by_name.get(filename)
        if content is None:
            return []
        # utf-8-sig so a BOM from Excel does not corrupt the first column name.
        reader = csv.DictReader(io.StringIO(content.lstrip("\ufeff")))
        if reader.fieldnames is None:
            problems.append(Problem("error", filename, "File kosong, tidak ada baris judul."))
            return []
        out = []
        for number, record in enumerate(reader, start=2):
            if all((v or "").strip() == "" for v in record.values()):
                continue  # A blank line is not an error.
            out.append(Row(dict(record), f"{filename} baris {number}"))
        return out

    figures = read("figures.csv")
    issues = read("issues.csv")
    relationships = read("relationships.csv")

    # relationship_issues.csv and modifiers.csv are second passes over a pair,
    # keyed by it, so they fold into the relationship rows rather than being
    # returned separately. Without the modifiers pass the CSV format could not
    # carry events at all, and a contributor's events were dropped with only a
    # "filename not recognised" warning.
    for row in read("relationship_issues.csv"):
        relationships.append(
            Row(
                {
                    "source": row.data.get("source"),
                    "target": row.data.get("target"),
                    "_auxiliary": True,
                    "issues": [
                        {
                            "issue": row.data.get("issue"),
                            "score": row.data.get("score"),
                            "weight": row.data.get("weight"),
                            "stance": row.data.get("stance"),
                            "evidence_url": row.data.get("evidence_url"),
                        }
                    ],
                },
                row.location,
            )
        )

    for row in read("modifiers.csv"):
        relationships.append(
            Row(
                {
                    "source": row.data.get("source"),
                    "target": row.data.get("target"),
                    "_auxiliary": True,
                    "modifiers": [
                        {
                            "label": row.data.get("label"),
                            "value": row.data.get("value"),
                            "kind": row.data.get("kind"),
                            "active": row.data.get("active"),
                            "expires_at": row.data.get("expires_at"),
                            "note": row.data.get("note"),
                        }
                    ],
                },
                row.location,
            )
        )

    if not figures and not relationships and not issues:
        problems.append(
            Problem(
                "error",
                "unggahan",
                "Tidak ada data yang bisa dibaca. Kirim minimal figures.csv.",
            )
        )

    return figures, issues, relationships, problems


# --------------------------------------------------------------------------- validation


@dataclass
class FigureSpec:
    name: str
    location: str
    fields: dict[str, Any]


@dataclass
class IssueSpec:
    name: str
    location: str
    fields: dict[str, Any]


@dataclass
class RelationshipSpec:
    source: str
    target: str
    location: str
    fields: dict[str, Any]
    issue_rows: list[dict[str, Any]] = field(default_factory=list)
    modifier_rows: list[dict[str, Any]] = field(default_factory=list)


def collect_figures(rows: list[Row], problems: list[Problem]) -> list[FigureSpec]:
    specs: list[FigureSpec] = []
    seen: dict[str, str] = {}

    for row in rows:
        name = _clean(row.data.get("name"))
        if name is None:
            problems.append(Problem("error", row.location, "Kolom 'name' kosong."))
            continue
        if len(name) > MAX_NAME:
            problems.append(
                Problem("error", row.location, f"Nama lebih dari {MAX_NAME} karakter.")
            )
            continue

        key = normalize_name(name)
        if key in seen:
            problems.append(
                Problem(
                    "error",
                    row.location,
                    f"Figur {name!r} muncul lebih dari sekali (juga di {seen[key]}). "
                    "Gabungkan menjadi satu baris.",
                )
            )
            continue
        seen[key] = row.location

        influence = _to_int(row.data.get("influence"), 50)
        if influence is None or not (0 <= influence <= 100):
            problems.append(
                Problem("error", row.location, "Kolom 'influence' harus angka 0 sampai 100.")
            )
            continue

        tags_raw = row.data.get("tags")
        if isinstance(tags_raw, list):
            tags = [str(t).strip() for t in tags_raw if str(t).strip()]
        else:
            # Semicolons, not commas: a comma is the CSV separator.
            tags = [t.strip() for t in re.split(r"[;|]", str(tags_raw or "")) if t.strip()]

        specs.append(
            FigureSpec(
                name=name,
                location=row.location,
                fields={
                    "full_name": _clean(row.data.get("full_name")),
                    "role": _clean(row.data.get("role")),
                    "party": _clean(row.data.get("party")),
                    "bloc": _clean(row.data.get("bloc")),
                    "region": _clean(row.data.get("region")),
                    "photo_url": _clean(row.data.get("photo_url")),
                    "bio": _clean(row.data.get("bio")),
                    "tags": ",".join(tags) if tags else None,
                    "influence": influence,
                    "is_active": _to_bool(row.data.get("is_active"), True),
                },
            )
        )
    return specs


def collect_issues(rows: list[Row], problems: list[Problem]) -> list[IssueSpec]:
    specs: list[IssueSpec] = []
    seen: dict[str, str] = {}

    for row in rows:
        name = _clean(row.data.get("name"))
        if name is None:
            problems.append(Problem("error", row.location, "Kolom 'name' kosong."))
            continue
        if len(name) > MAX_ISSUE_NAME:
            problems.append(
                Problem("error", row.location, f"Nama isu lebih dari {MAX_ISSUE_NAME} karakter.")
            )
            continue

        key = normalize_name(name)
        if key in seen:
            problems.append(
                Problem(
                    "error",
                    row.location,
                    f"Isu {name!r} muncul lebih dari sekali (juga di {seen[key]}).",
                )
            )
            continue
        seen[key] = row.location

        weight = _to_float(row.data.get("default_weight"), 1.0)
        if weight is None or not (0 <= weight <= 10):
            problems.append(
                Problem("error", row.location, "Kolom 'default_weight' harus angka 0 sampai 10.")
            )
            continue

        sort_order = _to_int(row.data.get("sort_order"), 0)
        if sort_order is None:
            problems.append(Problem("error", row.location, "Kolom 'sort_order' harus angka."))
            continue

        specs.append(
            IssueSpec(
                name=name,
                location=row.location,
                fields={
                    "category": _clean(row.data.get("category")),
                    "description": _clean(row.data.get("description")),
                    "default_weight": weight,
                    "sort_order": sort_order,
                },
            )
        )
    return specs


def collect_relationships(
    rows: list[Row],
    problems: list[Problem],
) -> list[RelationshipSpec]:
    """Validate relationship rows and fold reversed duplicates together.

    A pair given twice in opposite directions is an error, not a merge: the two
    rows can disagree on every field, and silently picking one would hide the
    contributor's mistake.
    """
    specs: list[RelationshipSpec] = []
    by_pair: dict[frozenset[str], RelationshipSpec] = {}

    for row in rows:
        source = _clean(row.data.get("source"))
        target = _clean(row.data.get("target"))

        if source is None or target is None:
            problems.append(
                Problem("error", row.location, "Kolom 'source' dan 'target' harus diisi.")
            )
            continue

        source_key = normalize_name(source)
        target_key = normalize_name(target)

        if source_key == target_key:
            problems.append(
                Problem(
                    "error",
                    row.location,
                    f"Relasi {source!r} ke dirinya sendiri tidak masuk akal.",
                )
            )
            continue

        pair = frozenset({source_key, target_key})
        existing = by_pair.get(pair)

        auxiliary = bool(row.data.get("_auxiliary"))

        if existing is not None:
            # relationship_issues.csv and modifiers.csv are second passes over
            # the same pair, so they fold into the row that relationships.csv
            # already created. That is the documented way to attach scores and
            # events, not a duplicate.
            if auxiliary:
                for item in row.data.get("issues") or []:
                    existing.issue_rows.append(dict(item) | {"_location": row.location})
                for item in row.data.get("modifiers") or []:
                    existing.modifier_rows.append(dict(item) | {"_location": row.location})
                continue

            # Otherwise it is a genuine duplicate. Same direction is a repeated
            # row; reversed direction is the undirected-pair trap. Both are
            # errors, and both name the other location.
            same_direction = normalize_name(existing.source) == source_key
            if same_direction:
                problems.append(
                    Problem(
                        "error",
                        row.location,
                        f"Relasi {source!r} - {target!r} sudah ada di {existing.location}.",
                    )
                )
            else:
                problems.append(
                    Problem(
                        "error",
                        row.location,
                        f"Relasi {source!r} - {target!r} adalah pasangan yang sama dengan "
                        f"{existing.location}, hanya urutannya dibalik. Relasi tidak berarah, "
                        "jadi tulis satu baris saja.",
                    )
                )
            continue

        # An empty rel_type on a row that already exists means "leave it alone",
        # not "change it to political".
        #
        # The CSV format needs a row per pair to attach events or per-issue
        # scores, and that row has no reason to restate the relationship kind. It
        # previously defaulted to "political" and then wrote that value, so a
        # file attaching one event silently rewrote a stored `coalition` tie to
        # `political`. Verified against a copy of the real database: exactly one
        # pair changed, and its rel_type was the only field that moved.
        raw_rel_type = _clean(row.data.get("rel_type"))
        rel_type = raw_rel_type or "political"
        if rel_type not in REL_TYPES:
            problems.append(
                Problem(
                    "error",
                    row.location,
                    f"rel_type {rel_type!r} tidak dikenal. Pilihan: {', '.join(REL_TYPES)}.",
                )
            )
            continue

        score_mode = _clean(row.data.get("score_mode")) or "computed"
        if score_mode not in SCORE_MODES:
            problems.append(
                Problem(
                    "error",
                    row.location,
                    f"score_mode {score_mode!r} tidak dikenal. Pilihan: {', '.join(SCORE_MODES)}.",
                )
            )
            continue

        manual_score = _to_int(row.data.get("manual_score"), 0)
        if manual_score is None or not (-100 <= manual_score <= 100):
            problems.append(
                Problem("error", row.location, "manual_score harus angka -100 sampai 100.")
            )
            continue

        spec = RelationshipSpec(
            source=source,
            target=target,
            location=row.location,
            fields={
                # `raw_rel_type` and `status` may be None, which means "not
                # stated" rather than "empty". apply_import skips None fields on
                # an update and falls back to the model default on a create, so a
                # row that only carries events cannot rewrite the stored kind.
                "rel_type": raw_rel_type,
                "status": _clean(row.data.get("status")),
                "score_mode": _clean(row.data.get("score_mode")),
                "manual_score": _to_int(row.data.get("manual_score")),
                "since": _clean(row.data.get("since")),
                "notes": _clean(row.data.get("notes")),
                "source_url": _clean(row.data.get("source_url")),
            },
            issue_rows=[],
            modifier_rows=[],
        )

        for index, item in enumerate(row.data.get("issues") or []):
            if not isinstance(item, dict):
                problems.append(
                    Problem(
                        "error",
                        f"{row.location} issues[{index}]",
                        "Setiap isu harus berupa objek.",
                    )
                )
                continue
            spec.issue_rows.append(dict(item) | {"_location": f"{row.location} issues[{index}]"})

        for index, item in enumerate(row.data.get("modifiers") or []):
            if not isinstance(item, dict):
                problems.append(
                    Problem(
                        "error",
                        f"{row.location} modifiers[{index}]",
                        "Setiap peristiwa harus berupa objek.",
                    )
                )
                continue
            spec.modifier_rows.append(
                dict(item) | {"_location": f"{row.location} modifiers[{index}]"}
            )

        specs.append(spec)
        by_pair[pair] = spec

    return specs


def validate_issue_rows(
    specs: list[RelationshipSpec],
    known_issues: set[str],
    problems: list[Problem],
) -> None:
    """Check every per-issue score, and that the issue name resolves."""
    for spec in specs:
        seen: set[str] = set()
        kept: list[dict[str, Any]] = []

        for item in spec.issue_rows:
            location = str(item.get("_location", spec.location))
            issue_name = _clean(item.get("issue"))
            if issue_name is None:
                problems.append(Problem("error", location, "Kolom 'issue' kosong."))
                continue

            key = normalize_name(issue_name)
            if key not in known_issues:
                problems.append(
                    Problem(
                        "error",
                        location,
                        f"Isu {issue_name!r} tidak ditemukan. Impor isunya lebih dulu.",
                    )
                )
                continue
            if key in seen:
                problems.append(
                    Problem("error", location, f"Isu {issue_name!r} disebut dua kali di relasi ini.")
                )
                continue
            seen.add(key)

            score = _to_int(item.get("score"))
            if score is None or not (-100 <= score <= 100):
                problems.append(
                    Problem("error", location, "Kolom 'score' harus angka -100 sampai 100.")
                )
                continue

            weight = _to_float(item.get("weight"), 1.0)
            if weight is None or not (0 <= weight <= 10):
                problems.append(
                    Problem("error", location, "Kolom 'weight' harus angka 0 sampai 10.")
                )
                continue

            kept.append(
                {
                    "issue_name": issue_name,
                    "score": score,
                    "weight": weight,
                    "stance": _clean(item.get("stance")),
                    "evidence_url": _clean(item.get("evidence_url")),
                }
            )

        spec.issue_rows = kept


def validate_modifier_rows(specs: list[RelationshipSpec], problems: list[Problem]) -> None:
    for spec in specs:
        kept: list[dict[str, Any]] = []
        for item in spec.modifier_rows:
            location = str(item.get("_location", spec.location))

            label = _clean(item.get("label"))
            if label is None:
                problems.append(Problem("error", location, "Kolom 'label' kosong."))
                continue
            if len(label) > MAX_LABEL:
                problems.append(
                    Problem("error", location, f"Label lebih dari {MAX_LABEL} karakter.")
                )
                continue

            value = _to_int(item.get("value"))
            if value is None or not (-100 <= value <= 100):
                problems.append(
                    Problem("error", location, "Kolom 'value' harus angka -100 sampai 100.")
                )
                continue

            kind = _clean(item.get("kind")) or "event"
            if kind not in MODIFIER_KINDS:
                problems.append(
                    Problem(
                        "error",
                        location,
                        f"kind {kind!r} tidak dikenal. Pilihan: {', '.join(MODIFIER_KINDS)}.",
                    )
                )
                continue

            expires_raw = item.get("expires_at")
            expires_at = _parse_datetime(expires_raw)
            if _clean(expires_raw) is not None and expires_at is None:
                problems.append(
                    Problem(
                        "error",
                        location,
                        f"expires_at {expires_raw!r} bukan ISO 8601. "
                        "Contoh yang benar: 2027-01-01T00:00:00Z.",
                    )
                )
                continue

            kept.append(
                {
                    "label": label,
                    "value": value,
                    "kind": kind,
                    "active": _to_bool(item.get("active"), True),
                    "expires_at": expires_at,
                    "note": _clean(item.get("note")),
                }
            )
        spec.modifier_rows = kept


def check_names_resolve(
    figures: list[FigureSpec],
    relationships: list[RelationshipSpec],
    known_figures: set[str],
    problems: list[Problem],
) -> None:
    """Every referenced figure must exist, in the file or already in the DB."""
    provided = {normalize_name(f.name) for f in figures}

    for spec in relationships:
        for role, raw in (("source", spec.source), ("target", spec.target)):
            key = normalize_name(raw)
            if key not in provided and key not in known_figures:
                problems.append(
                    Problem(
                        "error",
                        spec.location,
                        f"Kolom {role} merujuk figur {raw!r} yang tidak ada di file ini "
                        "maupun di database.",
                    )
                )


def build_bundle(db: Session) -> dict[str, Any]:
    """The whole dataset in the import format.

    Used by the export endpoint. Because export and import share a format, a
    contributor can download this, edit it, and send it back: the round trip is
    the proof that the format is usable rather than aspirational.

    Every reference is written as a name, never an id, for the same reason.
    """
    figures = list(db.scalars(select(Figure).order_by(Figure.id)))
    issues = list(db.scalars(select(Issue).order_by(Issue.sort_order, Issue.id)))
    relationships = list(db.scalars(select(Relationship).order_by(Relationship.id)))

    name_by_id = {f.id: f.name for f in figures}
    issue_name_by_id = {i.id: i.name for i in issues}

    return {
        "format": BUNDLE_FORMAT,
        "version": BUNDLE_VERSION,
        "figures": [
            {
                "name": f.name,
                "full_name": f.full_name,
                "role": f.role,
                "party": f.party,
                "bloc": f.bloc,
                "region": f.region,
                "influence": f.influence,
                "bio": f.bio,
                # Stored comma-separated; the bundle uses a list.
                "tags": [t for t in (f.tags or "").split(",") if t],
            }
            for f in figures
        ],
        "issues": [
            {
                "name": i.name,
                "category": i.category,
                "description": i.description,
                "default_weight": i.default_weight,
                "sort_order": i.sort_order,
            }
            for i in issues
        ],
        "relationships": [
            {
                "source": name_by_id.get(r.source_id, ""),
                "target": name_by_id.get(r.target_id, ""),
                "rel_type": r.rel_type,
                "status": r.status,
                "score_mode": r.score_mode,
                "manual_score": r.manual_score,
                "since": r.since,
                "notes": r.notes,
                "source_url": r.source_url,
                "issues": [
                    {
                        "issue": issue_name_by_id.get(ri.issue_id, ""),
                        "score": ri.score,
                        "weight": ri.weight,
                        "stance": ri.stance,
                        "evidence_url": ri.evidence_url,
                    }
                    for ri in sorted(r.issue_scores, key=lambda x: x.issue_id)
                ],
                "modifiers": [
                    {
                        "label": m.label,
                        "value": m.value,
                        "kind": m.kind,
                        "active": m.active,
                        "expires_at": m.expires_at.isoformat() if m.expires_at else None,
                        "note": m.note,
                    }
                    for m in sorted(r.modifiers, key=lambda x: x.id)
                ],
            }
            for r in relationships
        ],
    }


def run_import(
    db: Session,
    *,
    figures: list[Row],
    issues: list[Row],
    relationships: list[Row],
    parse_problems: list[Problem],
    apply: bool,
) -> ImportResult:
    """Validate everything, then write it if asked.

    `apply=False` runs every check and reports the counts that *would* result,
    without writing. The preview is therefore a real dry run rather than an
    approximation of one.
    """
    problems: list[Problem] = list(parse_problems)

    figure_specs = collect_figures(figures, problems)
    issue_specs = collect_issues(issues, problems)
    rel_specs = collect_relationships(relationships, problems)

    # Issues may come from the file or already exist in the database.
    known_issues = {normalize_name(i.name) for i in db.scalars(select(Issue)).all()}
    known_issues |= {normalize_name(s.name) for s in issue_specs}

    known_figures = {normalize_name(f.name) for f in db.scalars(select(Figure)).all()}
    check_names_resolve(figure_specs, rel_specs, known_figures, problems)
    validate_issue_rows(rel_specs, known_issues, problems)
    validate_modifier_rows(rel_specs, problems)

    errors = [p for p in problems if p.severity == "error"]

    if errors:
        # Nothing is written, so report zero counts rather than a misleading
        # preview of a partial import.
        return ImportResult(ok=False, problems=problems, counts={}, applied=False)

    counts = apply_import(db, figures=figure_specs, issues=issue_specs, relationships=rel_specs)

    if apply:
        db.commit()
    else:
        # The counts above were computed against a flushed session. Rolling back
        # discards the writes while keeping the numbers the caller was promised.
        db.rollback()

    return ImportResult(ok=True, problems=problems, counts=counts, applied=apply)


# --------------------------------------------------------------------------- applying


def apply_import(
    db: Session,
    *,
    figures: list[FigureSpec],
    issues: list[IssueSpec],
    relationships: list[RelationshipSpec],
) -> dict[str, Counts]:
    """Write everything. The caller validates first and commits at the end."""
    counts = {"figures": Counts(), "issues": Counts(), "relationships": Counts()}

    figure_by_key = {normalize_name(f.name): f for f in db.scalars(select(Figure)).all()}
    issue_by_key = {normalize_name(i.name): i for i in db.scalars(select(Issue)).all()}

    for spec in issues:
        key = normalize_name(spec.name)
        existing = issue_by_key.get(key)
        if existing is None:
            issue = Issue(name=spec.name, **spec.fields)
            db.add(issue)
            issue_by_key[key] = issue
            counts["issues"].created += 1
        else:
            for field_name, value in spec.fields.items():
                # An absent column leaves the stored value alone rather than
                # clearing it, so a partial file cannot erase data.
                if value is not None:
                    setattr(existing, field_name, value)
            counts["issues"].updated += 1

    for spec in figures:
        key = normalize_name(spec.name)
        existing = figure_by_key.get(key)
        if existing is None:
            figure = Figure(name=spec.name, **spec.fields)
            db.add(figure)
            figure_by_key[key] = figure
            counts["figures"].created += 1
        else:
            for field_name, value in spec.fields.items():
                if value is not None:
                    setattr(existing, field_name, value)
            counts["figures"].updated += 1

    # Flush so new figures and issues have ids for the relationships below.
    db.flush()

    # Index existing modifiers by (relationship, label) so a re-import updates
    # them instead of appending duplicates.
    modifier_by_label = {
        (m.relationship_id, m.label): m for m in db.scalars(select(Modifier)).all()
    }

    for spec in relationships:
        source = figure_by_key[normalize_name(spec.source)]
        target = figure_by_key[normalize_name(spec.target)]

        # The pair may already exist under either direction. Look for both, so
        # an upload of (B,A) updates the stored (A,B) instead of adding a second
        # row for the same tie.
        existing = db.scalar(
            select(Relationship).where(
                ((Relationship.source_id == source.id) & (Relationship.target_id == target.id))
                | ((Relationship.source_id == target.id) & (Relationship.target_id == source.id))
            )
        )

        if existing is None:
            existing = Relationship(source_id=source.id, target_id=target.id)
            db.add(existing)
            counts["relationships"].created += 1
        else:
            counts["relationships"].updated += 1

        for field_name, value in spec.fields.items():
            if value is not None:
                setattr(existing, field_name, value)

        db.flush()

        if spec.issue_rows:
            # Replace the score for each named issue, keeping any issue the file
            # did not mention.
            existing_scores = {ri.issue_id: ri for ri in existing.issue_scores}
            for row in spec.issue_rows:
                issue = issue_by_key[normalize_name(row["issue_name"])]
                current = existing_scores.get(issue.id)
                if current is None:
                    db.add(
                        RelationshipIssue(
                            relationship_id=existing.id,
                            issue_id=issue.id,
                            score=row["score"],
                            weight=row["weight"],
                            stance=row["stance"],
                            evidence_url=row["evidence_url"],
                        )
                    )
                else:
                    current.score = row["score"]
                    current.weight = row["weight"]
                    if row["stance"] is not None:
                        current.stance = row["stance"]
                    if row["evidence_url"] is not None:
                        current.evidence_url = row["evidence_url"]

        for row in spec.modifier_rows:
            # Modifiers are replaced as a set, not appended.
            #
            # Appending would duplicate every event on re-import, and since a
            # modifier's value is added to the score, a contributor who
            # downloaded the bundle, edited one figure, and sent it back would
            # silently double every event's effect. The round-trip test caught
            # exactly that.
            #
            # A modifier is identified by its label within the relationship,
            # which is what a contributor can see and edit.
            current = modifier_by_label.get((existing.id, row["label"]))
            if current is None:
                db.add(
                    Modifier(
                        relationship_id=existing.id,
                        label=row["label"],
                        value=row["value"],
                        kind=row["kind"],
                        active=row["active"],
                        expires_at=row["expires_at"],
                        note=row["note"],
                    )
                )
            else:
                current.value = row["value"]
                current.kind = row["kind"]
                current.active = row["active"]
                current.expires_at = row["expires_at"]
                current.note = row["note"]

    return counts
