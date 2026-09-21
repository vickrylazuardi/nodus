# T8 result — dialog, select, tabs, tooltip

**T8 as planned was not done, because three of its four targets did not need it.**
One real gap was found in the fourth and fixed without a dependency.

## What the plan said

Add shadcn/Radix primitives for Dialog, Select, Tabs and Tooltip, to fix the
focus-trap and keyboard-navigation findings from the original audit.

## What measurement found

| Target | State | Verdict |
|---|---|---|
| **Tabs** | **No tabs exist anywhere in the app** | Nothing to replace |
| **Select** | 7 native `<select>`, all already tabbable, labelled, `min-height: 44px` | Radix would be a **downgrade** |
| **Tooltip** | Native `title` attributes in use | Adequate for the content |
| **Dialog** | Announced correctly, Escape worked, **but Tab could leave it** | **Real gap — fixed** |

The audit findings T8 was based on (focus traps, keyboard navigation) had
already been fixed by hand during T5/T6. So T8's premise was stale, in the same
way T9's was.

## Why replacing the selects would be a downgrade

Native `<select>` on mobile opens the operating system's own picker, which is
fully accessible, familiar, and optimised for touch. A Radix Select replaces
that with a custom listbox: more code, more failure modes, and a control the
user's own device does not recognise. It is the right tool when you need
multi-select or rich option rendering. None of these seven do.

Measured before deciding, per select: `tabbable=true`, `labelled=true`,
`minHeight=44px`, options 3 to 6.

## The one real gap

The admin `ConfirmDialog` was in better shape than expected:

- `role="dialog"` present
- `aria-modal="true"` present
- `aria-label={title}` present, so it has a real accessible name
- Escape closes it (verified by dispatching through React's delegated handler;
  a synthetic `document.dispatchEvent` does not reach it, which made an earlier
  reading look like a failure)
- focus moves into the dialog on open and returns to the trigger on close

But with the dialog open, the page behind it held **127 focusable elements** and
was fully exposed to assistive technology. `aria-modal` tells a screen reader
the content is modal; it does not remove anything from the tab order.

**Fixed without a dependency**, using `inert`:

- `inert` on every sibling subtree. One attribute removes it from the tab order
  *and* from the accessibility tree, and the browser enforces it, so there is no
  key handling to get wrong.
- `aria-hidden="true"` as well, because older assistive technology does not
  honour `inert`.
- Tab wrapping at both ends, plus recovery if focus has already escaped.
- The walk-up skips any ancestor that contains the dialog, so the dialog is
  never hidden along with the page.
- Attributes are **restored** rather than cleared on close: an element may
  already have had `aria-hidden` for its own reasons, and removing it
  unconditionally would change the page it restores.

## Verified in the browser

| Check | Result |
|---|---|
| Background control refuses focus | attempted `Lihat situs publik`, focus stayed on `Batal` |
| Tab from last control wraps to first | `Hapus` -> `Batal` |
| Shift+Tab from first wraps to last | `Batal` -> `Hapus` |
| Dialog itself never inert | confirmed |
| Cleanup on close | **0** `inert` and **0** `aria-hidden` left behind |

The dialog renders inside `main`, so the walk-up correctly marks `main`'s
children (`nav`, `section`, `footer`) plus the top-level `header`: 5 elements.

## Honest limitation

Synthetic `KeyboardEvent`s do not cause native focus movement, so the repeated
Tab sequence could not verify natural movement through the dialog. What was
verified is the wrapping logic, which is the part that was broken, and that a
background control genuinely refuses focus under `inert`.

## Outcome

- **No dependency added.** `@radix-ui/*` was not installed, so no bundle growth.
- 8 tests added in `dialogContract.test.ts` guarding the trap, the attribute
  restoration, and the dialog-never-inert rule.
- Suite: **242 frontend + 73 backend**.

T8's remaining value was always the smallest of the plan's items, and the
measurement says it is now zero: every target is either absent, already
accessible, or fixed. Adding Radix here would add a dependency that fixes
nothing.
