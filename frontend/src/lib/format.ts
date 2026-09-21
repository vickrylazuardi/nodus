/**
 * Small helpers shared by the visual layer.
 */

import type { Tier } from "./types";

/**
 * Maps a score to the tier colour ramp defined in DESIGN.md.
 *
 * The tier thresholds here mirror the backend ladder exactly (see
 * `app/services/scoring.py`). The colours come from the design tokens rather
 * than being re-declared, so the palette stays single-sourced.
 */
export const TIER_COLORS: Record<string, string> = {
  solid_bloc: "#1F5A4C",
  alliance: "#2A6B5A",
  friendly: "#357A66",
  cordial: "#3F7F6C",
  neutral: "#525A66",
  wary: "#7A6A50",
  tension: "#8F5A3A",
  rivalry: "#8A3F2E",
  hostile: "#7E2A25",
};

/** Tier key for a score, matching the backend ladder exactly. */
export function tierKeyFor(score: number): string {
  if (score >= 80) return "solid_bloc";
  if (score >= 55) return "alliance";
  if (score >= 30) return "friendly";
  if (score >= 8) return "cordial";
  if (score >= -7) return "neutral";
  if (score >= -29) return "wary";
  if (score >= -54) return "tension";
  if (score >= -79) return "rivalry";
  return "hostile";
}

export function scoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return "#525A66";
  return TIER_COLORS[tierKeyFor(score)] ?? "#525A66";
}

/** Signed score for display, e.g. "+88" / "-94" / "0". */
export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return "–";
  return score > 0 ? `+${score}` : String(score);
}

export function formatNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "–";
  return value.toFixed(digits);
}

export function formatSigned(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "–";
  return value > 0 ? `+${value.toFixed(digits)}` : value.toFixed(digits);
}

/** Two-letter monogram used in place of avatars. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0] ?? "").join("").toUpperCase() || "?";
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/**
 * Position and width for the score rule motif.
 * Hostile fills left of centre, allied fills right.
 */
export function scoreRuleGeometry(score: number): { left: string; width: string } {
  const clamped = Math.max(-100, Math.min(100, score));
  const half = Math.abs(clamped) / 2;
  const width = `${Math.min(50, half)}%`;
  const left = clamped < 0 ? `${50 - Math.min(50, half)}%` : "50%";
  return { left, width };
}

export function tierColor(tier: Tier | null | undefined): string {
  if (!tier) return "#525A66";
  return TIER_COLORS[tier.key] ?? tier.color ?? "#525A66";
}

/** Tailwind-friendly class merge without pulling in a dependency at runtime. */
export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}