/**
 * Medallion: a framed letter or a portrait, nothing in between.
 *
 * Why this exists: 0 of 60 figures have photos yet, and inventing iconography
 * here would violate R-04 (generic AI icons). The circle is the frame; the
 * letters are the content. When `photo_url` arrives, the same component swaps
 * to `<img>` without changing anything that uses it.
 */

import { cx } from "@/lib/format";

interface Props {
  name: string | null | undefined;
  /** Optional image URL. When present, switches to <img>. */
  imageUrl?: string | null | undefined;
  /** Size class controlling radius and text scale. Defaults to md. */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: { radius: "h-7 w-7", text: "text-[9px]", bg: "#EFE6D4" },
  md: { radius: "h-12 w-12", text: "text-[13px]", bg: "#F7F1E4" },
  lg: { radius: "h-16 w-16", text: "text-[18px]", bg: "#F7F1E4" },
};

export function Medallion({ name, imageUrl, size = "md", className }: Props) {
  const cfg = SIZES[size];
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
