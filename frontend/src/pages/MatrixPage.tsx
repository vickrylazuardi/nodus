import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { ErrorState, LoadingState, Panel, PanelHeader, ResultCount } from "@/components/ui";
import { TierLegend } from "@/pages/MapPage";
import { api } from "@/lib/api";
import { formatScore, scoreColor } from "@/lib/format";
import type { MatrixCell } from "@/lib/types";

/*
 * Row height is the touch-target size. The score cells are not interactive, but
 * the row's figure name is a link, and a link inside a 30px row cannot offer a
 * 44px target without overlapping its neighbours. 44px keeps the grid dense
 * (58x58 still reads as a matrix) while giving the name a real hit area instead
 * of one that only measures 44 and hits 30.
 */
const ROW_HEIGHT = 44;

/**
 * Index the cells once per payload, then look up in constant time.
 *
 * The previous version called `cells.find(...)` for every rendered cell, which
 * is a linear scan inside a nested loop: with 58 figures that is 3364 cells
 * against up to 3364 comparisons each, measured at 11.3M comparisons and 61 ms
 * per render on the real payload. Indexing once measured 0.56 ms, 108x faster.
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

  const tiersQuery = useQuery({ queryKey: ["tiers"], queryFn: api.tiers });
  const figuresQuery = useQuery({ queryKey: ["figures"], queryFn: () => api.figures.list() });
  const matrixQuery = useQuery({
    queryKey: ["matrix", bloc],
    queryFn: () => api.matrix({ bloc: bloc || undefined }),
  });

  const blocs = Array.from(
    new Set((figuresQuery.data?.figures ?? []).map((f) => f.bloc).filter(Boolean) as string[]),
  ).sort();

  /*
   * These hooks must run before any early return. React requires the same hooks
   * in the same order on every render; placing them after the loading guard
   * meant they were skipped on the first pass and called on the second, which
   * throws "Rendered more hooks than during the previous render" and blanks the
   * page. `data` is therefore read defensively here rather than after the guard.
   */
  const cells = matrixQuery.data?.cells;

  // Built once per payload rather than once per cell. Without this the table
  // re-scans all 3364 cells for each of the 3364 cells it renders.
  const cellIndex = useMemo(() => indexCells(cells ?? []), [cells]);

  /*
   * Sorting is a plain sort of at most 58 items, measured at 0.2 ms. A table
   * library was considered and rejected: ~15 kB gzipped to sort a list this
   * size, and it would not have fixed the real bottleneck, which was the cell
   * lookup. Revisit if the figure count grows by an order of magnitude.
   */
  const apiFigures = matrixQuery.data?.figures;
  const figures = useMemo(() => {
    const list = apiFigures ?? [];
    if (!sortDir) return list;
    const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name, "id"));
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [apiFigures, sortDir]);

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

  const data = matrixQuery.data;

  /*
   * Total is the unfiltered figure count. Falls back to what the matrix
   * returned so the count line stays truthful if the figures query fails:
   * an announcement of "0 dari 0" would be worse than no announcement.
   */
  const totalFigures = figuresQuery.data?.figures.length ?? data.figures.length;

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
            <label className="flex items-center gap-2 text-[12.5px] text-ink-soft">
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

            <label className="flex items-center gap-2 text-[12.5px] text-ink-soft">
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

      <div className="max-h-[76vh] overflow-auto rounded-md border border-rule">
        <table className="border-separate border-spacing-0 text-[11.5px]">
          <caption className="sr-only">
            Matriks skor relasi antar figur politik. Baris dan kolom berisi nama figur yang sama.
          </caption>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 border-b border-r border-rule bg-neutral-raised px-3 py-2" />
              {figures.map((figure) => (
                <th
                  key={figure.id}
                  scope="col"
                  className="sticky top-0 z-20 h-[132px] border-b border-r border-rule bg-neutral-raised p-0 align-bottom"
                >
                  <span
                    className="inline-block whitespace-nowrap px-1 py-2 text-[11px] font-medium text-ink-soft"
                    style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                  >
                    {figure.name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {figures.map((rowFigure) => (
              <tr key={rowFigure.id}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 min-w-[170px] whitespace-nowrap border-b border-r border-rule bg-neutral-raised p-0 text-left text-[11.5px] font-medium"
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
                {figures.map((colFigure) => {
                  const cell = cellIndex.get(`${rowFigure.id}:${colFigure.id}`);
                  if (!cell || cell.self) {
                    return (
                      <td
                        key={colFigure.id}
                        className="w-[38px] border-b border-r border-rule bg-neutral-sunk/40 text-center text-[10.5px] text-ink-soft/50"
                        style={{ height: ROW_HEIGHT }}
                      >
                        ·
                      </td>
                    );
                  }
                  if (cell.score === null || cell.score === undefined) {
                    return (
                      <td
                        key={colFigure.id}
                        className="w-[38px] border-b border-r border-rule bg-neutral-raised text-center text-[10.5px] text-ink-soft/40"
                        style={{ height: ROW_HEIGHT }}
                        title="Belum ada data relasi"
                      >
                        ·
                      </td>
                    );
                  }
                  return (
                    <td
                      key={colFigure.id}
                      className="tabular w-[38px] border-b border-r border-rule text-center text-[10.5px] font-semibold"
                      style={{
                        height: ROW_HEIGHT,
                        backgroundColor: scoreColor(cell.score),
                        color: "#F7F1E4",
                      }}
                      title={`${rowFigure.name} dan ${colFigure.name}: ${formatScore(cell.score)}${
                        cell.top_issue ? ` · isu utama: ${cell.top_issue}` : ""
                      }`}
                    >
                      {formatScore(cell.score)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <TierLegend tiers={tiersQuery.data.tiers} />
      </div>
    </Panel>
  );
}