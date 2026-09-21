import { useQuery } from "@tanstack/react-query";

import { ErrorState, LoadingState, Panel, PanelHeader, ScoreValue } from "@/components/ui";
import { TierLegend } from "@/pages/MapPage";
import { api } from "@/lib/api";
import { formatDate, scoreColor } from "@/lib/format";

export function StatsPage() {
  const statsQuery = useQuery({ queryKey: ["stats"], queryFn: api.stats });
  const tiersQuery = useQuery({ queryKey: ["tiers"], queryFn: api.tiers });

  if (statsQuery.isPending || tiersQuery.isPending || !statsQuery.data || !tiersQuery.data) {
    return (
      <Panel>
        <LoadingState what="statistik" />
      </Panel>
    );
  }

  if (statsQuery.isError) {
    return (
      <Panel>
        <ErrorState
          message={(statsQuery.error as Error).message}
          onRetry={() => void statsQuery.refetch()}
        />
      </Panel>
    );
  }

  const stats = statsQuery.data;
  const tiers = tiersQuery.data.tiers;
  const total = Object.values(stats.tier_distribution).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <PanelHeader
          level={1}
          title="Statistik peta politik"
          description="Ringkasan seluruh dataset relasi."
        />
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Figur", value: stats.totals.figures },
            { label: "Relasi terpetakan", value: stats.totals.relationships },
            { label: "Isu penilaian", value: stats.totals.issues },
            { label: "Modifier aktif", value: stats.totals.active_modifiers },
          ].map((item) => (
            <div key={item.label} className="rounded-md border border-rule bg-neutral-sunk/50 p-4">
              <dd className="tabular font-display text-[27px] font-bold leading-none">
                {item.value}
              </dd>
              <dt className="mt-1 text-[11.5px] uppercase tracking-[0.06em] text-ink-soft">
                {item.label}
              </dt>
            </div>
          ))}
        </dl>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader
            title="Sebaran tingkat hubungan"
            description="Berapa banyak relasi yang berada di setiap tingkat."
          />
          <div
            className="flex h-[38px] overflow-hidden rounded-md border border-rule"
            role="img"
            aria-label="Diagram batang sebaran tingkat hubungan"
          >
            {tiers.map((tier) => {
              const count = stats.tier_distribution[tier.label] ?? 0;
              if (count === 0) return null;
              const pct = (count / total) * 100;
              return (
                <div
                  key={tier.key}
                  className="grid place-items-center text-[11px] font-bold text-white"
                  style={{ width: `${pct}%`, backgroundColor: scoreColor(tier.threshold) }}
                  title={`${tier.label}: ${count} relasi`}
                >
                  {pct > 8 ? count : ""}
                </div>
              );
            })}
          </div>
          <div className="mt-4">
            <TierLegend tiers={tiers} distribution={stats.tier_distribution} />
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Isu paling memecah"
            description="Isu dengan rentang skor terlebar antar relasi: paling sering membuat figur berselisih."
          />
          <ul className="flex flex-col gap-2">
            {stats.most_divisive_issues.map((issue) => (
              <li key={issue.issue_id} className="rounded-sm border border-rule px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold">{issue.issue}</span>
                  <ScoreValue
                    score={Math.round(issue.avg)}
                    color={scoreColor(issue.avg)}
                    size="sm"
                  />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10.5px] text-ink-soft">
                  <span className="rounded-sm border border-rule bg-neutral-sunk px-1.5 py-0.5">
                    rentang {issue.spread}
                  </span>
                  <span className="rounded-sm border border-rule bg-neutral-sunk px-1.5 py-0.5">
                    σ {issue.stddev}
                  </span>
                  <span className="rounded-sm border border-rule bg-neutral-sunk px-1.5 py-0.5">
                    {issue.n} relasi
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {[
          { title: "Relasi paling mesra", rows: stats.most_aligned },
          { title: "Relasi paling panas", rows: stats.most_hostile },
        ].map((group) => (
          <Panel key={group.title}>
            <PanelHeader title={group.title} />
            <ul className="flex flex-col gap-1.5">
              {group.rows.map((row) => (
                <li
                  key={row.pair}
                  className="flex items-center justify-between gap-3 rounded-sm border border-rule px-3 py-2"
                >
                  {/*
                   * min-w-0 is load-bearing. A flex or grid item's automatic
                   * minimum size is its content's min-content width, so
                   * `truncate` alone does not let it shrink: the item stays as
                   * wide as the longest figure name. Measured at 320px, that
                   * forced the whole page to 374px and the panel column to
                   * 353px inside a 280px grid.
                   */}
                  <span className="min-w-0 truncate text-[13px]">{row.pair}</span>
                  <ScoreValue score={row.score} color={scoreColor(row.score)} size="sm" />
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>

      <Panel sunk>
        <p className="text-[12px] text-ink-soft">
          Terakhir diperbarui:{" "}
          <strong className="font-semibold text-ink">{formatDate(stats.last_updated)}</strong>.
          Seluruh skor bersifat ilustratif dan dapat diubah melalui dashboard admin.
        </p>
      </Panel>
    </div>
  );
}
