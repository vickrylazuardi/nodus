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
  solid_bloc: "#0C4232",
  alliance: "#185542",
  friendly: "#276650",
  cordial: "#3C745E",
  neutral: "#6A7487",
  wary: "#96584E",
  tension: "#934337",
  rivalry: "#862E24",
  hostile: "#6E1913",
};

/**
 * Luminance of each tier fill, ascending on the green arm and descending on the
 * red arm. Kept beside the colours because the ordering IS the encoding: a
 * reader ranks two allies by intensity, and that only works if luminance moves
 * monotonically outward from neutral. Asserted in format.test.ts so a future
 * palette edit cannot silently break the scale.
 */
export const TIER_LUMINANCE: Record<string, number> = {
  solid_bloc: 0.042,
  alliance: 0.071,
  friendly: 0.105,
  cordial: 0.143,
  neutral: 0.173,
  wary: 0.14,
  tension: 0.105,
  rivalry: 0.071,
  hostile: 0.041,
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

/**
 * Colour for a score used as a FILL.
 *
 * Returns a real hex, because this feeds Cytoscape canvases and inline
 * `backgroundColor` styles that cannot resolve a CSS variable in every context.
 * For a score drawn as TYPE use `scoreTextColor`, which is theme-aware.
 */
export function scoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return "#6A7487";
  return TIER_COLORS[tierKeyFor(score)] ?? "#6A7487";
}

/**
 * Colour for a score used as TYPE, resolved by the CSS cascade.
 *
 * Tier fills are the data and stay identical in both themes, but they are far
 * too dark to read as text on a dark ground. This returns a `var(--tier-*-text)`
 * reference instead of a hex, so light and dark each get their own ladder with
 * no React re-render and no theme lookup at the call site.
 *
 * Use this wherever a score is drawn as a numeral or a label. Use `scoreColor`
 * (or a tier's own `color`) wherever a score is drawn as a FILL.
 */
export function scoreTextColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return "var(--tier-neutral-text)";
  const key = tierKeyFor(score);
  return TIER_COLORS[key] ? `var(--tier-${key}-text)` : "var(--tier-neutral-text)";
}

/** Theme-aware text colour for a tier key. */
export function tierTextColor(key: string | null | undefined): string {
  return key ? `var(--tier-${key}-text)` : "var(--tier-neutral-text)";
}

/**
 * Colour for a score drawn as a BAR on the scale track.
 *
 * Distinct from both other roles. A bar sits on the track, not on the page, so
 * it only has to separate from the track: the dark tier fills measure ~1.04:1
 * there and would be invisible, so dark mode substitutes a brighter value. The
 * track itself is `var(--scale-track)`.
 */
export function scoreBarColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return "var(--bar-neutral)";
  const key = tierKeyFor(score);
  return TIER_COLORS[key] ? `var(--bar-${key})` : "var(--bar-neutral)";
}

/** Theme-aware bar colour for a tier key. */
export function tierBarColor(key: string | null | undefined): string {
  return key ? `var(--bar-${key})` : "var(--bar-neutral)";
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

/**
 * Indonesian label for a relationship type.
 *
 * The stored `rel_type` is an English enum (`coalition`, `alliance`, ...) and
 * the previous pass printed it raw, so the interface said "6 isu · coalition"
 * in the middle of an Indonesian sentence. Falls back to the raw value so a
 * newly added type shows something rather than nothing.
 */
const REL_TYPE_LABELS: Record<string, string> = {
  coalition: "koalisi",
  alliance: "aliansi",
  family: "keluarga",
  political: "politik",
  business: "bisnis",
  party: "partai",
  government: "pemerintahan",
  opposition: "oposisi",
};

export function relTypeLabel(relType: string | null | undefined): string {
  if (!relType) return "–";
  return REL_TYPE_LABELS[relType] ?? relType;
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
  if (!tier) return "#6A7487";
  return TIER_COLORS[tier.key] ?? tier.color ?? "#6A7487";
}

/** Tailwind-friendly class merge without pulling in a dependency at runtime. */
export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}