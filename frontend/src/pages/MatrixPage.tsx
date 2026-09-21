import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { ErrorState, LoadingState, Panel, PanelHeader, ResultCount } from "@/components/ui";
import { TierLegend } from "@/pages/MapPage";
import { api } from "@/lib/api";
import { formatScore, scoreColor } from "@/lib/format";
import type { MatrixCell, MatrixData } from "@/lib/types";

/*
 * Row height is the touch-target size. The score cells are not interactive, but
 * the row's figure name is a link, and a link inside a 30px row cannot offer a
 * 44px target without overlapping its neighbours. 44px keeps the grid dense
 * (58x58 still reads as a matrix) while giving the name a real hit area instead
 * of one that only measures 44 and hits 30.
 */
const ROW_HEIGHT = 44;

function cellFor(data: MatrixData, row: number, col: number): MatrixCell | undefined {
  return data.cells.find((c) => c.row === row && c.col === col);
}

export function MatrixPage() {
  const [bloc, setBloc] = useState("");

  const tiersQuery = useQuery({ queryKey: ["tiers"], queryFn: api.tiers });
  const figuresQuery = useQuery({ queryKey: ["figures"], queryFn: () => api.figures.list() });
  const matrixQuery = useQuery({
    queryKey: ["matrix", bloc],
    queryFn: () => api.matrix({ bloc: bloc || undefined }),
  });

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
        }
      />

      <ResultCount
        visible={data.figures.length}
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
              {data.figures.map((figure) => (
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
            {data.figures.map((rowFigure) => (
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
                {data.figures.map((colFigure) => {
                  const cell = cellFor(data, rowFigure.id, colFigure.id);
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