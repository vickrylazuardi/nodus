/**
 * Map page — two-column instrument layout.
 *
 * Why this file exists: `/peta` needs more visual weight than a single tall panel
 * provides. The fix is a 70/30 split on desktop: a wide primary column for the map
 * itself, and a narrow companion rail for quick stats (nodes · edges, blocs, ally/
 * rival/neutral counts) plus the tier legend. Below 1024px, the companion rail
 * collapses above the canvas so readers see "how many" before "what".
 *
 * This follows DESIGN.md's "Two-column instrument" pattern: the map is full-bleed,
 * controls are floating (not inline), no borders around individual stat rows.
 */

import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { RelationshipGraph } from "@/components/RelationshipGraph";
import { Medallion, Panel, PanelHeader } from "@/components/ui";
import { StatsRail } from "@/components/MapSidepanel";
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
        <LoadingState />
      </Panel>
    );
  }

  if (graphQuery.isError) {
    return (
      <Panel>
        <ErrorState message={(graphQuery.error as Error).message} onRetry={() => void graphQuery.refetch()} />
      </Panel>
    );
  }

  const graph = graphQuery.data;
  const tiers = tiersQuery.data.tiers;

  // Extract one sample figure per bloc for monogram medallions in the header.
  // When photos arrive, these upgrade to real images automatically.
  const blocMedallions = blocs.map((b) => {
    const figure = figuresQuery.data?.figures.find((f) => f.bloc === b);
    return (
      <div key={b} className="flex min-h-[44px] items-center gap-2">
        <Medallion name={figure?.name} imageUrl={figure?.photo_url} size="sm" />
        <span className="text-[11.5px] text-ink-soft">{b}</span>
      </div>
    );
  });

  const alliance = graph.counts.allies ?? 0;
  const rivalry = graph.counts.rivals ?? 0;
  const balance = graph.counts.neutral ?? 0;

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-6 lg:flex lg:items-start lg:gap-6">
      {/* Left side: header + companion rail on mobile; right side after 1024px */}
      <div className={cx("flex w-full flex-col gap-5 lg:w-[30%]", "order-1 lg:order-2")}>
        {/* Companion rail */}
        <StatsRail
          figures={graph.counts.nodes}
          relationships={graph.counts.edges}
          blocs={graph.counts.blocs}
          allies={alliance}
          rivals={rivalry}
          neutral={balance}
          tiers={tiers}
        />
      </div>

      <div className={cx("flex w-full flex-1 flex-col gap-5", "lg:w-[70%]", "order-2 lg:order-1")}>
        {/* Header: concise hero without a subtitle line */}
        <Panel>
          <PanelHeader level={1} title="Peta relasi" description={null} />

          {/* Bloc medallions row — compact, no borders between them */}
          {blocs.length > 0 ? (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-sm bg-neutral-sunk p-3">
              {blocMedallions}
              <span className="ml-auto text-[11.5px] font-mono tabular text-ink-soft">
                {blocs.length} blok
              </span>
            </div>
          ) : null}

          {/* Controls: threshold slider, bloc filter, label checkbox */}
          <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12.5px] text-ink-soft">
            <label className="flex min-h-[44px] items-center gap-2">
              <span className="font-medium text-ink">Ambang skor</span>
              <input
                type="range"
                min={0}
                max={80}
                step={5}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="h-[44px] w-[130px] accent-primary"
                aria-label="Ambang batas kekuatan relasi"
              />
              <span className="tabular w-6 text-ink">{threshold}</span>
            </label>

            <label className="flex min-h-[44px] items-center gap-2">
              <span className="font-medium text-ink">Blok</span>
              <select
                value={bloc}
                onChange={(e) => setBloc(e.target.value)}
                className="min-h-[44px] rounded-sm border border-control-border bg-neutral-raised px-2 py-1.5 text-[12.5px] text-ink"
              >
                <option value="">Semua blok</option>
                {blocs.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-h-[44px] cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
                className="h-[18px] w-[18px] accent-primary"
                aria-label="Tampilkan label nama"
              />
              <span className="font-medium text-ink">Label nama</span>
            </label>
          </div>

          {/* The graph canvas */}
          {graph.counts.edges === 0 ? (
            <div className="rounded-md border border-dashed border-rule px-5 py-12 text-center">
              <p className="text-[13.5px] text-ink-soft">
                Tidak ada relasi yang melewati ambang {threshold}. Turunkan ambangnya untuk melihat
                lebih banyak koneksi.
              </p>
              <button
                type="button"
                className="mt-4 min-h-[44px] rounded-sm border border-control-border bg-neutral-raised px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:border-primary hover:bg-neutral-sunk"
                onClick={() => setThreshold(0)}
              >
                Reset ambang
              </button>
            </div>
          ) : (
            <RelationshipGraph data={graph} onSelect={onSelect} showLabels={showLabels} />
          )}

          {/*
            Legend and keys.

            The audit found two gaps here. First, node size encodes influence
            and nothing on the page said so, which is a fundamental omission in
            a network tool: an unexplained encoding is a defect. Second, the
            tier legend showed flat colour bars, so it did not convey that the
            ramp's intensity is part of the encoding.

            The legend now shows each tier at its true fill with the size key
            beside it, so both visual variables are documented where the map is.
          */}
          <div className="mt-4 flex flex-wrap items-start gap-x-8 gap-y-4">
            <div aria-label="Tingkat opini" className="min-w-0">
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
                Tingkat hubungan
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-2">
                {tiers.map((tier) => (
                  <span
                    key={tier.key}
                    className="flex items-center gap-1.5 text-[11.5px] text-ink-soft"
                  >
                    <span
                      aria-hidden="true"
                      className="tier-fill h-[10px] w-[18px] rounded-sm"
                      style={{ backgroundColor: tier.color }}
                    />
                    {tier.label}
                  </span>
                ))}
              </div>
            </div>

            {/*
              The size key. Two dots at the ends of the influence range, labelled,
              because a size encoding with no key is guesswork.
            */}
            <div className="min-w-0">
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
                Ukuran simpul
              </div>
              <div className="flex items-end gap-3 text-[11.5px] text-ink-soft">
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="inline-block h-[10px] w-[10px] rounded-full border border-rule-strong bg-neutral-sunk"
                  />
                  pengaruh rendah
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="inline-block h-[18px] w-[18px] rounded-full border border-rule-strong bg-neutral-sunk"
                  />
                  pengaruh tinggi
                </span>
              </div>
            </div>
          </div>
        </Panel>

        {/* Note panel below the instrument */}
        <Panel sunk>
          <p className="text-[12.5px] text-ink-soft">
            <strong className="font-semibold text-ink">Catatan.</strong> Skor bersifat ilustratif,
            dihitung dari data yang diisi admin berdasarkan dinamika yang dilaporkan publik. Ini alat
            bantu membaca pola relasi, bukan penilaian faktual atas tokoh.
          </p>
        </Panel>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- Fallbacks */

function LoadingState() {
  return (
    <div role="status" aria-live="polite" className="grid h-[min(72vh,760px)] w-full place-items-center rounded-md border border-rule bg-neutral-raised">
      <p className="text-[13px] text-ink-soft">Memuat mesin peta relasi…</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      className="rounded-md border border-hostile/40 bg-hostile/5 px-5 py-6"
      role="alert"
    >
      <p className="text-[13.5px] text-ink">
        <strong className="font-semibold">Gagal memuat.</strong> {message}
      </p>
      {onRetry ? (
        <button
          type="button"
          className="mt-3 min-h-[44px] rounded-sm border border-control-border bg-neutral-raised px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:border-primary hover:bg-neutral-sunk"
          onClick={onRetry}
        >
          Coba lagi
        </button>
      ) : null}
    </div>
  );
}
