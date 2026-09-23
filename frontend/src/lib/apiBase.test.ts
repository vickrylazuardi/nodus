/**
 * API base resolution.
 *
 * Why this exists: the frontend and backend are on different hosts in
 * production, so the API base is a build-time variable. Getting it wrong fails
 * in ways that are hard to see: a trailing slash yields "//figures", which some
 * hosts 404 and others silently rewrite, and an unset variable in production
 * yields a relative "/api" that hits the static host instead of the API.
 *
 * The function is tested directly rather than through the built bundle, because
 * the bundle contains the RAW env value and strips the slash at runtime.
 * Grepping the bundle for a trailing slash therefore proves nothing.
 */

import { describe, expect, it } from "vitest";

import { resolveApiBase } from "./api";

describe("resolveApiBase", () => {
  it("falls back to the relative path when unset, so dev keeps using the Vite proxy", () => {
    expect(resolveApiBase(undefined)).toBe("/api");
    expect(resolveApiBase("")).toBe("/api");
    expect(resolveApiBase("   ")).toBe("/api");
  });

  it("accepts an absolute origin", () => {
    expect(resolveApiBase("https://nodus-0qo0.onrender.com/api")).toBe(
      "https://nodus-0qo0.onrender.com/api",
    );
  });

  it("strips a trailing slash so paths do not become double-slashed", () => {
    // "https://host/api" + "/figures" must not become "https://host/api//figures"
    expect(resolveApiBase("https://nodus-0qo0.onrender.com/api/")).toBe(
      "https://nodus-0qo0.onrender.com/api",
    );
  });

  it("strips repeated trailing slashes", () => {
    expect(resolveApiBase("https://host/api///")).toBe("https://host/api");
  });

  it("trims surrounding whitespace", () => {
    // Pasting into a dashboard field very often brings a trailing newline.
    expect(resolveApiBase("  https://host/api  ")).toBe("https://host/api");
    expect(resolveApiBase("\nhttps://host/api/\n")).toBe("https://host/api");
  });

  it("leaves an origin with no path alone", () => {
    expect(resolveApiBase("https://host")).toBe("https://host");
  });
});
