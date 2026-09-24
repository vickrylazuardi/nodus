---
version: alpha
name: NODUS Assay
description: A precision measuring instrument for a contested subject. Cool neutral ground, one indigo accent outside the data axis, and a diverging score ramp whose intensity is legible in greyscale.
dial: ENERGY 2 / RHYTHM 3 / MOTION 2

colors:
  primary: "#2E3FBF"
  primary-hover: "#4256D6"
  primary-ink: "#2E3FBF"
  neutral: "#F4F6F8"
  neutral-raised: "#FFFFFF"
  neutral-sunk: "#E8EBF0"
  ink: "#0C1421"
  ink-soft: "#46536B"
  ink-muted: "#5D6B82"
  rule: "#D3D9E2"
  rule-strong: "#AEB7C6"
  ally: "#0C4232"
  hostile: "#6E1913"
  secondary: "#6A7487"

typography:
  display-xl:
    fontFamily: IBM Plex Sans
    fontSize: 3.25rem
    fontWeight: 600
    lineHeight: 1.06
    letterSpacing: "-0.022em"
  display-lg:
    fontFamily: IBM Plex Sans
    fontSize: 2rem
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-0.018em"
  display-md:
    fontFamily: IBM Plex Sans
    fontSize: 1.375rem
    fontWeight: 600
    lineHeight: 1.22
    letterSpacing: "-0.012em"
  body-lg:
    fontFamily: IBM Plex Sans
    fontSize: 1.0625rem
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: IBM Plex Sans
    fontSize: 0.9375rem
    fontWeight: 400
    lineHeight: 1.55
  body-sm:
    fontFamily: IBM Plex Sans
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.5
  measure:
    fontFamily: IBM Plex Mono
    fontSize: 0.8125rem
    fontWeight: 500
    lineHeight: 1.3
    fontFeature: "tnum"
  figure-numeral:
    fontFamily: IBM Plex Mono
    fontSize: 2.75rem
    fontWeight: 600
    lineHeight: 1
    fontFeature: "tnum"
  label:
    fontFamily: IBM Plex Sans
    fontSize: 0.75rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.06em"

rounded:
  none: 0px
  sm: 2px
  md: 4px
  lg: 6px

spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  xxl: 64px

components:
  page:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.ink}"
  panel:
    backgroundColor: "{colors.neutral-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: 20px
  panel-sunk:
    backgroundColor: "{colors.neutral-sunk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: 20px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    padding: 10px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    padding: 10px
  button-quiet:
    backgroundColor: "{colors.neutral-sunk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: 10px
  button-danger:
    backgroundColor: "{colors.hostile}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    padding: 10px
  input-field:
    backgroundColor: "{colors.neutral-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: 9px
  link:
    textColor: "{colors.primary-ink}"
    typography: "{typography.body-md}"
  text-body:
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
  text-secondary:
    textColor: "{colors.ink-soft}"
    typography: "{typography.body-sm}"
  text-muted:
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
  focus-ring:
    backgroundColor: "{colors.primary-ink}"
    height: 2px
  divider:
    backgroundColor: "{colors.rule}"
    height: 1px
  score-bar-ally:
    backgroundColor: "{colors.ally}"
    height: 6px
  score-bar-hostile:
    backgroundColor: "{colors.hostile}"
    height: 6px
  scale-axis:
    backgroundColor: "{colors.rule-strong}"
    height: 1px
  matrix-diagonal:
    backgroundColor: "{colors.rule-strong}"
    height: 1px
  chip-ring:
    backgroundColor: "{colors.rule-strong}"
    height: 1px
  chip-ally:
    backgroundColor: "{colors.ally}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    padding: 4px
  chip-hostile:
    backgroundColor: "{colors.hostile}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    padding: 4px
  chip-neutral:
    backgroundColor: "{colors.secondary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    padding: 4px
---

## Overview

NODUS scores the relationships between Indonesian political figures. The subject
is contested, the numbers are arguable, and every score is derived from weighted
issue positions that a reader is entitled to inspect. That makes the product a
**measuring instrument**, not a document.

The previous direction borrowed the diplomacy screen of Civilization VI:
parchment, bronze, and a printed-ledger metaphor. It was tasteful and it was
wrong, for one measurable reason. A ledger says *this is a record of what
happened*. The product actually says *this is a reading you can check and
dispute*. Parchment made the interface feel settled before the reader had a
chance to disagree with it, and a warm ground competed with the warm data ramp
for the same visual space.

This direction keeps the subject and inverts the metaphor.

**Reading this as:** a public analytical instrument for Indonesian political
relations, for readers who want to compare and challenge scores, in a
cool-ground precision-instrument language, dial ENERGY 2 / RHYTHM 3 / MOTION 2.

Three commitments follow from that, and every token below serves one of them.

1. **The score is the only saturated thing on the page.** Chrome is cool and
   near-achromatic so the diverging ramp carries all the colour. A cool ground
   lets both poles of the ramp read at full strength; parchment did not.
2. **Intensity must survive greyscale.** Polarity alone is not enough. A reader
   must be able to rank two allies by eye, so the ramp's luminance is monotonic
   outward from the neutral midpoint. See `## Information Design`.
3. **The accent lives outside the data axis.** The one accent is indigo, which
   is neither green nor red, so a button can never be mistaken for a score.

### Why "Assay"

An assay is the test that determines what a sample is actually made of. It keeps
the metal-and-measurement lineage of the old direction while moving it from the
archive to the bench: the same seriousness, pointed at the present tense.

### The dials

`ENERGY 2 / RHYTHM 3 / MOTION 2`, unchanged from the previous direction, and
deliberately so. The dials were never the problem; the execution was.

- **ENERGY 2** — confident but not loud. One accent, used sparingly. An
  instrument does not shout; it is legible. Note that ENERGY 2 does **not**
  license flatness: hierarchy is a separate obligation, and the previous pass
  failed it. See `## Hierarchy` below.
- **RHYTHM 3** — the map, the profile, and the issue breakdown are three
  different kinds of information and must remain three different compositions.
  Do not normalise them into one card grid.
- **MOTION 2** — transitions and hover states only. No parallax, no looping
  animation, no entrance animation on scroll. In an instrument, motion is
  feedback, never decoration.

## Colors

The palette is one accent plus a ground plus a diverging data ramp. There is no
fourth idea in it.

### Ground and ink

Cool, slightly blue-shifted neutrals. The blue cast is what separates the ground
from the ramp: a warm ground and a warm ramp compete for the same visual space,
which is the specific failure this palette replaces.

- **Neutral (#F4F6F8):** page ground. A cool near-white, not pure white, so
  raised panels can be lighter than the page.
- **Neutral Raised (#FFFFFF):** panels and the matrix surface. Panels are the
  lightest surface, which makes them read as *closer to the reader* than the
  page without needing a shadow.
- **Neutral Sunk (#E8EBF0):** wells, table stripes, bar tracks, and the
  companion rail. Anything the reader is not meant to act on directly.
- **Ink (#0C1421):** body and headline text. Cold near-black at 17.0:1 on the
  page. Never pure black.
- **Ink Soft (#46536B):** secondary text at 7.2:1 on the page. This is the
  default colour for supporting copy, and it is dark enough to read, which the
  previous direction's muted taupe was not.
- **Ink Muted (#5D6B82):** the quietest text that still passes, at 5.0:1 on the
  page and 5.4:1 on raised. Reserved for micro-labels. **Nothing on this page is
  set lighter than this**, because the previous direction shipped several
  labels below AA and the contrast audit found them.
- **Rule (#D3D9E2) / Rule Strong (#AEB7C6):** hairlines and structural rules.
  Rule is for separators the reader should barely notice; Rule Strong is for
  the coordinate rules of the matrix and the zero axis of a scale, which the
  reader must be able to find.

### The accent

- **Primary (#2E3FBF):** indigo. Used as a **fill** only (primary buttons, the
  active nav marker). White on it is 8.1:1.
- **Primary Hover (#4256D6):** hover fill. White on it is 5.9:1. It carries
  **white text, not ink**: ink on this indigo is 3.1:1 and fails, while white
  clears AA comfortably. A hover that lifts the fill keeps white type.
- **Primary Ink (#2E3FBF):** the same indigo, used wherever the accent becomes
  **text** (links, the wordmark, active nav labels, the focus ring). It clears
  7.5:1 on the page, 8.1:1 on raised, and 6.8:1 on sunk, so one value serves all
  three surfaces here. Two tokens are still declared separately so the fill and
  the text role can diverge later without touching a component.

Indigo is chosen because it sits **outside the red-green data axis**. The
previous direction spent bronze on chrome, which meant the accent and the
neutral tier both landed in the same warm family and had to be told apart by
context. Indigo cannot be confused with any score value.

### The diverging ramp

The score is the content, so the ramp is the palette's centre of gravity. Nine
tiers run from a full hostile to a full ally through a neutral midpoint.

| Tier | Key | Fill | White on fill | Luminance |
|---|---|---|---|---|
| Blok Solid | `solid_bloc` | `#0C4232` | 11.4:1 | 0.042 |
| Aliansi | `alliance` | `#185542` | 8.7:1 | 0.071 |
| Akrab | `friendly` | `#276650` | 6.8:1 | 0.105 |
| Netral Positif | `cordial` | `#3C745E` | 5.5:1 | 0.143 |
| Netral | `neutral` | `#6A7487` | 4.7:1 | 0.173 |
| Waspada | `wary` | `#96584E` | 5.5:1 | 0.140 |
| Ketegangan | `tension` | `#934337` | 6.8:1 | 0.105 |
| Rivalitas | `rivalry` | `#862E24` | 8.6:1 | 0.071 |
| Bermusuhan | `hostile` | `#6E1913` | 11.6:1 | 0.041 |

Two properties are load-bearing and neither is decorative:

- **Luminance is monotonic outward from neutral.** The green arm darkens as the
  score rises (0.173 → 0.042); the red arm darkens as it falls (0.173 → 0.041).
  The two arms are therefore **symmetric about the midpoint**. A reader can rank
  intensity in greyscale, in a photograph, or on a bad projector. The previous
  ramp failed this: its neutral was darker than its cordial, so the middle of the
  scale read as the strongest value.
- **Every tier clears 4.5:1 against white text**, because tier chips and matrix
  cells both set type directly on the fill. The lightest tier is `neutral` at
  4.7:1, which is the floor the whole ramp is built around.

Hue carries polarity; luminance and chroma carry intensity. That is the whole
encoding, and it is why the ramp is symmetric rather than merely pretty.

### Four roles for one colour

The same tier colour is used four different ways, and they have genuinely
different requirements. Collapsing them into one value is the mistake that
produced two separate invisible-bar bugs during this redesign, so the roles are
named and split.

| Role | Token | Changes per theme? | Why |
|---|---|---|---|
| **Fill** | `TIER_COLORS[key]` | No | Matrix cells and chips set white type on it. The fill IS the data, so a reader comparing screenshots must see the same colour. |
| **Type** | `--tier-{key}-text` | Yes | A fill dark enough for white type is unreadable as type on a dark ground (measured 1.5:1). Light darkens outward from neutral; dark brightens outward. |
| **Bar** | `--bar-{key}` | Yes | A bar sits on the *track*, not the page, so it only has to separate from the track. The dark fills measure ~1.04:1 against a dark track, so dark substitutes brighter values. |
| **Track** | `--scale-track` | Yes | The unfilled part of a bar is the DENOMINATOR of the scale. Without it the bar is decoration. 1.42:1 light / 1.44:1 dark: visible, but never shouting. |

`--control-border` is a fifth, separate role: WCAG 1.4.11 requires 3:1 for the
boundary of an interactive control, while a data rule should recede. `rule` is
the data rule; `control-border` is the control. One value cannot serve both.

**Tier colours do not change between light and dark themes.** The fill *is* the
data: a reader comparing a light-mode screenshot to a dark-mode one must see the
same colour for the same tier. On the dark ground the fills lose their contrast
against the page, so chips and cells carry a 1px `rule-strong` ring there to keep
their boundary visible. The ring is added; the colour is not swapped.

## Typography

One superfamily, three jobs. IBM Plex was drawn for technical documentation and
instrumentation, which is exactly this product's register, and it ships a true
monospace sibling so the measured values and the prose cannot drift apart.

- **IBM Plex Sans** carries body, UI, and display. Neutral, engineered, and
  unusually good at 12-13px, which is where most of this interface lives.
- **IBM Plex Mono** carries **measured values only**: score numerals, matrix
  coordinate labels, and companion-rail figures. This is a functional choice,
  not a terminal aesthetic: tabular mono digits do not shift width as values
  update, which is what makes a column of scores scannable. It is never used for
  headings or prose.
- **No serif.** The previous direction used Spectral for display, which pulled
  the interface toward an annual report. Dropping it is deliberate: headings get
  their authority from weight and tight tracking, and the instrument reads in
  one voice rather than two.

Uppercase micro-labels (`label`, 12px, 0.06em) are used **only** on table column
heads, field labels, and scale ticks, where they are structural signage. They are
not decorative section eyebrows. Tracking stays at 0.06em rather than the
previous 0.08em: wide tracking on small type is a legibility trap, and the
previous pass paired it with a failing contrast.

## Information Design

This section exists because the previous direction was visually tasteful and
still failed at its job. Its own audit recorded that every finding had been
measured from the DOM and that none of it had been seen. Seeing it made the
failure obvious, and the failure was not aesthetic.

Four rules. They are requirements, not suggestions.

### 1. Every score bar carries a visible zero axis and a scale

A diverging bar with no marked midpoint is a decoration. A reader cannot tell a
strong hostile from a weak one, or find where zero is. Every bar therefore
carries a centre rule at 0, and every bar in a primary reading position carries
ticks at ±50 and ±100.

### 2. The numeral sits with its bar

A value right-aligned in one row and a bar spanning the row below cannot be
associated without effort. The score numeral belongs at the end of its own bar,
or on the axis it measures. This is the single highest-value fix in the
interface.

### 3. A bar must discriminate

Four values of +94, +93, +90 and +88 must not render as four identical full
bars. Magnitude has to be visible in the bar's *extent* and its *fill*, not only
in the digits. Where a set of values is genuinely clustered, say so with an axis
range rather than pretending the bars differ.

### 4. Never show a bare hero number

The largest number on a profile is meaningless without its range. A hero score
is always accompanied by the ±100 scale it is drawn from and the tier band it
falls in.

### Node size and encodings need keys

Any visual variable that carries meaning gets a key: node size, edge dash,
edge weight, and tier fill. An unexplained encoding is a defect.

## Hierarchy

ENERGY 2 means restrained, not flat. The previous pass read as a prototype
partly because its page title, section titles, and body all carried the same
weight.

Exactly **one** element per screen is the loudest thing on it, and everything
else defers to it:

- **/peta** — the graph canvas.
- **/figur** — the ranked list, ordered by influence, with a visible rank.
- **/figur/:id** — the hero score and its scale.
- **/matriks** — the grid.
- **/isu** — the weight column, because weight is what makes an issue matter.
- **/statistik** — the distribution.

Hierarchy is built from three levers used together: size, weight, and colour.
A heading is larger **and** heavier **and** darker than its body, not just one
of the three.

## Layout & Components

The working layout is a primary column plus a narrow companion rail on desktop,
collapsing to one column below 1024px with the rail ordered first, because on a
phone the summary is the headline and the detail is the payload.

Section rhythm is deliberately uneven (RHYTHM 3): the relationship map is a
full-bleed instrument, the profile header is a compact masthead, and the issue
breakdown is a dense ruled list. These three do not share a composition, and
that is the point.

### /peta — Two-column instrument

On desktop, `/peta` splits into a 70/30 ratio:

- **Primary column:** a single map canvas container with floating zoom controls
  in the top-right, a hover card bottom-right, and a status label bottom-left.
  Controls sit 12px from the edges. The canvas border is `rule`; background is
  `neutral-raised`.
- **Companion rail:** counts, bloc breakdown, and the tier legend on
  `neutral-sunk`. The rail carries a node-size key, because node size encodes
  influence.

Below 1024px the rail collapses above the canvas, ordered first.

### /matriks — Coordinate grid

The matrix is a measuring surface, so it gets a coordinate system: a sticky
header row and a sticky first column, a marked diagonal, and a hover crosshair
that highlights the full row and column. Tier fill carries polarity **and**
intensity. Unmapped pairs are explicitly blank and the blank is explained in the
key, because an unexplained gap reads as a bug.

### /figur — Ranked index

The index is a ranked list, not a card gallery. Cards suit browsing a handful of
profiles; sixty comparable people with numeric attributes want aligned columns
and a visible rank. Rows, not cards.

## Elevation & Depth

Depth is expressed with **fill steps and rules, not shadows**. The ground is a
flat measuring surface.

- Panels are distinguished by a fill step (raised vs sunk) plus a 1px rule.
- The single exception is the modal, which uses one soft shadow because it must
  read as lifted off the surface. That is the only shadow in the system.
- No glow anywhere except the focus ring: a 2px indigo outline with a 2px
  offset so it stays visible on every fill.

## Shapes

Radii are small and consistent: `sm` (2px) for controls, `md` (4px) for panels,
`lg` (6px) for the modal. Nothing is pill-shaped. A measured instrument is
machined, not moulded, and squared corners keep dense tables aligned.

The one recurring shape is the **scale rule**: a horizontal measure with a
marked zero axis, ticks, and the value filled outward from the centre, left for
hostile and right for allied. It appears in the matrix, the relationship rows,
the per-issue breakdown, and the profile hero. This is the identity motif: the
same mark at four zoom levels.

## Components

- **`button-primary`** is the only indigo-filled control on a screen. Indigo is
  the accent, so a second primary button would spend it twice.
- **`button-quiet`** is the default action. Most controls here are quiet; the
  tool is read far more than it is edited.
- **`button-danger`** is the hostile fill, so destructive actions and hostile
  relationships share a colour language.
- **`chip-*`** carry tier identity in lists, legends, and matrix cells. They are
  filled, not outlined, because an outlined chip on a light ground reads as a
  form field.
- **`panel`** and **`panel-sunk`** are the only two surface levels.
- **`medallion`** displays a two-letter monogram when a figure has no photo,
  switching to `<img>` when `photo_url` is provided. No iconography is added:
  the circle is the frame, the letters are the content.
- **`scale-rule`** is the identity motif described under Shapes.
- **`stat-row`** is a compact one-line row for the companion rail, using mono
  numerals on the sunk fill.

## Theming

Both light and dark themes are shipped and both are first-class. The tier ramp
is theme-invariant (see `## Colors`); only ground, ink, rules, and the accent
swap. A theme that breaks the data encoding is not a theme, it is a bug.

## Do's and Don'ts

- **Do** let the score be the loudest thing on any screen. It is the content.
- **Do** keep every measured numeral tabular and set in Plex Mono.
- **Do** mark the zero axis on every scale.
- **Do** label illustrative data as illustrative wherever it is shown.
- **Don't** add drop shadows, glows, or blur. One shadow, on the modal, only.
- **Don't** use pure white or pure black as a text or ground colour.
- **Don't** set any text lighter than `ink-muted`.
- **Don't** put a badge above a headline. Headlines carry themselves.
- **Don't** add ornament (scrollwork, textures, faux-anything). The ramp does
  the work; texture costs contrast.
- **Don't** introduce a third type family or a second accent colour.
- **Don't** let chrome and data share a hue family. That was the old failure.
