import { useQuery } from "@tanstack/react-query";

import { ErrorState, LoadingState, Panel, PanelHeader, ScoreValue } from "@/components/ui";
import { api } from "@/lib/api";
import { scoreColor } from "@/lib/format";

export function IssuesPage() {
  const issuesQuery = useQuery({ queryKey: ["issues"], queryFn: () => api.issues.list() });

  if (issuesQuery.isPending) {
    return (
      <Panel>
        <LoadingState what="daftar isu" />
      </Panel>
    );
  }

  if (issuesQuery.isError) {
    return (
      <Panel>
        <ErrorState
          message={(issuesQuery.error as Error).message}
          onRetry={() => void issuesQuery.refetch()}
        />
      </Panel>
    );
  }

  const issues = issuesQuery.data.issues;
  const maxWeight = Math.max(...issues.map((i) => i.default_weight), 1);

  return (
    <Panel>
      <PanelHeader
        level={1}
        title="Isu dan bobot penilaian"
        description="Setiap relasi dinilai per isu. Bobot menentukan seberapa besar satu isu menarik skor akhir: kontribusi = skor isu × bobot. Skor isu berkisar −100 sampai +100."
      />

      <div className="min-w-0 overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <caption className="sr-only">Daftar isu penilaian dengan bobot dan rata-rata skor.</caption>
          <thead>
            <tr className="border-b border-rule text-left">
              {["Isu", "Kategori", "Bobot", "Dipakai", "Rata-rata skor", "Deskripsi"].map((head) => (
                <th
                  key={head}
                  scope="col"
                  className="whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft"
                >
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {issues.map((issue) => (
              <tr key={issue.id} className="border-b border-rule/60 hover:bg-neutral-sunk/50">
                <td className="px-3 py-2.5 font-semibold">{issue.name}</td>
                <td className="px-3 py-2.5">
                  <span className="rounded-sm border border-rule bg-neutral-sunk px-2 py-0.5 text-[11px]">
                    {issue.category ?? "–"}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2">
                    <span className="tabular w-8 text-[12.5px]">×{issue.default_weight}</span>
                    <span
                      aria-hidden="true"
                      className="h-[4px] rounded-full bg-primary/70"
                      style={{ width: `${(issue.default_weight / maxWeight) * 54}px` }}
                    />
                  </span>
                </td>
                <td className="tabular px-3 py-2.5 text-ink-soft">{issue.usage_count} relasi</td>
                <td className="px-3 py-2.5">
                  {issue.avg_score === null ? (
                    <span className="text-ink-soft">–</span>
                  ) : (
                    <ScoreValue
                      score={Math.round(issue.avg_score)}
                      color={scoreColor(issue.avg_score)}
                      size="sm"
                    />
                  )}
                </td>
                <td className="max-w-[420px] px-3 py-2.5 text-[12.5px] text-ink-soft">
                  {issue.description ?? "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
