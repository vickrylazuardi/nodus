# Touch targets — the T3 sweep was too narrow

Found while doing a final route sweep after T9. Two routes still shipped
undersized controls, months of "verified" notwithstanding.

## What the T3 probe measured

```js
document.querySelectorAll('button,a[href]')
```

**Only buttons and links.** The requirement is every control a thumb has to
hit, and that includes `select` and `input`. The probe was narrower than the
rule it was checking, so it reported zero problems while these shipped:

| Route | Control | Size | Should be |
|---|---|---|---|
| `/peta` | range slider | 130x**16** | 44 tall |
| `/peta` | bloc `<select>` | 187x**31** | 44 tall |
| `/peta` | "Label nama" checkbox | **13x13** | 44 hit area |
| `/admin` | username field | 378x**39** | 44 tall |
| `/admin` | password field | 378x**39** | 44 tall |

The admin fields came from one shared `inputClass`, so a single fix covered
every admin form at once.

## The second mistake: a false positive

After fixing, the checkbox still reported 18x18 and looked like a failure. It is
not one. A control nested in a `<label>` inherits the label's hit area, because
a click anywhere in the label activates it.

Verified by clicking the label **text**, 25px away from the box:

```
label (hit area)      : 89x44
clicked element       : span  insideLabel=true
click on TEXT toggled : true
```

So the checkbox is usable, and a probe that judges only the inner element's own
box will report a false positive on any correctly-built checkbox. **Judge the
hit area, not the element.**

## The fix

| File | Change |
|---|---|
| `pages/MapPage.tsx` | slider `h-[44px]`, select `min-h-[44px]`, checkbox 18px inside a `min-h-[44px]` label |
| `components/ui.tsx` | `inputClass` gains `min-h-[44px]` — covers every admin field |

## The guard

`pages/touchTargets.test.ts` asserts the contract on the classes that guarantee
the size, since jsdom has no layout engine and `getBoundingClientRect` returns
zeros there.

**Mutation-tested**, because a guard that passes on broken code is worthless:

```
remove min-h-[44px] from inputClass  ->  test FAILS   (correct)
restore it                           ->  5 tests PASS
```

The real measurement remains a browser check; the test stops the regression.

## The lesson

A verification probe must cover everything the requirement covers. T3's probe
checked two selectors out of four and was treated as proof the whole route was
fine. When a check reports a clean result, confirm the check is asking the whole
question before trusting the answer.

Related, and worth keeping: two other "verified" claims turned out to be
measurement artifacts rather than results — a stale-render race that made
`/matriks` appear to have the wrong `<h1>`, and a filtered-to-8-rows timing that
made the T9 lookup fix look 33x faster than it is. In both cases the code was
fine and the measurement was wrong.
