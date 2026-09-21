import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { ErrorState, LoadingState, Panel, PanelHeader, ScoreValue } from "@/components/ui";
import { api } from "@/lib/api";
import { scoreColor } from "@/lib/format";

export function AdminOverview() {
  const statsQuery = useQuery({ queryKey: ["stats"], queryFn: api.stats });
  const healthQuery = useQuery({ queryKey: ["health"], queryFn: api.health });

  if (statsQuery.isPending || healthQuery.isPending) {
    return (
      <Panel>
        <LoadingState what="ringkasan" />
      </Panel>
    );
  }

  if (statsQuery.isError || healthQuery.isError) {
    const error = (statsQuery.error ?? healthQuery.error) as Error;
    return (
      <Panel>
        <ErrorState
          message={error.message}
          onRetry={() => {
            void statsQuery.refetch();
            void healthQuery.refetch();
          }}
        />
      </Panel>
    );
  }

  const stats = statsQuery.data;

  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <PanelHeader
          title="Ringkasan"
          description="Kondisi dataset saat ini. Semua perubahan tersimpan langsung ke database."
          actions={
            <>
              <Link
                to="/admin/relasi"
                className="rounded-sm border border-primary bg-primary px-3 py-2 text-[13px] font-medium text-white hover:bg-primary-bright hover:text-ink"
              >
                Kelola relasi
              </Link>
              <Link
                to="/admin/figur"
                className="rounded-sm border border-rule px-3 py-2 text-[13px] hover:border-primary hover:text-primary-ink"
              >
                Kelola figur
              </Link>
            </>
          }
        />

        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Figur", value: stats.totals.figures, to: "/admin/figur" },
            { label: "Relasi", value: stats.totals.relationships, to: "/admin/relasi" },
            { label: "Isu", value: stats.totals.issues, to: "/admin/isu" },
            { label: "Modifier aktif", value: stats.totals.active_modifiers, to: null },
          ].map((item) => (
            <div key={item.label} className="rounded-md border border-rule bg-neutral-sunk/50 p-4">
              {/* dt before dd: a description list is term-then-description, and
                  the reverse order is invalid markup that some readers ignore. */}
              <dt className="text-[11.5px] uppercase tracking-[0.06em] text-ink-soft">
                {item.label}
              </dt>
              <dd className="tabular mt-1 font-display text-[27px] font-bold leading-none">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </Panel>

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
                  <span className="truncate text-[13px]">{row.pair}</span>
                  <ScoreValue score={row.score} color={scoreColor(row.score)} size="sm" />
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>

      <Panel>
        <PanelHeader
          title="Isu paling memecah"
          description="Rentang skor terlebar antar relasi. Isu seperti ini paling sering menimbulkan friksi."
        />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <caption className="sr-only">
              Isu yang paling memecah, dengan rata-rata skor, rentang, simpangan baku, dan jumlah
              relasi yang memakainya.
            </caption>
            <thead>
              <tr className="border-b border-rule text-left">
                {["Isu", "Rata-rata", "Rentang", "σ", "Dipakai"].map((head) => (
                  <th
                    key={head}
                    scope="col"
                    className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.most_divisive_issues.map((issue) => (
                <tr key={issue.issue_id} className="border-b border-rule/60">
                  <td className="px-3 py-2.5 font-semibold">{issue.issue}</td>
                  <td className="px-3 py-2.5">
                    <ScoreValue
                      score={Math.round(issue.avg)}
                      color={scoreColor(issue.avg)}
                      size="sm"
                    />
                  </td>
                  <td className="tabular px-3 py-2.5">{issue.spread}</td>
                  <td className="tabular px-3 py-2.5">{issue.stddev}</td>
                  <td className="tabular px-3 py-2.5 text-ink-soft">{issue.n} relasi</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}