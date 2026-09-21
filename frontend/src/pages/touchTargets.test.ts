/**
 * Touch-target contract.
 *
 * The original T3 sweep checked only `button, a[href]`, which is why it
 * reported zero problems while `/peta` shipped a 13px checkbox, a 31px select
 * and a 16px range input, and `/admin` shipped 39px form fields. The probe was
 * narrower than the requirement.
 *
 * Two rules this file encodes, both learned the hard way:
 *
 * 1. Every interactive control counts, not just buttons and links. `select`,
 *    `input` and `textarea` are touched with a thumb too.
 * 2. A control nested in a `<label>` inherits the label's hit area, because a
 *    click anywhere in the label activates it. Judging the inner element's own
 *    box produces a false positive: a 13px checkbox inside a 44px label is
 *    perfectly usable.
 *
 * These run in jsdom, which has no layout engine, so `getBoundingClientRect`
 * returns zeros. The contract is therefore asserted on the CLASSES that
 * guarantee the size, and the real measurement is a browser check recorded in
 * docs/revamp/12-touch-targets.md.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

/** Files that render interactive controls a thumb has to hit. */
const TOUCH_FILES = [
  "pages/MapPage.tsx",
  "pages/MatrixPage.tsx",
  "pages/FiguresPage.tsx",
  "pages/FigureDetailPage.tsx",
  "pages/admin/AdminApp.tsx",
];

/**
 * Admin files with link or button rows.
 *
 * Added after a sweep found the admin sub-nav at 33px and the overview links at
 * 38px. The earlier guard covered the public routes only, so the admin was
 * never checked — the same narrow-scope mistake as the original T3 probe.
 */
const ADMIN_TOUCH_FILES = [
  "pages/admin/AdminApp.tsx",
  "pages/admin/AdminOverview.tsx",
  "pages/admin/AdminFigures.tsx",
  "pages/admin/AdminIssues.tsx",
  "pages/admin/AdminRelationships.tsx",
  "pages/admin/AdminAudit.tsx",
];

describe("touch targets", () => {
  it("gives every select a 44px minimum height", () => {
    // A bare <select> is 31px tall by default, measured in the browser.
    for (const file of TOUCH_FILES) {
      const src = read(file);
      const selects = src.match(/<select[\s\S]*?className="([^"]*)"/g) ?? [];
      for (const block of selects) {
        expect(block, `${file}: select without min-h-[44px]`).toContain("min-h-[44px]");
      }
    }
  });

  it("keeps the shared input class at the 44px floor", () => {
    // Every admin form field goes through this one class, so the floor is
    // enforced in a single place.
    const ui = read("components/ui.tsx");
    const match = ui.match(/export const inputClass\s*=\s*"([^"]*)"/);
    expect(match, "inputClass not found").not.toBeNull();
    expect(match![1]).toContain("min-h-[44px]");
  });

  it("puts a 44px hit area on the map's checkbox via its label", () => {
    // The checkbox itself stays small on purpose; the wrapping label carries
    // the hit area, which is why the check is for the label and not the input.
    const src = read("pages/MapPage.tsx");
    const label = src.match(/<label[^>]*className="([^"]*)"[^>]*>\s*<input\s+type="checkbox"/);
    expect(label, "checkbox label not found").not.toBeNull();
    expect(label![1]).toContain("min-h-[44px]");
  });

  it("does not leave a bare range input without a height", () => {
    const src = read("pages/MapPage.tsx");
    const range = src.match(/<input[\s\S]{0,240}?type="range"[\s\S]{0,240}?className="([^"]*)"/);
    expect(range, "range input not found").not.toBeNull();
    expect(range![1]).toMatch(/h-\[44px\]/);
  });

  it("has no interactive element smaller than 44px in the nav", () => {
    // The masthead is on every route, so its targets matter most.
    const src = read("App.tsx");
    const links = src.match(/className=\{?\(?[^}]*\}/g) ?? [];
    const navLike = links.filter((c) => c.includes("min-h-[44px]"));
    expect(navLike.length).toBeGreaterThan(0);
  });

  it("gives every admin link a 44px minimum height", () => {
    /*
     * Anchors are inline by default, so `min-h` alone does nothing: the element
     * has to be inline-flex or block for a height to apply. That is why the
     * check is for both classes together.
     */
    for (const file of ADMIN_TOUCH_FILES) {
      const src = read(file);
      const anchors = src.match(/<Link[\s\S]*?className="([^"]*)"/g) ?? [];
      for (const block of anchors) {
        const classes = block.match(/className="([^"]*)"/)?.[1] ?? "";
        // Skip decorative links that carry no target of their own.
        if (classes.includes("underline")) continue;
        expect(
          classes.includes("min-h-[44px]") && /inline-flex|flex|block/.test(classes),
          `${file}: admin link without a 44px hit area -> ${classes.slice(0, 70)}`,
        ).toBe(true);
      }
    }
  });

  it("keeps the admin sub-navigation at 44px", () => {
    /*
     * Checks the classes that actually apply, ignoring comment lines.
     *
     * A regex that captured the first quoted string after `className` picked up
     * an explanatory comment instead of the class list once one was added
     * inside the JSX attribute. Stripping comments first is simpler and more
     * robust than making the pattern cleverer.
     */
    const raw = read("pages/admin/AdminApp.tsx");
    const src = raw
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("/*"))
      .join("\n");

    const navBlock = src.match(/<NavLink[\s\S]{0,400}?"([^"]*min-h-\[44px\][^"]*)"/);
    expect(navBlock, "admin NavLink with a 44px floor not found").not.toBeNull();
    // The shortest admin label is 41px wide, so width matters as well as height.
    expect(navBlock![1]).toContain("min-w-[44px]");
  });
});
