# PRISM revamp — decisions and rationale

Read `00-audit.md` first. These decisions follow from measured evidence.

## D1. Graph component: Cytoscape.js + fCoSE, code-split

**Chosen:** `cytoscape` + `cytoscape-fcose`, loaded lazily on the map route.

**Why:** 12.1M weekly downloads, MIT, actively released (2026-09-07). fCoSE is
the standard force layout and is *compound-aware* — it can lay out coalition
blocs as visual groups, which is exactly the Civ VI "diplomatic bloc" idea and
is the one capability the hand-rolled version cannot reach without another
few hundred lines.

**Rejected:**
- `@cosmograph/react` — **CC-BY-NC-4.0**. Non-commercial licence, unusable in an
  open-source project. Hard block, not a preference.
- `sigma` — WebGL is fast but text rendering is weak, and every label in this
  app is a person's name.
- `@xyflow/react` — a node-*editor* (drag-to-connect flowcharts). Wrong genre.
- `react-force-graph-2d` — thin wrapper over the same d3-force we already have;
  swapping 846 lines of our physics for someone else's physics gains little.
- `reagraph` — 53K/week. Too small a community for a project meant to attract
  contributors.

**Mandatory constraint:** Cytoscape is **133.6 KB gzipped vs the app's current
116 KB total**. It MUST be behind `React.lazy` so only map visitors pay. A task
that ships it in the main bundle has failed.

**What must survive the swap** (these are the current app's real strengths):
- Pinned drag — a dragged node stays put, drift measured at 0.0 over 6s.
- Zoom anchored on the cursor; pan on background drag.
- Score-driven edge styling (colour, width, dashes for hostile).
- Allied pairs pull close, rivals push apart.
- Keyboard: arrows pan, +/- zoom, 0 fits.
- `window.__prismGraph` testing seam, or an equivalent, or the drag-persistence
  test becomes unverifiable.

## D2. Component library: shadcn/ui (Radix + CVA), copied in

**Chosen:** shadcn/ui components, vendored into `src/components/ui/`.

**Why:** Radix primitives are 40-130M weekly downloads, MIT, and solve the exact
audit findings — focus traps, `aria-*` wiring, keyboard handling (A3, A5).
shadcn copies source into the repo rather than installing a black box, so the
DESIGN.md tokens stay in control of appearance. That matters here: a themed
dependency would fight the parchment/bronze direction.

**Not a full rewrite.** The 12 existing primitives in `ui.tsx` keep their names
and props. shadcn replaces their *internals* where Radix adds real
accessibility. `TierChip`, `ScoreRule`, `ScoreValue` are domain components with
no Radix equivalent — leave them alone.

## D3. Icons: NOT lucide-react by default

`antislop-ui` names Lucide explicitly as a tell: "a single default icon library
makes every AI site's icons identical". It is 75.6M downloads *because* it is
the default.

**Decision:** no icon library in the first pass. The app currently uses text
labels in Indonesian and they work. If a specific control genuinely needs a
glyph, add that one icon with a written reason per R-04. This is a deliberate
deviation from "popular components" — popularity is the thing antislop warns
about here, and the user installed antislop on purpose.

## D4. Tables: TanStack Table for the matrix only

`/matriks` has 66 interactive elements all under 44px (A4). TanStack Table
(15M/week, MIT) is headless — it brings sorting/virtualisation without styling,
so DESIGN.md keeps control. Other pages' lists are simple enough to leave.

## D5. Forms: react-hook-form + zod

Fixes A6. `zod` is already a dependency. RHF gives per-field errors and an
error summary, which is also the A3 `aria-live` fix for the admin side.

## D6. What NOT to do

- **Do not rewrite the backend.** 73 tests pass; the API contract is stable.
- **Do not touch the scoring model.** The soft clamp is load-bearing.
- **Do not add motion beyond MOTION 2.** No scroll animations, no loops.
- **Do not change the palette.** It passes WCAG AA at all 9 tiers, verified
  numerically after 8 real failures were found and fixed.
- **Do not cite performance as the reason for the graph swap.** 60 fps measured.

## D7. Skills: extend, do not rewrite

The user asked to "update" four skills. Three of them (`antislop`,
`antislop-ui`, `antislop-copywriting`) are a coherent published system, and the
last revamp's root cause was that they were *never wired up*, not that they were
wrong. Rewriting them would repeat that mistake in the other direction.

**Therefore:** add a new `references/` file to `antislop-ui` covering component
libraries and graph/data-viz — the genuine gap, since the skill has no guidance
on choosing a dependency. Add a `references/` file to `design-md` on
token-to-Tailwind-v4 flow. Patch `antislop-copywriting` only with an Indonesian
UI-copy section, since the app ships Indonesian and the skill assumes English.
Leave the core `antislop` rules untouched.
