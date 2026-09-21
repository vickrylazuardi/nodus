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
    "bg-neutral-sunk text-ink border border-rule hover:border-primary hover:bg-neutral-raised",
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

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-sm border border-rule bg-neutral-sunk px-2 py-0.5 text-[11px] text-ink-soft">
      {children}
    </span>
  );
}

/* -------------------------------------------------------------- ScoreRule */

/**
 * The identity motif: a hairline split at the midpoint with the filled portion
 * extending left for hostile and right for allied. Reused at three zoom levels
 * (matrix cell, relationship row, per-issue breakdown) so the same mark reads
 * the same way wherever it appears.
 */
export function ScoreRule({
  score,
  color,
  height = 6,
  label,
}: {
  score: number;
  color: string;
  height?: number;
  label?: string;
}) {
  const clamped = Math.max(-100, Math.min(100, score));
  const half = Math.abs(clamped) / 2;
  const width = Math.min(50, half);
  const left = clamped < 0 ? 50 - width : 50;

  return (
    <div
      className="relative w-full overflow-hidden rounded-sm bg-neutral-sunk"
      style={{ height }}
      role="img"
      aria-label={label ?? `Skor ${score}`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 z-10 w-px bg-ink/25"
      />
      <span
        className="absolute inset-y-0 rounded-sm"
        style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color }}
      />
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

/*
 * min-h-[44px] is the touch-target floor. py-2 alone produced a 39px field,
 * which is under the 44px minimum and was missed by the T3 sweep because that
 * probe only checked button and a[href], never input or select. Fixing it here
 * covers every admin form at once.
 */
export const inputClass =
  "min-h-[44px] w-full rounded-sm border border-rule bg-neutral-raised px-2.5 py-2 text-[13.5px] text-ink " +
  "placeholder:text-ink-soft/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";
