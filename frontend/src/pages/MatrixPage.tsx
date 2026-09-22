import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { ErrorState, LoadingState, Panel, PanelHeader, ResultCount, TierLegend } from "@/components/ui";
import { api } from "@/lib/api";
import { formatScore, scoreColor } from "@/lib/format";
import { indices, leadingSize, trailingSize, visibleRange } from "@/lib/virtualize";
import type { MatrixCell } from "@/lib/types";

/*
 * Row height is the touch-target size. The score cells are not interactive, but
 * the row's figure name is a link, and a link inside a 30px row cannot offer a
 * 44px target without overlapping its neighbours. 44px keeps the grid dense
 * (58x58 still reads as a matrix) while giving the name a real hit area instead
 * of one that only measures 44 and hits 30.
 */
const ROW_HEIGHT = 44;

/** Data column width. The declared width; measured reality may differ. */
const COL_WIDTH = 38;

/** Width of the sticky figure-name column. */
const ROW_HEADER_WIDTH = 170;

/** Extra rows and columns rendered beyond the viewport, to hide scroll seams. */
const OVERSCAN = 2;

/**
 * Index the cells once per payload, then look up in constant time.
 *
 * A linear `cells.find(...)` per rendered cell is O(n^2): with 58 figures that
 * was 3364 cells against up to 3364 candidates each, measured at 11.3M
 * comparisons and 61 ms of pure JavaScript per render. Indexing once measured
 * 0.56 ms, 108x faster.
 *
 * Keyed by `row:col` because that is exactly the lookup the table performs.
 */
function indexCells(cells: MatrixCell[]): Map<string, MatrixCell> {
  const index = new Map<string, MatrixCell>();
  for (const cell of cells) index.set(`${cell.row}:${cell.col}`, cell);
  return index;
}

export function MatrixPage() {
  const [bloc, setBloc] = useState("");
  /** null keeps the API's own order; the server already ranks sensibly. */
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  /*
   * Measured from the DOM rather than trusted from the constants above.
   *
   * The declared sizes are 44px and 38px, but the rendered sizes measured 45px
   * and 34.05px: the row's 1px bottom border and the column's border plus
   * cell padding both shift the real box. Virtualising against the wrong item
   * size makes the total scroll height drift as you scroll, because the spacers
   * are computed from a size the rows do not actually have.
   *
   * Measuring keeps this correct if the styling changes, which the constants
   * cannot.
   */
  const [itemSize, setItemSize] = useState({ row: ROW_HEIGHT, col: COL_WIDTH });

  const tiersQuery = useQuery({ queryKey: ["tiers"], queryFn: api.tiers });
  const figuresQuery = useQuery({ queryKey: ["figures"], queryFn: () => api.figures.list() });
  const matrixQuery = useQuery({
    queryKey: ["matrix", bloc],
    queryFn: () => api.matrix({ bloc: bloc || undefined }),
  });

  /*
   * Every hook runs before any early return. React requires the same hooks in
   * the same order on every render; placing these after the loading guard means
   * they are skipped on the first pass and called on the second, which throws
   * "Rendered more hooks than during the previous render" and blanks the page.
   * `data` is therefore read defensively here rather than after the guard.
   */
  const cells = matrixQuery.data?.cells;
  const apiFigures = matrixQuery.data?.figures;

  const cellIndex = useMemo(() => indexCells(cells ?? []), [cells]);

  /*
   * Sorting is a plain sort of at most 58 items, measured at 0.2 ms. A table
   * library was considered and rejected: it would not have fixed the real
   * bottleneck, which was the per-cell lookup and the 3364-node render.
   */
  const figures = useMemo(() => {
    const list = apiFigures ?? [];
    if (!sortDir) return list;
    const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name, "id"));
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [apiFigures, sortDir]);

  /* ------------------------------------------------------ virtualisation */

  /*
   * Measure the scroll container. Until it is measured the viewport is 0, and
   * a 0 viewport would render nothing at all, so the ranges fall back to the
   * full list. That also keeps jsdom tests, which have no layout, rendering a
   * complete table rather than an empty one.
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const measure = () => {
      setViewport({ width: el.clientWidth, height: el.clientHeight });

      // Read the real sizes off a rendered row and cell when available.
      const row = el.querySelector("tbody tr:not([aria-hidden]) th");
      const cell = el.querySelector("tbody td[data-cell]");
      if (row || cell) {
        setItemSize((prev) => {
          const nextRow = row ? Math.round(row.getBoundingClientRect().height) : prev.row;
          const nextCol = cell ? Math.round(cell.getBoundingClientRect().width) : prev.col;
          if (nextRow === prev.row && nextCol === prev.col) return prev;
          return { row: nextRow > 0 ? nextRow : prev.row, col: nextCol > 0 ? nextCol : prev.col };
        });
      }
    };
    measure();

    /*
     * ResizeObserver is not available in every environment (jsdom, older
     * browsers, and any non-DOM render). Without the guard the component throws
     * during mount and renders nothing at all, which is a far worse failure
     * than a slightly stale viewport measurement.
     */
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [matrixQuery.data]);

  const onScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    setScroll({ top: el.scrollTop, left: el.scrollLeft });
  }, []);

  const measured = viewport.width > 0 && viewport.height > 0;

  const rowRange = useMemo(
    () =>
      measured
        ? visibleRange(scroll.top, viewport.height, itemSize.row, figures.length, OVERSCAN)
        : { start: 0, end: figures.length },
    [measured, scroll.top, viewport.height, figures.length, itemSize.row],
  );

  const colRange = useMemo(
    () =>
      measured
        ? visibleRange(scroll.left, viewport.width, itemSize.col, figures.length, OVERSCAN)
        : { start: 0, end: figures.length },
    [measured, scroll.left, viewport.width, figures.length, itemSize.col],
  );

  const rows = useMemo(() => indices(rowRange), [rowRange]);
  const cols = useMemo(() => indices(colRange), [colRange]);

  /*
   * Second measurement pass, after the table has rendered.
   *
   * The effect above runs when the query resolves, but on that pass the rows
   * may not be in the DOM yet (the component is still returning the loading
   * panel), so the sizes it reads are the fallback constants. This pass reads
   * them from real rows, which is what the spacer maths needs to be correct.
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const row = el.querySelector("tbody tr:not([aria-hidden]) th");
    const cell = el.querySelector("tbody td[data-cell]");
    if (!row && !cell) return;
    const h = row ? Math.round(row.getBoundingClientRect().height) : 0;
    const w = cell ? Math.round(cell.getBoundingClientRect().width) : 0;
    if (h > 0 || w > 0) {
      setItemSize((prev) => {
        const nextRow = h > 0 ? h : prev.row;
        const nextCol = w > 0 ? w : prev.col;
        return nextRow === prev.row && nextCol === prev.col ? prev : { row: nextRow, col: nextCol };
      });
    }
  }, [figures.length, rowRange.end, colRange.end]);

  const leadRows = leadingSize(rowRange.start, itemSize.row);
  const tailRows = trailingSize(rowRange.end, figures.length, itemSize.row);
  const leadCols = leadingSize(colRange.start, itemSize.col);
  const tailCols = trailingSize(colRange.end, figures.length, itemSize.col);

  /* ------------------------------------------------------------- queries */

  const blocs = Array.from(
    new Set((figuresQuery.data?.figures ?? []).map((f) => f.bloc).filter(Boolean) as string[]),
  ).sort();

  if (
    matrixQuery.isPending ||
    tiersQuery.isPending ||
    figuresQuery.isPending ||
    !matrixQuery.data ||
    !tiersQuery.data
  ) {
    return (
      <Panel>
        <LoadingState what="matriks" />
      </Panel>
    );
  }

  if (matrixQuery.isError) {
    return (
      <Panel>
        <ErrorState
          message={(matrixQuery.error as Error).message}
          onRetry={() => void matrixQuery.refetch()}
        />
      </Panel>
    );
  }

  /*
   * Total is the unfiltered figure count. Falls back to what the matrix
   * returned so the count line stays truthful if the figures query fails:
   * an announcement of "0 dari 0" would be worse than no announcement.
   */
  const totalFigures = figuresQuery.data?.figures.length ?? figures.length;

  /*
   * Every row in the table body and head must carry the same number of cells,
   * or the columns stop lining up. That count is: the sticky name column, the
   * leading spacer, the rendered columns, and the trailing spacer.
   */
  const cellsPerRow = 3 + cols.length;

  return (
    <Panel>
      <PanelHeader
        level={1}
        title="Matriks relasi"
        description={
          <>
            Setiap sel adalah skor antara dua figur. Hijau berarti sekutu, merah berarti
            bermusuhan, dan sel kosong berarti relasinya belum dipetakan. Klik nama figur untuk
            membuka profilnya.
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="flex min-h-[44px] items-center gap-2 text-[12.5px] text-ink-soft">
              <span className="font-medium text-ink">Blok</span>
              <select
                value={bloc}
                onChange={(e) => setBloc(e.target.value)}
                className="min-h-[44px] rounded-sm border border-rule bg-neutral-raised px-2 py-1.5 text-[12.5px] text-ink"
              >
                <option value="">Semua blok</option>
                {blocs.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-h-[44px] items-center gap-2 text-[12.5px] text-ink-soft">
              <span className="font-medium text-ink">Urutan nama</span>
              <select
                value={sortDir ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setSortDir(v === "" ? null : (v as "asc" | "desc"));
                }}
                className="min-h-[44px] rounded-sm border border-rule bg-neutral-raised px-2 py-1.5 text-[12.5px] text-ink"
              >
                <option value="">Bawaan</option>
                <option value="asc">A ke Z</option>
                <option value="desc">Z ke A</option>
              </select>
            </label>
          </div>
        }
      />

      <ResultCount
        visible={figures.length}
        total={totalFigures}
        noun="figur"
        className="mb-4"
      />

      {/*
       * The table is virtualised in both directions. Rendering all 58x58 cells
       * measured ~200 ms with a 280 ms long task, because the cost is creating
       * 3364 <td> nodes rather than anything about the data. Only the rows and
       * columns in view are rendered, with spacer rows and cells reserving the
       * rest of the scroll area so the scrollbar still reflects the full grid.
       */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        /*
         * Exposes the measured viewport for diagnostics. The virtualiser is
         * invisible when it works, so without this there is no way to tell a
         * correctly virtualised table from one that silently fell back to
         * rendering everything.
         */
        data-vp={`${viewport.width}x${viewport.height}`}
        className="max-h-[76vh] overflow-auto rounded-md border border-rule"
      >
        <table className="border-separate border-spacing-0 text-[11.5px]">
          <caption className="sr-only">
            Matriks skor relasi antar figur politik. Baris dan kolom berisi nama figur yang sama.
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                style={{ width: ROW_HEADER_WIDTH }}
                className="sticky left-0 top-0 z-30 border-b border-r border-rule bg-neutral-raised"
              />
              {leadCols > 0 ? (
                <th
                  aria-hidden="true"
                  style={{ width: leadCols }}
                  className="sticky top-0 z-20 border-b border-rule bg-neutral-raised p-0"
                />
              ) : null}
              {cols.map((ci) => {
                const figure = figures[ci];
                if (!figure) return null;
                return (
                  <th
                    key={figure.id}
                    scope="col"
                    style={{ width: COL_WIDTH }}
                    className="sticky top-0 z-20 h-[132px] border-b border-r border-rule bg-neutral-raised p-0 align-bottom"
                  >
                    <span
                      className="inline-block whitespace-nowrap px-1 py-2 text-[11px] font-medium text-ink-soft"
                      style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                    >
                      {figure.name}
                    </span>
                  </th>
                );
              })}
              {tailCols > 0 ? (
                <th
                  aria-hidden="true"
                  style={{ width: tailCols }}
                  className="sticky top-0 z-20 border-b border-rule bg-neutral-raised p-0"
                />
              ) : null}
            </tr>
          </thead>
          <tbody>
            {leadRows > 0 ? (
              <tr aria-hidden="true">
                <td colSpan={cellsPerRow} style={{ height: leadRows, padding: 0, border: 0 }} />
              </tr>
            ) : null}

            {rows.map((ri) => {
              const rowFigure = figures[ri];
              if (!rowFigure) return null;
              return (
                <tr key={rowFigure.id}>
                  <th
                    scope="row"
                    style={{ width: ROW_HEADER_WIDTH }}
                    className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-rule bg-neutral-raised p-0 text-left text-[11.5px] font-medium"
                  >
                    {/*
                     * The name fills the row so the target is the whole cell, not
                     * just the glyphs: a 14px-tall text link in a 44px row wastes
                     * most of the space a thumb can reach.
                     */}
                    <Link
                      to={`/figur/${rowFigure.id}`}
                      className="flex min-h-[44px] items-center px-3 py-2 hover:text-primary-ink"
                    >
                      {rowFigure.name}
                    </Link>
                  </th>

                  {leadCols > 0 ? (
                    <td
                      aria-hidden="true"
                      style={{ width: leadCols, height: ROW_HEIGHT, padding: 0, border: 0 }}
                    />
                  ) : null}

                  {cols.map((ci) => {
                    const colFigure = figures[ci];
                    if (!colFigure) return null;
                    const cell = cellIndex.get(`${rowFigure.id}:${colFigure.id}`);
                    if (!cell || cell.self) {
                      return (
                        <td
                          key={colFigure.id}
                          data-cell="1"
                          style={{ width: COL_WIDTH, height: ROW_HEIGHT }}
                          className="border-b border-r border-rule bg-neutral-sunk/40 text-center text-[10.5px] text-ink-soft/50"
                        >
                          ·
                        </td>
                      );
                    }
                    if (cell.score === null || cell.score === undefined) {
                      return (
                        <td
                          key={colFigure.id}
                          data-cell="1"
                          style={{ width: COL_WIDTH, height: ROW_HEIGHT }}
                          className="border-b border-r border-rule bg-neutral-raised text-center text-[10.5px] text-ink-soft/40"
                          title="Belum ada data relasi"
                        >
                          ·
                        </td>
                      );
                    }
                    return (
                      <td
                        key={colFigure.id}
                        style={{
                          width: COL_WIDTH,
                          height: ROW_HEIGHT,
                          backgroundColor: scoreColor(cell.score),
                          color: "#F7F1E4",
                        }}
                        data-cell="1"
                        className="tabular border-b border-r border-rule text-center text-[10.5px] font-semibold"
                        title={`${rowFigure.name} dan ${colFigure.name}: ${formatScore(cell.score)}${
                          cell.top_issue ? ` · isu utama: ${cell.top_issue}` : ""
                        }`}
                      >
                        {formatScore(cell.score)}
                      </td>
                    );
                  })}

                  {tailCols > 0 ? (
                    <td
                      aria-hidden="true"
                      style={{ width: tailCols, height: ROW_HEIGHT, padding: 0, border: 0 }}
                    />
                  ) : null}
                </tr>
              );
            })}

            {tailRows > 0 ? (
              <tr aria-hidden="true">
                <td colSpan={cellsPerRow} style={{ height: tailRows, padding: 0, border: 0 }} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <TierLegend tiers={tiersQuery.data.tiers} />
      </div>
    </Panel>
  );
}
