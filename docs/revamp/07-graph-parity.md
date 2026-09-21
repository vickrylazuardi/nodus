# Graph parity contract (T7)

Measured on the **current** hand-rolled graph before any replacement work, so
the swap has a hard pass/fail list instead of a description. Re-measure the new
component against every row. A row that fails is a regression.

## How to measure

The current component exposes a read-only testing seam:

```js
window.__prismGraph.nodes()   // [{ id, label, x, y, fixed }]
window.__prismGraph.camera()  // { x, y, k }
window.__prismGraph.alpha()   // simulation heat, 0 = cold
window.__prismGraph.freeze()  // force cold, to isolate a single interaction
```

Canvas pixels cannot distinguish "the dragged node held" from "everything is
still settling". That is why the seam exists and why the replacement needs an
equivalent. Without it, rows 1 and 4 below cannot be verified at all.

## The contract

| # | Behaviour | Measured on current version | How to check |
|---|---|---|---|
| 1 | Dragged node stays pinned | **drift 0.0** over 6s of live physics | drag, wait 6s, compare `nodes()[id]` |
| 2 | Drag moves node by the exact screen delta | `dx=150, dy=90` for a 150/90 drag at zoom 1 | compare before/after coords |
| 3 | Node world position survives a zoom change | unchanged across `k: 1 -> 1.25` | record coords, zoom, re-read |
| 4 | Panning moves the camera, not the data | camera `{0,0,1} -> {120,-80,1}`, nodes identical | hash 5 node coords before/after |
| 5 | Zoom anchors on the cursor | anchor drift < 1e-4 over a 40-zoom chain | `camera.test.ts` |
| 6 | Fit-to-view frames all nodes | all nodes inside viewport with margin | bounding box vs viewport |
| 7 | Single-node graph does not divide by zero | `fit` returns finite `k > 0` | `camera.test.ts` |
| 8 | Keyboard: arrows pan, +/- zoom, 0 fits | all four verified | dispatch `KeyboardEvent` |
| 9 | Edge style comes from the API | `style.color/width/dashes/opacity` applied | visual + style object |
| 10 | Allies pull together, rivals push apart | spring rest length varies with score | inspect layout distances |
| 11 | Labels hide below 0.55x zoom | threshold constant | zoom out, count rendered labels |
| 12 | Click a node opens its profile | `onSelect` fires | click, check route change |
| 13 | 58 nodes / 150 edges at 60 fps | **60 fps, worst frame 17 ms** | rAF timing loop |
| 14 | No horizontal overflow on mobile | 390px, no overflow | `scrollWidth <= innerWidth` |

## Automated coverage that exists today

`frontend/src/components/camera.test.ts` — 13 tests covering rows 5, 6, 7 and
the drag-delta maths (rows 2, 3). These must be ported or preserved.

## Non-negotiables for the replacement

- **Code splitting.** Cytoscape is 133.6 KB gzipped; the whole app is ~118 KB.
  It must load lazily on the map route only. Shipping it in the main bundle
  fails the task even if all 14 rows pass.
- **No invented colours.** Node and edge colours come from the API
  (`tier.color`, `edge.style.*`) or from `DESIGN.md`.
- **Stop and report if a row cannot be met.** A working component replaced by a
  slightly worse one is a net loss. Rows 1, 3 and 4 are the ones the user
  specifically reported as broken in an earlier version; they are the highest
  risk and the most important to hold.

## Row 13 is not a justification

60 fps is the *current* baseline, so performance is not a reason to swap.
The reasons are maintainability (846 lines of bespoke physics) and compound
coalition grouping, which fCoSE supports and the hand-rolled version does not.
