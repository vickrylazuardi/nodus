/**
 * Accessibility contract for the public routes.
 *
 * These assert the parts of A1-A4 that jsdom can actually decide:
 *   - T1: exactly one <h1> per public route (jsdom can count elements)
 *   - T4: live regions exist and their text tracks the filter (jsdom can fire events)
 *
 * T2 (horizontal overflow) and T3 (44px hit areas) depend on real layout, which
 * jsdom does not implement — every getBoundingClientRect() here returns zeros.
 * They are asserted structurally in `layoutContract.test.tsx` and measured in a
 * real browser; this file does not pretend otherwise.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import type { Figure, FigureDetail, FigureRef, Issue, MatrixCell, Tier } from "@/lib/types";

/* ------------------------------------------------------------------ fixtures */

const TIERS: Tier[] = [
  {
    key: "solid_bloc",
    label: "Blok Solid",
    description: "Sekutu penuh",
    color: "#0C4232",
    threshold: 80,
  },
  {
    key: "cordial",
    label: "Netral Positif",
    description: "Umumnya sejalan",
    color: "#276650",
    threshold: 0,
  },
  {
    key: "hostile",
    label: "Bermusuhan",
    description: "Sering berselisih",
    color: "#6E1913",
    threshold: -80,
  },
];

function makeFigure(id: number, name: string): Figure {
  return {
    id,
    name,
    full_name: `${name} Lengkap`,
    role: "Anggota",
    party: "Partai Contoh",
    bloc: "Koalisi Contoh",
    region: "Nasional",
    photo_url: null,
    bio: null,
    tags: [],
    influence: 50,
    is_active: true,
    relationship_count: 2,
    avg_score: 12,
    best_ally: null,
    worst_rival: null,
  };
}

const FIGURES: Figure[] = [
  makeFigure(1, "Prabowo Subianto"),
  makeFigure(2, "Anies Baswedan"),
  makeFigure(3, "Ganjar Pranowo"),
];

const ISSUES: Issue[] = [
  {
    id: 1,
    name: "Koalisi",
    category: "Politik",
    description: "Sikap koalisi",
    default_weight: 1.5,
    sort_order: 1,
    usage_count: 3,
    avg_score: 20,
  },
];

const FIGURE_REFS: FigureRef[] = FIGURES.map((f) => ({
  id: f.id,
  name: f.name,
  party: f.party,
  bloc: f.bloc,
}));

/** Only the cells the matrix page reads: one mapped pair plus the diagonal. */
const MATRIX_CELLS: MatrixCell[] = [
  { row: 1, col: 1, score: null, tier: null, relationship_id: null, top_issue: null, self: true },
  { row: 1, col: 2, score: -40, tier: TIERS[2]!, relationship_id: 7, top_issue: "Koalisi", self: false },
  { row: 2, col: 2, score: null, tier: null, relationship_id: null, top_issue: null, self: true },
];

const FIGURE_DETAIL: FigureDetail = {
  figure: FIGURES[0]!,
  relationships: [
    {
      id: 7,
      source_id: 1,
      target_id: 2,
      source_name: "Prabowo Subianto",
      target_name: "Anies Baswedan",
      source_party: "Gerindra",
      target_party: "Independen",
      source_bloc: "KIM",
      target_bloc: "Perubahan",
      rel_type: "opposition",
      status: "aktif",
      since: null,
      notes: null,
      source_url: null,
      updated_at: null,
      score: -40,
      raw_score: -40,
      base_score: -35,
      issue_total_weight: 1,
      modifier_total: -5,
      score_mode: "computed",
      manual_score: 0,
      tier: TIERS[2]!,
      issues: [
        {
          issue_id: 1,
          issue: "Koalisi",
          category: "Politik",
          score: -40,
          weight: 1,
          contribution: -40,
          stance: null,
          evidence_url: "https://contoh.id/sumber",
        },
      ],
      modifiers: [],
      counterpart_id: 2,
      counterpart_name: "Anies Baswedan",
      counterpart_party: "Independen",
      counterpart_bloc: "Perubahan",
      is_source: true,
    },
  ],
  issue_summary: [
    {
      issue_id: 1,
      issue: "Koalisi",
      category: "Politik",
      avg_score: -40,
      weighted_avg: -40,
      n: 1,
      min: -40,
      max: -40,
    },
  ],
  summary: {
    relationship_count: 1,
    avg_score: -40,
    allies: [],
    rivals: [{ id: 2, name: "Anies Baswedan", score: -40, tier: TIERS[2]! }],
  },
  tier: TIERS[2]!,
};

/* -------------------------------------------------------------- fetch stub */

/**
 * Routes on the request path rather than a URL matcher: the app fetches
 * relative paths ("/api/figures") and jsdom's fetch would reject those as
 * invalid absolute URLs before any mock could see them.
 */
function installFetchStub(): void {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const path = url.split("?")[0] ?? "";

      if (/\/api\/figures\/\d+$/.test(path)) return Promise.resolve(json(FIGURE_DETAIL));
      if (path.endsWith("/api/figures")) {
        return Promise.resolve(json({ figures: FIGURES, count: FIGURES.length }));
      }
      if (path.endsWith("/api/tiers")) {
        return Promise.resolve(json({ tiers: TIERS, rel_types: [], modifier_kinds: [] }));
      }
      if (path.endsWith("/api/issues")) {
        return Promise.resolve(json({ issues: ISSUES, count: ISSUES.length }));
      }
      if (path.endsWith("/api/matrix")) {
        return Promise.resolve(json({ figures: FIGURE_REFS, cells: MATRIX_CELLS }));
      }
      // An edge-less graph keeps RelationshipGraph (canvas) out of these tests;
      // MapPage renders its "no relationships" state instead.
      if (path.endsWith("/api/graph")) {
        return Promise.resolve(
          json({ nodes: [], edges: [], counts: { nodes: FIGURES.length, edges: 0 } }),
        );
      }
      if (path.endsWith("/api/stats")) {
        return Promise.resolve(
          json({
            totals: { figures: 3, relationships: 1, issues: 1, active_modifiers: 0 },
            tier_distribution: { "Blok Solid": 1, "Netral Positif": 1, Bermusuhan: 1 },
            most_divisive_issues: [],
            most_hostile: [],
            most_aligned: [],
            last_updated: "2026-09-20T00:00:00Z",
            data_is_illustrative: true,
          }),
        );
      }
      throw new Error(`fetch stub has no route for ${url}`);
    }),
  );
}

function renderRoute(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/* --------------------------------------------------------------------- T1 */

const PUBLIC_ROUTES = ["/peta", "/figur", "/matriks", "/isu", "/statistik", "/cara-baca"];

describe("T1 — every public route has exactly one <h1>", () => {
  beforeEach(() => {
    installFetchStub();
  });

  it.each(PUBLIC_ROUTES)("%s renders exactly one <h1>", async (path) => {
    renderRoute(path);
    // Wait for the route's own content, not the loading state: the h1 lives in
    // the page panel, which only exists once its query resolves.
    await waitFor(() => expect(document.querySelectorAll("h1").length).toBeGreaterThan(0));
    expect(document.querySelectorAll("h1")).toHaveLength(1);
  });

  it.each(PUBLIC_ROUTES)("%s names its page in that <h1>", async (path) => {
    renderRoute(path);
    await waitFor(() => expect(document.querySelectorAll("h1").length).toBe(1));
    expect(document.querySelector("h1")?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it("/figur/1 keeps its own single <h1> (the figure's name)", async () => {
    renderRoute("/figur/1");
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument());
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Prabowo Subianto");
  });

  it("the outline root precedes every h2 on a public route", async () => {
    renderRoute("/figur");
    await waitFor(() => expect(document.querySelectorAll("h1")).toHaveLength(1));
    const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"));
    expect(headings[0]?.tagName).toBe("H1");
  });
});

/* --------------------------------------------------------------------- T4 */

describe("T4 — live regions announce async state", () => {
  beforeEach(() => {
    installFetchStub();
  });

  it("/figur has a polite live region", async () => {
    renderRoute("/figur");
    await waitFor(() => expect(document.querySelectorAll("[aria-live]").length).toBeGreaterThan(0));
    expect(document.querySelector('[aria-live="polite"]')).toBeInTheDocument();
  });

  it("/matriks has a polite live region", async () => {
    renderRoute("/matriks");
    await waitFor(() => expect(document.querySelectorAll("[aria-live]").length).toBeGreaterThan(0));
    expect(document.querySelector('[aria-live="polite"]')).toBeInTheDocument();
  });

  it("/figur announces the full count before any filter is applied", async () => {
    renderRoute("/figur");
    const region = await screen.findByText(/Menampilkan seluruh 3 figur/);
    expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("/figur updates the announcement when the filter narrows the list", async () => {
    const user = userEvent.setup();
    renderRoute("/figur");
    await screen.findByText(/Menampilkan seluruh 3 figur/);

    await user.type(screen.getByLabelText("Cari figur"), "Anies");

    const region = await screen.findByText(/Menampilkan 1 dari 3 figur/);
    expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("/figur returns to the full count when the filter is cleared", async () => {
    const user = userEvent.setup();
    renderRoute("/figur");
    const input = await screen.findByLabelText("Cari figur");

    await user.type(input, "Anies");
    await screen.findByText(/Menampilkan 1 dari 3 figur/);

    await user.clear(input);
    await screen.findByText(/Menampilkan seluruh 3 figur/);
  });

  it("/figur announces an empty result honestly instead of going silent", async () => {
    const user = userEvent.setup();
    renderRoute("/figur");
    const input = await screen.findByLabelText("Cari figur");

    await user.type(input, "zzzz");
    const region = await screen.findByText(/Menampilkan 0 dari 3 figur/);
    expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("the loading state is a polite live region", async () => {
    // Never resolves, so the pending branch stays mounted.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderRoute("/figur");

    const status = await screen.findByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("the error state is announced as an alert", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ detail: "Basis data tidak tersedia." }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );
    renderRoute("/figur");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Gagal memuat.");
    expect(alert).toHaveTextContent("Basis data tidak tersedia.");
  });

  it("the result count is visible text, not a screen-reader-only duplicate", async () => {
    renderRoute("/figur");
    const region = await screen.findByText(/Menampilkan seluruh 3 figur/);
    expect(region).not.toHaveClass("sr-only");
    expect(region).toBeVisible();
  });

  it("the matrix count line is inside the page's live region", async () => {
    renderRoute("/matriks");
    const region = await screen.findByText(/Menampilkan seluruh 3 figur/);
    const panel = region.closest("section");
    expect(panel).not.toBeNull();
    expect(within(panel as HTMLElement).getByRole("heading", { level: 1 })).toHaveTextContent(
      "Matriks relasi",
    );
  });
});
