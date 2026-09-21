/**
 * API contract test.
 *
 * Reads the backend's generated OpenAPI document and asserts that the
 * hand-written TypeScript interfaces still describe the same fields. Without
 * this, a backend schema change silently desynchronises the frontend types and
 * the breakage only shows up at runtime.
 *
 * The fetch happens inside `beforeAll` rather than at module scope: Vitest
 * evaluates `describe.skipIf` before any top-level await resolves, so a
 * module-scope fetch would always look like "backend down" and skip silently.
 *
 * When the backend is not reachable the suite fails loudly instead of skipping,
 * because a contract check that quietly passes is worse than no check. Set
 * PRISM_SKIP_CONTRACT=1 to skip deliberately (for example in a frontend-only CI job).
 */

import { beforeAll, describe, expect, it } from "vitest";

const OPENAPI_URL = process.env.PRISM_OPENAPI_URL ?? "http://127.0.0.1:8000/api/openapi.json";
const SKIP = process.env.PRISM_SKIP_CONTRACT === "1";

interface OpenApiSchema {
  properties?: Record<string, unknown>;
}

interface OpenApiDoc {
  components?: { schemas?: Record<string, OpenApiSchema> };
}

let schemas: Record<string, OpenApiSchema> | null = null;
let fetchError: string | null = null;

/**
 * Fields the frontend reads from each backend schema. Kept explicit rather
 * than derived, because this is the list we are asserting actually exists.
 */
const CONTRACT: Record<string, string[]> = {
  TierOut: ["key", "label", "description", "color", "threshold"],
  FigureOut: [
    "id",
    "name",
    "full_name",
    "role",
    "party",
    "bloc",
    "region",
    "bio",
    "tags",
    "influence",
    "is_active",
    "relationship_count",
    "avg_score",
    "best_ally",
    "worst_rival",
  ],
  FigureScoreRef: ["id", "name", "party", "bloc", "score"],
  IssueOut: [
    "id",
    "name",
    "category",
    "description",
    "default_weight",
    "sort_order",
    "usage_count",
    "avg_score",
  ],
  IssueBreakdownOut: [
    "issue_id",
    "issue",
    "category",
    "score",
    "weight",
    "contribution",
    "stance",
    "evidence_url",
  ],
  ModifierBreakdownOut: [
    "id",
    "label",
    "kind",
    "value",
    "effective_value",
    "fade",
    "expires_at",
    "note",
    "active",
  ],
  RelationshipOut: [
    "id",
    "source_id",
    "target_id",
    "source_name",
    "target_name",
    "rel_type",
    "notes",
    "score",
    "base_score",
    "modifier_total",
    "score_mode",
    "manual_score",
    "tier",
    "issues",
    "modifiers",
  ],
  FigureDetailOut: ["figure", "relationships", "issue_summary", "summary", "tier"],
  GraphEdgeOut: ["id", "score", "label", "rel_type", "tier", "style", "title", "top_issue"],
  GraphNodeOut: ["id", "label", "role", "party", "bloc", "influence", "degree", "tier", "size"],
  MatrixCellOut: ["row", "col", "score", "tier", "relationship_id", "top_issue", "self"],
  StatsOut: [
    "totals",
    "tier_distribution",
    "most_divisive_issues",
    "most_hostile",
    "most_aligned",
    "last_updated",
    "data_is_illustrative",
  ],
  TokenOut: ["access_token", "token_type", "expires_in", "username"],
  AuditEntryOut: ["id", "ts", "actor", "entity", "entity_id", "action", "detail"],
};

describe.runIf(!SKIP)("API contract", () => {
  beforeAll(async () => {
    try {
      // No AbortController here: jsdom's AbortSignal is not an instance of the
      // one undici's fetch expects, so passing a signal throws. Race a timer
      // against the request instead.
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timed out after 5s")), 5000),
      );
      const response = await Promise.race([fetch(OPENAPI_URL), timeout]);
      if (!response.ok) {
        fetchError = `HTTP ${response.status}`;
        return;
      }
      const doc = (await response.json()) as OpenApiDoc;
      schemas = doc.components?.schemas ?? null;
      if (!schemas) fetchError = "OpenAPI document has no components.schemas";
    } catch (error) {
      fetchError = (error as Error).message;
    }
  });

  it("reaches the backend to read its schema", () => {
    expect(
      fetchError,
      `Could not read ${OPENAPI_URL}. Start the backend (uv run uvicorn app.main:app) ` +
        `or set PRISM_SKIP_CONTRACT=1 to skip this suite deliberately.`,
    ).toBeNull();
    expect(schemas).not.toBeNull();
  });

  it("exposes every schema the frontend depends on", () => {
    const missing = Object.keys(CONTRACT).filter((name) => !schemas?.[name]);
    expect(missing, `backend is missing schemas: ${missing.join(", ")}`).toEqual([]);
  });

  it.each(Object.entries(CONTRACT))("%s has all expected fields", (schemaName, fields) => {
    const schema = schemas?.[schemaName];
    expect(schema, `${schemaName} not found in OpenAPI`).toBeDefined();
    const actual = Object.keys(schema?.properties ?? {});
    const missing = fields.filter((field) => !actual.includes(field));
    expect(missing, `${schemaName} is missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("serialises graph edges as from/to for the graph renderer", () => {
    const edge = schemas?.GraphEdgeOut;
    expect(edge).toBeDefined();
    const properties = Object.keys(edge?.properties ?? {});
    // The Python field is source/target with a serialization alias of from/to,
    // and the canvas renderer reads from/to.
    expect(properties).toContain("from");
    expect(properties).toContain("to");
  });
});
