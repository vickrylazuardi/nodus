# PRISM revamp — task status

Last verified: 2026-09-21. Every state below was checked against the working
tree, not recalled.

Legend: **DONE** verified · **PARTIAL** some of it · **OPEN** not started ·
**BLOCKED** waiting on something

---

## Wave 1 — accessibility and layout

| ID | Task | State | Evidence |
|---|---|---|---|
| T1 | `<h1>` on every public route | **DONE** | 7/7 routes report exactly 1, correct titles |
| T2 | Mobile overflow on `/figur/:id` | **DONE** | 0 overflow at 320 / 390 / 768 px (was 442px at 390) |
| T3 | Touch targets >= 44px | **DONE** | 0 under 44px on /matriks, /figur, /figur/1 (was 66/19/8) |
| T4 | Live regions for async state | **DONE** | `[aria-live]` present on /figur and /matriks |
| T5 | Admin forms to react-hook-form + zod | **DONE** | 3 files converted, 66 new tests |
| T6 | Admin ARIA | **DONE** | Issues 0->11, Figures 0->17, Relationships 2->21 |

T5/T6 took two attempts. The first ran 82 minutes, edited nothing, and left
scratch files that broke `npm run build`. See `05-rhf-findings.md` and
`06-t5t6-retry.md`.

---

## Wave 2 — components

| ID | Task | State | Evidence |
|---|---|---|---|
| T7 | Replace map with Cytoscape + fCoSE | **DONE** | See `09-t7-result.md`. Drag drift 0.0, 5 compound blocs, code-split |
| T8 | shadcn/Radix primitives | **OPEN** | `@radix-ui/*` not installed |
| T9 | TanStack Table for `/matriks` | **OPEN** | `@tanstack/react-table` not installed |

T9 depends on T3, which is done, so it is unblocked.

---

## Wave 3 — skills and docs

| ID | Task | State | Evidence |
|---|---|---|---|
| T10 | `antislop-ui` component-libraries reference | **DONE** | 173 lines, loads via skill_view |
| T11 | `antislop-ui` data-visualization reference | **DONE** | 140 lines |
| T12 | `design-md` tailwind-v4-flow reference | **DONE** | 145 lines |
| T13 | `antislop-copywriting` Indonesian section | **DONE** | +97 lines, checklist wired |
| T14 | Docs + dependency table | **DONE** | stale counts fixed (62/49 -> 73/62) |

---

## Found during the work, not in the original plan

| ID | Issue | State | Detail |
|---|---|---|---|
| B1 | **Admin bundle is eagerly imported** | **OPEN** | `App.tsx` imports `AdminApp` at the top, so public visitors download the admin dashboard. The main chunk grew 393 -> 486 kB. Cytoscape is correctly split; the admin is not. Fix: `React.lazy` on the `/admin` route. |
| B2 | **Test suite is flaky in parallel** | **OPEN** | Full parallel runs have failed 5 and 4 tests intermittently; `--no-file-parallelism` passes 197/197 every time, and each file passes alone and in pairs. Not diagnosed. Blocks a trustworthy `npm test` for contributors. |
| B3 | **The repo has zero commits** | **OPEN** | `git status` shows everything untracked: `.gitignore`, `AGENTS.md`, `backend/`, `frontend/`, `docs/`. For an open-source release this is the first thing to fix. |
| B4 | `AGENTS.md` test counts stale again | **OPEN** | Says 62 frontend tests; actual is 197. Backend 73 is correct. |

---

## Verification gates, current

| Gate | State |
|---|---|
| `backend pytest` | 73 pass |
| `frontend npm test` | 197 pass single-threaded; **flaky in parallel (B2)** |
| `tsc --noEmit` | clean |
| `npm run build` | succeeds, 2 chunks |
| `design.md lint` | 0 errors, 0 warnings |
| Browser click-through | recorded for public routes and all 5 admin pages |

---

## Suggested order for what is left

1. **B3 commit the repo** — cheap, and it protects everything already built.
2. **B1 lazy-load admin** — small change, real user-facing win.
3. **B2 fix the flake** — needs the failure text, which the last capture missed.
4. **B4 refresh the counts** — trivial, do it with B1.
5. **T9 matrix table** — unblocked.
6. **T8 Radix primitives** — the largest remaining item, and the least urgent:
   the audit findings it addressed were focus traps and keyboard nav, which
   T5/T6 already fixed by hand in the admin.
