---
version: alpha
name: PRISM Diplomatic Ledger
description: The diplomacy screen of Civilization VI, taken seriously as a data instrument. Aged parchment and bronze leaf for a record of power that is still being written.
dial: ENERGY 2 / RHYTHM 3 / MOTION 2

colors:
  primary: "#9A6B2F"
  primary-ink: "#7A5320"
  primary-bright: "#C08A3E"
  neutral: "#EFE6D4"
  neutral-raised: "#F7F1E4"
  neutral-sunk: "#E2D6BE"
  ink: "#1C1814"
  ink-soft: "#4A4139"
  ally: "#1F5A4C"
  hostile: "#7E2A25"
  secondary: "#525A66"
  rule: "#C9B99A"

typography:
  display-xl:
    fontFamily: Spectral
    fontSize: 3.25rem
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.015em"
  display-lg:
    fontFamily: Spectral
    fontSize: 2rem
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  display-md:
    fontFamily: Spectral
    fontSize: 1.375rem
    fontWeight: 600
    lineHeight: 1.25
  body-lg:
    fontFamily: Inter Tight
    fontSize: 1.0625rem
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: Inter Tight
    fontSize: 0.9375rem
    fontWeight: 400
    lineHeight: 1.55
  body-sm:
    fontFamily: Inter Tight
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.5
  figure-numeral:
    fontFamily: Spectral
    fontSize: 2.75rem
    fontWeight: 700
    lineHeight: 1
    fontFeature: "tnum"
  label:
    fontFamily: Inter Tight
    fontSize: 0.6875rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.08em"

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
    backgroundColor: "{colors.primary-bright}"
    textColor: "{colors.ink}"
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
    textColor: "{colors.secondary}"
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

PRISM scores the relationships between Indonesian political figures. The subject
matter is a ledger of alliances, betrayals, and grudges that people argue about,
so the interface borrows the one visual language a broad audience already reads
as exactly that: the diplomacy screen of Civilization VI.

This is an homage, not a costume. Three things are borrowed because they do real
work:

1. **A material metaphor.** Parchment reads as "a record that is being kept and
   revised," which is what a score ledger is. It is not a dark dashboard,
   because a dashboard says "live telemetry" and this is not telemetry.
2. **The diplomatic ladder.** Civ VI's opinion tiers (Denounced, Ally) map
   cleanly onto coalition politics, so the tier ladder is the primary
   information architecture rather than an afterthought.
3. **Dials on the sheet.** Treaties in the game expire and modifiers decay.
   That is the honest way to present political scores, which age badly.

What is deliberately **not** borrowed: no game chrome, no fantasy ornament, no
texture that costs contrast, no faux-medieval typeface. The result should look
like a serious reference work that happens to share a palette with a game.

## Colors

Parchment is the ground, bronze is the single interaction accent, and the two
pole colours carry meaning rather than decoration.

- **Primary / bronze (#9A6B2F):** the one accent, used as a **fill** only
  (primary buttons, active nav background). White on it is 4.65:1, which passes.
- **Primary Ink (#7A5320):** the same bronze darkened, used wherever bronze
  becomes **text** (links, the wordmark, active nav labels, focus ring). The
  fill bronze is only 3.75:1 against parchment, which fails WCAG AA for body
  text; this clears 5.49:1 on parchment, 6.05:1 on raised, 4.73:1 on sunk.
  Two tokens rather than one because a single bronze cannot serve both roles:
  dark enough to read as text makes a dull button, bright enough to be a
  lively button makes unreadable text.
- **Primary Bright (#C08A3E):** hover state only. It carries **ink text, not
  white**: white on this bronze is 3.02:1 and fails WCAG AA, while ink is
  5.84:1. A hover that brightens the metal needs dark type, like struck bronze
  catching light.
- **Neutral / parchment (#EFE6D4):** page ground. **Neutral Raised (#F7F1E4):**
  panels above the page. **Neutral Sunk (#E2D6BE):** wells and table stripes.
- **Ink (#1C1814):** body and headline text. Warm near-black, 14.8:1 on
  parchment. Never pure black, which reads as digital against warm paper.
- **Ally / verdigris (#1F5A4C):** allied end of the score scale. Aged copper,
  the colour bronze turns into, so the two poles belong to one material family.
- **Hostile / oxblood (#7E2A25):** hostile end of the score scale.
- **Secondary / slate (#525A66):** the neutral midpoint and secondary text.

Every tier colour is darkened until **white text on the fill clears 4.5:1**,
because the tier chips and matrix cells both set type on these colours. An
earlier, prettier ramp failed: the pale cordial teal was 2.37:1, and four of
the nine tiers were unreadable. Legibility sets the floor; the hue sets the mood.
- **Rule (#C9B99A):** hairline rules. Decorative only, never used for text.

The tier ladder interpolates between Ally and Hostile through Secondary, so a
reader can estimate a score's tier from its colour alone. That is the reason the
palette has two poles instead of the usual single accent: **the score is the
content**, and it needs a scale, not a highlight.

## Typography

Two families, both chosen for how they hold up in a reference document.

- **Spectral** for display and every numeral. A screen-first serif with sturdy
  terminals, which keeps large score figures legible at a glance and gives
  headings the authority of a printed ledger. Tabular figures
  (`fontFeature: tnum`) are required on all score values so digits do not shift
  width as they update.
- **Inter Tight** for body and UI. Neutral, excellent at small sizes, and tight
  enough to let dense tables and per-issue rows stay compact. A deliberate,
  unremarkable choice: the typeface should not compete with the scores.

Uppercase micro-labels (`label`) are used **only** on table column heads and
field labels, where they act as structural signage at 11px with 0.08em tracking.
They are not used as decorative section eyebrows.

## Layout

The ledger is a two-column working layout on desktop: a wide primary column for
the current subject and a narrow rail for the score summary and tier legend.
Below 1024px it collapses to one column with the summary rail first, because on
a phone the tier is the headline, not the detail.

Spacing uses the scale above. Section rhythm is deliberately uneven (RHYTHM 3):
the relationship map is a full-bleed instrument, the profile header is a compact
masthead, and the issue breakdown is a dense ruled list. These three do not share
a composition, and that is the point: the map, the person, and the score are
three different kinds of information.

## Elevation & Depth

Depth is expressed with **rules and fills, not shadows**. The parchment metaphor
is a flat printed sheet; drop shadows would break it.

- Panels are distinguished by a fill step (raised vs sunk) plus a 1px rule.
- The single exception is the modal, which uses one soft shadow because it must
  read as lifted off the page. That is the only shadow in the system.
- No glow anywhere except the focus ring: a 2px bronze outline plus a 1px
  parchment offset so it stays visible on both fills.

## Shapes

Radii are small and consistent: `sm` (2px) for controls, `md` (4px) for panels,
`lg` (6px) for the modal. Nothing is pill-shaped. A ledger is cut, not moulded,
and squared corners keep dense tables aligned.

The one recurring shape is the **score rule**: a horizontal hairline split at
the midpoint, with the filled portion extending left for hostile and right for
allied. It appears in the matrix, the relationship rows, and the per-issue
breakdown. This is the identity motif: the same mark at three zoom levels.

## Components

- **`button-primary`** is the only bronze-filled control on a screen. Bronze is
  the accent, so a second primary button would spend it twice.
- **`button-quiet`** is the default action. Most controls here are quiet; the
  tool is read far more than it is edited.
- **`button-danger`** is oxblood, matching the hostile end of the score scale so
  destructive actions and hostile relationships share a colour language.
- **`chip-*`** carry tier identity in lists and legends. They are filled, not
  outlined, because an outlined chip on parchment reads as a form field.
- **`panel`** and **`panel-sunk`** are the only two surface levels.

## Do's and Don'ts

- **Do** let the score be the loudest thing on any screen. It is the content.
- **Do** keep every score numeral tabular and set in Spectral.
- **Do** label illustrative data as illustrative wherever it is shown.
- **Don't** add drop shadows, glows, or blur. One shadow, on the modal, only.
- **Don't** use pure white or pure black anywhere.
- **Don't** put a badge above a headline. Headlines carry themselves.
- **Don't** add game ornament (scrollwork, faux-medieval faces, parchment
  texture images). The palette does the work; texture costs contrast.
- **Don't** introduce a third type family or a fourth accent colour.