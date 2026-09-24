/**
 * Canvas-readable design tokens.
 *
 * Cytoscape draws to a canvas, so it cannot read CSS custom properties the way
 * a DOM component can. These are the same values as `theme.css` and `DESIGN.md`,
 * exported once here so the graph never invents a palette of its own.
 *
 * If you change a value here, change it in DESIGN.md first, then re-export the
 * theme. The three places must agree; DESIGN.md is the source.
 */

export interface CanvasTokens {
  /** Panel surface the canvas sits on. */
  surface: string;
  /** Ink for node labels. */
  ink: string;
  /** Hairline rule for the bloc frames. */
  rule: string;
  /** Strong rule, used for the selected-node ring. */
  ruleStrong: string;
  /** Bloc frame fill, deliberately faint so nodes read on top of it. */
  blocFill: string;
  /** Bloc frame label. */
  blocLabel: string;
  /** Label halo, matching the surface so text stays legible over edges. */
  halo: string;
}

export const LIGHT_CANVAS: CanvasTokens = {
  surface: "#FFFFFF",
  ink: "#0C1421",
  rule: "#AEB7C6",
  ruleStrong: "#2E3FBF",
  blocFill: "rgba(174, 183, 198, 0.14)",
  blocLabel: "#46536B",
  halo: "#FFFFFF",
};

export const DARK_CANVAS: CanvasTokens = {
  surface: "#171D24",
  ink: "#E8ECF2",
  rule: "#3C4652",
  ruleStrong: "#93A0FF",
  blocFill: "rgba(60, 70, 82, 0.30)",
  blocLabel: "#A9B4C4",
  halo: "#171D24",
};

/** Reads the active theme from the document root. Defaults to light. */
export function activeCanvasTokens(): CanvasTokens {
  if (typeof document === "undefined") return LIGHT_CANVAS;
  return document.documentElement.dataset.theme === "dark" ? DARK_CANVAS : LIGHT_CANVAS;
}
