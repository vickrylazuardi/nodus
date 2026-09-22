/**
 * AdminRelationships — T5 (react-hook-form + zod) and T6 (ARIA) contract.
 *
 * This is the file the retry brief singles out, so its tests pin the findings
 * from 05-rhf-findings.md directly:
 *
 *   - `zodResolver` with `z.record(z.string(), rowSchema)` drives the per-row
 *     score editors.
 *   - `trigger(["rows.<id>.score", "rows.<id>.weight"])` validates one row and
 *     surfaces errors even though the form was never submitted — the finding
 *     the previous attempt left unresolved. Verified here.
 *   - A cleared number input stores NaN and must read as Indonesian copy.
 *   - `NaN` inside a `z.record` lands at `errors.rows.<id>.<field>`, which is
 *     where the inline `aria-describedby` points.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminRelationships } from "@/pages/admin/AdminRelationships";
import { StatusProvider } from "@/pages/admin/status";
import type { Issue, Relationship, Tier } from "@/lib/types";

/* ------------------------------------------------------------------ fixtures */

const TIER: Tier = {
  key: "cordial",
  label: "Netral Positif",
  description: "Umumnya sejalan",
  color: "#3F7F6C",
  threshold: 0,
};

const ISSUES: Issue[] = [
  {
    id: 1,
    name: "Koalisi",
    category: "Politik",
    description: null,
    default_weight: 1.5,
    sort_order: 1,
    usage_count: 3,
    avg_score: 20,
  },
  {
    id: 2,
    name: "Ekonomi",
    category: "Ekonomi",
    description: null,
    default_weight: 1,
    sort_order: 2,
    usage_count: 0,
    avg_score: null,
  },
];

function makeRelationship(overrides: Partial<Relationship> = {}): Relationship {
  return {
    id: 7,
    source_id: 1,
    target_id: 2,
    source_name: "Prabowo Subianto",
    target_name: "Anies Baswedan",
    source_party: "Gerindra",
    target_party: null,
    source_bloc: "KIM",
    target_bloc: null,
    rel_type: "political",
    status: "active",
    since: null,
    notes: null,
    source_url: null,
    updated_at: null,
    score: 12,
    raw_score: 12,
    base_score: 12,
    issue_total_weight: 1.5,
    modifier_total: 0,
    score_mode: "computed",
    manual_score: 0,
    tier: TIER,
    issues: [
      {
        issue_id: 1,
        issue: "Koalisi",
        category: "Politik",
        score: 40,
        weight: 1.5,
        contribution: 40,
        stance: "Mendukung",
        evidence_url: null,
      },
    ],
    modifiers: [],
    ...overrides,
  };
}

const RELATIONSHIPS: Relationship[] = [
  makeRelationship(),
  makeRelationship({
    id: 8,
    source_id: 1,
    target_id: 3,
    source_name: "Prabowo Subianto",
    target_name: "Ganjar Pranowo",
    issues: [],
  }),
];

const FIGURES = [
  {
    id: 1,
    name: "Prabowo Subianto",
    full_name: null,
    role: null,
    party: null,
    bloc: null,
    region: null,
    photo_url: null,
    bio: null,
    tags: [],
    influence: 90,
    is_active: true,
    relationship_count: 2,
    avg_score: 12,
    best_ally: null,
    worst_rival: null,
  },
  {
    id: 2,
    name: "Anies Baswedan",
    full_name: null,
    role: null,
    party: null,
    bloc: null,
    region: null,
    photo_url: null,
    bio: null,
    tags: [],
    influence: 70,
    is_active: true,
    relationship_count: 1,
    avg_score: 12,
    best_ally: null,
    worst_rival: null,
  },
  {
    id: 3,
    name: "Ganjar Pranowo",
    full_name: null,
    role: null,
    party: null,
    bloc: null,
    region: null,
    photo_url: null,
    bio: null,
    tags: [],
    influence: 65,
    is_active: true,
    relationship_count: 1,
    avg_score: 12,
    best_ally: null,
    worst_rival: null,
  },
];

/* -------------------------------------------------------------- fetch stub */

interface RecordedCall {
  method: string;
  path: string;
  body: unknown;
}

function installFetchStub(overrides: Partial<Record<string, () => Response>> = {}) {
  const calls: RecordedCall[] = [];

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const path = url.split("?")[0] ?? "";
      const method = init?.method ?? "GET";
      calls.push({
        method,
        path,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });

      const override = overrides[method];
      if (override) return Promise.resolve(override());

      if (path === "/api/relationships" && method === "GET") {
        return Promise.resolve(
          json({ relationships: RELATIONSHIPS, count: RELATIONSHIPS.length }),
        );
      }
      if (path === "/api/figures" && method === "GET") {
        return Promise.resolve(json({ figures: FIGURES, count: FIGURES.length }));
      }
      if (path === "/api/issues" && method === "GET") {
        return Promise.resolve(json({ issues: ISSUES, count: ISSUES.length }));
      }
      /*
       * The relationship-kind and modifier-kind lists come from the API rather
       * than a literal in the component. `alliance` is included deliberately:
       * 25 of the 150 seeded relationships use it, and the old hardcoded list
       * in the component omitted it, so the dropdown could not express the kind
       * of a fifth of the data.
       */
      if (path === "/api/tiers" && method === "GET") {
        return Promise.resolve(
          json({
            tiers: [],
            rel_types: ["political", "coalition", "alliance", "family", "business", "party", "government"],
            modifier_kinds: [
              "event",
              "scandal",
              "deal",
              "betrayal",
              "support",
              "endorsement",
              "legal",
            ],
          }),
        );
      }
      if (path === "/api/admin/relationships" && method === "POST") {
        return Promise.resolve(json({ id: 9 }, 201));
      }
      if (/^\/api\/admin\/relationships\/\d+\/issues$/.test(path) && method === "POST") {
        return Promise.resolve(json({ ok: true }));
      }
      if (/^\/api\/admin\/relationships\/\d+\/issues\/\d+$/.test(path) && method === "DELETE") {
        return Promise.resolve(json({ ok: true }));
      }
      if (/^\/api\/admin\/relationships\/\d+\/modifiers$/.test(path) && method === "POST") {
        return Promise.resolve(json({ id: 5 }, 201));
      }
      if (/^\/api\/admin\/modifiers\/\d+$/.test(path) && method === "DELETE") {
        return Promise.resolve(json({ ok: true }));
      }
      if (/^\/api\/admin\/relationships\/\d+$/.test(path) && method === "DELETE") {
        return Promise.resolve(json({ ok: true }));
      }
      throw new Error(`fetch stub has no route for ${method} ${url}`);
    }),
  );

  return calls;
}

function renderAdminRelationships() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <StatusProvider>
      <QueryClientProvider client={client}>
      <AdminRelationships />
    </QueryClientProvider>
    </StatusProvider>,
  );
}

/** Opens the score editor for the first relationship and waits for its rows. */
async function openScoreEditor() {
  const user = userEvent.setup();
  renderAdminRelationships();
  await user.click(
    await screen.findByRole("button", {
      name: "Ubah skor Prabowo Subianto dan Anies Baswedan",
    }),
  );
  await screen.findByRole("heading", { name: /Prabowo Subianto ↔ Anies Baswedan/ });
  return user;
}

/* --------------------------------------------------------------------- T5 */

describe("T5 — AdminRelationships score editor validates per row", () => {
  beforeEach(() => {
    installFetchStub();
  });

  /*
   * The finding left unresolved by the first attempt: does a row-scoped
   * `trigger` surface errors before the whole form was ever submitted?
   * Verified here: yes.
   */
  it("surfaces a per-row error from a row-scoped save, before any submit", async () => {
    const user = await openScoreEditor();

    const weight = screen.getByLabelText("Bobot untuk Koalisi");
    await user.clear(weight);
    await user.click(screen.getByRole("button", { name: "Simpan isu Koalisi" }));

    const inline = await waitFor(() => {
      const el = document.getElementById("rel-issue-1-weight-error");
      if (!el) throw new Error("inline weight error not rendered yet");
      return el;
    });
    expect(inline).toHaveTextContent("Isi bobot dengan angka.");
    expect(inline.textContent).not.toMatch(/nan|expected/i);

    // The error path is errors.rows.<id>.<field>, and the input points at it.
    expect(weight).toHaveAttribute("aria-invalid", "true");
    expect(weight).toHaveAttribute("aria-describedby", "rel-issue-1-weight-error");

    // And the summary repeats it, labelled with the issue name, linking to the
    // exact input.
    const summary = await screen.findByRole("alert");
    const link = within(summary).getByRole("link", { name: "Koalisi: Isi bobot dengan angka." });
    expect(link).toHaveAttribute("href", "#rel-issue-1-weight");
    expect(summary).toHaveFocus();
  });

  it("validates only the row being saved, not its siblings", async () => {
    const user = await openScoreEditor();
    // The editor opens collapsed to the issues that already carry a score;
    // "Buka semua" reveals the rest.
    await user.click(screen.getByRole("button", { name: /Buka semua/ }));

    // Break the second row's weight, then save the first row: the first save
    // must succeed and the second row must stay untouched.
    const secondWeight = screen.getByLabelText("Bobot untuk Ekonomi");
    await user.clear(secondWeight);

    const firstWeight = screen.getByLabelText("Bobot untuk Koalisi");
    await user.clear(firstWeight);
    await user.type(firstWeight, "2");
    await user.click(screen.getByRole("button", { name: "Simpan isu Koalisi" }));

    // No error for the untouched, broken sibling row.
    expect(document.getElementById("rel-issue-2-weight-error")).toBeNull();
    expect(secondWeight).not.toHaveAttribute("aria-invalid");
  });

  it("rejects a weight above the backend's maximum on that row", async () => {
    const user = await openScoreEditor();

    const weight = screen.getByLabelText("Bobot untuk Koalisi");
    await user.clear(weight);
    await user.type(weight, "11");
    await user.click(screen.getByRole("button", { name: "Simpan isu Koalisi" }));

    const inline = await waitFor(() => {
      const el = document.getElementById("rel-issue-1-weight-error");
      if (!el) throw new Error("inline weight error not rendered yet");
      return el;
    });
    expect(inline).toHaveTextContent("Bobot maksimal 10.");
  });

  it("never calls the API when a row fails validation", async () => {
    const calls = installFetchStub();
    const user = userEvent.setup();
    renderAdminRelationships();
    await user.click(
      await screen.findByRole("button", {
        name: "Ubah skor Prabowo Subianto dan Anies Baswedan",
      }),
    );
    await screen.findByRole("heading", { name: /Prabowo Subianto ↔ Anies Baswedan/ });

    await user.clear(screen.getByLabelText("Bobot untuk Koalisi"));
    await user.click(screen.getByRole("button", { name: "Simpan isu Koalisi" }));

    await screen.findByRole("alert");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("sends the exact upsert payload on a valid row save", async () => {
    const calls = installFetchStub();
    const user = await openScoreEditor();

    const weight = screen.getByLabelText("Bobot untuk Koalisi");
    await user.clear(weight);
    await user.type(weight, "2.5");
    const stance = screen.getByLabelText("Posisi atau sikap untuk Koalisi");
    await user.clear(stance);
    await user.type(stance, "  Mendukung penuh  ");
    await user.click(screen.getByRole("button", { name: "Simpan isu Koalisi" }));

    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.method === "POST" && c.path === "/api/admin/relationships/7/issues",
        ),
      ).toBe(true),
    );
    const post = calls.find(
      (c) => c.method === "POST" && c.path === "/api/admin/relationships/7/issues",
    );
    // Shape pinned by api-contract.test.ts: issue_id, score, weight, trimmed
    // stance (blank becomes null).
    expect(post?.body).toEqual({
      issue_id: 1,
      score: 40,
      weight: 2.5,
      stance: "Mendukung penuh",
    });
  });

  it("sends a blank stance as null", async () => {
    const calls = installFetchStub();
    const user = await openScoreEditor();

    const stance = screen.getByLabelText("Posisi atau sikap untuk Koalisi");
    await user.clear(stance);
    await user.click(screen.getByRole("button", { name: "Simpan isu Koalisi" }));

    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/issues"))).toBe(true),
    );
    const post = calls.find((c) => c.method === "POST" && c.path.endsWith("/issues"));
    expect(post?.body).toMatchObject({ issue_id: 1, stance: null });
  });

  it("sends the exact modifier payload, with the date at end of day UTC", async () => {
    const calls = installFetchStub();
    const user = await openScoreEditor();

    await user.type(screen.getByLabelText(/^Peristiwa baru/), "  PDI-P bergabung  ");
    const value = screen.getByLabelText(/^Nilai/);
    await user.clear(value);
    await user.type(value, "25");
    await user.selectOptions(screen.getByLabelText(/^Jenis/), "deal");
    const expiry = screen.getByLabelText(/^Kedaluwarsa/);
    await user.clear(expiry);
    await user.type(expiry, "2026-12-31");
    await user.click(screen.getByRole("button", { name: "Tambah" }));

    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.method === "POST" && c.path === "/api/admin/relationships/7/modifiers",
        ),
      ).toBe(true),
    );
    const post = calls.find(
      (c) => c.method === "POST" && c.path === "/api/admin/relationships/7/modifiers",
    );
    expect(post?.body).toEqual({
      label: "PDI-P bergabung",
      value: 25,
      kind: "deal",
      expires_at: "2026-12-31T23:59:59+00:00",
    });
  });

  it("rejects an empty modifier label with inline copy and a summary", async () => {
    const user = await openScoreEditor();

    await user.click(screen.getByRole("button", { name: "Tambah" }));

    const inline = await waitFor(() => {
      const el = document.getElementById("modifier-label-error");
      if (!el) throw new Error("inline label error not rendered yet");
      return el;
    });
    expect(inline).toHaveTextContent("Nama peristiwa wajib diisi.");
    expect(screen.getByLabelText(/^Peristiwa baru/)).toHaveAttribute("aria-invalid", "true");
  });

  it("reads a cleared modifier value as Indonesian copy", async () => {
    const user = await openScoreEditor();

    await user.type(screen.getByLabelText(/^Peristiwa baru/), "Uji");
    const value = screen.getByLabelText(/^Nilai/);
    await user.clear(value);
    await user.click(screen.getByRole("button", { name: "Tambah" }));

    const inline = await waitFor(() => {
      const el = document.getElementById("modifier-value-error");
      if (!el) throw new Error("inline value error not rendered yet");
      return el;
    });
    expect(inline).toHaveTextContent("Isi nilai dengan angka.");
    expect(inline.textContent).not.toMatch(/nan|expected/i);
  });

  it("requires both figures and rejects a self-pair", async () => {
    const calls = installFetchStub();
    const user = userEvent.setup();
    renderAdminRelationships();

    await user.click(await screen.findByRole("button", { name: "Relasi baru" }));
    await screen.findByRole("button", { name: "Simpan" });

    // Neither figure chosen.
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("Pilih figur A.");
    expect(summary).toHaveFocus();

    // Same figure on both sides: the backend rejects it, the form says so first.
    await user.selectOptions(screen.getByLabelText(/^Figur A/), "1");
    await user.selectOptions(screen.getByLabelText(/^Figur B/), "1");
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    const inline = await waitFor(() => {
      const el = document.getElementById("rel-target-error");
      if (!el) throw new Error("inline target error not rendered yet");
      return el;
    });
    expect(inline).toHaveTextContent("Figur A dan Figur B harus berbeda.");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("sends the exact relationship-create payload", async () => {
    const calls = installFetchStub();
    const user = userEvent.setup();
    renderAdminRelationships();

    await user.click(await screen.findByRole("button", { name: "Relasi baru" }));
    await screen.findByRole("button", { name: "Simpan" });
    await user.selectOptions(screen.getByLabelText(/^Figur A/), "1");
    await user.selectOptions(screen.getByLabelText(/^Figur B/), "2");
    await user.selectOptions(screen.getByLabelText(/^Jenis/), "coalition");
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(
        calls.some((c) => c.method === "POST" && c.path === "/api/admin/relationships"),
      ).toBe(true),
    );
    const post = calls.find((c) => c.method === "POST" && c.path === "/api/admin/relationships");
    expect(post?.body).toEqual({ source_id: 1, target_id: 2, rel_type: "coalition" });
  });
});

/* --------------------------------------------------------------------- T6 */

describe("T6 — AdminRelationships ARIA", () => {
  beforeEach(() => {
    installFetchStub();
  });

  it("names the relationships table with a caption", async () => {
    renderAdminRelationships();
    await screen.findByRole("table", { name: /daftar relasi antar figur/i });
  });

  it("marks the first figure of each row as its row's header", async () => {
    renderAdminRelationships();
    await screen.findByRole("table");
    expect(screen.getAllByRole("rowheader", { name: "Prabowo Subianto" })).toHaveLength(2);
  });

  it("gives the action column a header for screen readers", async () => {
    renderAdminRelationships();
    await screen.findByRole("table");
    expect(screen.getByRole("columnheader", { name: "Tindakan" })).toBeInTheDocument();
  });

  it("distinguishes the per-row actions by the pair they act on", async () => {
    renderAdminRelationships();
    await screen.findByRole("table");

    expect(
      screen.getByRole("button", { name: "Ubah skor Prabowo Subianto dan Anies Baswedan" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hapus relasi Prabowo Subianto dan Ganjar Pranowo" }),
    ).toBeInTheDocument();
  });

  it("labels the filter control", async () => {
    renderAdminRelationships();
    await screen.findByRole("table");
    expect(screen.getByRole("searchbox", { name: "Filter relasi" })).toBeInTheDocument();
  });

  it("labels the score slider and weight input with their issue", async () => {
    const user = await openScoreEditor();
    await user.click(screen.getByRole("button", { name: /Buka semua/ }));

    // The visible "Bobot" label repeats down the list; the accessible name
    // must carry the issue.
    expect(screen.getByRole("slider", { name: "Skor untuk Koalisi" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Skor untuk Ekonomi" })).toBeInTheDocument();
    expect(screen.getByLabelText("Bobot untuk Koalisi")).toBeInTheDocument();
    expect(screen.getByLabelText("Bobot untuk Ekonomi")).toBeInTheDocument();
  });

  it("distinguishes the per-row save and clear buttons by issue", async () => {
    const user = await openScoreEditor();
    await user.click(screen.getByRole("button", { name: /Buka semua/ }));

    expect(screen.getByRole("button", { name: "Simpan isu Koalisi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simpan isu Ekonomi" })).toBeInTheDocument();
    // Only the issue that already has a score offers "Kosongkan".
    expect(screen.getByRole("button", { name: "Kosongkan skor isu Koalisi" })).toBeInTheDocument();
  });

  it("keeps every control in the editor reachable by Tab, with no trap", async () => {
    const user = await openScoreEditor();
    await user.click(screen.getByRole("button", { name: /Buka semua/ }));
    (document.activeElement as HTMLElement | null)?.blur();

    const seen: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      await user.tab();
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) break;
      seen.push(el.getAttribute("aria-label") || el.id || el.textContent?.trim() || el.tagName);
    }

    // The row controls come first, then the modifier form, then "Tambah".
    expect(seen).toContain("Skor untuk Koalisi");
    expect(seen).toContain("Bobot untuk Koalisi");
    expect(seen).toContain("Posisi atau sikap untuk Koalisi");
    expect(seen).toContain("Simpan isu Koalisi");
    expect(seen).toContain("Skor untuk Ekonomi");
    expect(seen).toContain("Simpan isu Ekonomi");
    expect(seen).toContain("modifier-label");
    expect(seen).toContain("modifier-value");
    expect(seen).toContain("modifier-kind");
    expect(seen).toContain("modifier-expires-at");
    expect(seen).toContain("Tambah");
    expect(seen).not.toContain("document");
  });

  it("moves focus into the delete dialog when it opens", async () => {
    const user = userEvent.setup();
    renderAdminRelationships();

    await user.click(
      await screen.findByRole("button", {
        name: "Hapus relasi Prabowo Subianto dan Anies Baswedan",
      }),
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Hapus relasi");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("deletes the chosen relationship through the API", async () => {
    const calls = installFetchStub();
    const user = userEvent.setup();
    renderAdminRelationships();

    await user.click(
      await screen.findByRole("button", {
        name: "Hapus relasi Prabowo Subianto dan Anies Baswedan",
      }),
    );
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Hapus" }));

    await waitFor(() =>
      expect(
        calls.some((c) => c.method === "DELETE" && c.path === "/api/admin/relationships/7"),
      ).toBe(true),
    );
  });
});

describe("relationship kinds come from the API, not a literal in the component", () => {
  it("offers every kind the API returns", async () => {
    installFetchStub();
    const user = userEvent.setup();
    renderAdminRelationships();

    // The create form is behind a toggle.
    await user.click(await screen.findByRole("button", { name: /relasi baru/i }));

    const select = await screen.findByLabelText(/^Jenis$/i);
    const values = Array.from(select.querySelectorAll("option")).map((o) =>
      o.getAttribute("value"),
    );

    /*
     * `alliance` is the one that matters. The component previously held its own
     * hardcoded array that omitted it, while 25 of the 150 seeded relationships
     * use it, so the dropdown could not express the kind of a fifth of the data
     * and an admin editing such a tie would silently change its kind.
     */
    expect(values).toContain("alliance");
    expect(values).toEqual([
      "political",
      "coalition",
      "alliance",
      "family",
      "business",
      "party",
      "government",
    ]);
  });
});
