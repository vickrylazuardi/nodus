"""Public read-only endpoints. No authentication required."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models import Figure, Issue, Relationship
from app.schemas import (
    FigureDetailOut,
    FigureListOut,
    FigureOut,
    FigureScoreRef,
    GraphOut,
    HealthOut,
    IssueListOut,
    IssueOut,
    MatrixOut,
    RelationshipListOut,
    StatsOut,
    TierListOut,
    TierOut,
)
from app.services import repository as repo
from app.services import scoring

router = APIRouter(tags=["public"])


@router.get("/health", response_model=HealthOut)
def health(db: Session = Depends(get_db)) -> HealthOut:
    return HealthOut(
        status="ok",
        counts={
            "figures": db.scalar(select(func.count(Figure.id))) or 0,
            "relationships": db.scalar(select(func.count(Relationship.id))) or 0,
            "issues": db.scalar(select(func.count(Issue.id))) or 0,
        },
        data_is_illustrative=settings.data_is_illustrative,
    )


@router.get("/tiers", response_model=TierListOut)
def tiers() -> TierListOut:
    return TierListOut(
        tiers=[
            TierOut(
                key=t.key,
                label=t.label,
                description=t.description,
                color=t.color,
                threshold=t.threshold,
            )
            for t in scoring.TIERS
        ],
        rel_types=list(scoring.REL_TYPES),
        modifier_kinds=list(scoring.MODIFIER_KINDS),
    )


@router.get("/figures", response_model=FigureListOut)
def list_figures(
    q: str | None = None,
    bloc: str | None = None,
    party: str | None = None,
    active: bool | None = None,
    db: Session = Depends(get_db),
) -> FigureListOut:
    figures = repo.list_figures(db, q=q, bloc=bloc, party=party, active=active)
    payloads = repo.all_relationship_payloads(db)

    by_figure: dict[int, list] = {}
    for p in payloads:
        by_figure.setdefault(p.source_id, []).append(p)
        by_figure.setdefault(p.target_id, []).append(p)

    out: list[FigureOut] = []
    for f in figures:
        mine = by_figure.get(f.id, [])
        scores = [p.score for p in mine]
        model = FigureOut(
            id=f.id,
            name=f.name,
            full_name=f.full_name,
            role=f.role,
            party=f.party,
            bloc=f.bloc,
            region=f.region,
            photo_url=f.photo_url,
            bio=f.bio,
            tags=[t for t in (f.tags or "").split(",") if t],
            influence=f.influence,
            is_active=bool(f.is_active),
            relationship_count=len(mine),
            avg_score=int(round(sum(scores) / len(scores))) if scores else 0,
        )
        if mine:
            best = max(mine, key=lambda p: p.score)
            worst = min(mine, key=lambda p: p.score)

            def ref_for(p):
                other_id = p.target_id if p.source_id == f.id else p.source_id
                other_name = p.target_name if p.source_id == f.id else p.source_name
                other_party = p.target_party if p.source_id == f.id else p.source_party
                other_bloc = p.target_bloc if p.source_id == f.id else p.source_bloc
                return other_id, other_name, other_party, other_bloc

            bid, bname, bparty, bbloc = ref_for(best)
            wid, wname, wparty, wbloc = ref_for(worst)
            model.best_ally = FigureScoreRef(
                id=bid, name=bname, party=bparty, bloc=bbloc, score=best.score
            )
            model.worst_rival = FigureScoreRef(
                id=wid, name=wname, party=wparty, bloc=wbloc, score=worst.score
            )
        out.append(model)

    return FigureListOut(figures=out, count=len(out))


@router.get("/figures/{figure_id}", response_model=FigureDetailOut)
def get_figure(figure_id: int, db: Session = Depends(get_db)) -> FigureDetailOut:
    figure = repo.get_figure(db, figure_id)
    if figure is None:
        raise HTTPException(status_code=404, detail="Figure not found")

    detail = repo.figure_detail(db, figure)
    # figure_detail already resolves each row from this figure's point of view.
    rows = detail["relationships"]
    scores = [r.score for r in rows]

    figure_out = FigureOut(
        id=figure.id,
        name=figure.name,
        full_name=figure.full_name,
        role=figure.role,
        party=figure.party,
        bloc=figure.bloc,
        region=figure.region,
        photo_url=figure.photo_url,
        bio=figure.bio,
        tags=[t for t in (figure.tags or "").split(",") if t],
        influence=figure.influence,
        is_active=bool(figure.is_active),
        relationship_count=len(rows),
        avg_score=int(round(sum(scores) / len(scores))) if scores else 0,
    )

    return FigureDetailOut(
        figure=figure_out,
        relationships=rows,
        issue_summary=detail["issue_summary"],
        summary=detail["summary"],
        tier=repo.tier_out(detail["tier"]),
    )


@router.get("/relationships", response_model=RelationshipListOut)
def list_relationships(
    min_score: int | None = None,
    max_score: int | None = None,
    rel_type: str | None = None,
    figure_id: int | None = None,
    db: Session = Depends(get_db),
) -> RelationshipListOut:
    payloads = repo.all_relationship_payloads(db)
    if min_score is not None:
        payloads = [p for p in payloads if p.score >= min_score]
    if max_score is not None:
        payloads = [p for p in payloads if p.score <= max_score]
    if rel_type:
        payloads = [p for p in payloads if p.rel_type == rel_type]
    if figure_id:
        payloads = [p for p in payloads if figure_id in (p.source_id, p.target_id)]
    payloads.sort(key=lambda p: -p.score)
    return RelationshipListOut(relationships=payloads, count=len(payloads))


@router.get("/issues", response_model=IssueListOut)
def list_issues(db: Session = Depends(get_db)) -> IssueListOut:
    usage = repo.issue_usage(db)
    out = []
    for issue in repo.list_issues(db):
        used, avg = usage.get(issue.id, (0, None))
        out.append(
            IssueOut(
                id=issue.id,
                name=issue.name,
                category=issue.category,
                description=issue.description,
                default_weight=issue.default_weight,
                sort_order=issue.sort_order,
                usage_count=used,
                avg_score=round(avg, 1) if avg is not None else None,
            )
        )
    return IssueListOut(issues=out, count=len(out))


@router.get("/graph", response_model=GraphOut)
def graph(
    threshold: int = Query(default=0, ge=0, le=100),
    bloc: str | None = None,
    db: Session = Depends(get_db),
) -> GraphOut:
    return GraphOut(**repo.graph_payload(db, threshold=threshold, bloc=bloc))


@router.get("/matrix", response_model=MatrixOut)
def matrix(bloc: str | None = None, db: Session = Depends(get_db)) -> MatrixOut:
    return MatrixOut(**repo.matrix_payload(db, bloc=bloc))


@router.get("/stats", response_model=StatsOut)
def stats(db: Session = Depends(get_db)) -> StatsOut:
    return StatsOut(
        **repo.stats_payload(db),
        data_is_illustrative=settings.data_is_illustrative,
    )