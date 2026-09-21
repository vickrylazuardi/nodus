"""Pydantic v2 schemas: the API contract.

Separate from the ORM models so the wire format can evolve independently, and
so every response is documented in the generated OpenAPI spec.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


# --------------------------------------------------------------------------- tiers
class TierOut(BaseModel):
    key: str
    label: str
    description: str
    color: str
    threshold: int


class TierListOut(BaseModel):
    tiers: list[TierOut]
    rel_types: list[str]
    modifier_kinds: list[str]


# --------------------------------------------------------------------------- issues
class IssueBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    category: str | None = Field(default=None, max_length=80)
    description: str | None = None
    default_weight: float = Field(default=1.0, ge=0, le=10)
    sort_order: int = 0


class IssueCreate(IssueBase):
    pass


class IssueUpdate(IssueBase):
    pass


class IssueOut(IssueBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    usage_count: int = 0
    avg_score: float | None = None


class IssueListOut(BaseModel):
    issues: list[IssueOut]
    count: int


# --------------------------------------------------------------------------- figures
class FigureBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    full_name: str | None = Field(default=None, max_length=200)
    role: str | None = Field(default=None, max_length=160)
    party: str | None = Field(default=None, max_length=120)
    bloc: str | None = Field(default=None, max_length=120)
    region: str | None = Field(default=None, max_length=120)
    photo_url: str | None = None
    bio: str | None = None
    tags: list[str] = Field(default_factory=list)
    influence: int = Field(default=50, ge=0, le=100)
    is_active: bool = True


class FigureCreate(FigureBase):
    pass


class FigureUpdate(FigureBase):
    pass


class FigureRef(BaseModel):
    """Compact figure reference used inside relationship payloads."""

    id: int
    name: str
    party: str | None = None
    bloc: str | None = None


class FigureScoreRef(FigureRef):
    """A figure reference plus the score of the tie to it.

    Separate from FigureRef because the matrix payload uses bare references,
    where a score would be meaningless.
    """

    score: int


class FigureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    full_name: str | None
    role: str | None
    party: str | None
    bloc: str | None
    region: str | None
    photo_url: str | None
    bio: str | None
    tags: list[str]
    influence: int
    is_active: bool
    # Derived, filled by the service layer.
    relationship_count: int = 0
    avg_score: int = 0
    best_ally: FigureScoreRef | None = None
    worst_rival: FigureScoreRef | None = None


class FigureListOut(BaseModel):
    figures: list[FigureOut]
    count: int


# --------------------------------------------------------------------------- scoring payloads
class IssueBreakdownOut(BaseModel):
    issue_id: int
    issue: str
    category: str | None
    score: float
    weight: float
    contribution: float
    stance: str | None
    evidence_url: str | None


class ModifierBreakdownOut(BaseModel):
    id: int | None
    label: str
    kind: str
    value: float
    effective_value: float
    fade: float
    expires_at: datetime | None
    note: str | None
    active: bool = True


# --------------------------------------------------------------------------- relationships
class RelationshipBase(BaseModel):
    source_id: int
    target_id: int
    rel_type: str = "political"
    status: str = "active"
    score_mode: str = Field(default="computed", pattern="^(computed|manual|blended)$")
    manual_score: int = Field(default=0, ge=-100, le=100)
    since: str | None = Field(default=None, max_length=40)
    notes: str | None = None
    source_url: str | None = None

    @field_validator("target_id")
    @classmethod
    def _distinct(cls, v: int, info) -> int:
        if info.data.get("source_id") == v:
            raise ValueError("source_id and target_id must differ")
        return v


class RelationshipCreate(RelationshipBase):
    pass


class RelationshipUpdate(RelationshipBase):
    pass


class RelationshipOut(BaseModel):
    id: int
    source_id: int
    target_id: int
    source_name: str
    target_name: str
    source_party: str | None = None
    target_party: str | None = None
    source_bloc: str | None = None
    target_bloc: str | None = None
    rel_type: str
    status: str
    since: str | None
    notes: str | None
    source_url: str | None
    updated_at: datetime | None

    score: int
    raw_score: float
    base_score: float
    issue_total_weight: float
    modifier_total: float
    score_mode: str
    manual_score: int
    tier: TierOut
    issues: list[IssueBreakdownOut]
    modifiers: list[ModifierBreakdownOut]


class RelationshipListOut(BaseModel):
    relationships: list[RelationshipOut]
    count: int


class FigureRelationshipOut(RelationshipOut):
    """A relationship as seen from one figure's profile.

    Relationships are undirected and stored once per pair, so `source`/`target`
    do not mean "me" and "them". A profile must not render `target_name`
    unconditionally: when the profile's figure happens to be the row's target,
    that field IS the figure you are already looking at, and the row prints its
    own name. These fields resolve the counterpart once, on the server, so the
    name, initials, party, and bloc cannot disagree with each other.
    """

    counterpart_id: int
    counterpart_name: str
    counterpart_party: str | None = None
    counterpart_bloc: str | None = None
    # True when the profile's figure is the row's target, kept for debugging.
    is_source: bool


class RelationshipIssueIn(BaseModel):
    issue_id: int
    score: int = Field(ge=-100, le=100)
    weight: float = Field(default=1.0, ge=0, le=10)
    stance: str | None = None
    evidence_url: str | None = None


class ModifierIn(BaseModel):
    label: str = Field(min_length=1, max_length=240)
    value: int = Field(ge=-100, le=100)
    kind: str = "event"
    active: bool = True
    expires_at: datetime | None = None
    note: str | None = None


# --------------------------------------------------------------------------- figure detail
class IssueSummaryOut(BaseModel):
    issue_id: int
    issue: str
    category: str | None
    avg_score: float
    weighted_avg: float
    n: int
    min: float
    max: float


class FigureSummaryOut(BaseModel):
    relationship_count: int
    avg_score: int
    allies: list[dict]
    rivals: list[dict]


class FigureDetailOut(BaseModel):
    figure: FigureOut
    relationships: list[FigureRelationshipOut]
    issue_summary: list[IssueSummaryOut]
    summary: FigureSummaryOut
    tier: TierOut


# --------------------------------------------------------------------------- graph / matrix
class GraphNodeOut(BaseModel):
    id: int
    label: str
    full_name: str | None
    role: str | None
    party: str | None
    bloc: str | None
    influence: int
    degree: int
    tier: TierOut
    size: float


class EdgeStyleOut(BaseModel):
    color: str
    width: float
    dashes: bool
    arrows: str
    opacity: float


class GraphEdgeOut(BaseModel):
    id: int
    source: int = Field(serialization_alias="from")
    target: int = Field(serialization_alias="to")
    score: int
    label: str
    rel_type: str
    tier: TierOut
    style: EdgeStyleOut
    title: str
    top_issue: str | None

    model_config = ConfigDict(populate_by_name=True)


class GraphOut(BaseModel):
    nodes: list[GraphNodeOut]
    edges: list[GraphEdgeOut]
    counts: dict[str, int]


class MatrixCellOut(BaseModel):
    row: int
    col: int
    score: int | None = None
    tier: TierOut | None = None
    relationship_id: int | None = None
    top_issue: str | None = None
    self: bool = False


class MatrixOut(BaseModel):
    figures: list[FigureRef]
    cells: list[MatrixCellOut]


# --------------------------------------------------------------------------- stats
class StatsOut(BaseModel):
    totals: dict[str, int]
    tier_distribution: dict[str, int]
    most_divisive_issues: list[dict]
    most_hostile: list[dict]
    most_aligned: list[dict]
    last_updated: datetime | None
    data_is_illustrative: bool


# --------------------------------------------------------------------------- auth
class LoginIn(BaseModel):
    username: str = "admin"
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    username: str


class PasswordChangeIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8)


class AuditEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ts: datetime
    actor: str
    entity: str
    entity_id: int | None
    action: str
    detail: str | None


class AuditListOut(BaseModel):
    entries: list[AuditEntryOut]
    count: int


class HealthOut(BaseModel):
    status: str
    counts: dict[str, int]
    data_is_illustrative: bool
