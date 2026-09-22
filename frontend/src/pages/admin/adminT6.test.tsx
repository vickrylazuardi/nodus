/**
 * Admin T6 — the read-only admin pages.
 *
 * AdminIssues, AdminFigures and AdminRelationships have their own test files
 * (they carry T5 as well). This file covers the two pages T6 names explicitly
 * as having zero aria attributes: AdminAudit and AdminOverview.
 *
 * What jsdom can decide here: accessible names, table captions, heading
 * structure, and that every control is labelled. What it cannot: whether focus
 * is *visible*. That is a CSS outline from theme.css and was measured in a
 * real browser during the walkthrough.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminAudit } from "@/pages/admin/AdminAudit";
import { StatusProvider } from "@/pages/admin/status";
import { AdminOverview } from "@/pages/admin/AdminOverview";
import type { AuditEntry, Stats } from "@/lib/types";

/* ------------------------------------------------------------------ fixtures */

const AUDIT_ENTRIES: AuditEntry[] = [
  {
    id: 1,
    ts: "2026-09-20T10:30:00Z",
    actor: "admin",
    entity: "issue",
    entity_id: 3,
    action: "create",
    detail: "Koalisi & Bagi Kursi Kabinet",
  },
  {
    id: 2,
    ts: "2026-09-19T08:00:00Z",
    actor: "admin",
    entity: "relationship",
    entity_id: 7,
    action: "update",
    detail: null,
  },
];

const STATS: Stats = {
  totals: { figures: 58, relationships: 150, issues: 24, active_modifiers: 3 },
  tier_distribution: { "Blok Solid": 12, Netral: 20 },
  most_divisive_issues: [
    { issue_id: 1, issue: "Koalisi", n: 105, avg: 44, stddev: 18.2, spread: 90 },
  ],
  most_hostile: [{ pair: "Prabowo Subianto ↔ Anies Baswedan", score: -94 }],
  most_aligned: [{ pair: "Prabowo Subianto ↔ Gibran Rakabuming", score: 88 }],
  last_updated: "2026-09-20T00:00:00Z",
  data_is_illustrative: true,
};

/* -------------------------------------------------------------- fetch stub */

function installFetchStub() {
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
      if (path === "/api/admin/audit") {
        return Promise.resolve(json({ entries: AUDIT_ENTRIES, count: AUDIT_ENTRIES.length }));
      }
      if (path === "/api/stats") return Promise.resolve(json(STATS));
      if (path === "/api/health") {
        return Promise.resolve(
          json({
            status: "ok",
            counts: { figures: 58, relationships: 150, issues: 24 },
            data_is_illustrative: true,
          }),
        );
      }
      throw new Error(`fetch stub has no route for ${url}`);
    }),
  );
}

function renderWithProviders(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return render(
    <StatusProvider>
      <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
    </StatusProvider>,
  );
}

/* --------------------------------------------------------------------- T6 */

describe("T6 — AdminAudit", () => {
  beforeEach(() => {
    installFetchStub();
  });

  it("names the audit table with a caption", async () => {
    renderWithProviders(<AdminAudit />);
    // Was 0 aria attributes before this pass; the caption is the table's
    // accessible name.
    await screen.findByRole("table", { name: /riwayat perubahan data/i });
  });

  it("marks every column header as a column scope", async () => {
    renderWithProviders(<AdminAudit />);
    await screen.findByRole("table");
    for (const head of ["Waktu", "Entitas", "ID", "Aksi", "Detail"]) {
      expect(screen.getByRole("columnheader", { name: head })).toBeInTheDocument();
    }
  });

  it("renders each entry as a row with its own cells", async () => {
    renderWithProviders(<AdminAudit />);
    const table = await screen.findByRole("table");
    expect(within(table).getByText("Koalisi & Bagi Kursi Kabinet")).toBeInTheDocument();
    expect(within(table).getByText("issue")).toBeInTheDocument();
    expect(within(table).getByText("relationship")).toBeInTheDocument();
  });

  it("has no unlabelled controls", async () => {
    renderWithProviders(<AdminAudit />);
    await screen.findByRole("table");
    for (const control of screen.queryAllByRole("button")) {
      expect(control).toHaveAccessibleName();
    }
  });
});

describe("T6 — AdminOverview", () => {
  beforeEach(() => {
    installFetchStub();
  });

  it("names the divisive-issues table with a caption", async () => {
    renderWithProviders(<AdminOverview />);
    await screen.findByRole("table", { name: /isu yang paling memecah/i });
  });

  it("exposes the totals as a description list, term before description", async () => {
    renderWithProviders(<AdminOverview />);
    const term = await screen.findByText("Modifier aktif");
    const description = screen.getByText("3");

    expect(term.tagName).toBe("DT");
    expect(description.tagName).toBe("DD");
    // dt precedes dd within the same group: the reverse order is invalid and
    // some readers drop it.
    expect(term.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders every total with its label", async () => {
    renderWithProviders(<AdminOverview />);
    await screen.findByText("Modifier aktif");
    expect(screen.getByText("58")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
  });

  it("labels the navigation links", async () => {
    renderWithProviders(<AdminOverview />);
    await screen.findByText("Modifier aktif");
    expect(screen.getByRole("link", { name: "Kelola relasi" })).toHaveAttribute(
      "href",
      "/admin/relasi",
    );
    expect(screen.getByRole("link", { name: "Kelola figur" })).toHaveAttribute(
      "href",
      "/admin/figur",
    );
  });

  it("has no unlabelled controls", async () => {
    renderWithProviders(<AdminOverview />);
    await screen.findByText("Modifier aktif");
    for (const control of screen.queryAllByRole("button")) {
      expect(control).toHaveAccessibleName();
    }
    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveAccessibleName();
    }
  });
});
