/**
 * AdminIssues — T5 (react-hook-form + zod) and T6 (ARIA) contract.
 *
 * These tests pin the two things the retry brief names as the deliverable:
 *
 *   T5 — an invalid submit produces BOTH inline errors and a focusable error
 *        summary, a cleared number field reads as Indonesian copy rather than
 *        zod's "Expected number, received nan", and a valid submit still sends
 *        the exact payload the OpenAPI contract tests expect.
 *   T6 — the table has an accessible name, each row's actions are
 *        distinguishable, every control is labelled, and the tab order covers
 *        the whole editor with no trap.
 *
 * jsdom cannot decide whether focus is *visible* (that is a CSS outline from
 * theme.css) or whether the layout overflows, so those are measured in a real
 * browser; nothing here pretends otherwise.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminIssues } from "@/pages/admin/AdminIssues";
import type { Issue } from "@/lib/types";

/* ------------------------------------------------------------------ fixtures */

const ISSUES: Issue[] = [
  {
    id: 1,
    name: "Koalisi",
    category: "Politik",
    description: "Sikap koalisi terhadap isu pemerintahan.",
    default_weight: 1.5,
    sort_order: 1,
    usage_count: 3,
    avg_score: 20,
  },
  {
    id: 2,
    name: "Ekonomi",
    category: null,
    description: null,
    default_weight: 1,
    sort_order: 2,
    usage_count: 0,
    avg_score: null,
  },
];

/* -------------------------------------------------------------- fetch stub */

interface RecordedCall {
  method: string;
  path: string;
  body: unknown;
}

/**
 * Routes on the request path, like publicA11y.test.tsx does: the app fetches
 * relative URLs ("/api/issues") which jsdom's real fetch would reject as
 * invalid before a URL matcher could see them.
 */
function installFetchStub(overrides: Partial<Record<string, () => Response>> = {}) {
  const calls: RecordedCall[] = [];

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const path = url.split("?")[0] ?? "";
      const method = init?.method ?? "GET";
      calls.push({
        method,
        path,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });

      const override = overrides[method];
      if (override) return Promise.resolve(override());

      if (path === "/api/issues" && method === "GET") {
        return Promise.resolve(json({ issues: ISSUES, count: ISSUES.length }));
      }
      if (path === "/api/admin/issues" && method === "POST") {
        return Promise.resolve(json({ id: 3 }, 201));
      }
      if (/^\/api\/admin\/issues\/\d+$/.test(path) && method === "PUT") {
        return Promise.resolve(json({ ok: true }));
      }
      if (/^\/api\/admin\/issues\/\d+$/.test(path) && method === "DELETE") {
        return Promise.resolve(json({ ok: true }));
      }
      throw new Error(`fetch stub has no route for ${method} ${url}`);
    }),
  );

  return calls;
}

function renderAdminIssues() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AdminIssues />
    </QueryClientProvider>,
  );
}

/** Opens the "new issue" editor and waits for the form to be on screen. */
async function openNewIssueEditor() {
  const user = userEvent.setup();
  renderAdminIssues();
  await user.click(await screen.findByRole("button", { name: "Isu baru" }));
  await screen.findByRole("button", { name: "Simpan isu" });
  return user;
}

/**
 * Types a value into a number input from empty, which is the only reliable way
 * to set one: the inputs carry a default, and appending to it would silently
 * produce a different number (1 + "2.5" = "12.5").
 */
async function setNumber(
  user: ReturnType<typeof userEvent.setup>,
  label: RegExp,
  value: string,
) {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  await user.type(input, value);
}

/* --------------------------------------------------------------------- T5 */

describe("T5 — AdminIssues form validates with react-hook-form + zod", () => {
  beforeEach(() => {
    installFetchStub();
  });

  it("shows inline errors AND a focused error summary after an invalid submit", async () => {
    const user = await openNewIssueEditor();

    await user.click(screen.getByRole("button", { name: "Simpan isu" }));

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("Periksa kembali isian berikut.");
    expect(summary).toHaveTextContent("Nama isu wajib diisi.");
    expect(summary).toHaveFocus();

    // The same message must also sit inline, wired to the field itself.
    const inline = document.getElementById("issue-name-error");
    expect(inline).toHaveTextContent("Nama isu wajib diisi.");
    expect(summary.contains(inline)).toBe(false);

    const nameInput = screen.getByLabelText(/^Nama isu/);
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    expect(nameInput).toHaveAttribute("aria-describedby", "issue-name-error");
  });

  it("links each summary item to the field it describes", async () => {
    const user = await openNewIssueEditor();

    await user.click(screen.getByRole("button", { name: "Simpan isu" }));

    const summary = await screen.findByRole("alert");
    const link = within(summary).getByRole("link", { name: "Nama isu wajib diisi." });
    expect(link).toHaveAttribute("href", "#issue-name");
    // The anchor target must exist, or the link is decorative.
    expect(document.getElementById("issue-name")).not.toBeNull();
  });

  it("does not validate before the first submit", async () => {
    const user = await openNewIssueEditor();

    await user.type(screen.getByLabelText(/^Nama isu/), "Koalisi");
    await user.clear(screen.getByLabelText(/^Nama isu/));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Nama isu/)).not.toHaveAttribute("aria-invalid");
  });

  it("rejects a whitespace-only name", async () => {
    const user = await openNewIssueEditor();

    await user.type(screen.getByLabelText(/^Nama isu/), "   ");
    await user.click(screen.getByRole("button", { name: "Simpan isu" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nama isu wajib diisi.");
  });

  /*
   * The trap from 05-rhf-findings.md: valueAsNumber stores NaN when the input
   * is cleared, and zod's default message for that is "Expected number,
   * received nan". invalid_type_error is what turns it into Indonesian copy.
   */
  it("reads a cleared numeric field as Indonesian copy, not as a type error", async () => {
    const user = await openNewIssueEditor();

    await user.type(screen.getByLabelText(/^Nama isu/), "Koalisi");
    await user.clear(screen.getByLabelText(/^Bobot bawaan/));
    await user.click(screen.getByRole("button", { name: "Simpan isu" }));

    const inline = await waitFor(() => {
      const el = document.getElementById("issue-default-weight-error");
      if (!el) throw new Error("inline weight error not rendered yet");
      return el;
    });
    expect(inline).toHaveTextContent("Isi bobot bawaan dengan angka.");
    expect(inline.textContent).not.toMatch(/nan|expected/i);

    const weightInput = screen.getByLabelText(/^Bobot bawaan/);
    expect(weightInput).toHaveAttribute("aria-invalid", "true");
    expect(weightInput).toHaveAttribute("aria-describedby", "issue-default-weight-error");

    // And it is repeated in the summary, as the brief requires.
    expect(within(screen.getByRole("alert")).getByRole("link", {
      name: "Isi bobot bawaan dengan angka.",
    })).toBeInTheDocument();
  });

  it("reads a cleared sort order the same way", async () => {
    const user = await openNewIssueEditor();

    await user.type(screen.getByLabelText(/^Nama isu/), "Koalisi");
    await user.clear(screen.getByLabelText(/^Urutan tampil/));
    await user.click(screen.getByRole("button", { name: "Simpan isu" }));

    const inline = await waitFor(() => {
      const el = document.getElementById("issue-sort-order-error");
      if (!el) throw new Error("inline sort order error not rendered yet");
      return el;
    });
    expect(inline).toHaveTextContent("Isi urutan tampil dengan angka.");
  });

  it("rejects a weight above the backend's maximum", async () => {
    const user = await openNewIssueEditor();

    await user.type(screen.getByLabelText(/^Nama isu/), "Koalisi");
    await setNumber(user, /^Bobot bawaan/, "11");
    await user.click(screen.getByRole("button", { name: "Simpan isu" }));

    const inline = await waitFor(() => {
      const el = document.getElementById("issue-default-weight-error");
      if (!el) throw new Error("inline weight error not rendered yet");
      return el;
    });
    expect(inline).toHaveTextContent("Bobot bawaan maksimal 10.");
  });

  it("rejects a name longer than the backend's 160 characters", async () => {
    const user = await openNewIssueEditor();

    await user.type(screen.getByLabelText(/^Nama isu/), "a".repeat(161));
    await user.click(screen.getByRole("button", { name: "Simpan isu" }));

    const inline = await waitFor(() => {
      const el = document.getElementById("issue-name-error");
      if (!el) throw new Error("inline name error not rendered yet");
      return el;
    });
    expect(inline).toHaveTextContent("Nama isu maksimal 160 karakter.");
  });

  it("never calls the API when validation fails", async () => {
    const calls = installFetchStub();
    const user = userEvent.setup();
    renderAdminIssues();
    await user.click(await screen.findByRole("button", { name: "Isu baru" }));
    await user.click(await screen.findByRole("button", { name: "Simpan isu" }));

    await screen.findByRole("alert");
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("sends the exact create payload on a valid submit", async () => {
    const calls = installFetchStub();
    const user = await openNewIssueEditor();

    await user.type(screen.getByLabelText(/^Nama isu/), "  Pertahanan  ");
    await user.type(screen.getByLabelText(/^Kategori/), "Keamanan");
    await setNumber(user, /^Bobot bawaan/, "2.5");
    await user.type(screen.getByLabelText(/^Deskripsi/), "  Sikap pertahanan.  ");
    await user.click(screen.getByRole("button", { name: "Simpan isu" }));

    await waitFor(() => {
      expect(calls.some((c) => c.method === "POST" && c.path === "/api/admin/issues")).toBe(true);
    });
    const post = calls.find((c) => c.method === "POST");
    // Payload shape is pinned by api-contract.test.ts: trimmed strings, blank
    // optionals as null, numbers untouched.
    expect(post?.body).toEqual({
      name: "Pertahanan",
      category: "Keamanan",
      description: "Sikap pertahanan.",
      default_weight: 2.5,
      sort_order: 0,
    });

    // The editor closes and the list is back.
    await screen.findByRole("button", { name: "Isu baru" });
    expect(screen.queryByRole("button", { name: "Simpan isu" })).not.toBeInTheDocument();
  });

  it("sends blank optional fields as null, exactly as before the conversion", async () => {
    const calls = installFetchStub();
    const user = await openNewIssueEditor();

    await user.type(screen.getByLabelText(/^Nama isu/), "Pertahanan");
    await user.click(screen.getByRole("button", { name: "Simpan isu" }));

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const post = calls.find((c) => c.method === "POST");
    expect(post?.body).toEqual({
      name: "Pertahanan",
      category: null,
      description: null,
      default_weight: 1,
      sort_order: 0,
    });
  });

  it("updates an existing issue with a PUT to its own id", async () => {
    const calls = installFetchStub();
    const user = userEvent.setup();
    renderAdminIssues();

    await user.click(await screen.findByRole("button", { name: "Ubah isu Koalisi" }));
    const nameInput = await screen.findByLabelText(/^Nama isu/);
    expect(nameInput).toHaveValue("Koalisi");
    expect(screen.getByLabelText(/^Kategori/)).toHaveValue("Politik");

    await user.clear(nameInput);
    await user.type(nameInput, "Koalisi Baru");
    await user.click(screen.getByRole("button", { name: "Perbarui" }));

    await waitFor(() =>
      expect(calls.some((c) => c.method === "PUT" && c.path === "/api/admin/issues/1")).toBe(true),
    );
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.body).toMatchObject({ name: "Koalisi Baru", category: "Politik" });
  });

  it("surfaces a server error in an alert and keeps the form open", async () => {
    installFetchStub({
      POST: () =>
        new Response(JSON.stringify({ detail: "Nama isu sudah dipakai" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
    });
    const user = await openNewIssueEditor();

    await user.type(screen.getByLabelText(/^Nama isu/), "Koalisi");
    await user.click(screen.getByRole("button", { name: "Simpan isu" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nama isu sudah dipakai");
    expect(screen.getByRole("button", { name: "Simpan isu" })).toBeInTheDocument();
  });
});

/* --------------------------------------------------------------------- T6 */

describe("T6 — AdminIssues ARIA", () => {
  beforeEach(() => {
    installFetchStub();
  });

  it("names the issues table with a caption", async () => {
    renderAdminIssues();
    await screen.findByRole("table", {
      name: /daftar isu penilaian dengan kategori/i,
    });
  });

  it("marks each issue name as its row's header", async () => {
    renderAdminIssues();
    await screen.findByRole("table");
    expect(screen.getByRole("rowheader", { name: /Koalisi/ })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: /Ekonomi/ })).toBeInTheDocument();
  });

  it("gives the action column a header for screen readers", async () => {
    renderAdminIssues();
    await screen.findByRole("table");
    expect(screen.getByRole("columnheader", { name: "Tindakan" })).toBeInTheDocument();
  });

  it("distinguishes the per-row actions by issue name", async () => {
    renderAdminIssues();
    await screen.findByRole("table");

    // The visible labels repeat down the column, so the accessible names must
    // carry the issue: "Ubah" alone is ambiguous when two rows exist.
    expect(screen.getAllByText("Ubah")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Ubah isu Koalisi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ubah isu Ekonomi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hapus isu Koalisi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hapus isu Ekonomi" })).toBeInTheDocument();
  });

  it("labels every control in the editor", async () => {
    await openNewIssueEditor();

    // getByLabelText throws when a control has no associated label.
    expect(screen.getByLabelText(/^Nama isu/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Kategori/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Bobot bawaan/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Urutan tampil/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Deskripsi/)).toBeInTheDocument();

    for (const control of screen.getAllByRole("button")) {
      expect(control).toHaveAccessibleName();
    }
  });

  it("keeps every editor control reachable by Tab, in visual order, with no trap", async () => {
    const user = await openNewIssueEditor();
    (document.activeElement as HTMLElement | null)?.blur();

    const order: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      await user.tab();
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) {
        // Tab leaving the editor for the browser chrome is not a trap: the
        // count assertion below covers it.
        order.push("document");
        continue;
      }
      order.push(el.id || el.textContent?.trim() || el.tagName);
    }

    // Five fields, then the two form buttons, then out of the form entirely.
    expect(order.slice(0, 7)).toEqual([
      "issue-name",
      "issue-category",
      "issue-default-weight",
      "issue-sort-order",
      "issue-description",
      "Batal",
      "Simpan isu",
    ]);
  });

  it("keeps the cancel button out of the submit path", async () => {
    const calls = installFetchStub();
    const user = await openNewIssueEditor();

    await user.type(screen.getByLabelText(/^Nama isu/), "Koalisi");
    await user.click(screen.getByRole("button", { name: "Batal" }));

    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
    await screen.findByRole("button", { name: "Isu baru" });
  });

  it("announces the delete dialog as a modal with a name", async () => {
    const user = userEvent.setup();
    renderAdminIssues();

    await user.click(await screen.findByRole("button", { name: "Hapus isu Koalisi" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Hapus isu");
    expect(within(dialog).getByRole("button", { name: "Hapus" })).toBeInTheDocument();
  });

  /*
   * Measured in the browser: with focus left on the page behind it, the dialog
   * was announced as a modal but Escape never reached its handler and Tab
   * walked the page underneath. Focus must move in on open.
   */
  it("moves focus into the dialog when it opens", async () => {
    const user = userEvent.setup();
    renderAdminIssues();

    const trigger = await screen.findByRole("button", { name: "Hapus isu Koalisi" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("closes on Escape once focus is inside the dialog", async () => {
    const user = userEvent.setup();
    renderAdminIssues();

    await user.click(await screen.findByRole("button", { name: "Hapus isu Koalisi" }));
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Focus returns to the control that opened it.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Hapus isu Koalisi" })).toHaveFocus(),
    );
  });

  it("keeps Cancel reachable before the destructive action", async () => {
    const user = userEvent.setup();
    renderAdminIssues();

    await user.click(await screen.findByRole("button", { name: "Hapus isu Koalisi" }));
    await screen.findByRole("dialog");

    await user.tab();
    expect(screen.getByRole("button", { name: "Batal" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Hapus" })).toHaveFocus();
  });

  it("deletes the chosen issue through the API", async () => {
    const calls = installFetchStub();
    const user = userEvent.setup();
    renderAdminIssues();

    await user.click(await screen.findByRole("button", { name: "Hapus isu Koalisi" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Hapus" }));

    await waitFor(() =>
      expect(
        calls.some((c) => c.method === "DELETE" && c.path === "/api/admin/issues/1"),
      ).toBe(true),
    );
  });
});
