"""Data access layer.

Every query lives here rather than in route handlers, so the scoring assembly
and the graph/matrix aggregation can be unit tested against a session without
going through HTTP.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import AuditLog, Figure, Issue, Modifier, Relationship, RelationshipIssue
from app.schemas import (
    EdgeStyleOut,
    FigureRef,
    FigureRelationshipOut,
    GraphEdgeOut,
    GraphNodeOut,
    IssueBreakdownOut,
    IssueSummaryOut,
    MatrixCellOut,
    ModifierBreakdownOut,
    RelationshipOut,
    TierOut,
)
from app.services import scoring


def tier_out(tier: scoring.Tier) -> TierOut:
    return TierOut(
        key=tier.key,
        label=tier.label,
        description=tier.description,
        color=tier.color,
        threshold=tier.threshold,
    )


def tier_from_out(tier: TierOut) -> scoring.Tier:
    """Reverse mapping, needed where a breakdown tier is carried in a schema."""
    return scoring.Tier(
        threshold=tier.threshold,
        key=tier.key,
        label=tier.label,
        description=tier.description,
        color=tier.color,
    )


# --------------------------------------------------------------------------- figures
def list_figures(
    db: Session,
    *,
    q: str | None = None,
    bloc: str | None = None,
    party: str | None = None,
    active: bool | None = None,
) -> list[Figure]:
    stmt = select(Figure)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            Figure.name.ilike(like)
            | Figure.full_name.ilike(like)
            | Figure.role.ilike(like)
            | Figure.party.ilike(like)
        )
    if bloc:
        stmt = stmt.where(Figure.bloc == bloc)
    if party:
        stmt = stmt.where(Figure.party == party)
    if active is not None:
        stmt = stmt.where(Figure.is_active.is_(active))
    return list(db.scalars(stmt.order_by(Figure.influence.desc(), Figure.name)))


def get_figure(db: Session, figure_id: int) -> Figure | None:
    return db.get(Figure, figure_id)


def figures_by_id(db: Session) -> dict[int, Figure]:
    return {f.id: f for f in db.scalars(select(Figure))}


# --------------------------------------------------------------------------- issues
def list_issues(db: Session) -> list[Issue]:
    return list(db.scalars(select(Issue).order_by(Issue.sort_order, Issue.name)))


def issue_usage(db: Session) -> dict[int, tuple[int, float | None]]:
    """issue_id -> (times used, mean score)."""
    rows = db.execute(
        select(
            RelationshipIssue.issue_id,
            func.count(RelationshipIssue.id),
            func.avg(RelationshipIssue.score),
        ).group_by(RelationshipIssue.issue_id)
    ).all()
    return {r[0]: (r[1], float(r[2]) if r[2] is not None else None) for r in rows}


# --------------------------------------------------------------------------- relationships
def _load_relationships(db: Session) -> list[Relationship]:
    """Eager-load everything the scorer needs, in one round trip."""
    stmt = select(Relationship).options(
        selectinload(Relationship.issue_scores).selectinload(RelationshipIssue.issue),
        selectinload(Relationship.modifiers),
        selectinload(Relationship.source),
        selectinload(Relationship.target),
    )
    return list(db.scalars(stmt.order_by(Relationship.id)))


def compute_for(db: Session, rel: Relationship, now: datetime | None = None) -> scoring.ScoreBreakdown:
    issue_inputs = [
        scoring.IssueScoreInput(
            issue_id=row.issue_id,
            issue_name=row.issue.name if row.issue else f"#{row.issue_id}",
            category=row.issue.category if row.issue else None,
            score=float(row.score),
            weight=float(row.weight),
            stance=row.stance,
            evidence_url=row.evidence_url,
        )
        for row in rel.issue_scores
    ]
    modifier_inputs = [
        scoring.ModifierInput(
            id=m.id,
            label=m.label,
            value=float(m.value),
            kind=m.kind,
            active=bool(m.active),
            expires_at=m.expires_at,
            created_at=m.created_at,
            note=m.note,
        )
        for m in rel.modifiers
    ]
    return scoring.compute_score(
        issue_inputs,
        modifier_inputs,
        score_mode=rel.score_mode,
        manual_score=rel.manual_score,
        now=now,
    )


def relationship_out(
    rel: Relationship, breakdown: scoring.ScoreBreakdown | None = None
) -> RelationshipOut:
    breakdown = breakdown or compute_for(None, rel)  # type: ignore[arg-type]
    return RelationshipOut(
        id=rel.id,
        source_id=rel.source_id,
        target_id=rel.target_id,
        source_name=rel.source.name if rel.source else f"#{rel.source_id}",
        target_name=rel.target.name if rel.target else f"#{rel.target_id}",
        source_party=rel.source.party if rel.source else None,
        target_party=rel.target.party if rel.target else None,
        source_bloc=rel.source.bloc if rel.source else None,
        target_bloc=rel.target.bloc if rel.target else None,
        rel_type=rel.rel_type,
        status=rel.status,
        since=rel.since,
        notes=rel.notes,
        source_url=rel.source_url,
        updated_at=rel.updated_at,
        score=breakdown.score,
        raw_score=breakdown.raw_score,
        base_score=breakdown.base_score,
        issue_total_weight=breakdown.issue_total_weight,
        modifier_total=breakdown.modifier_total,
        score_mode=breakdown.score_mode,
        manual_score=breakdown.manual_score,
        tier=tier_out(breakdown.tier),
        issues=[
            IssueBreakdownOut(
                issue_id=i.issue_id,
                issue=i.issue,
                category=i.category,
                score=i.score,
                weight=i.weight,
                contribution=i.contribution,
                stance=i.stance,
                evidence_url=i.evidence_url,
            )
            for i in breakdown.issues
        ],
        modifiers=[
            ModifierBreakdownOut(
                id=m.id,
                label=m.label,
                kind=m.kind,
                value=m.value,
                effective_value=m.effective_value,
                fade=m.fade,
                expires_at=m.expires_at,
                note=m.note,
                active=True,
            )
            for m in breakdown.modifiers
        ],
    )


def all_relationship_payloads(db: Session) -> list[RelationshipOut]:
    return [relationship_out(rel) for rel in _load_relationships(db)]


def get_relationship(db: Session, rel_id: int) -> Relationship | None:
    stmt = (
        select(Relationship)
        .where(Relationship.id == rel_id)
        .options(
            selectinload(Relationship.issue_scores).selectinload(RelationshipIssue.issue),
            selectinload(Relationship.modifiers),
            selectinload(Relationship.source),
            selectinload(Relationship.target),
        )
    )
    return db.scalars(stmt).first()


# --------------------------------------------------------------------------- figure detail
def figure_relationship_out(payload: RelationshipOut, figure_id: int) -> FigureRelationshipOut:
    """Resolve a relationship from one figure's point of view.

    `is_source` decides which side is the counterpart. Getting this wrong is
    how a profile ends up printing its own name in its relationship list.
    """
    is_source = payload.source_id == figure_id
    return FigureRelationshipOut(
        **payload.model_dump(),
        counterpart_id=payload.target_id if is_source else payload.source_id,
        counterpart_name=payload.target_name if is_source else payload.source_name,
        counterpart_party=payload.target_party if is_source else payload.source_party,
        counterpart_bloc=payload.target_bloc if is_source else payload.source_bloc,
        is_source=is_source,
    )


def figure_detail(db: Session, figure: Figure) -> dict:
    rels = [r for r in _load_relationships(db) if figure.id in (r.source_id, r.target_id)]
    payloads = [relationship_out(r) for r in rels]
    # Rows as seen from this figure, so the client never has to work out which
    # side is the counterpart.
    rows = [figure_relationship_out(p, figure.id) for p in payloads]

    # Aggregate this figure's position on each issue across all its ties.
    buckets: dict[int, dict] = defaultdict(
        lambda: {"scores": [], "weighted": 0.0, "weight": 0.0, "issue": "", "category": None}
    )
    for payload in payloads:
        for issue in payload.issues:
            b = buckets[issue.issue_id]
            b["issue"] = issue.issue
            b["category"] = issue.category
            b["scores"].append(issue.score)
            b["weighted"] += issue.score * issue.weight
            b["weight"] += issue.weight

    issue_summary = [
        IssueSummaryOut(
            issue_id=iid,
            issue=b["issue"],
            category=b["category"],
            avg_score=round(sum(b["scores"]) / len(b["scores"]), 1),
            weighted_avg=round(b["weighted"] / b["weight"], 1) if b["weight"] else 0.0,
            n=len(b["scores"]),
            min=min(b["scores"]),
            max=max(b["scores"]),
        )
        for iid, b in buckets.items()
    ]
    issue_summary.sort(key=lambda x: x.weighted_avg, reverse=True)

    scores = [p.score for p in payloads]
    avg = int(round(sum(scores) / len(scores))) if scores else 0

    allies = []
    rivals = []
    for row in rows:
        entry = {
            "id": row.counterpart_id,
            "name": row.counterpart_name,
            "score": row.score,
            "tier": row.tier.model_dump(),
        }
        if row.score >= 30:
            allies.append(entry)
        elif row.score <= -8:
            rivals.append(entry)
    allies.sort(key=lambda x: -x["score"])
    rivals.sort(key=lambda x: x["score"])

    return {
        "relationships": sorted(rows, key=lambda r: -r.score),
        "issue_summary": issue_summary,
        "summary": {
            "relationship_count": len(payloads),
            "avg_score": avg,
            "allies": allies,
            "rivals": rivals,
        },
        "tier": scoring.tier_for(avg),
    }


# --------------------------------------------------------------------------- graph
def graph_payload(db: Session, *, threshold: int = 0, bloc: str | None = None) -> dict:
    figures = list(db.scalars(select(Figure).where(Figure.is_active.is_(True))))
    if bloc:
        figures = [f for f in figures if f.bloc == bloc]
    allowed = {f.id for f in figures}

    payloads = [
        p
        for p in all_relationship_payloads(db)
        if p.source_id in allowed and p.target_id in allowed
    ]
    if threshold:
        payloads = [p for p in payloads if abs(p.score) >= threshold]

    degree: dict[int, int] = defaultdict(int)
    for p in payloads:
        degree[p.source_id] += 1
        degree[p.target_id] += 1

    nodes = []
    for f in figures:
        mine = [p.score for p in payloads if f.id in (p.source_id, p.target_id)]
        mean = sum(mine) / len(mine) if mine else 0.0
        nodes.append(
            GraphNodeOut(
                id=f.id,
                label=f.name,
                full_name=f.full_name,
                role=f.role,
                party=f.party,
                bloc=f.bloc,
                influence=f.influence,
                degree=degree.get(f.id, 0),
                tier=tier_out(scoring.tier_for(mean)),
                size=round(14 + (f.influence or 50) / 100 * 22, 1),
            )
        )

    edges = []
    for p in payloads:
        style = scoring.normalize_for_graph(p.score)
        edges.append(
            GraphEdgeOut(
                id=p.id,
                source=p.source_id,
                target=p.target_id,
                score=p.score,
                label=f"{p.score:+d}",
                rel_type=p.rel_type,
                tier=p.tier,
                style=EdgeStyleOut(**style),
                title=f"{p.source_name} <-> {p.target_name}: {p.score:+d} ({p.tier.label})",
                top_issue=p.issues[0].issue if p.issues else None,
            )
        )

    return {
        "nodes": nodes,
        "edges": edges,
        "counts": {
            "nodes": len(nodes),
            "edges": len(edges),
            "allies": sum(1 for e in edges if e.score >= 30),
            "rivals": sum(1 for e in edges if e.score <= -30),
            "neutral": sum(1 for e in edges if -30 < e.score < 30),
            "blocs": len(set(n.bloc for n in nodes if n.bloc)),
        },
    }


# --------------------------------------------------------------------------- matrix
def matrix_payload(db: Session, *, bloc: str | None = None) -> dict:
    figures = list(db.scalars(select(Figure).where(Figure.is_active.is_(True))))
    if bloc:
        figures = [f for f in figures if f.bloc == bloc]

    lookup: dict[tuple[int, int], RelationshipOut] = {}
    for p in all_relationship_payloads(db):
        lookup[(p.source_id, p.target_id)] = p
        lookup[(p.target_id, p.source_id)] = p

    cells = []
    for a in figures:
        for b in figures:
            if a.id == b.id:
                cells.append(MatrixCellOut(row=a.id, col=b.id, self=True))
                continue
            p = lookup.get((a.id, b.id))
            cells.append(
                MatrixCellOut(
                    row=a.id,
                    col=b.id,
                    score=p.score if p else None,
                    tier=p.tier if p else None,
                    relationship_id=p.id if p else None,
                    top_issue=p.issues[0].issue if (p and p.issues) else None,
                )
            )

    return {
        "figures": [
            FigureRef(id=f.id, name=f.name, party=f.party, bloc=f.bloc) for f in figures
        ],
        "cells": cells,
    }


# --------------------------------------------------------------------------- stats
def stats_payload(db: Session) -> dict:
    payloads = all_relationship_payloads(db)
    issues = {i.id: i for i in list_issues(db)}

    tier_distribution: dict[str, int] = defaultdict(int)
    for p in payloads:
        tier_distribution[p.tier.label] += 1

    per_issue: dict[int, list[float]] = defaultdict(list)
    for p in payloads:
        for issue in p.issues:
            per_issue[issue.issue_id].append(issue.score)

    divisive = []
    for iid, values in per_issue.items():
        if len(values) < 2:
            continue
        mean = sum(values) / len(values)
        variance = sum((v - mean) ** 2 for v in values) / len(values)
        divisive.append(
            {
                "issue_id": iid,
                "issue": issues[iid].name if iid in issues else f"#{iid}",
                "n": len(values),
                "avg": round(mean, 1),
                "stddev": round(variance**0.5, 1),
                "spread": max(values) - min(values),
            }
        )
    divisive.sort(key=lambda x: -x["spread"])

    def pair(p: RelationshipOut) -> str:
        return f"{p.source_name} <-> {p.target_name}"

    return {
        "totals": {
            "figures": db.scalar(select(func.count(Figure.id))) or 0,
            "relationships": len(payloads),
            "issues": len(issues),
            "active_modifiers": sum(len(p.modifiers) for p in payloads),
        },
        "tier_distribution": dict(tier_distribution),
        "most_divisive_issues": divisive[:8],
        "most_hostile": [
            {"pair": pair(p), "score": p.score}
            for p in sorted(payloads, key=lambda x: x.score)[:5]
        ],
        "most_aligned": [
            {"pair": pair(p), "score": p.score}
            for p in sorted(payloads, key=lambda x: -x.score)[:5]
        ],
        "last_updated": max((p.updated_at for p in payloads if p.updated_at), default=None),
    }


# --------------------------------------------------------------------------- audit
def write_audit(
    db: Session, *, actor: str, entity: str, entity_id: int | None, action: str, detail: str = ""
) -> None:
    db.add(
        AuditLog(
            ts=datetime.now(timezone.utc),
            actor=actor,
            entity=entity,
            entity_id=entity_id,
            action=action,
            detail=detail,
        )
    )