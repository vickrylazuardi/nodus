/**
 * Design-system primitives.
 *
 * Each component exists because more than one screen needs it. Anything used
 * once lives in its page instead.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/format";

/* ------------------------------------------------------------------ Button */

type ButtonVariant = "primary" | "quiet" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

/**
 * Hit-area contract: discrete controls are at least 44x44 CSS px, the smallest
 * size a thumb can hit reliably. Exported so links that are not built from
 * <Button> (list rows, nav items, the matrix) hold the same minimum instead of
 * each page inventing its own padding.
 */
export const HIT_AREA = "min-h-[44px]";

/*
 * Radii are small (2px) per DESIGN.md: a ledger is cut, not moulded, and
 * squared corners keep the dense tables aligned.
 */
const BUTTON_STYLES: Record<ButtonVariant, string> = {
  // The only bronze-filled control on a screen. A second primary button would
  // spend the single accent twice.
  primary:
    "bg-primary text-white hover:bg-primary-bright hover:text-ink border border-primary hover:border-primary-bright",
  quiet:
    "bg-neutral-sunk text-ink border border-control-border hover:border-primary hover:bg-neutral-raised",
  danger: "bg-hostile text-white border border-hostile hover:opacity-90",
};

export function Button({ variant = "quiet", className, children, ...rest }: ButtonProps) {
  return (
    <button
      className={cx(
        "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-sm px-3 py-2 text-[13px] font-medium",
        "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        BUTTON_STYLES[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------- Panel */

export function Panel({
  children,
  className,
  sunk = false,
}: {
  children: ReactNode;
  className?: string;
  sunk?: boolean;
}) {
  return (
    <section
      className={cx(
        // min-w-0 lets a Panel shrink when it is a flex or grid item.
        //
        // A grid item's automatic minimum size is its content's min-content
        // width, so without this a Panel holding a long unbroken string cannot
        // go narrower than that string and overflows its track. Measured on
        // /statistik at 320px: the grid track was 280px while its Panel
        // children rendered 354px and pushed the whole document to 374px.
        "min-w-0 rounded-md border border-rule p-5",
        sunk ? "bg-neutral-sunk" : "bg-neutral-raised",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  description,
  actions,
  level = 2,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /**
   * 1 promotes this panel's title to the page's <h1>. Every public route needs
   * exactly one <h1> so the document outline has a root; the page-level panel
   * passes 1 and every section panel keeps the default. Only the element
   * changes — the visual weight is deliberately identical, because the page
   * title and a section title carry the same emphasis in this ledger.
   */
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <Heading className="text-[17px] leading-tight">{title}</Heading>
        {description ? (
          <p className="mt-1 max-w-prose text-[13px] text-ink-soft">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/* -------------------------------------------------------------------- Chip */

/**
 * Filled, not outlined: an outlined chip on parchment reads as a form field.
 * The dot is present only because the chip always carries a real tier colour.
 */
export function TierChip({
  label,
  color,
  className,
}: {
  label: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[11px] font-semibold text-white",
        className,
      )}
      style={{ backgroundColor: color }}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-white/70" />
      {label}
    </span>
  );
}

/** Tier legend. Inline tier chips with colour bars, no distribution counts by default. */
export function TierLegend({ tiers }: { tiers: Array<{ key: string; label: string; color: string }> }) {
  return (
    <div className={cx("flex flex-wrap gap-x-4 gap-y-2")} aria-label="Tingkat opini">
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
        </span>
      ))}
    </div>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-sm border border-rule bg-neutral-sunk px-2 py-0.5 text-[11px] text-ink-soft">
      {children}
    </span>
  );
}

/* -------------------------------------------------------------- ScoreRule */

/**
 * The identity motif: a horizontal measure with a marked zero axis, optional
 * ticks, and the value filled outward from the centre, left for hostile and
 * right for allied. Reused at four zoom levels (matrix cell, relationship row,
 * per-issue breakdown, profile hero) so the same mark reads the same way
 * wherever it appears.
 *
 * Why the axis and ticks are not optional: the previous pass drew a diverging
 * bar with no midpoint, so a reader could not find zero and could not tell a
 * strong hostile from a weak one. A diverging bar without a marked centre is a
 * decoration, not a measurement. See DESIGN.md `## Information Design`.
 */
export function ScoreRule({
  score,
  color,
  height = 6,
  label,
  ticks = false,
  className,
}: {
  score: number;
  color: string;
  height?: number;
  label?: string;
  /** Draw ticks at ±50 and ±100. Use on a primary reading position. */
  ticks?: boolean;
  className?: string;
}) {
  const clamped = Math.max(-100, Math.min(100, score));
  const half = Math.abs(clamped) / 2;
  const width = Math.min(50, half);
  const left = clamped < 0 ? 50 - width : 50;

  return (
    <div
      className={cx("scale-rule relative w-full overflow-hidden rounded-sm", className)}
      style={{ height, backgroundColor: "var(--scale-track)" }}
      role="img"
      aria-label={label ?? `Skor ${score} dari rentang -100 sampai +100`}
    >
      {ticks ? (
        <>
          <span aria-hidden="true" className="scale-tick" style={{ left: "25%" }} />
          <span aria-hidden="true" className="scale-tick" style={{ left: "75%" }} />
        </>
      ) : null}
      <span aria-hidden="true" className="absolute inset-y-0 left-1/2 z-10 w-px bg-rule-strong" />
      <span
        className="absolute inset-y-0 rounded-sm"
        style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color }}
      />
      {/*
        The value marker.

        A bare filled extent says "some positive amount" and nothing more, so
        the bar cannot answer "where exactly does this sit?". A caret at the
        terminus gives the fill a readable endpoint on the scale, which is what
        makes the mark a measurement rather than a proportion.
      */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 z-20 w-[2px] bg-ink"
        style={{ left: `calc(${clamped < 0 ? left : left + width}% - 1px)` }}
      />
    </div>
  );
}

/**
 * A score scale with its range made explicit.
 *
 * The hero number on a profile was previously a bare numeral with no scale,
 * which the visual audit found meaningless: the largest thing on the page told
 * a first-time reader nothing about what it measured or where it sat. This
 * pairs the numeral with the -100..+100 axis it is drawn from and the tier it
 * falls in.
 *
 * The tick labels are the tier thresholds, not arbitrary marks. A band name
 * like "Akrab" is asserted rather than placed unless the reader can see where
 * the bands begin, which is what the audit flagged about the previous version.
 */
export function ScoreScale({
  score,
  color,
  tierLabel,
  size = "md",
  ticks,
}: {
  score: number;
  color: string;
  tierLabel?: string;
  size?: "sm" | "md" | "lg";
  /**
   * Tier boundaries to mark on the axis, as scores. Rendered as small labels
   * under the bar so a reader can place the value against them.
   */
  ticks?: Array<{ score: number; label: string }>;
}) {
  const numerals = {
    sm: "text-[26px]",
    md: "text-[38px]",
    lg: "text-[52px]",
  } as const;
  const barHeight = { sm: 6, md: 8, lg: 10 } as const;

  return (
    <div className="w-full">
      <div className="flex items-end justify-between gap-3">
        <span
          className={cx("tabular font-semibold leading-none", numerals[size])}
          style={{ color }}
        >
          {score > 0 ? `+${score}` : String(score)}
        </span>
        {tierLabel ? (
          <span className="pb-1 text-[12px] font-medium text-ink-soft">{tierLabel}</span>
        ) : null}
      </div>

      <ScoreRule score={score} color={color} height={barHeight[size]} ticks className="mt-2" />

      {/*
        The range is stated, not implied. Without it the numeral is a riddle.
        When tier boundaries are supplied they replace the generic pole labels,
        so the axis teaches the vocabulary instead of only naming the extremes.
      */}
      {ticks && ticks.length > 0 ? (
        <div className="relative mt-1 h-[16px]">
          {ticks.map((tick) => {
            // Map -100..100 onto 0..100% of the track.
            const pct = ((tick.score + 100) / 200) * 100;
            return (
              <span
                key={tick.score}
                className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-ink-soft"
                style={{ left: `${pct}%` }}
              >
                {tick.label}
              </span>
            );
          })}
        </div>
      ) : (
        <div className="mt-1 flex justify-between text-[11px] font-medium text-ink-soft">
          <span>−100 bermusuhan</span>
          <span>0</span>
          <span>+100 sekutu</span>
        </div>
      )}
    </div>
  );
}


/* ------------------------------------------------------------------ Score */

/** A score numeral. Always tabular so digits do not shift as values update. */
export function ScoreValue({
  score,
  color,
  size = "md",
}: {
  score: number;
  color: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const sizes = {
    sm: "text-[15px]",
    md: "text-[19px]",
    lg: "text-[28px]",
    xl: "text-[44px]",
  } as const;
  const text = score > 0 ? `+${score}` : String(score);
  return (
    <span className={cx("tabular font-semibold leading-none", sizes[size])} style={{ color }}>
      {text}
    </span>
  );
}

/* ------------------------------------------------------------- Empty/Load */

export function LoadingState({ what = "data" }: { what?: string }) {
  return (
    <div
      className="flex items-center gap-3 py-10 text-[13px] text-ink-soft"
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-rule border-t-primary"
      />
      Memuat {what}…
    </div>
  );
}

/**
 * Empty states name the cause and the next action, rather than saying
 * "no data" (antislop R-27).
 */
export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-rule px-5 py-10 text-center">
      <p className="text-[13.5px] text-ink-soft">{title}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      className="rounded-md border border-hostile/40 bg-hostile/5 px-5 py-6"
      role="alert"
    >
      <p className="text-[13.5px] text-ink">
        <strong className="font-semibold">Gagal memuat.</strong> {message}
      </p>
      {onRetry ? (
        <Button variant="quiet" className="mt-3" onClick={onRetry}>
          Coba lagi
        </Button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- Live region */

/**
 * Announces a result count after an in-page filter changes. The text is the
 * visible count line, not a hidden duplicate, so sighted and screen-reader
 * users get the same sentence at the same moment.
 *
 * `role="status"` is deliberately not used here: it already implies
 * `aria-live="polite"`, and pairing the two makes some screen readers announce
 * twice. The explicit attribute is what the audit measured, so it is set on its
 * own.
 */
export function ResultCount({
  visible,
  total,
  noun,
  className,
}: {
  visible: number;
  total: number;
  noun: string;
  className?: string;
}) {
  return (
    <p className={cx("text-[12.5px] text-ink-soft", className)} aria-live="polite">
      {visible === total
        ? `Menampilkan seluruh ${total} ${noun}`
        : `Menampilkan ${visible} dari ${total} ${noun}`}
    </p>
  );
}

/* ------------------------------------------------------------------- Field */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11.5px] text-ink-soft">{hint}</span> : null}
    </label>
  );
}

/* ----------------------------- Compact stat row for /peta companion rail */

/**
 * One-line stat row used in the companion rail: monospace numerals on sunk parchment,
 * no borders between rows. This is sidebar copy, not a form field.
 */
export function StatRow({ left, right }: { left: string | React.ReactNode; right: string | React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-sm bg-neutral-sunk px-3 py-2 text-[11.5px] leading-snug">
      <span>{left}</span>
      <span className="font-mono font-semibold">{right}</span>
    </div>
  );
}

/* ------------------------------ Medallion placeholder */

/**
 * Medallion: a framed letter or a portrait, nothing in between.
 *
 * Why this exists: 0 of 60 figures have photos yet, and inventing iconography
 * here would violate R-04 (generic AI icons). The circle is the frame; the
 * letters are the content. When `photo_url` arrives, the same component swaps
 * to `<img>` without changing anything that uses it.
 */

type MedallionSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<MedallionSize, { radius: string; text: string; bg: string }> = {
  sm: { radius: "h-7 w-7", text: "text-[10px]", bg: "#E8EBF0" },
  md: { radius: "h-12 w-12", text: "text-[14px]", bg: "#E8EBF0" },
  lg: { radius: "h-16 w-16", text: "text-[19px]", bg: "#E8EBF0" },
};

export function Medallion({
  name,
  imageUrl,
  size = "md",
  className,
}: {
  name: string | null | undefined;
  imageUrl?: string | null | undefined;
  size?: MedallionSize;
  className?: string;
}) {
  const cfg = SIZE_CLASS[size];
  const initials =
    name && name.trim().length > 0
      ? name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0] ?? "")
          .join("")
          .toUpperCase() || "?"
      : "?";

  if (imageUrl) {
    return (
      <div
        className={cx(
          "relative flex items-center justify-center overflow-hidden rounded-full border-2 border-rule",
          cfg.radius,
          className,
        )}
        style={{ backgroundColor: cfg.bg }}
        aria-label="Foto figur"
      >
        <img
          src={imageUrl}
          alt={name || "Foto figur"}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className={cx(
        "grid place-items-center rounded-full border-2 border-rule font-display font-semibold uppercase leading-none text-primary-ink",
        cfg.radius,
        cfg.text,
        className,
      )}
      style={{ backgroundColor: cfg.bg }}
      aria-label="Monogram figur"
    >
      {initials}
    </div>
  );
}

/*
 * min-h-[44px] is the touch-target floor. py-2 alone produced a 39px field,
 * which is under the 44px minimum and was missed by the T3 sweep because that
 * probe only checked button and a[href], never input or select. Fixing it here
 * covers every admin form at once.
 */
export const inputClass =
  "min-h-[44px] w-full rounded-sm border border-control-border bg-neutral-raised px-2.5 py-2 text-[13.5px] text-ink " +
  "placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";
