import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import {
  EmptyState,
  ErrorState,
  HIT_AREA,
  LoadingState,
  Panel,
  PanelHeader,
  ResultCount,
  ScoreRule,
  ScoreValue,
  Tag,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cx, initials, scoreColor } from "@/lib/format";
import type { Figure } from "@/lib/types";

function FigureCard({ figure }: { figure: Figure }) {
  return (
    <Link
      to={`/figur/${figure.id}`}
      className={cx(
        HIT_AREA,
        /*
         * min-w-0 is load-bearing: this card is a grid item, and a grid item's
         * automatic minimum size is its content's min-content width. Without
         * it the card could not shrink below its widest unbreakable content and
         * measured 283px inside a 238px track, pushing /figur to 324px on a
         * 320px viewport.
         */
        "group flex min-w-0 flex-col gap-3 rounded-md border border-rule bg-neutral-raised p-4 transition-colors hover:border-primary",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-rule bg-neutral-sunk font-display text-[14px] font-semibold text-primary-ink"
        >
          {initials(figure.name)}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[14.5px] font-semibold group-hover:text-primary-ink">
            {figure.name}
          </div>
          <div className="truncate text-[11.5px] text-ink-soft">{figure.role ?? "–"}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {figure.party ? <Tag>{figure.party}</Tag> : null}
        {figure.bloc ? <Tag>{figure.bloc}</Tag> : null}
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-rule pt-3">
        <div>
          <ScoreValue score={figure.avg_score} color={scoreColor(figure.avg_score)} size="sm" />
          <div className="mt-0.5 text-[10.5px] uppercase tracking-[0.06em] text-ink-soft">
            Skor rata-rata
          </div>
        </div>
        <div>
          <span className="tabular text-[15px] font-semibold">{figure.relationship_count}</span>
          <div className="mt-0.5 text-[10.5px] uppercase tracking-[0.06em] text-ink-soft">
            Relasi
          </div>
        </div>
        <div>
          <span className="tabular text-[15px] font-semibold">{figure.influence}</span>
          <div className="mt-0.5 text-[10.5px] uppercase tracking-[0.06em] text-ink-soft">
            Pengaruh
          </div>
        </div>
      </div>

      {figure.best_ally || figure.worst_rival ? (
        <div className="flex flex-col gap-1 text-[11.5px]">
          {figure.best_ally ? (
            <div className="flex items-center justify-between gap-2 text-ally">
              <span className="truncate">▲ {figure.best_ally.name}</span>
              <span className="tabular shrink-0 font-semibold">
                {figure.best_ally.score > 0 ? "+" : ""}
                {figure.best_ally.score}
              </span>
            </div>
          ) : null}
          {figure.worst_rival ? (
            <div className="flex items-center justify-between gap-2 text-hostile">
              <span className="truncate">▼ {figure.worst_rival.name}</span>
              <span className="tabular shrink-0 font-semibold">
                {figure.worst_rival.score > 0 ? "+" : ""}
                {figure.worst_rival.score}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </Link>
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
        description={`${total} figur, diurutkan menurut tingkat pengaruh. Skor rata-rata adalah rata-rata relasinya terhadap seluruh figur lain dalam peta ini.`}
        actions={
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama, partai, jabatan…"
            aria-label="Cari figur"
            className="min-h-[44px] w-[220px] max-w-full rounded-sm border border-rule bg-neutral-raised px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-soft/60"
          />
        }
      />

      <ResultCount
        visible={filtered.length}
        total={total}
        noun="figur"
        className="mb-4"
      />

      {filtered.length === 0 ? (
        <EmptyState
          title={`Tidak ada figur yang cocok dengan "${query}".`}
          action={
            <button
              type="button"
              onClick={() => setQuery("")}
              className="min-h-[44px] rounded-sm border border-rule px-3 py-1.5 text-[13px] hover:border-primary hover:text-primary-ink"
            >
              Hapus filter
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((figure) => (
            <FigureCard key={figure.id} figure={figure} />
          ))}
        </div>
      )}
    </Panel>
  );
}

export { ScoreRule };