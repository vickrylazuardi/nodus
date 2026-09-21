# T5/T6 retry brief — admin forms and ARIA

**This file is the task. Read it fully before starting.**

## Why there is a retry

A previous agent ran 82 minutes, edited **zero** admin files, wrote no tests,
and left scratch files under `src/` that broke `npm run build`. Two rules exist
because of that:

1. **Scratch files go in `/tmp/`, never under `src/`.** `tsconfig.json` includes
   all of `src`, so any stray file there is compiled into the production build
   and an unused import fails it.
2. **Deliver a working minimal version first, then improve it.** Do not spend
   the budget exploring. Land the smallest correct change, verify it, then
   iterate if time remains.

## Time budget

Aim to have real edits to `AdminIssues.tsx` on disk within the first 15 minutes.
Do not probe the library further; the probing is already done and summarised in
`05-rhf-findings.md` in this directory. Read that file, then write code.

## Already established — do not re-derive

- `zodResolver` with `z.record(z.string(), rowSchema)` is the right shape for
  the per-row score editors in `AdminRelationships.tsx`.
- `form.trigger(["rows.2.score", "rows.2.weight"])` validates specific dotted
  paths only. Use it for per-row validation.
- `valueAsNumber: true` stores **`NaN`** when a number input is cleared. Set
  `invalid_type_error` on every numeric field so a blank field reads as
  Indonesian copy, not a type error. `NaN` lands at
  `errors.rows.<id>.<field>`, which is where `aria-describedby` must point.
- `resetField` works for clearing one row.

## Packages (already installed, do NOT run npm install)

`react-hook-form@7.88.0`, `@hookform/resolvers@5.9.1`, `zod@3.24.1`.

## Hard rules

- UI copy is **Indonesian**, formal register (`Anda`). Error messages say what
  to do: `Nama wajib diisi`, not `Invalid input`.
- Never use `text-primary` for text. Use `text-primary-ink`.
- No icon library. No emoji. No motion beyond hover/transition.
- **Do not change any API call or payload shape.** 17 OpenAPI contract tests in
  `frontend/src/lib/api-contract.test.ts` pin the contract and must keep passing.
  Read `frontend/src/lib/api.ts` and `frontend/src/lib/types.ts` for the shapes.
- Do not run `npm run build` unless you first confirm no scratch files exist
  under `src/`. Typecheck and test are enough.

## File ownership

You may edit ONLY:
- `frontend/src/pages/admin/*.tsx`
- `frontend/src/pages/admin/*.test.tsx` (new files you create)

Do NOT touch: `frontend/src/pages/*.tsx` (top level), `frontend/src/components/`,
`DESIGN.md`, `frontend/src/styles/theme.css`, `backend/`, `package.json`.

## Scope: do AdminIssues.tsx FIRST

Deliver T5 for **`AdminIssues.tsx` only** as a complete, tested, working unit.
That file is 302 lines and has 0 aria attributes. It is the smallest real win.

Only after it is done, verified, and committed to disk, move to
`AdminFigures.tsx` (391 lines) and then `AdminRelationships.tsx` (680 lines).
If the budget runs out, a fully finished `AdminIssues.tsx` is worth far more
than three half-finished files. **Partial completion of one file is a failure;
complete completion of one file is a success.**

Report clearly which files you finished and which you did not start.
