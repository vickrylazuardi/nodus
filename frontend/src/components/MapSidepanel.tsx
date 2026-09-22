/**
 * Companion rail for /peta.
 *
 * Why this exists: the map needs a narrow rail showing "how many" before it shows
 * "what" — nodes, edges, blocs, ally/rival/neutral counts, then the tier legend.
 * This is sidebar copy, not form fields, so no outline-only inputs here.
 */

import type { Tier } from "@/lib/types";

export interface StatsRailProps {
  /** Figure · relationship counts used by the live region everywhere. */
  figures: number;
  relationships: number;
  /** Blocs count, derived from bloc groupings. */
  blocs?: number;
  /** Ally/Rival/Neutral edge counts from computeStats(). */
  allies?: number;
  rivals?: number;
  neutral?: number;
  tiers: Tier[];
}

export function StatRow({
  left,
  right,
}: {
  left: string | React.ReactNode;
  right: string | React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-sm bg-neutral-sunk px-3 py-2 text-[11.5px] leading-snug">
      <span>{left}</span>
      <span className="font-mono font-semibold">{right}</span>
    </div>
  );
}

export function StatsRail({
  figures,
  relationships,
  blocs,
  allies,
  rivals,
  neutral,
  tiers,
}: StatsRailProps) {
  const alliance = allies ?? 0;
  const rivalry = rivals ?? 0;
  const balance = neutral ?? 0;
  const blocLabel = blocs ? `${blocs} blok` : "";

  return (
    <aside className="flex flex-col gap-3">
      {/* Compact stats row */}
      <div className="flex items-center justify-between gap-2 rounded-sm bg-neutral-sunk px-3 py-2 text-[11.5px] leading-snug">
        <span className="text-ink-soft">Figur</span>
        <span className="font-mono font-semibold">{figures}</span>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-sm bg-neutral-sunk px-3 py-2 text-[11.5px] leading-snug">
        <span className="text-ink-soft">Relasi</span>
        <span className="font-mono font-semibold">{relationships}</span>
      </div>

      {blocs ? (
        <div className="flex items-center justify-between gap-2 rounded-sm bg-neutral-sunk px-3 py-2 text-[11.5px] leading-snug">
          <span className="text-ink-soft">Kekompokan</span>
          <span className="font-mono font-semibold">{blocLabel}</span>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 rounded-sm bg-neutral-sunk px-3 py-2 text-[11.5px] leading-snug">
        <span className="text-ink-soft">Aliansi</span>
        <span className="font-mono font-semibold">{alliance}</span>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-sm bg-neutral-sunk px-3 py-2 text-[11.5px] leading-snug">
        <span className="text-ink-soft">Netral</span>
        <span className="font-mono font-semibold">{balance}</span>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-sm bg-neutral-sunk px-3 py-2 text-[11.5px] leading-snug">
        <span className="text-ink-soft">Rival</span>
        <span className="font-mono font-semibold">{rivalry}</span>
      </div>

      {/* Tier legend — small version for the narrow rail */}
      <div className="rounded-sm border border-rule bg-neutral-sunk p-3">
        <div aria-label="Tingkat opini" className="flex flex-wrap gap-x-4 gap-y-2">
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
      </div>
    </aside>
  );
}
