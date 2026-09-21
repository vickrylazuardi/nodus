/**
 * API types. Hand-written to mirror the backend Pydantic schemas, but the
 * shapes are asserted against the generated OpenAPI document in
 * `src/lib/api-contract.test.ts` so drift is caught by CI.
 */

export type ScoreMode = "computed" | "manual" | "blended";

export interface Tier {
  key: string;
  label: string;
  description: string;
  color: string;
  threshold: number;
}

export interface TierList {
  tiers: Tier[];
  rel_types: string[];
  modifier_kinds: string[];
}

export interface FigureRef {
  id: number;
  name: string;
  party: string | null;
  bloc: string | null;
}

/** A figure reference carrying the score of the tie to it. */
export interface FigureScoreRef extends FigureRef {
  score: number;
}

export interface Figure {
  id: number;
  name: string;
  full_name: string | null;
  role: string | null;
  party: string | null;
  bloc: string | null;
  region: string | null;
  photo_url: string | null;
  bio: string | null;
  tags: string[];
  influence: number;
  is_active: boolean;
  relationship_count: number;
  avg_score: number;
  best_ally: FigureScoreRef | null;
  worst_rival: FigureScoreRef | null;
}

export interface FigureList {
  figures: Figure[];
  count: number;
}

export interface Issue {
  id: number;
  name: string;
  category: string | null;
  description: string | null;
  default_weight: number;
  sort_order: number;
  usage_count: number;
  avg_score: number | null;
}

export interface IssueList {
  issues: Issue[];
  count: number;
}

export interface IssueBreakdown {
  issue_id: number;
  issue: string;
  category: string | null;
  score: number;
  weight: number;
  contribution: number;
  stance: string | null;
  evidence_url: string | null;
}

export interface ModifierBreakdown {
  id: number | null;
  label: string;
  kind: string;
  value: number;
  effective_value: number;
  fade: number;
  expires_at: string | null;
  note: string | null;
  active: boolean;
}

export interface Relationship {
  id: number;
  source_id: number;
  target_id: number;
  source_name: string;
  target_name: string;
  source_party: string | null;
  target_party: string | null;
  source_bloc: string | null;
  target_bloc: string | null;
  rel_type: string;
  status: string;
  since: string | null;
  notes: string | null;
  source_url: string | null;
  updated_at: string | null;
  score: number;
  raw_score: number;
  base_score: number;
  issue_total_weight: number;
  modifier_total: number;
  score_mode: ScoreMode;
  manual_score: number;
  tier: Tier;
  issues: IssueBreakdown[];
  modifiers: ModifierBreakdown[];
}

export interface RelationshipList {
  relationships: Relationship[];
  count: number;
}

/**
 * A relationship as seen from one figure's profile.
 *
 * Relationships are undirected and stored once per pair, so `source`/`target`
 * do not mean "me" and "them". Always render `counterpart_*`: when the profile
 * figure is the row's target, `target_name` is the figure you are already
 * looking at.
 */
export interface FigureRelationship extends Relationship {
  counterpart_id: number;
  counterpart_name: string;
  counterpart_party: string | null;
  counterpart_bloc: string | null;
  is_source: boolean;
}

export interface IssueSummary {
  issue_id: number;
  issue: string;
  category: string | null;
  avg_score: number;
  weighted_avg: number;
  n: number;
  min: number;
  max: number;
}

export interface FigureSummary {
  relationship_count: number;
  avg_score: number;
  allies: Array<{ id: number; name: string; score: number; tier: Tier }>;
  rivals: Array<{ id: number; name: string; score: number; tier: Tier }>;
}

export interface FigureDetail {
  figure: Figure;
  relationships: FigureRelationship[];
  issue_summary: IssueSummary[];
  summary: FigureSummary;
  tier: Tier;
}

export interface GraphNode {
  id: number;
  label: string;
  full_name: string | null;
  role: string | null;
  party: string | null;
  bloc: string | null;
  influence: number;
  degree: number;
  tier: Tier;
  size: number;
}

export interface EdgeStyle {
  color: string;
  width: number;
  dashes: boolean;
  arrows: string;
  opacity: number;
}

export interface GraphEdge {
  id: number;
  from: number;
  to: number;
  score: number;
  label: string;
  rel_type: string;
  tier: Tier;
  style: EdgeStyle;
  title: string;
  top_issue: string | null;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  counts: { nodes: number; edges: number };
}

export interface MatrixCell {
  row: number;
  col: number;
  score: number | null;
  tier: Tier | null;
  relationship_id: number | null;
  top_issue: string | null;
  self: boolean;
}

export interface MatrixData {
  figures: FigureRef[];
  cells: MatrixCell[];
}

export interface Stats {
  totals: {
    figures: number;
    relationships: number;
    issues: number;
    active_modifiers: number;
  };
  tier_distribution: Record<string, number>;
  most_divisive_issues: Array<{
    issue_id: number;
    issue: string;
    n: number;
    avg: number;
    stddev: number;
    spread: number;
  }>;
  most_hostile: Array<{ pair: string; score: number }>;
  most_aligned: Array<{ pair: string; score: number }>;
  last_updated: string | null;
  data_is_illustrative: boolean;
}

export interface Health {
  status: string;
  counts: { figures: number; relationships: number; issues: number };
  data_is_illustrative: boolean;
}

export interface Token {
  access_token: string;
  token_type: string;
  expires_in: number;
  username: string;
}

export interface AuditEntry {
  id: number;
  ts: string;
  actor: string;
  entity: string;
  entity_id: number | null;
  action: string;
  detail: string | null;
}

export interface AuditList {
  entries: AuditEntry[];
  count: number;
}