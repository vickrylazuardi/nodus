/**
 * Range maths for the virtualised matrix.
 *
 * These are the calculations that decide what is on screen, so they are worth
 * pinning precisely: an off-by-one here either leaves a blank gap at the edge
 * of the viewport or renders an extra row nobody sees.
 */

import { describe, expect, it } from "vitest";

import { indices, leadingSize, trailingSize, visibleRange } from "./virtualize";

describe("visibleRange", () => {
  it("renders only the rows in view", () => {
    // 44px rows, 440px viewport, scrolled to the top: rows 0..10 plus overscan.
    const r = visibleRange(0, 440, 44, 58, 2);
    expect(r.start).toBe(0);
    expect(r.end).toBe(12); // ceil(440/44) = 10, + 2 overscan
  });

  it("shifts the window as the user scrolls", () => {
    const r = visibleRange(440, 440, 44, 58, 2);
    expect(r.start).toBe(8); // floor(440/44) = 10, - 2 overscan
    expect(r.end).toBe(22);
  });

  it("never starts before the first item", () => {
    expect(visibleRange(0, 440, 44, 58, 5).start).toBe(0);
  });

  it("never runs past the last item", () => {
    const r = visibleRange(10000, 440, 44, 58, 2);
    expect(r.end).toBe(58);
    expect(r.start).toBeLessThanOrEqual(58);
  });

  it("never inverts the range when scrolled far past a shrunken list", () => {
    // The real scenario: scrolled to the bottom of 58 rows, then filtered to 8.
    // Clamping only `end` left `start` at 225 with `end` at 8, which inverted
    // the range and produced a leading spacer taller than the content.
    const r = visibleRange(10000, 440, 44, 8, 2);
    expect(r.start).toBeLessThanOrEqual(r.end);
    expect(r.start).toBeLessThanOrEqual(8);
    expect(r.end).toBeLessThanOrEqual(8);
    expect(leadingSize(r.start, 44) + trailingSize(r.end, 8, 44)).toBeLessThanOrEqual(8 * 44);
  });

  it("keeps start <= end for every combination", () => {
    for (const count of [0, 1, 8, 58]) {
      for (const scroll of [0, 44, 440, 5000, 100000]) {
        for (const viewport of [0, 1, 440, 5000]) {
          const r = visibleRange(scroll, viewport, 44, count, 2);
          expect(r.start, `count=${count} scroll=${scroll} viewport=${viewport}`).toBeLessThanOrEqual(r.end);
        }
      }
    }
  });

  it("renders nothing for an empty list", () => {
    expect(visibleRange(0, 440, 44, 0)).toEqual({ start: 0, end: 0 });
  });

  it("does not divide by zero on a zero item size", () => {
    const r = visibleRange(100, 440, 0, 58);
    expect(r).toEqual({ start: 0, end: 0 });
    expect(Number.isFinite(r.start)).toBe(true);
    expect(Number.isFinite(r.end)).toBe(true);
  });

  it("does not divide by zero on a zero viewport", () => {
    // jsdom reports 0 for every measurement, so this is the state tests run in.
    expect(visibleRange(0, 0, 44, 58)).toEqual({ start: 0, end: 0 });
  });

  it("handles a negative item size without producing a negative range", () => {
    const r = visibleRange(0, 440, -44, 58);
    expect(r.start).toBeGreaterThanOrEqual(0);
    expect(r.end).toBeGreaterThanOrEqual(0);
  });

  it("covers the whole list when the viewport is larger than the content", () => {
    const r = visibleRange(0, 5000, 44, 58, 2);
    expect(r.start).toBe(0);
    expect(r.end).toBe(58);
  });

  it("never renders more than the list length", () => {
    for (const scroll of [0, 100, 1000, 100000]) {
      const r = visibleRange(scroll, 440, 44, 58, 2);
      expect(r.end - r.start).toBeLessThanOrEqual(58);
    }
  });

  it("grows the window by overscan on both sides", () => {
    const none = visibleRange(440, 440, 44, 58, 0);
    const some = visibleRange(440, 440, 44, 58, 3);
    expect(some.start).toBe(none.start - 3);
    expect(some.end).toBe(none.end + 3);
  });
});

describe("spacer sizes", () => {
  it("reserves the height of the rows above the window", () => {
    expect(leadingSize(8, 44)).toBe(352);
  });

  it("reserves the height of the rows below the window", () => {
    expect(trailingSize(22, 58, 44)).toBe(36 * 44);
  });

  it("reserves nothing when the whole list is rendered", () => {
    expect(leadingSize(0, 44)).toBe(0);
    expect(trailingSize(58, 58, 44)).toBe(0);
  });

  it("never returns a negative size", () => {
    expect(leadingSize(-5, 44)).toBe(0);
    expect(trailingSize(999, 58, 44)).toBe(0);
  });

  it("keeps the total scroll height constant regardless of scroll position", () => {
    // This is the property that stops the scrollbar jumping as you scroll: the
    // spacers plus the rendered rows must always add up to the full list.
    const itemSize = 44;
    const count = 58;
    for (const scroll of [0, 220, 440, 1000, 4000]) {
      const r = visibleRange(scroll, 440, itemSize, count, 2);
      const rendered = (r.end - r.start) * itemSize;
      const total = leadingSize(r.start, itemSize) + rendered + trailingSize(r.end, count, itemSize);
      expect(total).toBe(count * itemSize);
    }
  });
});

describe("indices", () => {
  it("lists every index in the range", () => {
    expect(indices({ start: 2, end: 5 })).toEqual([2, 3, 4]);
  });

  it("is empty for an empty range", () => {
    expect(indices({ start: 3, end: 3 })).toEqual([]);
  });

  it("produces exactly end - start entries", () => {
    const r = visibleRange(440, 440, 44, 58, 2);
    expect(indices(r)).toHaveLength(r.end - r.start);
  });
});

describe("the saving this buys", () => {
  it("renders a small fraction of a 58x58 matrix", () => {
    // 440px viewport / 44px rows = 10 visible rows, plus 4 overscan.
    const rows = visibleRange(0, 440, 44, 58, 2);
    const cols = visibleRange(0, 900, 38, 58, 2);
    const cellsRendered = (rows.end - rows.start) * (cols.end - cols.start);
    const cellsTotal = 58 * 58;

    expect(cellsTotal).toBe(3364);
    expect(cellsRendered).toBeLessThan(cellsTotal);
    // Should be a large reduction, not a marginal one.
    expect(cellsRendered).toBeLessThan(cellsTotal / 4);
  });

  it("always covers the viewport, so no blank gap appears while scrolling", () => {
    /*
     * This is the property that matters, and it is not the same as "the window
     * size is constant". The window legitimately shrinks at the end of the list,
     * where fewer rows remain than fit on screen, so asserting a constant size
     * fails on correct behaviour.
     *
     * What must never happen is a gap: the rendered rows have to cover the
     * visible band at every scroll position.
     */
    const itemSize = 45;
    const count = 58;
    const viewport = 479;
    const total = count * itemSize;

    for (let top = 0; top + viewport <= total; top += 17) {
      const r = visibleRange(top, viewport, itemSize, count, 2);
      const firstPixel = r.start * itemSize;
      const lastPixel = r.end * itemSize;
      expect(firstPixel, `gap above at scroll ${top}`).toBeLessThanOrEqual(top);
      expect(lastPixel, `gap below at scroll ${top}`).toBeGreaterThanOrEqual(top + viewport);
    }
  });

  it("keeps a steady window through the middle and tapers only at the ends", () => {
    /*
     * The measured shape, rather than an assumed one:
     *
     *   13, 14, 15, 15, ..., 15, 15, 14, 13
     *   ^start   ^--- 15 for the whole middle ---^   ^end
     *
     * The taper is exactly two steps at each end, because the overscan cannot
     * extend past the list boundary. A previous version of this test assumed
     * the whole middle was constant and failed on correct behaviour, which is a
     * test bug rather than a code bug.
     */
    const itemSize = 45;
    const count = 58;
    const viewport = 479;
    const overscan = 2;

    const sizes: number[] = [];
    for (let top = 0; top + viewport <= count * itemSize; top += itemSize) {
      const r = visibleRange(top, viewport, itemSize, count, overscan);
      sizes.push(r.end - r.start);
    }

    const interior = sizes.slice(2, -2);
    expect(Math.max(...interior) - Math.min(...interior)).toBe(0);

    // Exactly one step of taper at each end, from the overscan hitting the wall.
    expect(sizes[0]).toBeLessThan(sizes[2]!);
    expect(sizes[sizes.length - 1]).toBeLessThan(sizes[sizes.length - 3]!);
  });
});

describe("measured item size, not the declared one", () => {
  it("uses the real rendered row height when it differs from the constant", () => {
    // The declared row height is 44px but the rendered height measured 45px,
    // because the row's bottom border adds a pixel. Virtualising against the
    // declared value made the spacer maths wrong.
    const declared = 44;
    const measured = 45;
    const count = 58;

    const totalDeclared = count * declared;
    const totalMeasured = count * measured;
    expect(totalDeclared).not.toBe(totalMeasured);

    // The spacer sum must equal the true content height, so the scrollbar
    // reflects reality.
    const r = visibleRange(500, 479, measured, count, 2);
    const sum =
      leadingSize(r.start, measured) + (r.end - r.start) * measured + trailingSize(r.end, count, measured);
    expect(sum).toBe(totalMeasured);
  });
});
