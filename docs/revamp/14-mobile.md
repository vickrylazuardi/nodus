# Mobile responsiveness

Added after the revamp was otherwise complete. Every finding below was measured
in a real browser; the numbers are before/after, not estimates.

## The measurement trap that cost the most time

`document.documentElement.scrollWidth > window.innerWidth` **does not reliably
detect horizontal overflow**. On `/admin/isu` it reported `scrollW=320` on a
320px viewport while the page could genuinely be scrolled 206px sideways.

The test that works is to try to scroll:

```js
const b = window.scrollX;
window.scrollTo(9999, window.scrollY);
const scrolled = window.scrollX - b;   // > 1 means real overflow
window.scrollTo(b, window.scrollY);
```

Every overflow claim in this document was re-verified with that, and several
earlier "clean" readings turned out to be wrong.

## Real bugs found and fixed

### 1. `sr-only` escaping its scroll container (the subtle one)

`/admin/relasi` scrolled sideways by **402px** on a 320px viewport.

`sr-only` is `position: absolute`. With no positioned ancestor it resolves
against the initial containing block, so inside a `whitespace-nowrap` table cell
it escaped the table's `overflow-x-auto` wrapper and widened the document. The
cell was 150px wide; the span rendered at `right: 526`.

Fix: `relative` on the containing cell. Three cells affected
(`AdminFigures`, `AdminIssues`, `AdminRelationships`).

### 2. `min-w-0` on `Panel`

`/statistik` forced the document to **374px** on a 320px viewport.

A grid or flex item's automatic minimum size is its content's min-content width,
so a `Panel` holding a long unbroken string could not shrink below that string.
Measured: the grid track was 280px while its `Panel` children rendered 354px.

Fix: `min-w-0` on `Panel` in `ui.tsx`, which covers every page that uses it.

### 3. `minmax(<px>, …)` floors in grid tracks

`minmax(300px, 1fr)` resolved to a **280px single column** at a 320px viewport —
the floor cannot shrink. Fixed in `StatsPage` and `FigureDetailPage` by using
`minmax(0, …)`; at `lg` and above the `fr` ratio still gives the intended width.

### 4. Figure card could not shrink

The card rendered **283px inside a 238px track**, pushing `/figur` to 324px.
Same root cause as (2): a grid item without `min-w-0`. Fixed on the card itself.

### 5. Masthead squeezed into a six-row column

Measured at 320px: the wordmark took most of the row, so `flex-wrap` squeezed the
nav into an **81px column** and the six links stacked into **six rows, 284px
tall**. The nav was technically "wrapped", which is why a class-level check
missed it, but it was a squeezed desktop row rather than a mobile design.

Fix: the nav gets its own full-width row below `lg`, scrolling horizontally.

### 6. The three-row tablet band

The first masthead fix switched to a single row at `sm` (640px). Measured: at
640px the wordmark, six nav links and the Admin button cannot share a row, so it
became **three rows and a 113px header** — the "two-state layout" failure, where
the middle of the width range is an accident.

Fix: the single-row state starts at `lg`, not `sm`.

| width | before | after |
|---|---|---|
| 320px | 157px header, 3 rows | **109px, 2 rows** |
| 640px | 113px header, 3 rows | **109px, 2 rows** |
| 1024px+ | 65px, 1 row | 65px, 1 row |

### 7. Admin link stretched across the row

The Admin link measured **288px wide** on a phone, which is what pushed the
masthead to three rows. Fixed with `shrink-0` and `ml-auto`.

### 8. Touch targets the earlier sweep missed

The T3 probe checked only `button, a[href]`. Added since: `select` and `input`.

| Route | Control | Before | After |
|---|---|---|---|
| `/peta` | range slider | 130x16 | 44 tall |
| `/peta` | bloc select | 187x31 | 44 tall |
| `/peta` | checkbox | 13x13 | 18px inside a 44px label |
| `/admin` | form fields | 378x39 | 44 tall |
| admin | sub-nav links | 33 tall | 44 tall |
| admin | overview links | 38 tall | 44 tall |
| admin | "Isu" link | 41 wide | 44 wide |
| admin | search fields | 38 tall | 44 tall |

A false positive worth recording: the checkbox still measured 18x18 and looked
like a failure. It is not one. A control inside a `<label>` inherits the label's
hit area — verified by clicking the label text 25px away, which toggled it.
**Judge the hit area, not the element.**

## Verification

Real horizontal-overflow test, all 12 routes, at every width:

| width | result |
|---|---|
| 320, 360, 390, 414, 480, 640, 768, 1024, 1280, 1440 | **ALL OK** |

Also confirmed at mobile widths:

- matrix virtualisation still active: **161–385 DOM cells**, not 3364
- map renders 58 nodes and 5 blocs, canvas 238x576 at 320px
- masthead: 2 rows below 1024px, 1 row above

## Tests

`mobileLayout.test.ts` — 12 tests, mutation-tested. Removing the `relative`
from one `sr-only` cell makes the guard fail; restoring it makes it pass.

Suite: **256 frontend + 73 backend**.

## Honest limitation

Two tests initially asserted the wrong property and failed on correct code:

- one demanded `min-w-0` on every truncating element, but the class correctly
  lives on the wrapping element in one place
- one counted masthead controls with a regex that missed a class inside a `cx()`
  call, finding 2 of 3

Both were corrected to the measured behaviour rather than loosened. Worth
noting because a test that fails on correct code is as misleading as one that
passes on broken code.
