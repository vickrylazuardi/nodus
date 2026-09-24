/**
 * Client-side logic tests.
 *
 * The tier ladder and soft clamp exist in both Python and TypeScript. These
 * tests pin the TypeScript side to the same numbers the backend tests use, so
 * a change to one without the other is caught.
 */

import { describe, expect, it } from "vitest";

import {
  TIER_COLORS,
  TIER_LUMINANCE,
  formatScore,
  formatSigned,
  initials,
  scoreColor,
  scoreRuleGeometry,
  scoreTextColor,
  tierKeyFor,
  tierTextColor,
} from "@/lib/format";

describe("tier ladder", () => {
  // Mirrors tests/test_scoring.py::test_tier_boundaries
  const cases: Array<[number, string]> = [
    [100, "solid_bloc"],
    [80, "solid_bloc"],
    [79, "alliance"],
    [55, "alliance"],
    [54, "friendly"],
    [30, "friendly"],
    [29, "cordial"],
    [8, "cordial"],
    [7, "neutral"],
    [0, "neutral"],
    [-7, "neutral"],
    [-8, "wary"],
    [-29, "wary"],
    [-30, "tension"],
    [-54, "tension"],
    [-55, "rivalry"],
    [-79, "rivalry"],
    [-80, "hostile"],
    [-100, "hostile"],
  ];

  it.each(cases)("score %i maps to %s", (score, expected) => {
    expect(tierKeyFor(score)).toBe(expected);
  });
});

describe("score formatting", () => {
  it("prefixes positive scores with a plus", () => {
    expect(formatScore(88)).toBe("+88");
    expect(formatScore(0)).toBe("0");
    expect(formatScore(-94)).toBe("-94");
  });

  it("handles missing scores without printing NaN", () => {
    expect(formatScore(null)).toBe("–");
    expect(formatScore(undefined)).toBe("–");
  });

  it("formats decimals with an explicit sign", () => {
    expect(formatSigned(12.34)).toBe("+12.3");
    expect(formatSigned(-12.34)).toBe("-12.3");
  });

  it("never emits NaN for a non-finite input", () => {
    expect(formatSigned(Number.NaN)).toBe("–");
  });
});

describe("score rule geometry", () => {
  it("fills right of centre for allied scores", () => {
    const geo = scoreRuleGeometry(100);
    expect(geo.left).toBe("50%");
    expect(geo.width).toBe("50%");
  });

  it("fills left of centre for hostile scores", () => {
    const geo = scoreRuleGeometry(-100);
    expect(geo.left).toBe("0%");
    expect(geo.width).toBe("50%");
  });

  it("renders nothing visible at zero", () => {
    const geo = scoreRuleGeometry(0);
    expect(geo.width).toBe("0%");
  });

  it("clamps out-of-range scores rather than overflowing the track", () => {
    expect(scoreRuleGeometry(-500).width).toBe("50%");
    expect(scoreRuleGeometry(500).width).toBe("50%");
  });
});

describe("score colours", () => {
  it("returns the token palette value for a known score", () => {
    expect(scoreColor(95)).toBe("#0C4232");
    expect(scoreColor(-95)).toBe("#6E1913");
  });

  it("falls back to the neutral tier when there is no score", () => {
    expect(scoreColor(null)).toBe("#6A7487");
  });

  /*
   * The two roles must stay distinct.
   *
   * A fill is the data and never changes between themes; type has to, because a
   * colour dark enough to carry white text is unreadable as text on a dark
   * ground. If a future edit makes scoreTextColor return a hex, dark mode
   * silently loses its text ladder and every score numeral goes near-invisible.
   */
  it("gives type a theme-aware colour and fills a fixed one", () => {
    expect(scoreTextColor(95)).toBe("var(--tier-solid_bloc-text)");
    expect(scoreTextColor(-95)).toBe("var(--tier-hostile-text)");
    expect(scoreTextColor(null)).toBe("var(--tier-neutral-text)");
    expect(tierTextColor("cordial")).toBe("var(--tier-cordial-text)");
    expect(tierTextColor(null)).toBe("var(--tier-neutral-text)");

    // Fills stay literal hexes so canvas rendering and inline styles work.
    expect(scoreColor(95)).toMatch(/^#[0-9A-F]{6}$/i);
    expect(scoreTextColor(95)).not.toMatch(/^#/);
  });

  /*
   * The luminance ordering is the encoding, not a cosmetic detail.
   *
   * A reader has to be able to rank two allies by eye, which only works if the
   * ramp darkens monotonically outward from the neutral midpoint. The previous
   * palette failed this: its neutral (0.086) was darker than its cordial
   * (0.177), so the middle of the scale read as the strongest value and a
   * reader could not tell a strong alliance from a weak one.
   *
   * Asserted here because a palette edit that breaks the ordering still passes
   * every contrast check, and the failure is invisible without measuring.
   */
  it("keeps luminance monotonic outward from neutral", () => {
    /*
     * Walks each arm with a running previous value rather than indexing the
     * array. The project enables noUncheckedIndexedAccess, so arr[i] is
     * `T | undefined` and every comparison would need a cast, which would hide
     * exactly the kind of gap this test exists to catch.
     */
    const assertArm = (
      arm: Array<[string, number]>,
      direction: "ascending" | "descending",
    ) => {
      let previous: [string, number] | null = null;
      for (const entry of arm) {
        const [key, value] = entry;
        if (previous) {
          const [prevKey, prevValue] = previous;
          if (direction === "ascending") {
            expect(value, `${key} must be lighter than ${prevKey}`).toBeGreaterThan(prevValue);
          } else {
            expect(value, `${key} must be darker than ${prevKey}`).toBeLessThan(prevValue);
          }
        }
        previous = entry;
      }
    };

    assertArm(
      [
        ["solid_bloc", TIER_LUMINANCE.solid_bloc as number],
        ["alliance", TIER_LUMINANCE.alliance as number],
        ["friendly", TIER_LUMINANCE.friendly as number],
        ["cordial", TIER_LUMINANCE.cordial as number],
        ["neutral", TIER_LUMINANCE.neutral as number],
      ],
      "ascending",
    );

    assertArm(
      [
        ["neutral", TIER_LUMINANCE.neutral as number],
        ["wary", TIER_LUMINANCE.wary as number],
        ["tension", TIER_LUMINANCE.tension as number],
        ["rivalry", TIER_LUMINANCE.rivalry as number],
        ["hostile", TIER_LUMINANCE.hostile as number],
      ],
      "descending",
    );
  });

  it("keeps the two arms symmetric, so +80 and -80 read equally strong", () => {
    expect(TIER_LUMINANCE.solid_bloc).toBeCloseTo(TIER_LUMINANCE.hostile as number, 2);
    expect(TIER_LUMINANCE.alliance).toBeCloseTo(TIER_LUMINANCE.rivalry as number, 2);
    expect(TIER_LUMINANCE.friendly).toBeCloseTo(TIER_LUMINANCE.tension as number, 2);
    expect(TIER_LUMINANCE.cordial).toBeCloseTo(TIER_LUMINANCE.wary as number, 2);
  });

  /*
   * Every tier fill carries white type in chips and matrix cells, so each one
   * must clear WCAG AA against white. The previous ramp's lightest tier was
   * 2.37:1 and four of nine tiers were unreadable.
   */
  /*
   * A bar is drawn on the track, so its fill must separate from the TRACK, not
   * from the page. This is the bug the screenshot could not show: in dark mode
   * the tier fills measured ~1.04:1 against the dark track, so every bar was
   * invisible while all the text around it looked fine.
   */
  it("keeps every bar fill separable from the scale track", () => {
    const channel = (c: number) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const ratio = (a: string, b: string) => {
      const la = luminance(a);
      const lb = luminance(b);
      const [hi, lo] = la > lb ? [la, lb] : [lb, la];
      return (hi + 0.05) / (lo + 0.05);
    };

    // Track values from theme.css, one per theme.
    const LIGHT_TRACK = "#D3D9E2";
    const DARK_TRACK = "#303845";

    // Bar fills are per theme: light uses the tier fill, dark the brighter value.
    const lightBars: Array<[string, string]> = [
      ["solid_bloc", "#0C4232"],
      ["cordial", "#3C745E"],
      ["neutral", "#6A7487"],
      ["hostile", "#6E1913"],
    ];
    const darkBars: Array<[string, string]> = [
      ["solid_bloc", "#5EE2BA"],
      ["cordial", "#5FAD8D"],
      ["neutral", "#848E9F"],
      ["hostile", "#F4BFBB"],
    ];

    for (const [key, fill] of lightBars) {
      expect(ratio(fill, LIGHT_TRACK), `light ${key} bar vs track`).toBeGreaterThanOrEqual(3);
    }
    for (const [key, fill] of darkBars) {
      expect(ratio(fill, DARK_TRACK), `dark ${key} bar vs track`).toBeGreaterThanOrEqual(3);
    }
  });

  /*
   * Every tier fill carries white type in chips and matrix cells, so each one
   * must clear WCAG AA against white. The previous ramp's lightest tier was
   * 2.37:1 and four of nine tiers were unreadable.
   */
  it("keeps white text legible on every tier fill", () => {
    const channel = (c: number) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const contrastWithWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);

    for (const [key, hex] of Object.entries(TIER_COLORS) as Array<[string, string]>) {
      const ratio = contrastWithWhite(hex);
      expect(ratio, `${key} (${hex}) must clear 4.5:1 against white`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Prabowo Subianto")).toBe("PS");
    expect(initials("Joko Widodo")).toBe("JW");
  });

  it("handles a single-word name", () => {
    expect(initials("Megawati")).toBe("M");
  });

  it("never returns an empty string", () => {
    expect(initials("   ")).toBe("?");
  });
});