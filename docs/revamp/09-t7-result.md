# T7 result — Cytoscape map shipped

Replaces the 852-line hand-rolled canvas graph. See `07-graph-parity.md` for the
contract this was measured against and `08-t7-spike-results.md` for the
feasibility work that de-risked it.

## Files

| File | Role |
|---|---|
| `components/RelationshipGraph.tsx` | Lazy boundary (49 lines). Keeps Cytoscape out of the main bundle. |
| `components/graph/CytoscapeGraph.tsx` | The component: mounts Cytoscape, renders, handles interaction. |
| `components/graph/layout.ts` | Pure layout logic. No React, no DOM, so it is unit-testable headless. |
| `components/graph/layout.test.ts` | 32 tests, run without a browser. |

Removed: `components/camera.test.ts`. It re-implemented the camera transforms
inside the test file and proved the arithmetic rather than the component.
Cytoscape owns zoom and pan natively now, so the file tested nothing that still
exists.

## Parity results (measured in the browser)

| # | Behaviour | Result |
|---|---|---|
| 1 | Dragged node stays pinned | **drift 0.0** over 5s settle |
| 2 | Drag moves by the exact screen delta | `dx=249, dy=174` for a 100/70 drag at k=0.40 |
| 3 | World position survives zoom | unchanged |
| 4 | Panning does not move data | unchanged |
| 9 | Edge style from the API | `data(color)`, `data(width)`, `data(opacity)` |
| 10 | Allies closer than rivals | verified headless, 181 vs 293 |
| 11 | Labels hide by zoom rule | 3 of 58 named at k=0.40 |
| 12 | Click opens profile | `tap` handler wired to `onSelect` |
| 14 | No mobile overflow | none |

New capability: **compound bloc grouping**. Five blocs (KIM 31, PDI-P 8,
Pendukung Pemerintahan 8, Masyarakat Sipil 8, Oposisi Konstruktif 3), verified
clustering — same-bloc members average 162 units apart, cross-bloc 428.

## Bundle

```
main chunk            485.82 kB / 142.64 kB gzip
CytoscapeGraph chunk  576.81 kB / 179.91 kB gzip
```

Cytoscape appears **0 times** in the main chunk (verified by grep on the built
asset). Only `/peta` visitors download the graph engine. The main chunk grew
from 393 kB to 486 kB, but that is the admin work (react-hook-form + zod), not
the graph.

## Four things measurement changed

**1. Label visibility cannot be binary.** The map fits the viewport at roughly
k=0.4 to 0.5. At that zoom, 58 labels cannot be placed in the available pixels
without overlapping. Suppressing all of them leaves an anonymous map; showing
all of them is noise. The rule is now tiered: below the threshold only figures
with influence >= 90 are named. Measured effect at k=0.40: exactly three names
show — Prabowo Subianto, Joko Widodo, Megawati Soekarnoputri.

**2. The layout was non-deterministic.** `randomize: true` produced **5 distinct
layouts in 5 runs**, with fit zoom ranging 0.492 to 0.580. Two readers comparing
screenshots would see different maps, and the label threshold would be a coin
flip. Now `randomize: false`, and a test asserts identical positions across runs.

**3. Tuning the layout to fit made it worse.** Raising the fit zoom by reducing
`nodeRepulsion` from 4500 to 2000 collapsed the **minimum pair distance to 0.2
world units** — nodes stacked on top of each other. A smaller map with
overlapping nodes is worse than a larger readable one. Reverted, with a test
asserting the minimum pair distance stays above 10.

**4. Synthetic pointer events do not drive Cytoscape.** It binds mouse events.
A drag test using `PointerEvent` reported no movement and `locked=false`, which
looks exactly like a broken drag. Retested with `mousedown`/`mousemove`/
`mouseup` and it worked first time. Anyone debugging this later should know
before chasing a phantom.

## Honest caveat on `Susun ulang`

Pressing "Susun ulang tata letak" unlocks every node and re-runs the layout, so
a pinned node moves. That is what "rearrange" means and is correct behaviour,
but the on-screen copy previously said nodes "stay where you put them" with no
qualification. The copy now says "sampai Anda menekan tombol susun ulang".

## Open issue: the test suite is flaky in parallel

Full-suite parallel runs failed on 2 of 3 attempts (5 failures, then 0, then 4),
while `--no-file-parallelism` passes **197/197** every time. Each affected file
passes in isolation and in pairs. This is not yet diagnosed and should not be
called fixed. The affected assertions span admin, a11y and layout tests, which
suggests resource contention rather than a logic error.
