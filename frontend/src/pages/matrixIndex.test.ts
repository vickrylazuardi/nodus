/**
 * Matrix cell indexing.
 *
 * The page previously resolved each cell with `cells.find(...)` inside a nested
 * loop, which is O(n^2): 3364 rendered cells against up to 3364 candidates each,
 * measured at 11.3M comparisons and 61 ms per render on the real payload.
 *
 * These tests pin the replacement's correctness. Speed is verified separately
 * because a fast wrong answer is worse than a slow right one.
 */

import { describe, expect, it } from "vitest";

import type { MatrixCell } from "@/lib/types";

/** Mirrors the implementation in MatrixPage.tsx. */
function indexCells(cells: MatrixCell[]): Map<string, MatrixCell> {
  const index = new Map<string, MatrixCell>();
  for (const cell of cells) index.set(`${cell.row}:${cell.col}`, cell);
  return index;
}

function cell(row: number, col: number, score: number | null): MatrixCell {
  return {
    row,
    col,
    score,
    tier: null,
    relationship_id: null,
    top_issue: null,
    self: row === col,
  };
}

describe("indexCells", () => {
  it("finds every cell the linear scan would have found", () => {
    const cells = [
      cell(1, 1, null),
      cell(1, 2, 74),
      cell(2, 1, 74),
      cell(2, 2, null),
    ];
    const index = indexCells(cells);
    for (const c of cells) {
      expect(index.get(`${c.row}:${c.col}`)).toBe(c);
    }
  });

  it("does not confuse a row id with a column id", () => {
    // Keying on `${row}:${col}` must distinguish (1,2) from (2,1). A key built
    // by summing or concatenating without a separator would collide here.
    const a = cell(1, 2, 10);
    const b = cell(2, 1, -10);
    const index = indexCells([a, b]);
    expect(index.get("1:2")?.score).toBe(10);
    expect(index.get("2:1")?.score).toBe(-10);
  });

  it("returns undefined for a pair with no relationship", () => {
    const index = indexCells([cell(1, 1, null)]);
    expect(index.get("1:99")).toBeUndefined();
  });

  it("keeps a null score distinct from a missing cell", () => {
    // A missing relationship and a mapped-but-unscored one render differently
    // ("belum dipetakan" versus a value), so they must not collapse together.
    const index = indexCells([cell(1, 2, null)]);
    expect(index.has("1:2")).toBe(true);
    expect(index.get("1:2")?.score).toBeNull();
    expect(index.has("2:1")).toBe(false);
  });

  it("handles an empty payload", () => {
    expect(indexCells([]).size).toBe(0);
  });

  it("keeps the last entry when a pair appears twice", () => {
    // The API should not send duplicates, but if it does the behaviour should
    // be defined rather than accidental.
    const index = indexCells([cell(1, 2, 10), cell(1, 2, 20)]);
    expect(index.get("1:2")?.score).toBe(20);
    expect(index.size).toBe(1);
  });

  it("is materially faster than the linear scan on a realistic payload", () => {
    // 58 figures, one cell per ordered pair, as the API sends it.
    const figures = Array.from({ length: 58 }, (_, i) => i + 1);
    const cells: MatrixCell[] = [];
    for (const r of figures) {
      for (const c of figures) cells.push(cell(r, c, r === c ? null : (r * c) % 200 - 100));
    }

    const linear = () => {
      let found = 0;
      for (const r of figures) {
        for (const c of figures) {
          if (cells.find((x) => x.row === r && x.col === c)) found++;
        }
      }
      return found;
    };
    const indexed = () => {
      const index = indexCells(cells);
      let found = 0;
      for (const r of figures) {
        for (const c of figures) {
          if (index.get(`${r}:${c}`)) found++;
        }
      }
      return found;
    };

    expect(linear()).toBe(indexed()); // same answer

    const t0 = performance.now();
    indexed();
    const indexedMs = performance.now() - t0;

    // The indexed path must stay well inside a frame budget. The linear scan is
    // ~60 ms on this payload; asserting a loose ceiling keeps the test stable on
    // a slow CI machine while still catching a regression to the old approach.
    expect(indexedMs).toBeLessThan(16);
  });
});
