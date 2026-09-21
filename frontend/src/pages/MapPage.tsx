import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { RelationshipGraph } from "@/components/RelationshipGraph";
import { Button, ErrorState, LoadingState, Panel, PanelHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";

export function MapPage() {
  const navigate = useNavigate();
  const [threshold, setThreshold] = useState(0);
  const [bloc, setBloc] = useState("");
  const [showLabels, setShowLabels] = useState(true);

  const tiersQuery = useQuery({ queryKey: ["tiers"], queryFn: api.tiers });
  const figuresQuery = useQuery({ queryKey: ["figures"], queryFn: () => api.figures.list() });
  const graphQuery = useQuery({
    queryKey: ["graph", threshold, bloc],
    queryFn: () => api.graph({ threshold, bloc: bloc || undefined }),
  });

  const onSelect = useCallback(
    (node: { id: number }) => navigate(`/figur/${node.id}`),
    [navigate],
  );

  const blocs = Array.from(
    new Set((figuresQuery.data?.figures ?? []).map((f) => f.bloc).filter(Boolean) as string[]),
  ).sort();

  if (graphQuery.isPending || tiersQuery.isPending || !graphQuery.data || !tiersQuery.data) {
    return (
      <Panel>
        <LoadingState what="peta relasi" />
      </Panel>
    );
  }

  if (graphQuery.isError) {
    return (
      <Panel>
        <ErrorState
          message={(graphQuery.error as Error).message}
          onRetry={() => void graphQuery.refetch()}
        />
      </Panel>
    );
  }

  const graph = graphQuery.data;
  const tiers = tiersQuery.data.tiers;

  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <PanelHeader
          level={1}
          title="Peta relasi"
          description={
            <>
              Titik adalah figur, ukurannya mengikuti tingkat pengaruh. Garis adalah relasi: makin
              tebal dan pekat berarti makin kuat, putus-putus berarti bermusuhan. Sekutu saling
              menarik dan rival saling menjauh, sehingga blok koalisi terbentuk sendiri.{" "}
              <strong className="font-semibold text-ink">
                Gulir untuk memperbesar, seret latar untuk menggeser, seret titik untuk
                memindahkannya.
              </strong>{" "}
              Titik yang Anda pindahkan akan tetap di tempatnya sampai Anda menekan tombol susun
              ulang. Saat diperkecil, hanya figur paling berpengaruh yang diberi nama; arahkan
              kursor ke titik mana pun untuk melihat namanya, atau perbesar untuk menampilkan
              semuanya. Klik figur untuk membuka profilnya.
            </>
          }
        />

        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12.5px] text-ink-soft">
          <label className="flex items-center gap-2">
            <span className="font-medium text-ink">Ambang skor</span>
            <input
              type="range"
              min={0}
              max={80}
              step={5}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-[130px] accent-[#9A6B2F]"
              aria-label="Ambang batas kekuatan relasi"
            />
            <span className="tabular w-6 text-ink">{threshold}</span>
          </label>

          <label className="flex items-center gap-2">
            <span className="font-medium text-ink">Blok</span>
            <select
              value={bloc}
              onChange={(e) => setBloc(e.target.value)}
              className="rounded-sm border border-rule bg-neutral-raised px-2 py-1.5 text-[12.5px] text-ink"
            >
              <option value="">Semua blok</option>
              {blocs.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="accent-[#9A6B2F]"
            />
            <span className="font-medium text-ink">Label nama</span>
          </label>

          <span className="tabular ml-auto text-ink-soft">
            {graph.counts.nodes} figur · {graph.counts.edges} relasi
          </span>
        </div>

        {graph.counts.edges === 0 ? (
          <div className="rounded-md border border-dashed border-rule px-5 py-12 text-center">
            <p className="text-[13.5px] text-ink-soft">
              Tidak ada relasi yang melewati ambang {threshold}. Turunkan ambangnya untuk melihat
              lebih banyak koneksi.
            </p>
            <Button className="mt-4" onClick={() => setThreshold(0)}>
              Reset ambang
            </Button>
          </div>
        ) : (
          <RelationshipGraph data={graph} onSelect={onSelect} showLabels={showLabels} />
        )}

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          {tiers.map((tier) => (
            <span key={tier.key} className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
              <span
                aria-hidden="true"
                className="h-[3px] w-5 rounded-full"
                style={{ backgroundColor: tier.color }}
              />
              {tier.label}
            </span>
          ))}
        </div>
      </Panel>

      <Panel sunk>
        <p className="text-[12.5px] text-ink-soft">
          <strong className="font-semibold text-ink">Catatan.</strong> Skor bersifat ilustratif,
          dihitung dari data yang diisi admin berdasarkan dinamika yang dilaporkan publik. Ini alat
          bantu membaca pola relasi, bukan penilaian faktual atas tokoh.
        </p>
      </Panel>
    </div>
  );
}


/** Small legend used by other pages too. */
export interface LegendTier {
  key: string;
  label: string;
  color: string;
}

export function TierLegend({
  tiers,
  distribution,
}: {
  tiers: LegendTier[];
  distribution?: Record<string, number>;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {tiers.map((tier) => (
        <span
          key={tier.key}
          className={cx("flex items-center gap-1.5 text-[11.5px] text-ink-soft")}
        >
          <span
            aria-hidden="true"
            className="h-[3px] w-5 rounded-full"
            style={{ backgroundColor: tier.color }}
          />
          {tier.label}
          {distribution?.[tier.label] !== undefined ? ` (${distribution[tier.label]})` : ""}
        </span>
      ))}
    </div>
  );
}