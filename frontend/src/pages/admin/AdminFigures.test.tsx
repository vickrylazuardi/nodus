/**
 * AdminFigures — T5 (react-hook-form + zod) and T6 (ARIA) contract.
 *
 * Same shape as AdminIssues.test.tsx: an invalid submit must produce both
 * inline errors and a focusable error summary, a cleared numeric field must
 * read as Indonesian copy rather than a zod type error, a valid submit must
 * still send the exact payload the contract tests expect, and the table must
 * carry an accessible name with per-row action names.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminFigures } from "@/pages/admin/AdminFigures";
import type { Figure } from "@/lib/types";

/* ------------------------------------------------------------------ fixtures */

const FIGURES: Figure[] = [
  {
    id: 1,
    name: "Prabowo Subianto",
    full_name: "Prabowo Subianto Djojohadikusumo",
    role: "Presiden RI",
    party: "Gerindra",
    bloc: "Koalisi Indonesia Maju",
    region: "Nasional",
    photo_url: null,
    bio: "Ringkasan singkat.",
    tags: ["presiden", "gerindra"],
    influence: 98,
    is_active: true,
    relationship_count: 46,
    avg_score: 12,
    best_ally: null,
    worst_rival: null,
  },
  {
    id: 2,
    name: "Anies Baswedan",
    full_name: null,
    role: null,
    party: null,
    bloc: null,
    region: null,
    photo_url: null,
    bio: null,
    tags: [],
    influence: 70,
    is_active: false,
    relationship_count: 0,
    avg_score: -40,
    best_ally: null,
    worst_rival: null,
  },
];

/* -------------------------------------------------------------- fetch stub */

interface RecordedCall {
  method: string;
  path: string;
  body: unknown;
}

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

      if (path === "/api/figures" && method === "GET") {
        return Promise.resolve(json({ figures: FIGURES, count: FIGURES.length }));
      }
      if (path === "/api/admin/figures" && method === "POST") {
        return Promise.resolve(json({ id: 3 }, 201));
      }
      if (/^\/api\/admin\/figures\/\d+$/.test(path) && method === "PUT") {
        return Promise.resolve(json({ ok: true }));
      }
      if (/^\/api\/admin\/figures\/\d+$/.test(path) && method === "DELETE") {
        return Promise.resolve(json({ ok: true }));
      }
      throw new Error(`fetch stub has no route for ${method} ${url}`);
    }),
  );

  return calls;
}

function renderAdminFigures() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AdminFigures />
    </QueryClientProvider>,
  );
}

async function openNewFigureEditor() {
  const user = userEvent.setup();
  renderAdminFigures();
  await user.click(await screen.findByRole("button", { name: "Figur baru" }));
  await screen.findByRole("button", { name: "Simpan figur" });
  return user;
}

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

describe("T5 — AdminFigures form validates with react-hook-form + zod", () => {
  beforeEach(() => {
    installFetchStub();
  });

  it("shows inline errors AND a focused error summary after an invalid submit", async () => {
    const user = await openNewFigureEditor();

    await user.click(screen.getByRole("button", { name: "Simpan figur" }));

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("Periksa kembali isian berikut.");
    expect(summary).toHaveTextContent("Nama tampil wajib diisi.");
    expect(summary).toHaveFocus();

    const inline = document.getElementById("figure-name-error");
    expect(inline).toHaveTextContent("Nama tampil wajib diisi.");
    expect(summary.contains(inline)).toBe(false);

    const nameInput = screen.getByLabelText(/^Nama tampil/);
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    expect(nameInput).toHaveAttribute("aria-describedby", "figure-name-error");
  });

  it("links each summary item to the field it describes", async () => {
    const user = await openNewFigureEditor();

    await user.click(screen.getByRole("button", { name: "Simpan figur" }));

    const summary = await screen.findByRole("alert");
    const link = within(summary).getByRole("link", { name: "Nama tampil wajib diisi." });
    expect(link).toHaveAttribute("href", "#figure-name");
    expect(document.getElementById("figure-name")).not.toBeNull();
  });

  it("rejects a whitespace-only name", async () => {
    const user = await openNewFigureEditor();

    await user.type(screen.getByLabelText(/^Nama tampil/), "   ");
    await user.click(screen.getByRole("button", { name: "Simpan figur" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nama tampil wajib diisi.");
  });

  it("reads a cleared influence as Indonesian copy, not as a type error", async () => {
    const user = await openNewFigureEditor();

    await user.type(screen.getByLabelText(/^Nama tampil/), "Prabowo Subianto");
    await user.clear(screen.getByLabelText(/^Pengaruh/));
    await user.click(screen.getByRole("button", { name: "Simpan figur" }));

    const inline = await waitFor(() => {
      const el = document.getElementById("figure-influence-error");
      if (!el) throw new Error("inline influence error not rendered yet");
      return el;
    });
    expect(inline).toHaveTextContent("Isi pengaruh dengan angka.");
    expect(inline.textContent).not.toMatch(/nan|expected/i);

    const influenceInput = screen.getByLabelText(/^Pengaruh/);
    expect(influenceInput).toHaveAttribute("aria-invalid", "true");
    expect(influenceInput).toHaveAttribute("aria-describedby", "figure-influence-error");
  });

  it("rejects an influence above 100", async () => {
    const user = await openNewFigureEditor();

    await user.type(screen.getByLabelText(/^Nama tampil/), "Prabowo Subianto");
    await setNumber(user, /^Pengaruh/, "101");
    await user.click(screen.getByRole("button", { name: "Simpan figur" }));

    const inline = await waitFor(() => {
      const el = document.getElementById("figure-influence-error");
      if (!el) throw new Error("inline influence error not rendered yet");
      return el;
    });
    expect(inline).toHaveTextContent("Pengaruh maksimal 100.");
  });

  it("rejects a name longer than the backend's 120 characters", async () => {
    const user = await openNewFigureEditor();

    await user.type(screen.getByLabelText(/^Nama tampil/), "a".repeat(121));
    await user.click(screen.getByRole("button", { name: "Simpan figur" }));

    const inline = await waitFor(() => {
      const el = document.getElementById("figure-name-error");
      if (!el) throw new Error("inline name error not rendered yet");
      return el;
    });
    expect(inline).toHaveTextContent("Nama tampil maksimal 120 karakter.");
  });

  it("never calls the API when validation fails", async () => {
    const calls = installFetchStub();
    const user = userEvent.setup();
    renderAdminFigures();
    await user.click(await screen.findByRole("button", { name: "Figur baru" }));
    await user.click(await screen.findByRole("button", { name: "Simpan figur" }));

    await screen.findByRole("alert");
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("sends the exact create payload on a valid submit", async () => {
    const calls = installFetchStub();
    const user = await openNewFigureEditor();

    await user.type(screen.getByLabelText(/^Nama tampil/), "  Prabowo  ");
    await user.type(screen.getByLabelText(/^Nama lengkap/), "Prabowo Subianto");
    await user.type(screen.getByLabelText(/^Partai/), "Gerindra");
    await user.type(screen.getByLabelText(/^Tag/), "presiden, gerindra , ");
    await setNumber(user, /^Pengaruh/, "98");
    await user.click(screen.getByRole("button", { name: "Simpan figur" }));

    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.path === "/api/admin/figures")).toBe(true),
    );
    const post = calls.find((c) => c.method === "POST");
    // Shape pinned by api-contract.test.ts: trimmed, blanks as null, tags split
    // and de-blanked, influence as a number, is_active as a boolean.
    expect(post?.body).toEqual({
      name: "Prabowo",
      full_name: "Prabowo Subianto",
      role: null,
      party: "Gerindra",
      bloc: null,
      region: null,
      bio: null,
      tags: ["presiden", "gerindra"],
      influence: 98,
      is_active: true,
    });

    await screen.findByRole("button", { name: "Figur baru" });
    expect(screen.queryByRole("button", { name: "Simpan figur" })).not.toBeInTheDocument();
  });

  it("sends is_active false when the checkbox is cleared", async () => {
    const calls = installFetchStub();
    const user = await openNewFigureEditor();

    await user.type(screen.getByLabelText(/^Nama tampil/), "Anies Baswedan");
    await user.click(screen.getByLabelText("Tampilkan di situs publik"));
    await user.click(screen.getByRole("button", { name: "Simpan figur" }));

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const post = calls.find((c) => c.method === "POST");
    expect(post?.body).toMatchObject({ name: "Anies Baswedan", is_active: false });
  });

  it("prefills the editor from the existing figure and PUTs to its own id", async () => {
    const calls = installFetchStub();
    const user = userEvent.setup();
    renderAdminFigures();

    await user.click(await screen.findByRole("button", { name: "Ubah figur Prabowo Subianto" }));
    expect(await screen.findByLabelText(/^Nama tampil/)).toHaveValue("Prabowo Subianto");
    expect(screen.getByLabelText(/^Tag/)).toHaveValue("presiden, gerindra");
    expect(screen.getByLabelText(/^Pengaruh/)).toHaveValue(98);

    const nameInput = screen.getByLabelText(/^Nama tampil/);
    await user.clear(nameInput);
    await user.type(nameInput, "Prabowo");
    await user.click(screen.getByRole("button", { name: "Perbarui" }));

    await waitFor(() =>
      expect(calls.some((c) => c.method === "PUT" && c.path === "/api/admin/figures/1")).toBe(true),
    );
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.body).toMatchObject({ name: "Prabowo", tags: ["presiden", "gerindra"] });
  });

  it("surfaces a server error in an alert and keeps the form open", async () => {
    installFetchStub({
      POST: () =>
        new Response(JSON.stringify({ detail: "Nama figur sudah dipakai" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
    });
    const user = await openNewFigureEditor();

    await user.type(screen.getByLabelText(/^Nama tampil/), "Prabowo");
    await user.click(screen.getByRole("button", { name: "Simpan figur" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nama figur sudah dipakai");
    expect(screen.getByRole("button", { name: "Simpan figur" })).toBeInTheDocument();
  });
});

/* --------------------------------------------------------------------- T6 */

describe("T6 — AdminFigures ARIA", () => {
  beforeEach(() => {
    installFetchStub();
  });

  it("names the figures table with a caption", async () => {
    renderAdminFigures();
    await screen.findByRole("table", { name: /daftar figur dengan jabatan/i });
  });

  it("marks each figure name as its row's header", async () => {
    renderAdminFigures();
    await screen.findByRole("table");
    expect(screen.getByRole("rowheader", { name: /Prabowo Subianto/ })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: /Anies Baswedan/ })).toBeInTheDocument();
  });

  it("gives the action column a header for screen readers", async () => {
    renderAdminFigures();
    await screen.findByRole("table");
    expect(screen.getByRole("columnheader", { name: "Tindakan" })).toBeInTheDocument();
  });

  it("distinguishes the per-row actions by figure name", async () => {
    renderAdminFigures();
    await screen.findByRole("table");

    expect(screen.getAllByText("Ubah")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Ubah figur Prabowo Subianto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hapus figur Prabowo Subianto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ubah figur Anies Baswedan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hapus figur Anies Baswedan" })).toBeInTheDocument();
  });

  it("labels the filter control", async () => {
    renderAdminFigures();
    await screen.findByRole("table");
    expect(screen.getByRole("searchbox", { name: "Filter figur" })).toBeInTheDocument();
  });

  it("labels every control in the editor", async () => {
    await openNewFigureEditor();

    expect(screen.getByLabelText(/^Nama tampil/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nama lengkap/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Jabatan/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Partai/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Blok/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Wilayah/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Pengaruh/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Tag/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Ringkasan/)).toBeInTheDocument();
    expect(screen.getByLabelText("Tampilkan di situs publik")).toBeInTheDocument();

    for (const control of screen.getAllByRole("button")) {
      expect(control).toHaveAccessibleName();
    }
  });

  it("keeps every editor control reachable by Tab, in visual order, with no trap", async () => {
    const user = await openNewFigureEditor();
    (document.activeElement as HTMLElement | null)?.blur();

    const order: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      await user.tab();
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) {
        order.push("document");
        continue;
      }
      order.push(el.id || el.textContent?.trim() || el.tagName);
    }

    expect(order.slice(0, 12)).toEqual([
      "figure-name",
      "figure-full-name",
      "figure-role",
      "figure-party",
      "figure-bloc",
      "figure-region",
      "figure-influence",
      "figure-tags",
      "figure-bio",
      "figure-is-active",
      "Batal",
      "Simpan figur",
    ]);
  });

  it("moves focus into the delete dialog when it opens", async () => {
    const user = userEvent.setup();
    renderAdminFigures();

    await user.click(await screen.findByRole("button", { name: "Hapus figur Anies Baswedan" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Hapus figur");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("deletes the chosen figure through the API", async () => {
    const calls = installFetchStub();
    const user = userEvent.setup();
    renderAdminFigures();

    await user.click(await screen.findByRole("button", { name: "Hapus figur Anies Baswedan" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Hapus" }));

    await waitFor(() =>
      expect(
        calls.some((c) => c.method === "DELETE" && c.path === "/api/admin/figures/2"),
      ).toBe(true),
    );
  });
});
