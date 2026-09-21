/**
 * Range maths for virtualised rendering.
 *
 * Kept pure and free of React so it can be tested directly. The matrix renders
 * 3364 cells (58x58) at roughly 200 ms, which is a visible long task, and the
 * cost scales with cell count rather than with anything else on the page.
 * Rendering only what is on screen removes that cost.
 *
 * Everything here assumes fixed-size items, which is true of the matrix: every
 * row is ROW_HEIGHT and every data column is COL_WIDTH. Variable sizes would
 * need measurement, and that is a different problem.
 */

export interface Range {
  /** First index to render, inclusive. */
  start: number;
  /** Last index to render, exclusive. */
  end: number;
}

/**
 * How many items of `itemSize` are visible in a viewport starting at `scroll`,
 * with `overscan` extra items on each side.
 *
 * Overscan matters: without it, a fast scroll shows blank gaps for one frame
 * before the new rows paint. Two or three rows is enough to hide that and
 * costs very little.
 *
 * Returns an empty range for a zero or negative item size, rather than
 * dividing by zero and producing Infinity.
 */
export function visibleRange(
  scroll: number,
  viewport: number,
  itemSize: number,
  count: number,
  overscan = 2,
): Range {
  if (itemSize <= 0 || count <= 0) return { start: 0, end: 0 };
  if (viewport <= 0) return { start: 0, end: 0 };

  const first = Math.floor(scroll / itemSize);
  const last = Math.ceil((scroll + viewport) / itemSize);

  /*
   * Both ends are clamped to the list. Clamping only `end` is not enough: when
   * the list shrinks while scrolled past its new end (filtering 58 figures down
   * to 8), `start` can exceed `count`, which inverts the range and makes the
   * leading spacer taller than the content. The visible symptom is a scrollbar
   * that jumps and cannot reach the bottom.
   */
  const start = Math.min(count, Math.max(0, first - overscan));
  const end = Math.min(count, Math.max(start, last + overscan));
  return { start, end };
}

/** Pixel height of the unrendered items before `start`. */
export function leadingSize(start: number, itemSize: number): number {
  return Math.max(0, start) * itemSize;
}

/** Pixel height of the unrendered items from `end` to `count`. */
export function trailingSize(end: number, count: number, itemSize: number): number {
  return Math.max(0, count - Math.max(0, end)) * itemSize;
}

/**
 * Build the list of indices in a range, so callers do not have to.
 * Returns a plain array rather than a generator: the caller maps over it
 * immediately, and an array is easier to assert against in tests.
 */
export function indices(range: Range): number[] {
  const out: number[] = [];
  for (let i = range.start; i < range.end; i++) out.push(i);
  return out;
}
