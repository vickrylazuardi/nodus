# PRISM revamp — audit findings

Measured 2026-09-20 against the running app (frontend :5173, backend :8000).
Every number here came from the live DOM or npm, not from estimation.

## Verified bugs (real, reproducible)

| # | Finding | Evidence | Severity |
|---|---|---|---|
| A1 | **No `<h1>` on any public route.** All six start at `<h2>`. | `/peta`, `/figur`, `/matriks`, `/isu`, `/statistik`, `/cara-baca` all return `h1 count = 0`; first heading is `H2: Peta relasi` etc. | High — screen readers get no page title; breaks document outline |
| A2 | **`/figur/1` overflows on mobile.** | At 390x844, `scrollWidth = 442`. Culprits: `section.rounded-md.border.border-rule w=422` and `div.flex.flex-col.gap-5 w=422`. | High |
| A3 | **Zero `aria-live` regions app-wide.** | `[aria-live]` count = 0 on all 7 routes. Filter changes, score recalcs and save results are silent to screen readers. | Medium |
| A4 | **Touch targets below 44px.** | `/matriks` 66 of 66 interactive elements under 44px; `/figur/1` 19; `/figur` 8. | Medium |
| A5 | **Admin has almost no ARIA.** | `AdminAudit.tsx`, `AdminIssues.tsx`, `AdminOverview.tsx` = 0 aria attributes. | Medium |
| A6 | **Admin forms are raw `useState`.** | 4 admin files manage form state by hand; no validation library, no error summary. | Medium |

## Non-findings (checked, and NOT bugs)

- **`/bantuan` 404** — this was my own wrong URL. The real route is `/cara-baca`.
  Recorded so nobody "fixes" a route that was never meant to exist.
- **Graph performance** — measured **60 fps, worst frame 17 ms** at 58 nodes /
  150 edges with the simulation warm. The hand-rolled O(n²) loop is *not*
  currently a bottleneck. Do not justify the graph swap with performance.

## Scale headroom (for the graph decision)

| nodes | pair comparisons per frame |
|---|---|
| 58 (today) | 1,653 |
| 150 | 11,175 |
| 300 | 44,850 |
| 600 | 179,700 |

O(n²) is fine today and becomes a problem somewhere past ~300 figures.

## Current shape

- `RelationshipGraph.tsx` — **846 lines** of hand-written physics, the largest
  file in the frontend.
- `AdminRelationships.tsx` — 680 lines.
- `FigureDetailPage.tsx` — 444 lines.
- `ui.tsx` — 268 lines, 12 hand-rolled primitives (`Button`, `Panel`,
  `PanelHeader`, `TierChip`, `Tag`, `ScoreRule`, `ScoreValue`, `LoadingState`,
  `EmptyState`, `ErrorState`, `Field`, `inputClass`).
- Frontend total: 5,082 lines.
- Build today: **383 KB raw / 116 KB gzipped**.
- Tests: 73 backend, 62 frontend.

## Dependency reality check (npm, weekly downloads, measured)

| package | version | weekly | license | note |
|---|---|---|---|---|
| `@radix-ui/react-slot` | 1.3.3 | 131.5M | MIT | shadcn/ui foundation |
| `lucide-react` | 1.47.0 | 75.6M | ISC | antislop calls this a *tell* — see decisions |
| `class-variance-authority` | 0.7.1 | 48.3M | Apache-2.0 | |
| `react-hook-form` | 7.88.0 | 42.9M | MIT | fixes A6 |
| `@radix-ui/react-tooltip` | 1.2.16 | 42.7M | MIT | |
| `@tanstack/react-table` | 9.2.4 | 15.0M | MIT | fixes matrix/table work |
| `cytoscape` | 3.34.3 | 12.1M | MIT | |
| `cytoscape-fcose` | 2.2.0 | 11.2M | MIT | |
| `@xyflow/react` | 12.11.6 | 8.4M | MIT | node-editor, not a force graph |
| `graphology` | 0.26.0 | 1.07M | MIT | data model only |
| `vis-network` | 10.1.2 | 540K | Apache-2.0 | |
| `react-force-graph-2d` | 1.29.1 | 533K | MIT | |
| `sigma` | 3.0.3 | 238K | MIT | WebGL, needs graphology |
| `reagraph` | 4.32.0 | 53K | Apache-2.0 | |
| `@cosmograph/react` | 2.5.1 | 30K | **CC-BY-NC-4.0** | **REJECTED — non-commercial, incompatible with an open-source release** |

## Bundle cost (measured locally, bundlephobia was 403)

```
cytoscape.min.js   428 KB raw  ->  133.6 KB gzipped
current whole app  383 KB raw  ->  116   KB gzipped
```

**Cytoscape alone is larger than the entire current application.** Any plan
that adds it must code-split it, or the map route doubles the download for
every visitor including those who never open it.
