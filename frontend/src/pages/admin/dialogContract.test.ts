/**
 * Modal dialog contract.
 *
 * The admin ConfirmDialog is the only modal in the app. It was already
 * announced correctly (`role="dialog"`, `aria-modal`, `aria-label`) and Escape
 * already worked, but Tab could leave it: measured with the dialog open, the
 * page behind held 127 focusable elements and nothing stopped focus reaching
 * them. That is the gap this file guards.
 *
 * jsdom has no layout and does not implement `inert`, so these assert the
 * contract on the source and on the behaviour jsdom does model. The real
 * measurement was done in a browser and is recorded in
 * docs/revamp/13-t8-result.md.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(resolve(__dirname, "AdminApp.tsx"), "utf8");

describe("ConfirmDialog accessibility", () => {
  it("is announced as a modal with a real accessible name", () => {
    expect(src).toContain('role="dialog"');
    expect(src).toContain('aria-modal="true"');
    // aria-label, not aria-labelledby: the title is a plain string prop.
    expect(src).toContain("aria-label={title}");
  });

  it("closes on Escape", () => {
    expect(src).toMatch(/e\.key === "Escape"/);
  });

  it("hides the page behind it from assistive technology", () => {
    // aria-modal alone does not remove the background from the tab order.
    expect(src).toContain('setAttribute("inert"');
    expect(src).toContain('setAttribute("aria-hidden", "true")');
  });

  it("traps Tab by wrapping at both ends", () => {
    // Forward wrap: last control -> first.
    expect(src).toMatch(/!event\.shiftKey && \(active === last/);
    // Backward wrap: first control -> last.
    expect(src).toMatch(/event\.shiftKey && \(active === first/);
  });

  it("recovers if focus has already escaped the dialog", () => {
    // Without this, a stray focus outside would leave Tab unhandled and the
    // user stranded behind the modal.
    expect(src).toMatch(/!dialog\.contains\(active\)/);
  });

  it("restores the previous attributes on close rather than clearing them", () => {
    // An element may already have had aria-hidden before the dialog opened;
    // removing it unconditionally would change the page it restores.
    expect(src).toContain("const touched = siblings.map");
    expect(src).toMatch(/if \(ariaHidden === null\) el\.removeAttribute/);
    expect(src).toMatch(/else el\.setAttribute\("aria-hidden", ariaHidden\)/);
  });

  it("restores focus to the control that opened it", () => {
    expect(src).toMatch(/previouslyFocused\?\.focus\?\.\(\)/);
  });

  it("never makes the dialog itself inert", () => {
    // The walk-up must skip any ancestor containing the dialog, or the dialog
    // would be hidden along with the page.
    expect(src).toMatch(/!child\.contains\(dialog\)/);
  });
});
