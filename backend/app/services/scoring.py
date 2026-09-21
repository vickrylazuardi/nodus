"""Relationship scoring.

Civ VI model mapped onto politics:

    Opinion score (-100..100)      -> relationship score
    Access levels (Denounced/Ally) -> relationship tiers
    Diplomacy modifiers (timed)    -> decaying event modifiers
    Agenda / Casus Belli           -> weighted issues

The engine is pure: it takes plain data and returns a breakdown, with no
database access, so it is cheap to unit test.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal, TypedDict

MIN_SCORE = -100
MAX_SCORE = 100

# Inside this band a score passes through unchanged; beyond it the value
# approaches the limit asymptotically.
SOFT_CLAMP_THRESHOLD = 85.0

ScoreMode = Literal["computed", "manual", "blended"]


class GraphStyle(TypedDict):
    """Edge styling for the relationship map."""

    color: str
    width: float
    dashes: bool
    arrows: str
    opacity: float


@dataclass(frozen=True)
class Tier:
    threshold: int
    key: str
    label: str
    description: str
    color: str


# Ordered high to low; `tier_for` returns the first entry whose threshold the
# score meets.
TIERS: tuple[Tier, ...] = (
    Tier(80, "solid_bloc", "Blok Solid", "Sekutu penuh, saling dukung di semua isu", "#1F5A4C"),
    Tier(55, "alliance", "Aliansi", "Mitra koalisi kuat", "#2A6B5A"),
    Tier(30, "friendly", "Akrab", "Sering sejalan, komunikasi lancar", "#357A66"),
    Tier(8, "cordial", "Netral Positif", "Berteman tapi belum terikat", "#3F7F6C"),
    Tier(-7, "neutral", "Netral", "Tidak ada kedekatan berarti", "#525A66"),
    Tier(-29, "wary", "Waspada", "Ada friksi, komunikasi terbatas", "#7A6A50"),
    Tier(-54, "tension", "Ketegangan", "Saling menyindir, potensi pecah kongsi", "#8F5A3A"),
    Tier(-79, "rivalry", "Rivalitas", "Konfrontasi terbuka di isu utama", "#8A3F2E"),
    Tier(
        MIN_SCORE,
        "hostile",
        "Bermusuhan",
        "Konflik permanen, blok berbeda",
        "#7E2A25",
    ),
)

REL_TYPES = ("political", "coalition", "family", "business", "party", "government")
MODIFIER_KINDS = ("event", "scandal", "deal", "betrayal", "support", "endorsement", "legal")


def tier_for(score: float) -> Tier:
    for tier in TIERS:
        if score >= tier.threshold:
            return tier
    return TIERS[-1]


def soft_clamp(value: float, threshold: float = SOFT_CLAMP_THRESHOLD) -> float:
    """Compress the extremes while preserving order.

    A hard clamp maps every very hostile pair to exactly -100, so the map can no
    longer distinguish "bad" from "catastrophic". Beyond +/-threshold the result
    approaches +/-100 asymptotically and stays strictly ordered.
    """
    sign = -1.0 if value < 0 else 1.0
    magnitude = abs(value)
    if magnitude <= threshold:
        return value
    span = MAX_SCORE - threshold
    return sign * (threshold + span * (1.0 - math.exp(-(magnitude - threshold) / span)))


def _as_aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def decay_factor(
    expires_at: datetime | None,
    created_at: datetime | None,
    now: datetime | None = None,
) -> float:
    """Modifiers fade only in the last quarter of their life.

    A permanent modifier (no expiry) never decays. An expired one returns 0.0
    and is dropped from the breakdown.
    """
    if expires_at is None:
        return 1.0
    now = now or datetime.now(timezone.utc)
    expires = _as_aware(expires_at)
    if expires <= now:
        return 0.0
    if created_at is None:
        return 1.0
    start = _as_aware(created_at)
    span = (expires - start).total_seconds()
    if span <= 0:
        return 1.0
    remaining = (expires - now).total_seconds() / span
    if remaining >= 0.25:
        return 1.0
    return max(0.0, remaining / 0.25)


@dataclass
class IssueScoreInput:
    issue_id: int
    issue_name: str
    category: str | None
    score: float
    weight: float
    stance: str | None = None
    evidence_url: str | None = None


@dataclass
class ModifierInput:
    id: int | None
    label: str
    value: float
    kind: str
    active: bool = True
    expires_at: datetime | None = None
    created_at: datetime | None = None
    note: str | None = None


@dataclass
class IssueBreakdown:
    issue_id: int
    issue: str
    category: str | None
    score: float
    weight: float
    contribution: float
    stance: str | None
    evidence_url: str | None


@dataclass
class ModifierBreakdown:
    id: int | None
    label: str
    kind: str
    value: float
    effective_value: float
    fade: float
    expires_at: datetime | None
    note: str | None


@dataclass
class ScoreBreakdown:
    score: int
    raw_score: float
    base_score: float
    issue_total_weight: float
    modifier_total: float
    score_mode: str
    manual_score: int
    tier: Tier
    issues: list[IssueBreakdown] = field(default_factory=list)
    modifiers: list[ModifierBreakdown] = field(default_factory=list)


def compute_score(
    issue_scores: list[IssueScoreInput],
    modifiers: list[ModifierInput],
    *,
    score_mode: str = "computed",
    manual_score: int = 0,
    now: datetime | None = None,
) -> ScoreBreakdown:
    """Compute the full score breakdown for one relationship."""
    now = now or datetime.now(timezone.utc)

    total_weight = 0.0
    weighted_sum = 0.0
    issues: list[IssueBreakdown] = []

    for item in issue_scores:
        weighted_sum += item.score * item.weight
        total_weight += item.weight
        issues.append(
            IssueBreakdown(
                issue_id=item.issue_id,
                issue=item.issue_name,
                category=item.category,
                score=item.score,
                weight=item.weight,
                contribution=round(item.score * item.weight, 2),
                stance=item.stance,
                evidence_url=item.evidence_url,
            )
        )

    base = (weighted_sum / total_weight) if total_weight > 0 else 0.0

    modifier_total = 0.0
    modifier_rows: list[ModifierBreakdown] = []
    for mod in modifiers:
        if not mod.active:
            continue
        fade = decay_factor(mod.expires_at, mod.created_at, now)
        if fade <= 0:
            continue
        effective = mod.value * fade
        modifier_total += effective
        modifier_rows.append(
            ModifierBreakdown(
                id=mod.id,
                label=mod.label,
                kind=mod.kind,
                value=mod.value,
                effective_value=round(effective, 2),
                fade=round(fade, 2),
                expires_at=mod.expires_at,
                note=mod.note,
            )
        )

    raw = base + modifier_total
    bounded = max(MIN_SCORE, min(MAX_SCORE, raw))
    score = int(round(soft_clamp(bounded)))

    if score_mode == "manual":
        score = int(manual_score)
    elif score_mode == "blended":
        score = int(round((score + int(manual_score)) / 2))

    return ScoreBreakdown(
        score=score,
        raw_score=round(raw, 2),
        base_score=round(base, 2),
        issue_total_weight=round(total_weight, 2),
        modifier_total=round(modifier_total, 2),
        score_mode=score_mode,
        manual_score=manual_score,
        tier=tier_for(score),
        # Strongest contributors first: the issues that actually drove the score.
        issues=sorted(issues, key=lambda i: abs(i.contribution), reverse=True),
        modifiers=modifier_rows,
    )


def normalize_for_graph(score: int) -> GraphStyle:
    """Map a score to edge styling for the relationship map."""
    tier = tier_for(score)
    strength = abs(score) / 100.0
    return {
        "color": tier.color,
        "width": round(0.8 + strength * 5.2, 2),
        "dashes": score < 0,
        "arrows": "to" if score >= 8 else ("to;from" if score <= -29 else ""),
        "opacity": round(0.35 + strength * 0.65, 2),
    }