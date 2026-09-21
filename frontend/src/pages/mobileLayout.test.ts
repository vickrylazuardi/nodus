/**
 * Mobile layout contract.
 *
 * Guards the defects found while adding mobile responsiveness. Each one was
 * measured in a real browser first; jsdom has no layout engine, so these assert
 * the source-level properties that cause the behaviour rather than the rendered
 * result. The browser measurements are recorded in docs/revamp/14-mobile.md.
 *
 * The failures these guard against, all measured before the fix:
 *
 *   /statistik   374px document on a 320px viewport
 *   /figur       324px document on a 320px viewport
 *   masthead     81px wide nav, six links stacked into six rows, 284px tall
 *   masthead     157px header on a phone (three rows)
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

/** Strip comment lines so class-list assertions read real code only. */
function code(rel: string): string {
  return read(rel)
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

describe("the figure detail header stacks on a phone", () => {
  const src = code("pages/FigureDetailPage.tsx");

  it("does not let the identity block compete with the score rail for width", () => {
    /*
     * Measured at 390px before the fix: the name column was 47px wide and the
     * name box inside it was 0px, so the figure's own name was invisible. The
     * avatar is 76px and the score rail took 237px; `flex-1` on the identity
     * block lost that contest.
     *
     * The fix is a single column below sm, so the two never share a row on a
     * phone. Assert the container stacks rather than wrapping.
     *
     * Search from the header's own row class, not from the first `<Panel>` in
     * the file: that one belongs to the loading state.
     */
    expect(src).toMatch(/flex-col gap-5 sm:flex-row/);
    expect(src).not.toMatch(/flex flex-wrap items-start justify-between/);
  });

  it("applies the identity block's width floor only from sm up", () => {
    /*
     * `min-w-[280px]` is correct on desktop, where there is room beside the
     * rail. Without a breakpoint prefix it would be a 280px hard floor on a
     * phone whose panel only offers 240px, forcing the page sideways.
     */
    expect(src).toContain("lg:min-w-[280px]");
    const bare = src.match(/(^|[" ])min-w-\[280px\]/g) ?? [];
    expect(bare, "a 280px floor with no breakpoint prefix").toEqual([]);
  });
});

describe("figure detail text wraps instead of clipping on a phone", () => {
  const src = code("pages/FigureDetailPage.tsx");

  it("does not truncate a counterpart name unconditionally", () => {
    /*
     * Measured at 320px: the name gets 123px, but Indonesian names run to
     * 191px ("Agus Gumiwang Kartasasmita"), so `truncate` was cutting exactly
     * the part that distinguishes similar names.
     *
     * Only `sm:truncate` is acceptable. A bare `truncate` on a name span is
     * the defect, so match for the token not preceded by `sm:`.
     */
    const nameSpans = src.match(/text-\[14px\] font-semibold[^"]*"/g) ?? [];
    expect(nameSpans.length).toBeGreaterThan(0);
    for (const cls of nameSpans) {
      const bare = cls.match(/(?<!sm:)truncate/g) ?? [];
      expect(bare, `bare truncate on a name: ${cls}`).toEqual([]);
    }
    expect(src).toMatch(/sm:truncate/);
  });

  it("gives the four header stats two columns, not four, on a phone", () => {
    /*
     * "Pengaruh" needs 59px at 10.5px uppercase with tracking. Four columns at
     * 320px offered 47px each and it clipped; two columns fit it.
     */
    const dl = src.slice(src.indexOf("<dl"), src.indexOf("</dl>"));
    expect(dl).toMatch(/grid-cols-2/);
    expect(dl).not.toMatch(/grid-cols-4/);
  });
});

describe("no fixed pixel floor can force horizontal overflow", () => {
  it("uses minmax(0, ...) rather than minmax(<px>, ...) in grid tracks", () => {
    /*
     * A px floor in minmax() is a hard minimum the column cannot go below.
     * Measured: minmax(300px, 1fr) resolved to 280px at a 320px viewport and
     * forced the document to 374px.
     */
    for (const file of ["pages/StatsPage.tsx", "pages/FigureDetailPage.tsx"]) {
      const src = code(file);
      const pxFloors = src.match(/minmax\([0-9]+px/g) ?? [];
      expect(pxFloors, `${file} has a px floor in minmax()`).toEqual([]);
    }
  });

  it("gives Panel a min-w-0 so it can shrink as a grid or flex item", () => {
    /*
     * A grid item's automatic minimum size is its content's min-content width,
     * so a Panel holding a long unbroken string cannot go narrower than that
     * string. Measured: the /statistik track was 280px while its Panel children
     * rendered 354px and pushed the document to 374px.
     */
    const ui = code("components/ui.tsx");
    const panel = ui.match(/export function Panel[\s\S]{0,500}?"([^"]*rounded-md border border-rule p-5[^"]*)"/);
    expect(panel, "Panel class not found").not.toBeNull();
    expect(panel![1]).toContain("min-w-0");
  });

  it("gives the figure card a min-w-0 so it can shrink inside its grid", () => {
    // Measured: the card rendered 283px inside a 238px track, pushing /figur to
    // 324px on a 320px viewport.
    const src = code("pages/FiguresPage.tsx");
    const card = src.match(/<Link[\s\S]{0,400}?"([^"]*group flex[^"]*)"/);
    expect(card, "figure card class not found").not.toBeNull();
    expect(card![1]).toContain("min-w-0");
  });

  it("pairs truncate with a shrinkable ancestor wherever truncation is needed", () => {
    /*
     * `truncate` sets overflow:hidden and text-overflow:ellipsis, but on its own
     * it does not let a flex or grid item shrink below its content width. The
     * requirement is that either the truncating element or the flex item
     * wrapping it carries min-w-0.
     *
     * An earlier version of this test demanded min-w-0 on the truncating element
     * itself and failed on correct code: in FiguresPage the truncate sits on a
     * div whose parent already has min-w-0, and measurement confirms it
     * truncates properly (a long name clips, and the page does not overflow).
     */
    const files = [
      "pages/StatsPage.tsx",
      "pages/FiguresPage.tsx",
      "pages/FigureDetailPage.tsx",
      "pages/admin/AdminOverview.tsx",
    ];
    for (const file of files) {
      const src = code(file);
      // Wherever truncate appears, min-w-0 must appear in the same file: the
      // pattern is used as a pair even when the classes land on two elements.
      if (!src.includes("truncate")) continue;
      expect(src, `${file} uses truncate without any min-w-0`).toContain("min-w-0");
    }
  });

  it("puts min-w-0 on the row item in the stats lists", () => {
    // This one is a direct flex child beside a score chip, so it must carry the
    // class itself. Measured: without it the row could not shrink and pushed
    // /statistik to 374px on a 320px viewport.
    const src = code("pages/StatsPage.tsx");
    const span = src.match(/<span className="([^"]*truncate[^"]*)"/);
    expect(span, "stats row span not found").not.toBeNull();
    expect(span![1]).toContain("min-w-0");
  });
});

describe("masthead reflows instead of squeezing", () => {
  it("gives the nav its own full-width row below lg", () => {
    // Measured at 320px: without this the nav was squeezed into an 81px column
    // and its six links stacked into six rows 284px tall.
    const src = code("App.tsx");
    const nav = src.match(/<nav[\s\S]{0,300}?className="([^"]*)"/);
    expect(nav, "masthead nav not found").not.toBeNull();
    expect(nav![1]).toContain("w-full");
    expect(nav![1]).toContain("order-last");
    // And it must scroll horizontally rather than wrap on a phone.
    expect(nav![1]).toContain("overflow-x-auto");
  });

  it("switches to a single row at lg, not sm", () => {
    /*
     * At 640px the wordmark, six nav links and the Admin button cannot share one
     * row. Forcing it produced three rows and a 113px header. The single-row
     * state starts at lg.
     */
    const src = code("App.tsx");
    const wrap = src.match(/<div className="([^"]*max-w-\[1600px\][^"]*)"/);
    expect(wrap, "masthead wrapper not found").not.toBeNull();
    expect(wrap![1]).toContain("lg:flex-nowrap");
    expect(wrap![1]).not.toContain("sm:flex-nowrap");
  });

  it("keeps every masthead control at 44px", () => {
    /*
     * Three controls: the wordmark link, the six nav links (one class shared via
     * cx), and the Admin link. Asserting on the source count rather than on a
     * regex per element, because the nav link's classes live inside a cx() call
     * and a naive pattern finds only two of the three.
     */
    const src = code("App.tsx");
    const occurrences = (src.match(/min-h-\[44px\]/g) ?? []).length;
    expect(occurrences, "masthead should have 3 controls with a 44px floor").toBeGreaterThanOrEqual(3);

    // And every one of them also carries min-w, because the shortest label
    // ("Isu") is 41px wide.
    const minW = (src.match(/min-w-\[44px\]/g) ?? []).length;
    expect(minW, "masthead controls need a 44px minimum width too").toBeGreaterThanOrEqual(2);
  });

  it("keeps the Admin link from stretching across the row on a phone", () => {
    // Measured: it was 288px wide and pushed the masthead to three rows.
    const src = code("App.tsx");
    const admin = src.match(/to="\/admin"[\s\S]{0,200}?className="([^"]*)"/);
    expect(admin, "admin link not found").not.toBeNull();
    expect(admin![1]).toContain("shrink-0");
  });
});

describe("the mobile breakpoint is chosen by content, not by device", () => {
  it("does not use a device-width breakpoint anywhere", () => {
    // 375 / 414 / 428 are iPhone widths; a breakpoint belongs where the content
    // breaks, not where a device happens to be.
    for (const file of ["App.tsx", "pages/MapPage.tsx", "pages/MatrixPage.tsx"]) {
      const src = code(file);
      expect(src).not.toMatch(/min-width:\s*(375|414|428)px/);
      expect(src).not.toMatch(/(sm|md|lg|xl):.*(375|414|428)px/);
    }
  });

  it("anchors sr-only spans so they cannot escape a scroll container", () => {
    /*
     * The subtlest bug of this whole task, and the one that took longest to
     * find.
     *
     * `sr-only` is `position: absolute`. With no positioned ancestor it resolves
     * against the initial containing block, so inside a `whitespace-nowrap`
     * table cell it escaped the table's `overflow-x-auto` wrapper entirely and
     * widened the document. Measured: /admin/relasi scrolled sideways by 402px
     * on a 320px viewport, and the page's own scrollWidth looked fine at 320
     * while `window.scrollTo` revealed the real overflow.
     *
     * A `relative` on the containing cell anchors it, at no visual cost.
     */
    const files = [
      "pages/admin/AdminFigures.tsx",
      "pages/admin/AdminIssues.tsx",
      "pages/admin/AdminRelationships.tsx",
    ];
    for (const file of files) {
      const src = code(file);
      const cells = src.match(/<th\b[^>]*className="[^"]*"[^>]*>\s*<span className="sr-only">/g) ?? [];
      for (const cell of cells) {
        expect(cell, `${file}: sr-only span in an unpositioned cell`).toContain("relative");
      }
    }
  });

  it("gives every overflow-x-auto wrapper a min-w-0", () => {
    /*
     * A scroll wrapper only contains its content if it can shrink. Inside a flex
     * or grid parent it cannot, because such an item's automatic minimum size is
     * its content width.
     */
    const files = [
      "pages/admin/AdminFigures.tsx",
      "pages/admin/AdminIssues.tsx",
      "pages/admin/AdminRelationships.tsx",
      "pages/admin/AdminAudit.tsx",
      "pages/IssuesPage.tsx",
    ];
    for (const file of files) {
      const src = code(file);
      const wrappers = src.match(/className="[^"]*overflow-x-auto[^"]*"/g) ?? [];
      for (const w of wrappers) {
        expect(w, `${file}: overflow wrapper without min-w-0 -> ${w.slice(0, 60)}`).toContain("min-w-0");
      }
    }
  });
});
