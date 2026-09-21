# PRISM revamp plan — index

Written 2026-09-20. All findings measured against the running app, not estimated.

## Files

| File | Purpose |
|---|---|
| `00-audit.md` | What is actually wrong, with evidence. Includes non-findings. |
| `01-decisions.md` | Library choices and rationale, including what was rejected. |
| `02-tasks-wave1.md` | T1-T6: accessibility and mobile fixes. Parallel, low risk. |
| `03-tasks-wave2.md` | T7-T9: graph swap, shadcn, table. Higher risk. |
| `04-tasks-wave3.md` | T10-T14: skills and docs. |

## Delegation order

```
Wave 1  T1 T2 T3 T4 T5 T6     parallel, cheap models fine
Wave 2  T7                    strongest model — highest risk
        T8                    parallel with T7
        T9                    after T3
Wave 3  T10 T11 T12 T13 T14   parallel, cheap models fine
```

Wave 1 before wave 2: T3 (touch targets) must land before T9 (table rebuild),
or the table work gets redone.

## Model guidance

- **T7 (graph swap)** — strongest model. It replaces a component that currently
  works and is verified; a regression here is worse than no change.
- **T5, T8** — mid-tier. Library integration with a fixed contract.
- **T1, T2, T3, T4, T6, T9, T14** — cheap models. Each has a measured problem,
  a named file, and a numeric pass condition.
- **T10-T13** — cheap models, but they are writing *prose about judgement*.
  Give them the real examples from `01-decisions.md`; those examples are what
  makes the guidance concrete rather than generic.

## The gate (every task)

```bash
cd backend  && /Users/macbook/.hermes/bin/uv run pytest -q   # 73 pass
cd frontend && npm test                                       # 62 pass
cd frontend && npx tsc --noEmit                               # clean
cd frontend && npm run build                                  # succeeds
npx -y @google/design.md lint DESIGN.md                       # 0 errors
```

Plus, per the antislop Delivery Gate: a recorded browser click-through. A claim
of "works" without one is not a pass.

## Known-stale facts to fix in flight

`AGENTS.md` line 82-83 claims 62 backend / 49 frontend tests. Verified actual:
**73 backend / 62 frontend**. T14 fixes this.

## Progress

| Task | Status | Evidence |
|---|---|---|
| T1 h1 on public routes | **done, verified** | 7/7 routes report exactly 1 `<h1>`, correct titles |
| T2 mobile overflow | **done, verified** | 0 overflow at 320/390/768px on 4 routes (was 442px at 390) |
| T3 touch targets | **done, verified** | 0 under 44px on /matriks, /figur, /figur/1 (was 66/19/8) |
| T4 live regions | **done, verified** | `[aria-live]` = 1 on /figur and /matriks, reads "Menampilkan seluruh 58 figur" |
| T5 admin react-hook-form | **FAILED, not started** | 82 min, 0 edits to any admin file, agent stopped |
| T6 admin ARIA | **FAILED, not started** | aria counts unchanged (Audit 0, Issues 0, Overview 0) |
| T10 component-libraries reference | **done** | 173 lines, loads via skill_view |
| T11 data-visualization reference | **done** | 140 lines |
| T12 tailwind-v4-flow reference | **done** | 145 lines |
| T13 Indonesian copy section | **done** | +97 lines, checklist wired in |
| T14 docs + dependency table | **done** | stale counts fixed (62/49 -> 73/62) |
| T7 graph swap | **de-risked, not started** | feasibility spike 11/11 pass, see `08-t7-spike-results.md` |
| T8 shadcn/Radix primitives | not started | |
| T9 TanStack Table | not started | |

### T7 is now de-risked by measurement

A headless spike (`08-t7-spike-results.md`, scripts in `spikes/`) confirmed
**11/11 parity checks pass** with `cytoscape@3.34.3` + `cytoscape-fcose@2.2.0`:

- allies sit closer than rivals: **181 vs 293** (n=92/38)
- same-bloc members cluster: **162 vs 428** cross-bloc
- locked node survives a relayout, holding at +(150, 90)
- 58 nodes / 150 edges / 5 compound blocs laid out in **~85 ms**

It also found a blocking bug before any implementation started: **fCoSE
compound layout crashes with `RangeError: Invalid array length` when
`styleEnabled: false`**, and some config variants *hang* instead of erroring.
Both are written up with the fix.

Consequence: layout is computable headless, so parity rows 1, 2 and 10 become
automated vitest cases instead of manual browser checks.

### Housekeeping

Removed two dead artifacts left by the failed first attempt:
`src/pages/admin/__scratch*.tsx` (which broke `npm run build`) and
`tsconfig.verify.json` (excluded scratch files that no longer existed, and was
referenced by nothing).

### T5/T6 retry in flight

First attempt failed (see below). Retry dispatched as `deleg_43704dfb` with a
hardened brief in `06-t5t6-retry.md`:

- explicit time budget (real edits to `AdminIssues.tsx` within 15 minutes)
- scratch files must live in `/tmp/`, never under `src/`
- **scope reduced to one file** (`AdminIssues.tsx`, 302 lines, 0 aria attrs)
  delivered complete with tests, before any other file is touched
- the prior findings handed over instead of re-derived

Rationale for the reduced scope: the first attempt's failure mode was breadth
without depth. A finished single file is verifiable; three half-finished files
are not.

### T5/T6 first attempt — failed

The admin agent ran 82 minutes, edited **no** admin file, and wrote no tests.
Its only output was three scratch files named `src/pages/admin/__scratch*.tsx`,
which `tsc -b` compiled as part of the build and **broke `npm run build`**.
They have been deleted and the build restored.

Its experiments did produce real findings (zod/NaN coercion, `trigger` with
dotted paths, `z.record` for row editors), now preserved in
`05-rhf-findings.md` so the retry starts from them instead of repeating 80
minutes of probing. The retry needs an explicit time budget and a rule that
scratch files live in `/tmp/`, never under `src/`.

### Verification method

T1-T4 were verified by **independent browser measurement**, not by reading the
agent's report. One apparent failure (`/matriks` showing `h1 = "Figur"`) turned
out to be a stale-render race from measuring during in-flight HMR edits; a
clean re-measure showed the correct title. Recorded because it is a real trap:
do not measure a page while a dev server is hot-reloading it.

## What this plan deliberately does not do

- Does not rewrite the backend (73 tests pass, contract is stable).
- Does not touch the scoring model or the soft clamp.
- Does not change the palette (WCAG AA verified across all 9 tiers).
- Does not add an icon library (D3 — antislop names Lucide as a tell).
- Does not claim performance as a reason for the graph swap (60 fps measured).

## Honest limitation

Every UI finding here was measured from the DOM — heading counts, scroll widths,
element box sizes, contrast ratios, frame timings. None of it was seen. Whether
the revamped UI *looks* good remains a human judgement, and the dials in
`DESIGN.md` (ENERGY 2 / RHYTHM 3 / MOTION 2) are the control for that, not the
task list.
