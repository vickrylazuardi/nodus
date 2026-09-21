# react-hook-form + zod findings (for the T5 retry)

Recovered from a stalled subagent's scratch files before deleting them. These
are real, tested behaviours — the retry should not rediscover them.

## Confirmed working

- **`zodResolver` with a `z.record(z.string(), rowSchema)` shape works** for the
  nested per-row score editors in `AdminRelationships.tsx`. This is the right
  model for a dynamic list of issue rows keyed by issue id.
- **`form.trigger(["rows.2.score", "rows.2.weight", "rows.2.stance"])`** accepts
  an array of dotted field paths and validates only those. Use this for
  per-row validation instead of validating the whole form.
- **`resetField` works** for clearing a single row.
- **`<select>` with a `refine` works** for the stance/relationship-type fields.

## The trap: cleared number inputs

`valueAsNumber: true` stores **`NaN`** when the user clears a number input.
This matters because the score editor has `min`/`max` constraints and a blank
field must produce a readable Indonesian message, not "Expected number,
received nan".

Verified zod behaviour with `z.number({ invalid_type_error: "angka" })`:

| input value | resulting error code |
|---|---|
| `NaN` (field cleared) | `invalid_type` |
| `null` | `invalid_type` |
| `undefined` (key absent) | `invalid_type` / required |
| `11` with `.max(10)` | `too_big` |
| `5` | valid |

**Consequence:** set `invalid_type_error` on every numeric field so a cleared
input reads as a human message ("Isi angka" / "Wajib diisi"), not as a type
error. Also note `NaN` propagates through `z.record` — the error lands at
`errors.rows.<id>.<field>`, which is the path the inline `aria-describedby`
must point at.

## Unresolved when the agent stalled

- Whether a row-scoped `trigger` surfaces errors when the **whole form** has
  never been submitted. The scratch log shows `errors: {}` after triggering row
  fields in one case. The retry should verify this explicitly rather than assume
  it, because the inline error display depends on it.
- `NaN` inside a `z.record` produced `[{"p":...}]`-shaped output in one probe;
  the exact error path shape was not pinned down.

## What went wrong with the first attempt

The agent spent 82 minutes and produced **no edits to any admin file**
(`react-hook-form` appears 0 times in all six) and no tests. It wrote three
scratch files under `src/pages/admin/` named `__scratch*.rhf.test.tsx`, which
`tsc -b` then tried to compile — **breaking the project's own `npm run build`**.
Its transcript went silent for 59 minutes before being stopped.

Lessons for the retry, and worth stating in the prompt:

1. **Scratch files must not live under `src/`.** `tsconfig.json` includes all of
   `src`, so a scratch file with an unused import fails the production build.
   Use `/tmp/` for experiments.
2. **A time limit matters.** "Explore until confident" produced 80 minutes of
   probing and zero delivery. The retry gets an explicit budget and an
   instruction to deliver a working minimal version first.
3. The research above was the genuinely valuable output. It is preserved here so
   the retry starts from these findings instead of repeating the experiments.
