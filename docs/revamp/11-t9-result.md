# T9 result — matrix table

**T9 as originally planned was not done, because its premise turned out to be
false.** A different, real problem on the same page was found and fixed instead.

## The plan said: add TanStack Table

The stated reason was that `/matriks` had "66 of 66 touch targets under 44px".

**That was already fixed by T3.** Measured before starting T9: `under44 = 0`.

## What the measurement actually found

| Thing measured | Result |
|---|---|
| Touch targets under 44px | **0** (T3 fixed it) |
| Render fps | 61 fps, worst frame 17 ms |
| Sorting 58 names by hand | 0.205 ms |
| **Cell lookup** | **61 ms per render, 11.3M comparisons** |
| Full 58x58 render | **~240 ms, with a 280 ms long task** |

The real defect was `cellFor()`, called once per rendered cell, each call
scanning all 3364 cells:

```js
function cellFor(data, row, col) {
  return data.cells.find((c) => c.row === row && c.col === col);   // O(n) per cell
}
```

3364 cells x up to 3364 comparisons = 11.3M comparisons per render, measured at
61 ms of pure JavaScript with no React and no DOM.

## What was done instead

Replaced the linear scan with a `Map` keyed `row:col`, built once per payload
and memoised. Correctness is pinned by 7 tests, including that `1:2` and `2:1`
do not collide and that a `null` score stays distinct from a missing cell.

Sorting was added as a plain `sort()` on at most 58 items (measured 0.2 ms),
exposed as a "Urutan nama" control. A table library was **rejected**: it would
add ~15 kB gzipped, and TanStack Table is headless row/column state management
that renders nothing and would not have touched the lookup.

## Honest result — and a correction

The lookup is genuinely **108x faster in isolation** (60.82 ms to 0.56 ms,
benchmarked on the real payload with no React). But that is not the same as the
page being 108x faster, and an earlier draft of this note wrongly claimed
"297 ms to 8.9 ms, 33x". **That reading was invalid**: it was taken while the
table was already filtered to 8 rows, so it measured a 304-cell render and
compared it against a 3364-cell one.

Measured properly, by stashing the change and A/B testing the same interaction:

| | Baseline | With the index |
|---|---|---|
| Expand from 8 rows to all 58 | 252.6 ms / 230.4 ms | 249.3 ms / 180.2 ms |

**That is within noise.** The honest conclusion is that the index removes 61 ms
of measurable JavaScript, but the page's dominant cost is elsewhere and the fix
is not perceptible at this data size.

## Where the remaining cost actually is

Cost scales with cell count, not with the lookup:

| Rows | Cells | Render |
|---|---|---|
| 8 | ~304 | ~5 ms |
| 58 | 3364 | ~200 ms |

3364 `<td>` elements are created and reconciled on every full render. That is
the bottleneck. Removing it needs **virtualisation** (render only the visible
rows and columns), which is the one thing a table library genuinely provides
here.

## Recommendation for a future T9

Virtualise the matrix. The honest case:

- **Problem:** 3364 DOM nodes per render, ~200 ms, a visible long task.
- **Fix:** row and column virtualisation, so only the viewport is rendered.
- **Library:** this is where TanStack Table (with `@tanstack/react-virtual`)
  would earn its 15 kB, or `@tanstack/react-virtual` alone.

Note that the same 3364-node problem applies to the *look*, not only the speed:
a reader sees a 58x58 grid of 11px numbers, which is dense by design. Any
virtualisation work should confirm the dense grid is still the intent.

## What shipped

- `indexCells()` + `useMemo` — correct, tested, and a real 108x on the lookup
- Name sorting, asc/desc, with headers following rows (verified in the browser)
- 7 new tests; suite now **204 passing**
- A Rules of Hooks bug was introduced and caught during this work: the new
  `useMemo` calls were placed after the loading early-return, which threw
  "Rendered more hooks than during the previous render" and blanked `/matriks`.
  Moved above the guard. Worth remembering: **any hook added to this page must
  go above the early returns.**
