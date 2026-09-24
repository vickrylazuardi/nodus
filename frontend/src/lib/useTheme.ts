import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "nodus-theme";

/**
 * Reads the theme the inline script in index.html already applied.
 *
 * The attribute is set before first paint (see index.html) so there is no flash
 * of the wrong theme. This hook adopts that value rather than deciding again,
 * which would let React and the pre-paint script disagree.
 */
function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/**
 * Theme state, persisted and applied to the document root.
 *
 * Both themes are first-class: the tier ramp is deliberately theme-invariant so
 * the data reads identically either way, and only the ground, ink, rules and
 * accent swap. See DESIGN.md `## Theming`.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private mode or a blocked storage API. The theme still applies for
      // this session; only persistence is lost, which is not worth failing on.
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setThemeState((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggle };
}
