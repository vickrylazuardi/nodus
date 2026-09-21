# T7 feasibility spike — results

Run headless against the live API data (58 nodes, 150 edges, 5 blocs) with
`cytoscape@3.34.3` + `cytoscape-fcose@2.2.0`, both MIT. **11/11 checks pass.**

## The blocking bug, and its fix

**fCoSE compound layout crashes with `RangeError: Invalid array length`** when
Cytoscape is created with `styleEnabled: false` (the usual headless default).

Isolated cause: compound parents have no computed bounding box without styles,
so the layout's internal grid maths receives `NaN` and tries to allocate an
array of that length.

```js
cytoscape({ headless: true, elements, styleEnabled: true })  // compound works
cytoscape({ headless: true, elements, styleEnabled: false }) // RangeError
```

Without this, compound grouping (the main reason for choosing Cytoscape) is
unusable, and the failure looks like a library bug rather than a config mistake.

Also: `nestingFactor` and `nodeSeparation` variants **hang** rather than error
when combined with compound + `styleEnabled: false`. Any spike must run each
config in a child process with a hard timeout, or it stalls forever.

## Verified configuration

```js
cy.layout({
  name: "fcose",
  quality: "default",
  animate: false,
  randomize: true,
  numIter: 2500,
  idealEdgeLength: (edge) => {           // the political encoding
    const s = edge.data("score") ?? 0;
    return s >= 0 ? 86 - s * 0.22 : 86 + Math.abs(s) * 0.24;
  },
  nodeRepulsion: 4500,
}).run();
```

Layout of 58 nodes / 150 edges / 5 compound blocs: **~85 ms**, well inside a
frame budget. This is not a bottleneck.

## Results

| Check | Result |
|---|---|
| All 58 nodes present | 58 |
| All 150 edges present | 150 |
| Compound blocs created | 5 |
| Every node has finite coordinates | pass |
| Layout has real extent | w=800 h=741 |
| No overlapping nodes | closest pair 33.5 |
| **Allies sit closer than rivals** | **181 vs 293** (n=92/38) |
| **Same-bloc members cluster** | **162 vs 428** cross-bloc |
| Model position independent of camera | pan+zoom left coords unchanged |
| **Locked node survives a relayout** | held at +(150, 90) |
| Other nodes free to settle | 57 unlocked |

The two bolded rows are the ones that matter: the political meaning of the map
(allies drawn together, rivals pushed apart) and coalition grouping both survive
the swap. The compound clustering is a genuine upgrade — the current
hand-rolled graph has no bloc grouping at all.

## Two traps for the implementer

1. **Lock order.** Move the node first, *then* `lock()`. Locking first pins it
   to its current position and the subsequent `position()` call is silently
   ignored. My first test asserted the wrong order and failed.
2. **`styleEnabled: true` is mandatory**, not an optimisation, whenever compound
   parents are used.

## Consequence for the testing strategy

Layout is computable **headless**, so node positions are unit-testable in
vitest without a browser or a real canvas. Parity rows 1, 2, 10 and the
compound-clustering property can all become automated tests rather than manual
browser checks. Only rendering, pointer interaction and fps need a browser.

## Note on `idealEdgeLength` as a function

A function is accepted and works (verified separately): it produced a valid
58/58 layout. The crash was compound-only, not function-only.

## Reproducing this

The spike scripts are kept at `docs/revamp/spikes/`:

```bash
# needs cytoscape + cytoscape-fcose installed somewhere reachable
node docs/revamp/spikes/t7-verify.cjs     # 11 checks, exits 1 on failure
node docs/revamp/spikes/t7-isolate.cjs comp-nostyle   # reproduces the crash
```

They read `/tmp/t7spike/graph.json`, a snapshot of `GET /api/graph`. Fetch a
fresh copy with:

```bash
curl -s http://127.0.0.1:8000/api/graph -o /tmp/t7spike/graph.json
```

`t7-isolate.cjs` takes a case name and runs one config, so each can be given a
hard timeout by the caller. Do not run all configs in one process: the
compound + `styleEnabled:false` variants hang rather than error.
