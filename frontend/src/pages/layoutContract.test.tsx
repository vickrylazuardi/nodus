/**
 * Structural contracts for the two layout defects (T2, T3).
 *
 * jsdom has no layout engine: every getBoundingClientRect() returns zeros, so
 * "scrollWidth <= innerWidth" and "the target is 44px tall" cannot be asserted
 * here. Rather than fake those numbers, these tests pin the *mechanism* each fix
 * relies on, which is what actually regresses:
 *
 *   T2 — an unconditional pixel min-width on a flex/grid child. That is exactly
 *        what produced the measured 442px scroll width at a 390px viewport: the
 *        figure header's `min-w-[280px]` applied at every breakpoint, so the
 *        column could not shrink below its content.
 *   T3 — every interactive element carries a >=44px hit-area class, so a new
 *        control that forgets it fails here instead of shipping.
 *
 * The real numbers are measured in a browser and reported with the delivery;
 * these are the guard rails that keep the fix from being undone.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import type { Figure, FigureDetail, FigureRef, Tier } from "@/lib/types";

/* ------------------------------------------------------------------ fixtures */

const TIERS: Tier[] = [
  { key: "alliance", label: "Aliansi", description: "Mitra kuat", color: "#2A6B5A", threshold: 55 },
  { key: "hostile", label: "Bermusuhan", description: "Berselisih", color: "#7E2A25", threshold: -80 },
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
    bio: "Biografi singkat yang cukup panjang untuk membungkus beberapa baris di layar ponsel.",
    tags: [],
    influence: 50,
    is_active: true,
    relationship_count: 1,
    avg_score: 12,
    best_ally: null,
    worst_rival: null,
  };
}

/*
 * A deliberately unbreakable figure: the longest single-token name in the
 * dataset. If the page cannot shrink around this, the overflow returns.
 */
const LONG_NAME = "Agus Gumiwang Kartasasmita";
const FIGURES: Figure[] = [makeFigure(1, LONG_NAME), makeFigure(2, "Anies Baswedan")];

const FIGURE_REFS: FigureRef[] = FIGURES.map((f) => ({
  id: f.id,
  name: f.name,
  party: f.party,
  bloc: f.bloc,
}));

const FIGURE_DETAIL: FigureDetail = {
  figure: FIGURES[0]!,
  relationships: [],
  issue_summary: [],
  summary: { relationship_count: 0, avg_score: 0, allies: [], rivals: [] },
  tier: TIERS[1]!,
};

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
        return Promise.resolve(json({ issues: [], count: 0 }));
      }
      if (path.endsWith("/api/matrix")) {
        return Promise.resolve(json({ figures: FIGURE_REFS, cells: [] }));
      }
      if (path.endsWith("/api/graph")) {
        return Promise.resolve(
          json({ nodes: [], edges: [], counts: { nodes: FIGURES.length, edges: 0 } }),
        );
      }
      if (path.endsWith("/api/stats")) {
        return Promise.resolve(
          json({
            totals: { figures: 2, relationships: 0, issues: 0, active_modifiers: 0 },
            tier_distribution: {},
            most_divisive_issues: [],
            most_hostile: [],
            most_aligned: [],
            last_updated: null,
            data_is_illustrative: true,
          }),
        );
      }
      throw new Error(`fetch stub has no route for ${url}`);
    }),
  );
}

function renderRoute(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/* ------------------------------------------------------------------ helpers */

/**
 * True when a class list pins a *layout* minimum width with no breakpoint
 * prefix — a floor big enough to force the page wider than the viewport.
 *
 * Two deliberate exclusions, both verified against the audit:
 *   - floors <= 44px are touch-target sizes (T3), not layout constraints
 *   - anything inside a scroll container cannot widen the page; the matrix's
 *     `min-w-[170px]` row header lives in an `overflow-auto` wrapper by design
 *
 * `sm:min-w-[280px]` is fine: it only applies where there is room.
 * `min-w-[280px]` is the defect that measured scrollWidth 442 at 390px.
 */
const LAYOUT_FLOOR_PX = 45;

function hasUnconditionalLayoutFloor(el: HTMLElement): boolean {
  const hasFloor = String(el.className)
    .split(/\s+/)
    .filter(Boolean)
    .some((cls) => {
      const match = /^min-w-\[([\d.]+)px\]$/.exec(cls);
      if (!match) return false;
      return Number(match[1]) >= LAYOUT_FLOOR_PX;
    });

  if (!hasFloor) return false;

  /*
   * A floor inside a scroll container is contained by it. Checked by class as
   * well as computed style: vitest runs with `css: false`, so Tailwind classes
   * never reach getComputedStyle and the matrix's `overflow-auto` wrapper would
   * otherwise look like a page-level overflow.
   */
  const SCROLL_CLASSES = new Set([
    "overflow-auto",
    "overflow-x-auto",
    "overflow-scroll",
    "overflow-x-scroll",
  ]);
  for (let node = el.parentElement; node; node = node.parentElement) {
    const classes = String(node.className).split(/\s+/).filter(Boolean);
    if (classes.some((cls) => SCROLL_CLASSES.has(cls))) return false;

    const overflowX = getComputedStyle(node).overflowX;
    if (overflowX === "auto" || overflowX === "scroll") return false;
  }
  return true;
}

/** Every class that gives a control the 44px minimum hit area. */
const HIT_AREA_CLASSES = new Set(["min-h-[44px]", "min-h-11", "h-11"]);

function hasHitArea(className: string): boolean {
  return className
    .split(/\s+/)
    .filter(Boolean)
    .some((cls) => HIT_AREA_CLASSES.has(cls));
}

function interactiveElements(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("button, a[href]"));
}

/* --------------------------------------------------------------------- T2 */

const PUBLIC_ROUTES = ["/peta", "/figur", "/matriks", "/isu", "/statistik", "/cara-baca"];

describe("T2 — no element pins an unconditional pixel min-width", () => {
  beforeEach(() => {
    installFetchStub();
  });

  it.each([...PUBLIC_ROUTES, "/figur/1"])(
    "%s contains no unconditional min-w-[<px>] class",
    async (path) => {
      renderRoute(path);
      // Wait for real content; the loading panel is not what overflowed.
      await waitFor(() => expect(document.querySelectorAll("h1").length).toBe(1));

      const offenders = Array.from(document.querySelectorAll<HTMLElement>("*"))
        .filter((el) => hasUnconditionalLayoutFloor(el))
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)}`);

      expect(offenders, `unconditional pixel min-width on: ${offenders.join(" | ")}`).toEqual([]);
    },
  );

  it("/figur/1 keeps the desktop column floor behind a breakpoint", async () => {
    renderRoute("/figur/1");
    await waitFor(() => expect(document.querySelectorAll("h1")).toHaveLength(1));

    /*
     * The fix must not have removed the desktop floor, only scoped it.
     *
     * The breakpoint is `lg`, not `sm`. It started at `sm` and was moved: at
     * 640px the wordmark, six nav links and the Admin button cannot share a row,
     * so a single-row masthead produced a three-row 113px header in the middle
     * of the width range. The floor follows the same breakpoint as the layout it
     * belongs to, so this accepts either prefix rather than pinning one.
     */
    const scoped = Array.from(document.querySelectorAll<HTMLElement>("*")).filter((el) =>
      String(el.className)
        .split(/\s+/)
        .some((cls) => /^(sm|lg):min-w-\[[\d.]+px\]$/.test(cls)),
    );
    expect(scoped.length).toBeGreaterThan(0);
  });

  it("/figur/1 lets its grid children shrink (min-w-0 on the tracks)", async () => {
    renderRoute("/figur/1");
    await waitFor(() => expect(document.querySelectorAll("h1")).toHaveLength(1));

    /*
     * The two-column working layout: below lg it is one column, and a grid item
     * defaults to min-width:auto. Without min-w-0 on both children the column
     * cannot shrink past its longest row and the page scrolls sideways.
     */
    const grid = document.querySelector<HTMLElement>('div.grid[class*="lg:grid-cols-"]');
    expect(grid).not.toBeNull();

    const children = Array.from(grid!.children) as HTMLElement[];
    expect(children.length).toBeGreaterThanOrEqual(2);

    for (const child of children) {
      const classes = String(child.className).split(/\s+/);
      expect(
        classes.includes("min-w-0"),
        `grid child is missing min-w-0: "${String(child.className).slice(0, 90)}"`,
      ).toBe(true);
    }
  });
});

/* --------------------------------------------------------------------- T3 */

describe("T3 — every interactive element carries a >=44px hit area", () => {
  beforeEach(() => {
    installFetchStub();
  });

  it.each(["/peta", "/figur", "/matriks", "/figur/1"])(
    "%s has no interactive element without a hit-area class",
    async (path) => {
      renderRoute(path);
      await waitFor(() => expect(document.querySelectorAll("h1")).toHaveLength(1));

      const offenders = interactiveElements()
        .filter((el) => !hasHitArea(el.className || ""))
        .map((el) => {
          const text = (el.textContent ?? "").trim().slice(0, 30);
          return `${el.tagName.toLowerCase()}[${text}] class="${String(el.className).slice(0, 70)}"`;
        });

      expect(
        offenders,
        `controls without a 44px hit area on ${path}: ${offenders.join(" | ")}`,
      ).toEqual([]);
    },
  );

  it("the masthead nav links are hit-area sized on every public route", async () => {
    for (const path of PUBLIC_ROUTES) {
      const { unmount } = renderRoute(path);
      await waitFor(() => expect(document.querySelectorAll("h1")).toHaveLength(1));

      const navLinks = Array.from(
        document.querySelectorAll<HTMLElement>('nav[aria-label="Navigasi utama"] a[href]'),
      );
      expect(navLinks.length).toBeGreaterThan(0);
      for (const link of navLinks) {
        expect(
          hasHitArea(link.className || ""),
          `nav link "${link.textContent}" lacks a hit area on ${path}`,
        ).toBe(true);
      }
      unmount();
    }
  });

  it("the matrix row links are hit-area sized", async () => {
    renderRoute("/matriks");
    await waitFor(() => expect(document.querySelectorAll("h1")).toHaveLength(1));

    const rowLinks = Array.from(
      document.querySelectorAll<HTMLElement>('tbody th a[href^="/figur/"]'),
    );
    expect(rowLinks.length).toBeGreaterThan(0);
    for (const link of rowLinks) {
      expect(hasHitArea(link.className || ""), `matrix row link lacks a hit area`).toBe(true);
    }
  });

  it("the figure cards are hit-area sized", async () => {
    renderRoute("/figur");
    await waitFor(() => expect(document.querySelectorAll("h1")).toHaveLength(1));

    const cards = Array.from(
      document.querySelectorAll<HTMLElement>('a[href^="/figur/"]'),
    ).filter((a) => !a.closest("nav") && !a.closest("thead") && !a.closest("tbody"));
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(hasHitArea(card.className || ""), `figure card lacks a hit area`).toBe(true);
    }
  });

  it("the shared Button primitive sets the 44px minimum itself", async () => {
    const { Button } = await import("@/components/ui");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Button>Contoh</Button>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const button = document.querySelector("button");
    expect(button).not.toBeNull();
    expect(hasHitArea(button!.className)).toBe(true);
  });
});
