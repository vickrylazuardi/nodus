# Delegation tasks — wave 2 (the graph swap)

T7 is the highest-risk task. It replaces a component that currently works and
is verified. Give it to your strongest available model, not the cheapest.

---

## T7 — Replace the map with Cytoscape.js + fCoSE

**Read `01-decisions.md` D1 before starting.**

**The API already provides everything needed** (verified against
`GET /api/graph` on the live backend, 58 nodes / 150 edges):

```jsonc
// node — has `bloc` on every node, which is the compound-grouping key
{ "id": 1, "label": "Prabowo Subianto",
  "role": "Presiden RI", "party": "Gerindra",
  "bloc": "Koalisi Indonesia Maju (KIM)",   // <- fCoSE compound parent
  "influence": 98, "degree": 46,
  "tier": { "key": "friendly", "label": "Akrab", "color": "#357A66" },
  "size": 35.6 }

// edge — `style` maps 1:1 onto a Cytoscape stylesheet, do not invent colours
{ "id": 1, "from": 1, "to": 2, "score": 74, "rel_type": "coalition",
  "tier": { "key": "alliance", "color": "#2A6B5A" },
  "style": { "color": "#2A6B5A", "width": 4.65,
             "dashes": false, "arrows": "to", "opacity": 0.83 } }
```

Bloc sizes: KIM 31, Pendukung Pemerintahan 8, PDI-P 8, Oposisi Konstruktif 3,
Masyarakat Sipil 8. Five compound groups, all non-empty.

Edge mapping: `style.color` -> `line-color`, `style.width` -> `width`,
`style.dashes` -> `line-style: dashed`, `style.opacity` -> `opacity`.


**Install:**
```bash
cd frontend && npm i cytoscape cytoscape-fcose && npm i -D @types/cytoscape
```

**Hard constraint — code splitting.** Cytoscape is **133.6 KB gzipped**; the
entire current app is 116 KB. It MUST be behind `React.lazy` + `Suspense` so
only visitors to `/peta` download it. After building, confirm the map chunk is
separate from the main chunk. Shipping it in the main bundle is a failed task.

**Behaviour that must survive** (the current component was fixed specifically
to do these — regressing any one is a failure):

| Behaviour | Current verified state |
|---|---|
| Dragged node stays pinned | drift **0.0** over 6s of live physics |
| Zoom anchored on cursor | verified over a 40-zoom chain |
| Pan on background drag | camera moves, **nodes do not** |
| Edge colour/width/dash by score | from `edge.data.style` |
| Allies pull together, rivals push apart | spring rest length varies by score |
| Keyboard: arrows pan, +/- zoom, 0 fit | all working |
| Labels hide below 0.55x zoom | prevents overlap noise |
| Click a node opens its profile | `onSelect` |

**Mapping to Cytoscape:**
- Pinned drag: Cytoscape gives this natively — `layout.run()` once, then nodes
  stay where dragged. Do NOT re-run the layout on drag.
- Zoom/pan: native (`cy.zoom()`, `cy.pan()`, `userZoomingEnabled`).
- Edge style: map `edge.data.style` to a Cytoscape stylesheet
  (`line-color`, `width`, `line-style: dashed`).
- Allies/rivals: fCoSE `idealEdgeLength(edge)` — short for high score, long for
  negative. This is the political meaning; do not drop it.
- Compound blocs: fCoSE supports compound nodes. Grouping by `bloc` is the
  upgrade this swap buys. Add it only after parity is reached.

**Colours:** every node and edge colour comes from the API (`tier.color`) or
`DESIGN.md`. Do not introduce a Cytoscape default palette.

**Testing seam:** keep `window.__prismGraph` or provide an equivalent exposing
node positions and the camera. Without it the drag-persistence test cannot run.
Port `camera.test.ts` (currently passing) to whatever the new maths is, or keep
it if the transforms are unchanged.

**Verify, and report each number:**
1. `npm run build` — report main chunk size AND map chunk size separately.
2. Drag a node, wait 6s, measure drift. Must be < 1.0.
3. Zoom with the wheel; confirm the point under the cursor stays anchored.
4. Pan; confirm node world positions are unchanged.
5. Keyboard: arrows, +, -, 0.
6. 60 fps check at 58 nodes (current baseline: 60 fps, worst frame 17 ms).
7. Mobile 390px: no horizontal overflow, touch drag works.
8. All four gate commands.

**If parity cannot be reached, stop and report rather than shipping a worse
map.** The current one works; a regression is worse than no change.

---

## T8 — shadcn/ui primitives for Dialog, Select, Tabs, Tooltip

**Read `01-decisions.md` D2.**

**Install:**
```bash
cd frontend && npm i @radix-ui/react-dialog @radix-ui/react-select \
  @radix-ui/react-tabs @radix-ui/react-tooltip @radix-ui/react-slot \
  class-variance-authority
```

**Do:** create `src/components/ui/` with shadcn-style `dialog.tsx`,
`select.tsx`, `tabs.tsx`, `tooltip.tsx`. Style them **only** with DESIGN.md
tokens — no shadcn default greys, no `slate-*`, no `zinc-*`.

**Keep the existing API.** `ui.tsx` exports 12 primitives used across 13 pages.
Do not rename or change their props. Replace internals only where Radix adds
accessibility.

**Do NOT touch** `TierChip`, `ScoreRule`, `ScoreValue` — domain components with
no Radix equivalent.

**Do NOT install lucide-react** (see D3).

**Verify:** every page still renders; dialogs trap focus and close on Escape;
selects are keyboard-navigable; gate commands pass.

---

## T9 — TanStack Table for `/matriks`

**Read `01-decisions.md` D4.** Depends on T3 (touch targets) landing first.

**Install:** `cd frontend && npm i @tanstack/react-table`

**Do:** rebuild the 58x58 matrix on TanStack Table (headless — styling stays
DESIGN.md). Add column sorting and sticky headers. Keep the dense-grid look.

**Files:** `frontend/src/pages/MatrixPage.tsx` (164 lines)

**Verify:** all 58 rows and columns present; cell colours match tier colours
from the API; sorting works; still scrolls internally on mobile without page
overflow; touch targets stay >= 44px; gate commands pass.
