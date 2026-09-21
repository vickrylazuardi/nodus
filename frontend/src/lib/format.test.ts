/**
 * Client-side logic tests.
 *
 * The tier ladder and soft clamp exist in both Python and TypeScript. These
 * tests pin the TypeScript side to the same numbers the backend tests use, so
 * a change to one without the other is caught.
 */

import { describe, expect, it } from "vitest";

import {
  formatScore,
  formatSigned,
  initials,
  scoreColor,
  scoreRuleGeometry,
  tierKeyFor,
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
    expect(scoreColor(95)).toBe("#1F5A4C");
    expect(scoreColor(-95)).toBe("#7E2A25");
  });

  it("falls back to the neutral slate when there is no score", () => {
    expect(scoreColor(null)).toBe("#525A66");
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