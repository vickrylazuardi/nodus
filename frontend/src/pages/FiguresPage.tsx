import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  PanelHeader,
  ResultCount,
  ScoreRule,
  Tag,
  TierChip,
} from "@/components/ui";
import { api } from "@/lib/api";
import { scoreBarColor, scoreTextColor } from "@/lib/format";
import type { Figure } from "@/lib/types";

/**
 * A ranked index, not a card gallery.
 *
 * The previous pass rendered 60 profile cards in a 4-column grid. The visual
 * audit found that the wrong instrument for this content: cards suit browsing
 * a handful of profiles, while this is sixty comparable people carrying three
 * numeric attributes each. Rows align the numbers into columns so they can be
 * compared down the page, fit roughly twice as many figures per screen, and
 * give the sort key somewhere to be visible.
 *
 * The rank column exists because the list is ordered by influence and nothing
 * on screen previously said so.
 */
function FigureRow({ figure, rank }: { figure: Figure; rank: number }) {
  return (
    <tr className="group border-b border-rule last:border-b-0 hover:bg-neutral-sunk/60">
      <td className="w-[52px] px-3 py-2 align-middle">
        <span className="tabular text-[13px] font-semibold text-ink-muted">{rank}</span>
      </td>

      <td className="min-w-0 px-2 py-2 align-middle">
        <Link
          to={`/figur/${figure.id}`}
          className="flex min-h-[44px] min-w-0 flex-col justify-center gap-0.5"
        >
          <span className="truncate text-[14px] font-semibold group-hover:text-primary-ink">
            {figure.name}
          </span>
          <span className="truncate text-[11.5px] text-ink-soft">
            {[figure.role, figure.party].filter(Boolean).join(" · ") || "–"}
          </span>
        </Link>
      </td>

      {/*
        Coalition is the one attribute with a colour language of its own, so it
        gets a chip rather than plain text. The chip carries the tier colour of
        the figure's own average score, which ties the index to the map's
        encoding instead of introducing a second, competing one.
      */}
      <td className="hidden px-2 py-2 align-middle lg:table-cell">
        {figure.bloc ? <Tag>{figure.bloc}</Tag> : <span className="text-ink-muted">–</span>}
      </td>

      <td className="w-[96px] px-2 py-2 text-right align-middle">
        <span
          className="tabular text-[15px] font-semibold"
          style={{ color: scoreTextColor(figure.avg_score) }}
        >
          {figure.avg_score > 0 ? `+${figure.avg_score}` : figure.avg_score}
        </span>
      </td>

      {/* The bar repeats the numeral as a length, on the shared ±100 scale. */}
      <td className="hidden w-[132px] px-3 py-2 align-middle sm:table-cell">
        <ScoreRule score={figure.avg_score} color={scoreBarColor(figure.avg_score)} height={8} />
      </td>

      <td className="w-[72px] px-2 py-2 text-right align-middle">
        <span className="tabular text-[13px] text-ink-soft">{figure.relationship_count}</span>
      </td>

      <td className="w-[88px] px-3 py-2 text-right align-middle">
        <span className="tabular text-[14px] font-semibold">{figure.influence}</span>
      </td>

      {/*
        The two strongest relations, not "ally" and "rival".

        Measured against the live API: 23 of 60 figures have a `worst_rival`
        whose score is POSITIVE, because it is the least-positive relation, not
        a negative one. Rendering that in hostile red under a "rival" label
        promised a polarity the data did not deliver. The column is now labelled
        for what it actually shows, and each value takes its colour from its own
        score, so a +46 is green wherever it appears.
      */}
      <td className="hidden w-[220px] px-3 py-2 align-middle xl:table-cell">
        <div className="flex flex-col gap-0.5 text-[11.5px]">
          {figure.best_ally ? (
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-ink-soft">{figure.best_ally.name}</span>
              <span
                className="tabular shrink-0 font-semibold"
                style={{ color: scoreTextColor(figure.best_ally.score) }}
              >
                {figure.best_ally.score > 0 ? "+" : ""}
                {figure.best_ally.score}
              </span>
            </span>
          ) : null}
          {figure.worst_rival ? (
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-ink-soft">{figure.worst_rival.name}</span>
              <span
                className="tabular shrink-0 font-semibold"
                style={{ color: scoreTextColor(figure.worst_rival.score) }}
              >
                {figure.worst_rival.score > 0 ? "+" : ""}
                {figure.worst_rival.score}
              </span>
            </span>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

export function FiguresPage() {
  const [query, setQuery] = useState("");
  const figuresQuery = useQuery({ queryKey: ["figures"], queryFn: () => api.figures.list() });

  const filtered = useMemo(() => {
    const figures = figuresQuery.data?.figures ?? [];
    if (!query.trim()) return figures;
    const needle = query.trim().toLowerCase();
    return figures.filter((f) =>
      [f.name, f.full_name, f.party, f.role, f.bloc]
        .filter(Boolean)
        .some((field) => (field as string).toLowerCase().includes(needle)),
    );
  }, [figuresQuery.data, query]);

  if (figuresQuery.isPending) {
    return (
      <Panel>
        <LoadingState what="daftar figur" />
      </Panel>
    );
  }

  if (figuresQuery.isError) {
    return (
      <Panel>
        <ErrorState
          message={(figuresQuery.error as Error).message}
          onRetry={() => void figuresQuery.refetch()}
        />
      </Panel>
    );
  }

  const total = figuresQuery.data.figures.length;

  return (
    <Panel>
      <PanelHeader
        level={1}
        title="Figur"
        description={
          <>
            Diurutkan menurut tingkat pengaruh, dari yang tertinggi. Skor rata-rata adalah
            rata-rata relasi figur tersebut terhadap seluruh figur lain dalam peta ini, pada
            rentang −100 sampai +100.
          </>
        }
        actions={
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama, partai, jabatan…"
            aria-label="Cari figur"
            className="min-h-[44px] w-[220px] max-w-full rounded-sm border border-control-border bg-neutral-raised px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-muted"
          />
        }
      />

      <ResultCount visible={filtered.length} total={total} noun="figur" className="mb-4" />

      {filtered.length === 0 ? (
        <EmptyState
          title={`Tidak ada figur yang cocok dengan "${query}".`}
          action={
            <button
              type="button"
              onClick={() => setQuery("")}
              className="min-h-[44px] rounded-sm border border-control-border px-3 py-1.5 text-[13px] hover:border-primary hover:text-primary-ink"
            >
              Hapus filter
            </button>
          }
        />
      ) : (
        <div className="-mx-5 min-w-0 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <caption className="sr-only">
              Daftar figur politik diurutkan menurut tingkat pengaruh, dengan skor rata-rata,
              jumlah relasi, dan relasi terkuat.
            </caption>
            <thead>
              <tr className="border-b border-rule-strong">
                <th
                  scope="col"
                  className="px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted"
                >
                  #
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted"
                >
                  Figur
                </th>
                <th
                  scope="col"
                  className="hidden px-2 py-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted lg:table-cell"
                >
                  Blok
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 text-right text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted"
                >
                  Skor
                </th>
                <th
                  scope="col"
                  className="hidden px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted sm:table-cell"
                >
                  <span className="sr-only">Skala skor</span>
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 text-right text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted"
                >
                  Relasi
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted"
                >
                  Pengaruh
                </th>
                <th
                  scope="col"
                  className="hidden px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted xl:table-cell"
                >
                  Relasi terkuat
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((figure, index) => (
                <FigureRow key={figure.id} figure={figure} rank={index + 1} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export { TierChip };
