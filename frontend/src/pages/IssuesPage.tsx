import { useQuery } from "@tanstack/react-query";

import { ErrorState, LoadingState, Panel, PanelHeader, ScoreValue } from "@/components/ui";
import { api } from "@/lib/api";
import { scoreTextColor } from "@/lib/format";

/**
 * Category is carried as a colour rail on the issue name rather than a repeated
 * chip.
 *
 * The previous pass put a tinted chip in every row, so "Ekonomi" appeared three
 * times and "Sosial" three times without ever grouping anything. A rail on the
 * name column marks the category at a glance, and the categories are also used
 * to sort, so the repeated value does real work instead of adding noise.
 *
 * Colours are deliberately muted neutrals: category is a grouping aid, not a
 * measurement, so it must not compete with the score ramp.
 */
const CATEGORY_RAIL: Record<string, string> = {
  "Struktur Kekuasaan": "#2E3FBF",
  Integritas: "#6E1913",
  Kebijakan: "#185542",
  Ekonomi: "#96584E",
  Sosial: "#276650",
  Negara: "#6A7487",
  Demokrasi: "#3C745E",
};

function railColor(category: string | null): string {
  if (!category) return "#AEB7C6";
  return CATEGORY_RAIL[category] ?? "#AEB7C6";
}

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

  /*
   * Sorted by weight, descending.
   *
   * The audit found this table unsorted, which inverted its hierarchy: weight
   * is the thing that decides how much an issue moves a score, and it was
   * buried mid-table in the smallest type while long prose descriptions
   * dominated the eye. Ordering by weight makes the page answer its own
   * question ("which issues matter most?") before the reader scans anything.
   */
  const issues = [...issuesQuery.data.issues].sort(
    (a, b) => b.default_weight - a.default_weight,
  );

  const weights = issues.map((i) => i.default_weight);
  const minWeight = Math.min(...weights, 1);
  const maxWeight = Math.max(...weights, 1);

  return (
    <Panel>
      <PanelHeader
        level={1}
        title="Isu dan bobot penilaian"
        description={
          <>
            Setiap relasi dinilai per isu. Bobot menentukan seberapa besar satu isu menarik skor
            akhir: kontribusi = skor isu × bobot. Skor isu berkisar −100 sampai +100. Tabel
            diurutkan dari bobot terbesar.
          </>
        }
      />

      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <caption className="sr-only">
            Daftar isu penilaian dengan bobot, jumlah relasi, dan rata-rata skor, diurutkan dari
            bobot terbesar.
          </caption>
          <thead>
            <tr className="border-b border-rule-strong text-left">
              <th
                scope="col"
                className="px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted"
              >
                Isu
              </th>
              <th
                scope="col"
                className="px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted"
              >
                Kategori
              </th>
              {/*
                Weight is the sort key and the page's primary signal, so it gets
                the widest numeric column and its own labelled scale.
              */}
              <th
                scope="col"
                className="w-[180px] px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted"
              >
                Bobot
              </th>
              <th
                scope="col"
                className="px-3 py-2.5 text-right text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted"
              >
                Dipakai
              </th>
              <th
                scope="col"
                className="px-3 py-2.5 text-right text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted"
              >
                Rata-rata skor
              </th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue) => (
              <tr key={issue.id} className="border-b border-rule/60 hover:bg-neutral-sunk/50">
                {/*
                  The name cell holds the rail and the description together, so
                  the description no longer dictates row height across the whole
                  table: it is clamped to two lines here instead of stretching a
                  420px column.
                */}
                <td className="px-3 py-3 align-top">
                  <div className="flex gap-2.5">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 w-[3px] shrink-0 rounded-full"
                      style={{ backgroundColor: railColor(issue.category) }}
                    />
                    <div className="min-w-0">
                      <span className="block font-semibold">{issue.name}</span>
                      {issue.description ? (
                        <span className="mt-0.5 line-clamp-2 block max-w-[440px] text-[12px] leading-snug text-ink-soft">
                          {issue.description}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </td>

                <td className="px-3 py-3 align-top text-[12px] text-ink-soft">
                  {issue.category ?? "–"}
                </td>

                <td className="px-3 py-3 align-top">
                  {/*
                    The bar is drawn on the table's own weight range and labelled
                    with that range, so it discriminates. The previous bar was
                    normalised to the max with no stated domain, and its 0.8-1.6
                    spread made every row look the same length.
                  */}
                  <div className="flex items-center gap-2">
                    <span className="tabular w-9 shrink-0 text-[12.5px] font-semibold">
                      ×{issue.default_weight}
                    </span>
                    <span className="relative h-[6px] flex-1 overflow-hidden rounded-sm bg-neutral-sunk">
                      <span
                        className="absolute inset-y-0 left-0 rounded-sm bg-primary"
                        style={{
                          width: `${
                            maxWeight === minWeight
                              ? 100
                              : ((issue.default_weight - minWeight) /
                                  (maxWeight - minWeight)) *
                                  80 +
                                20
                          }%`,
                        }}
                      />
                    </span>
                  </div>
                </td>

                <td className="tabular px-3 py-3 text-right align-top text-ink-soft">
                  {issue.usage_count}
                </td>

                <td className="px-3 py-3 text-right align-top">
                  {issue.avg_score === null ? (
                    <span className="text-ink-muted">–</span>
                  ) : (
                    <ScoreValue
                      score={Math.round(issue.avg_score)}
                      color={scoreTextColor(issue.avg_score)}
                      size="sm"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[12px] text-ink-muted">
        Bobot ditampilkan pada rentang ×{minWeight} sampai ×{maxWeight}, skala tabel ini.
      </p>
    </Panel>
  );
}
