# Delegation tasks — wave 3 (skills and docs)

**Read `01-decisions.md` D7 first.** The instruction is *extend*, not rewrite.
The last revamp's root cause was that these skills were never wired up — not
that their rules were wrong. Rewriting them repeats that mistake inverted.

---

## T10 — Add `references/component-libraries.md` to `antislop-ui`

**The real gap:** `antislop-ui` says a great deal about colour, layout, motion
and decoration, but **nothing about choosing a dependency**. An agent reading it
today gets no help deciding between Cytoscape and Sigma, or whether shadcn/ui
is acceptable. That silence is why an agent defaults to whatever is popular —
which is the exact failure mode the skill exists to prevent.

**Write a reference file covering:**

1. **Popularity is evidence, not a decision.** Record weekly downloads, last
   release date, and licence before choosing. Then ask whether the library's
   *default look* is the product's look. shadcn/ui is safe because it copies
   source in; a themed library fights the design direction.

2. **Licence is a hard gate.** Real example from this project:
   `@cosmograph/react` is CC-BY-NC-4.0 — non-commercial, unusable in open
   source. Check the licence before the API.

3. **Bundle cost against the current app, not in the abstract.** Real example:
   Cytoscape is 133.6 KB gzipped while the whole PRISM app is 116 KB. A
   dependency larger than the app must be code-split or refused.

4. **The default-library tell applies to dependencies too.** R-04 names Lucide
   because a single default icon set makes every AI site identical. Same logic
   for component kits: the tell is the library that arrived because it was the
   default, not because it fit.

5. **Never swap a working component for performance you have not measured.**
   Real example: this project's hand-rolled graph runs at 60 fps with a worst
   frame of 17 ms at 58 nodes. Performance would have been a false justification.

6. **A checklist:** licence compatible? maintained in the last 12 months?
   download count recorded? bundle cost measured against current build? default
   styling overridable by our tokens? accessibility included or hand-rolled?
   behaviour parity list written *before* the swap?

**Also patch `SKILL.md`:** add one line to the UI Skill Checklist —
"Is every new dependency licence-checked, size-measured against the current
build, and chosen for fit rather than popularity? (see
`references/component-libraries.md`)"

**Do not renumber or alter any existing R-XX rule.**

---

## T11 — Add `references/data-visualization.md` to `antislop-ui`

**The gap:** the skill covers "Charts Without a Question" in one paragraph and
says nothing about graphs, maps, or node-link diagrams — which is the entire
primary view of this app.

**Cover:**
- A node-link diagram needs a stated question, like a chart does.
- Colour in a data view is *data*, not decoration: every colour must decode to a
  value, and the legend must be present.
- Contrast applies to data marks — 3:1 against adjacent colours (R-25), which
  matters for tier colours sitting next to each other.
- Labels are content: hiding them at low zoom is legitimate; never rendering
  them is not.
- Interaction honesty: if a node is draggable it must stay where dropped.
  Cite the real failure — reheating a simulation on drag makes the whole layout
  jump, which users read as the app fighting them.
- Empty and single-node states: a graph with 1 node or 0 edges must still render
  sensibly, not divide by zero on fit-to-view.
- Density: state a node-count ceiling and what happens past it.

---

## T12 — Add `references/tailwind-v4-flow.md` to `design-md`

**The gap:** the skill documents the CLI export command but not what to do with
the output in a real project, which is where the last build broke.

**Cover:**
- The one-way flow: `DESIGN.md` -> `export --format css-tailwind` -> the
  `@theme` block in `theme.css`. Never hand-edit downstream.
- **`@import "tailwindcss"` must be the first line** of the theme file, before
  any `@layer`. Real failure from this project: it was missing, no utilities
  generated, and every component silently collapsed to default styling while
  the tokens looked correct in the file.
- When a palette must exist in more than one language (CSS, TS for canvas,
  Python because the API returns tier colours), DESIGN.md is the single source
  and the others are generated or manually synced with a test that compares them.
- Fill vs text colours need separate tokens. Real example: one bronze cannot be
  both a lively button fill and readable body text — `#9A6B2F` is 3.75:1 on
  parchment (fails AA) while `#7A5320` is 5.49:1 (passes).
- Verify contrast numerically, never by eye. A palette that "looked good" here
  had 8 real AA failures.

---

## T13 — Patch `antislop-copywriting` with an Indonesian UI-copy section

**The gap:** the skill's anti-patterns are English-specific ("Unlock", "Elevate",
"Seamless"). This app ships entirely in Indonesian, so the skill currently
cannot check its own copy.

**Add a section covering:**
- Indonesian equivalents of the banned buzzword class: *revolusioner, mudah
  banget, solusi terdepan, transformasi digital, all-in-one*.
- Formal vs informal register (*Anda* vs *kamu*) — pick one and hold it. PRISM
  uses *Anda*.
- Do not translate UI conventions literally: "Learn more" as *Pelajari lebih
  lanjut* is fine; "Get started" as *Dapatkan dimulai* is machine translation.
- Keep widely-understood English technical terms (*dashboard*, *admin*) rather
  than forcing awkward calques.
- Honest empty/error states in Indonesian must still name cause and next action
  (R-27): "Belum ada data. Jalankan sinkronisasi untuk mengisinya."
- Data-honesty disclaimers must be unambiguous in Indonesian. PRISM's scores are
  *estimasi ilustratif*, not measurements, and the wording must not imply
  precision the data does not have.

**Do not** touch the English rules or renumber anything.

---

## T14 — Update project docs

**Files:** `README.md`, `AGENTS.md`, `CONTRIBUTING.md`

- `AGENTS.md` currently says "62 tests" for the frontend and "62 tests" for the
  backend in the verification block. Real counts are **73 backend, 62 frontend**.
  Fix, and add the new gate commands.
- Add the new dependencies and the reason for each (one line, per D1-D5).
- Document the code-splitting requirement for the map.
- Keep the data-honesty disclaimer prominent: 58 figures, 150 relationships and
  24 issues are **illustrative estimates**, not measurements.
