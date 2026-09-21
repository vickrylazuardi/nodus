"""Scoring engine tests.

These pin the behaviours that matter: the soft clamp must preserve ordering at
the extremes, modifiers must decay rather than vanish, and weights must actually
shift the result.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.services.scoring import (
    MAX_SCORE,
    MIN_SCORE,
    IssueScoreInput,
    ModifierInput,
    compute_score,
    decay_factor,
    normalize_for_graph,
    soft_clamp,
    tier_for,
)

NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)


def issue(score: float, weight: float = 1.0, issue_id: int = 1, name: str = "Isu") -> IssueScoreInput:
    return IssueScoreInput(
        issue_id=issue_id, issue_name=name, category="Uji", score=score, weight=weight
    )


# --------------------------------------------------------------------------- soft clamp
def test_soft_clamp_passes_through_inside_threshold() -> None:
    assert soft_clamp(0) == 0
    assert soft_clamp(42) == 42
    assert soft_clamp(-84.9) == pytest.approx(-84.9)


def test_soft_clamp_bounds_without_pinning() -> None:
    """The whole point of the soft clamp: extremes stay ordered, not flattened."""
    a = soft_clamp(-100)
    b = soft_clamp(-200)
    c = soft_clamp(-1000)

    assert MIN_SCORE <= c <= b <= a <= MIN_SCORE + 20
    assert c < b < a, "deeper hostility must still score lower"
    assert len({round(a, 4), round(b, 4), round(c, 4)}) == 3


def test_soft_clamp_is_symmetric() -> None:
    assert soft_clamp(-150) == pytest.approx(-soft_clamp(150))


def test_soft_clamp_never_exceeds_bounds() -> None:
    for value in (-10_000, -100, 0, 100, 10_000):
        assert MIN_SCORE <= soft_clamp(value) <= MAX_SCORE


# --------------------------------------------------------------------------- decay
def test_permanent_modifier_never_decays() -> None:
    assert decay_factor(None, NOW - timedelta(days=3650), NOW) == 1.0


def test_modifier_decays_only_in_final_quarter() -> None:
    created = NOW
    expires = NOW + timedelta(days=100)

    # 50 days in: halfway through, still full strength.
    assert decay_factor(expires, created, NOW + timedelta(days=50)) == 1.0
    # 80 days in: inside the last quarter, partially faded.
    assert 0 < decay_factor(expires, created, NOW + timedelta(days=80)) < 1.0
    # Past expiry: gone.
    assert decay_factor(expires, created, NOW + timedelta(days=101)) == 0.0


def test_expired_modifier_is_dropped_from_breakdown() -> None:
    breakdown = compute_score(
        [issue(-50)],
        [
            ModifierInput(
                id=1, label="Kedaluwarsa", value=-40, kind="event",
                expires_at=NOW - timedelta(days=1), created_at=NOW - timedelta(days=30),
            )
        ],
        now=NOW,
    )
    assert breakdown.modifier_total == 0.0
    assert breakdown.modifiers == []
    assert breakdown.score == -50


def test_inactive_modifier_is_ignored() -> None:
    breakdown = compute_score(
        [issue(0)],
        [ModifierInput(id=1, label="Nonaktif", value=-90, kind="event", active=False)],
        now=NOW,
    )
    assert breakdown.modifier_total == 0.0
    assert breakdown.score == 0


# --------------------------------------------------------------------------- weighting
def test_weights_shift_the_base_score() -> None:
    """A heavy issue must dominate a light one."""
    heavy_negative = compute_score([issue(-100, weight=9), issue(100, weight=1)], [], now=NOW)
    heavy_positive = compute_score([issue(-100, weight=1), issue(100, weight=9)], [], now=NOW)

    assert heavy_negative.base_score < 0
    assert heavy_positive.base_score > 0
    assert heavy_negative.score < heavy_positive.score


def test_zero_total_weight_yields_zero_base() -> None:
    breakdown = compute_score([issue(80, weight=0)], [], now=NOW)
    assert breakdown.base_score == 0.0


def test_no_issues_yields_zero_base() -> None:
    breakdown = compute_score([], [], now=NOW)
    assert breakdown.score == 0
    assert breakdown.base_score == 0.0
    assert breakdown.tier.key == "neutral"


def test_issues_sorted_by_absolute_contribution() -> None:
    breakdown = compute_score(
        [issue(10, 1.0, 1, "Kecil"), issue(-90, 2.0, 2, "Besar"), issue(40, 1.0, 3, "Sedang")],
        [],
        now=NOW,
    )
    assert [i.issue for i in breakdown.issues] == ["Besar", "Sedang", "Kecil"]


# --------------------------------------------------------------------------- score modes
def test_manual_mode_ignores_computation() -> None:
    breakdown = compute_score(
        [issue(100)], [], score_mode="manual", manual_score=-77, now=NOW
    )
    assert breakdown.score == -77
    assert breakdown.base_score == 100.0


def test_blended_mode_averages_both() -> None:
    # soft_clamp(100) is 94, not 100, so the blend is (94 + 0) / 2 = 47. The
    # clamp applies before blending on purpose: blending a clamped score with a
    # manual override keeps both inputs on the same -100..100 scale.
    breakdown = compute_score(
        [issue(100)], [], score_mode="blended", manual_score=0, now=NOW
    )
    assert breakdown.score == 47
    assert breakdown.base_score == 100.0


def test_blended_mode_with_unclamped_value() -> None:
    """Inside the clamp threshold the blend is a plain mean."""
    breakdown = compute_score([issue(60)], [], score_mode="blended", manual_score=20, now=NOW)
    assert breakdown.score == 40


def test_score_mode_defaults_to_computed() -> None:
    assert compute_score([issue(30)], [], now=NOW).score == 30


# --------------------------------------------------------------------------- tiers
@pytest.mark.parametrize(
    ("score", "key"),
    [
        (100, "solid_bloc"),
        (80, "solid_bloc"),
        (79, "alliance"),
        (55, "alliance"),
        (30, "friendly"),
        (8, "cordial"),
        (0, "neutral"),
        (-7, "neutral"),
        (-8, "wary"),
        (-29, "wary"),
        (-30, "tension"),
        (-54, "tension"),
        (-55, "rivalry"),
        (-79, "rivalry"),
        (-80, "hostile"),
        (-100, "hostile"),
    ],
)
def test_tier_boundaries(score: int, key: str) -> None:
    assert tier_for(score).key == key


def test_tiers_are_ordered_descending() -> None:
    thresholds = [t.threshold for t in __import__("app.services.scoring", fromlist=["TIERS"]).TIERS]
    assert thresholds == sorted(thresholds, reverse=True)


# --------------------------------------------------------------------------- graph styling
def test_graph_style_reflects_strength_and_sign() -> None:
    strong_ally = normalize_for_graph(95)
    weak_ally = normalize_for_graph(5)
    hostile = normalize_for_graph(-95)

    assert strong_ally["width"] > weak_ally["width"]
    assert hostile["width"] > weak_ally["width"]
    assert hostile["dashes"] is True
    assert strong_ally["dashes"] is False


def test_graph_style_opacity_is_bounded() -> None:
    for score in (-100, -50, 0, 50, 100):
        assert 0 <= normalize_for_graph(score)["opacity"] <= 1
