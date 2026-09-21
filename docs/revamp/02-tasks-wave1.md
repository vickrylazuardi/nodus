# Delegation tasks — wave 1 (parallel, no dependencies)

**Rules for every task below.** Copy these into each delegation prompt.

```
Repo: /Users/macbook/civ-politics-v2
Backend: cd backend && /Users/macbook/.hermes/bin/uv run pytest -q   (73 must pass)
Frontend: cd frontend && npm test                                     (62 must pass)
Typecheck: cd frontend && npx tsc --noEmit                            (must be clean)
Build: cd frontend && npm run build                                   (must succeed)

Read /Users/macbook/civ-politics-v2/AGENTS.md before writing any UI.
Read /Users/macbook/civ-politics-v2/DESIGN.md for every colour and type value.
NEVER hand-edit a colour. NEVER use text-primary for text (use text-primary-ink).
UI copy is INDONESIAN.
Do not add an icon library. Do not add motion beyond hover/transition.
Do not modify: backend/, DESIGN.md palette, app/services/scoring.py.
You are DONE only when all four commands above pass. Report the exact numbers.
```

---

## T1 — Add `<h1>` to every public route (fixes A1)

**Problem:** all six public routes start at `<h2>`. Verified: `h1 count = 0` on
`/peta`, `/figur`, `/matriks`, `/isu`, `/statistik`, `/cara-baca`.

**Do:** give each page exactly one `<h1>`. The text already exists as the
current first `<h2>` ("Peta relasi", "Figur", "Matriks relasi", "Isu dan bobot
penilaian", "Statistik peta politik", "Cara membaca peta ini"). Promote it, or
add a visually-hidden `<h1>` if the design needs the current visual weight.
`/figur/:id` already has an `<h1>` (the figure's name) — leave it.

**Files:** `frontend/src/pages/*.tsx`

**Verify:** add a test asserting exactly one `<h1>` per public route. Then in a
browser confirm `document.querySelectorAll('h1').length === 1` on all six.

**Done when:** all six report 1, and the four gate commands pass.

---

## T2 — Fix mobile overflow on `/figur/:id` (fixes A2)

**Problem:** at 390x844 the page reports `scrollWidth = 442` (52px too wide).
Offending elements measured: `section.rounded-md.border.border-rule` at
`w=422` and `div.flex.flex-col.gap-5` at `w=422`.

**Do:** find why those sections exceed the viewport. Likely a fixed width, a
`min-w-`, or a grid column that does not collapse. Fix so
`scrollWidth <= innerWidth` at 390px.

**Files:** `frontend/src/pages/FigureDetailPage.tsx` (444 lines)

**Verify in a real browser at 390x844:**
```js
document.documentElement.scrollWidth <= window.innerWidth + 1
```
Also check 320px (smallest common phone) and 768px.

**Done when:** no horizontal overflow at 320, 390, 768; gate commands pass.

---

## T3 — Raise touch targets to 44px (fixes A4)

**Problem measured:** `/matriks` 66 of 66 interactive elements under 44px;
`/figur/1` 19; `/figur` 8.

**Do:** ensure every `button` and `a[href]` has a hit area of at least 44x44
CSS px. Use padding or a pseudo-element to extend the hit area — do NOT make
the matrix cells visually huge, which would break the dense-grid design. A
transparent expanded hit area is the right tool for matrix cells.

**Files:** `frontend/src/pages/MatrixPage.tsx`, `FiguresPage.tsx`,
`FigureDetailPage.tsx`, `frontend/src/components/ui.tsx`

**Verify:**
```js
Array.from(document.querySelectorAll('button,a[href]'))
  .filter(b => { const r = b.getBoundingClientRect();
                 return r.width > 0 && (r.width < 44 || r.height < 44); }).length
```
Must be 0 on `/matriks`, `/figur`, `/figur/1`.

**Done when:** count is 0 on those three routes; the matrix still reads as a
dense grid; gate commands pass.

---

## T4 — Add live regions for async state (fixes A3)

**Problem:** zero `[aria-live]` regions app-wide. Filter changes, loading, and
save results are silent to screen readers.

**Do:**
1. In `ui.tsx`, give `LoadingState` `role="status"` and `aria-live="polite"`.
2. Give `ErrorState` `role="alert"`.
3. On `/figur` and `/matriks`, add a polite live region announcing result
   counts after filtering, in Indonesian, e.g. `Menampilkan 12 dari 58 figur`.

**Files:** `frontend/src/components/ui.tsx`, `pages/FiguresPage.tsx`,
`pages/MatrixPage.tsx`

**Verify:** `document.querySelectorAll('[aria-live]').length >= 1` on `/figur`
and `/matriks`; the count text updates when a filter changes.

**Done when:** verified in browser; gate commands pass.

---

## T5 — Admin forms to react-hook-form + zod (fixes A6)

**Problem:** 4 admin files manage form state with raw `useState`; no validation,
no error summary.

**Do:** `npm i react-hook-form @hookform/resolvers` (zod already present).
Convert admin forms to RHF with zod resolvers. Every field gets
`aria-invalid` and `aria-describedby` pointing at its error. Add an error
summary with `role="alert"` at the top of each form.

**Files:** `frontend/src/pages/admin/AdminFigures.tsx`,
`AdminIssues.tsx`, `AdminRelationships.tsx`

**Do not** change the API calls or payload shapes — the backend contract is
tested by 17 OpenAPI contract tests and must keep passing.

**Verify:** submit an invalid form; errors appear inline and in the summary;
submit a valid one; it still saves. Gate commands pass.

---

## T6 — Admin ARIA pass (fixes A5)

**Problem measured:** `AdminAudit.tsx`, `AdminIssues.tsx`, `AdminOverview.tsx`
have **0** aria attributes.

**Do:** label every icon-only or ambiguous control; associate every input with
a `<label>`; give tables `<caption>` or `aria-label`; ensure focus is visible on
every interactive element.

**Files:** `frontend/src/pages/admin/*.tsx`

**Verify:** tab through each admin page with the keyboard only — every control
reachable, focus always visible, no trap. Report the tab order you observed.

**Done when:** keyboard walkthrough passes; gate commands pass.
