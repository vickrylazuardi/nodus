import { useQuery } from "@tanstack/react-query";

import { EmptyState, ErrorState, LoadingState, Panel, PanelHeader } from "@/components/ui";
import { api } from "@/lib/api";

export function AdminAudit() {
  const auditQuery = useQuery({
    queryKey: ["admin", "audit"],
    queryFn: () => api.auth.audit(250),
  });

  if (auditQuery.isPending) {
    return (
      <Panel>
        <LoadingState what="riwayat" />
      </Panel>
    );
  }

  if (auditQuery.isError) {
    return (
      <Panel>
        <ErrorState
          message={(auditQuery.error as Error).message}
          onRetry={() => void auditQuery.refetch()}
        />
      </Panel>
    );
  }

  const entries = auditQuery.data.entries;

  return (
    <Panel>
      <PanelHeader
        title="Riwayat perubahan"
        description="Catatan audit setiap perubahan data, terbaru lebih dulu. Berguna untuk menelusuri siapa mengubah apa."
      />

      {entries.length === 0 ? (
        <EmptyState title="Belum ada perubahan tercatat. Riwayat terisi begitu Anda menyimpan data." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            {/* The caption is the table's accessible name; without it a screen
                reader announces only "table, 5 columns". */}
            <caption className="sr-only">
              Riwayat perubahan data, terbaru lebih dulu, dengan waktu, entitas, aksi, dan
              detailnya.
            </caption>
            <thead>
              <tr className="border-b border-rule text-left">
                {["Waktu", "Entitas", "ID", "Aksi", "Detail"].map((head) => (
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
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-rule/60">
                  <td className="tabular whitespace-nowrap px-3 py-2.5 text-[12px] text-ink-soft">
                    {entry.ts.slice(0, 19).replace("T", " ")}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-sm border border-rule bg-neutral-sunk px-2 py-0.5 text-[11px]">
                      {entry.entity}
                    </span>
                  </td>
                  <td className="tabular px-3 py-2.5 text-ink-soft">{entry.entity_id ?? "–"}</td>
                  <td className="px-3 py-2.5">{entry.action}</td>
                  <td className="px-3 py-2.5 text-[12px] text-ink-soft">{entry.detail ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
