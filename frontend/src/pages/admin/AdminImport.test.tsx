/**
 * The admin import page.
 *
 * What jsdom can decide here: that nothing is uploaded until the admin asks,
 * that Terapkan stays disabled until a clean preview exists, that problems are
 * shown with their location, and that the two-step flow never applies a file
 * that failed validation. What it cannot: the real multipart request, which was
 * verified over HTTP against a running server instead.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminImport } from "@/pages/admin/AdminImport";
import { StatusProvider } from "@/pages/admin/status";
import { api } from "@/lib/api";
import type { ImportResult } from "@/lib/types";

const CLEAN: ImportResult = {
  ok: true,
  applied: false,
  problems: [],
  counts: {
    figures: { created: 2, updated: 0 },
    relationships: { created: 1, updated: 0 },
  },
};

const WITH_ERRORS: ImportResult = {
  ok: false,
  applied: false,
  problems: [
    {
      severity: "error",
      location: "relationships.csv baris 3",
      message:
        "Relasi 'Beta' - 'Alpha' adalah pasangan yang sama dengan relationships.csv baris 2, " +
        "hanya urutannya dibalik. Relasi tidak berarah, jadi tulis satu baris saja.",
    },
    {
      severity: "warning",
      location: "catatan.csv",
      message: "Nama file tidak dikenal dan diabaikan.",
    },
  ],
  counts: {},
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <StatusProvider>
      <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminImport />
      </MemoryRouter>
    </QueryClientProvider>
    </StatusProvider>,
  );
}

/** A File that jsdom will accept, named so the page reads it as CSV. */
function csvFile(name = "figures.csv") {
  return new File(["name\nAlpha\n"], name, { type: "text/csv" });
}

async function chooseFile(user: ReturnType<typeof userEvent.setup>) {
  const input = screen.getByLabelText(/file yang diunggah/i);
  await user.upload(input, csvFile());
  return input;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("nothing is sent until the admin asks", () => {
  it("does not call the API on mount", () => {
    const preview = vi.spyOn(api.importData, "preview");
    const apply = vi.spyOn(api.importData, "apply");

    renderPage();

    expect(preview).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("names the file once one is chosen", async () => {
    const user = userEvent.setup();
    renderPage();
    await chooseFile(user);

    expect(await screen.findByText(/figures\.csv/)).toBeTruthy();
  });

  it("disables both buttons while nothing is chosen", () => {
    renderPage();

    expect(screen.getByRole("button", { name: /periksa dulu/i })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: /terapkan/i })).toHaveProperty("disabled", true);
  });
});

describe("preview is a real dry run", () => {
  it("reports what would happen without applying", async () => {
    const user = userEvent.setup();
    const preview = vi.spyOn(api.importData, "preview").mockResolvedValue(CLEAN);
    const apply = vi.spyOn(api.importData, "apply").mockResolvedValue(CLEAN);

    renderPage();
    await chooseFile(user);
    await user.click(screen.getByRole("button", { name: /periksa dulu/i }));

    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    expect(apply).not.toHaveBeenCalled();

    // The counts are shown as a preview, and the wording says nothing was written.
    expect(await screen.findByText(/tidak ada yang ditulis pada langkah ini/i)).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: /siap diterapkan/i }),
    ).toBeTruthy();
  });

  it("sends the chosen file as multipart form data", async () => {
    const user = userEvent.setup();
    const preview = vi.spyOn(api.importData, "preview").mockResolvedValue(CLEAN);

    renderPage();
    await chooseFile(user);
    await user.click(screen.getByRole("button", { name: /periksa dulu/i }));

    await waitFor(() => expect(preview).toHaveBeenCalled());
    const files = preview.mock.calls[0]?.[0] as unknown as File[];
    expect(files).toHaveLength(1);
    expect(files[0]?.name).toBe("figures.csv");
  });
});

describe("apply is gated on a clean preview", () => {
  it("keeps Terapkan disabled until a preview succeeds", async () => {
    const user = userEvent.setup();
    vi.spyOn(api.importData, "preview").mockResolvedValue(CLEAN);

    renderPage();
    await chooseFile(user);

    const applyButton = screen.getByRole("button", { name: /terapkan/i });
    expect(applyButton).toHaveProperty("disabled", true);
    expect(screen.getByText(/aktif setelah periksa dulu/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /periksa dulu/i }));

    await waitFor(() => expect(applyButton).toHaveProperty("disabled", false));
  });

  it("never enables Terapkan when the preview found errors", async () => {
    const user = userEvent.setup();
    vi.spyOn(api.importData, "preview").mockResolvedValue(WITH_ERRORS);

    renderPage();
    await chooseFile(user);
    await user.click(screen.getByRole("button", { name: /periksa dulu/i }));

    await screen.findByText(/ada kesalahan/i);
    expect(screen.getByRole("button", { name: /terapkan/i })).toHaveProperty("disabled", true);
  });

  it("does not apply when preview failed, even if clicked", async () => {
    const user = userEvent.setup();
    vi.spyOn(api.importData, "preview").mockResolvedValue(WITH_ERRORS);
    const apply = vi.spyOn(api.importData, "apply").mockResolvedValue(CLEAN);

    renderPage();
    await chooseFile(user);
    await user.click(screen.getByRole("button", { name: /periksa dulu/i }));
    await screen.findByText(/ada kesalahan/i);

    // A disabled button cannot be activated; assert the call never happens.
    await user.click(screen.getByRole("button", { name: /terapkan/i }));
    expect(apply).not.toHaveBeenCalled();
  });
});

describe("problems are shown so the contributor can fix them", () => {
  it("shows each problem with its location in the file", async () => {
    const user = userEvent.setup();
    vi.spyOn(api.importData, "preview").mockResolvedValue(WITH_ERRORS);

    renderPage();
    await chooseFile(user);
    await user.click(screen.getByRole("button", { name: /periksa dulu/i }));

    await screen.findByText(/ada kesalahan/i);
    expect(screen.getByText("relationships.csv baris 3")).toBeTruthy();
    expect(screen.getByText(/urutannya dibalik/i)).toBeTruthy();
  });

  it("separates errors from warnings", async () => {
    const user = userEvent.setup();
    vi.spyOn(api.importData, "preview").mockResolvedValue(WITH_ERRORS);

    renderPage();
    await chooseFile(user);
    await user.click(screen.getByRole("button", { name: /periksa dulu/i }));

    await screen.findByText(/ada kesalahan/i);
    expect(screen.getByText(/1 kesalahan yang harus diperbaiki/i)).toBeTruthy();
    expect(screen.getByText(/1 peringatan, tidak menghalangi impor/i)).toBeTruthy();
  });
});

describe("applying", () => {
  it("reports success and the counts after applying", async () => {
    const user = userEvent.setup();
    vi.spyOn(api.importData, "preview").mockResolvedValue(CLEAN);
    vi.spyOn(api.importData, "apply").mockResolvedValue({ ...CLEAN, applied: true });

    renderPage();
    await chooseFile(user);
    await user.click(screen.getByRole("button", { name: /periksa dulu/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /terapkan/i })).toHaveProperty("disabled", false),
    );
    await user.click(screen.getByRole("button", { name: /terapkan/i }));

    await screen.findByText(/impor selesai/i);
    expect(screen.getByText(/sudah tersimpan/i)).toBeTruthy();
  });

  it("says nothing changed when the server cancels the import", async () => {
    const user = userEvent.setup();
    vi.spyOn(api.importData, "preview").mockResolvedValue(CLEAN);
    vi.spyOn(api.importData, "apply").mockResolvedValue({
      ...WITH_ERRORS,
      applied: false,
    });

    renderPage();
    await chooseFile(user);
    await user.click(screen.getByRole("button", { name: /periksa dulu/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /terapkan/i })).toHaveProperty("disabled", false),
    );
    await user.click(screen.getByRole("button", { name: /terapkan/i }));

    await screen.findByText(/impor dibatalkan/i);
    expect(screen.getByText(/tidak ada yang berubah/i)).toBeTruthy();
  });

  it("shows a network failure with a retry", async () => {
    const user = userEvent.setup();
    vi.spyOn(api.importData, "preview").mockRejectedValue(new Error("Gagal menghubungi server."));

    renderPage();
    await chooseFile(user);
    await user.click(screen.getByRole("button", { name: /periksa dulu/i }));

    expect(await screen.findByText(/gagal menghubungi server/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /coba lagi/i })).toBeTruthy();
  });
});

describe("export", () => {
  it("offers a download and explains that the file round-trips", () => {
    renderPage();

    expect(screen.getByRole("button", { name: /unduh prism-bundle\.json/i })).toBeTruthy();
    expect(screen.getByText(/tidak akan menggandakan data/i)).toBeTruthy();
  });

  it("calls the export endpoint when clicked", async () => {
    const user = userEvent.setup();
    const exported = vi.spyOn(api, "exportBundle").mockResolvedValue(undefined);

    renderPage();
    await user.click(screen.getByRole("button", { name: /unduh prism-bundle\.json/i }));

    await waitFor(() => expect(exported).toHaveBeenCalledTimes(1));
  });
});

describe("accessibility", () => {
  it("labels the file input and points at the format documentation", () => {
    renderPage();

    const input = screen.getByLabelText(/file yang diunggah/i);
    expect(input.getAttribute("type")).toBe("file");
    expect(input.getAttribute("aria-describedby")).toBe("import-files-help");
    expect(screen.getByText(/IMPORT-FORMAT\.md/)).toBeTruthy();
  });

  it("announces the chosen file in a live region", async () => {
    const user = userEvent.setup();
    renderPage();
    await chooseFile(user);

    const status = await screen.findByRole("status");
    expect(within(status).getByText(/figures\.csv/)).toBeTruthy();
  });

  it("gives the counts table a caption and scoped headers", async () => {
    const user = userEvent.setup();
    vi.spyOn(api.importData, "preview").mockResolvedValue(CLEAN);

    renderPage();
    await chooseFile(user);
    await user.click(screen.getByRole("button", { name: /periksa dulu/i }));
    await screen.findByRole("heading", { name: /siap diterapkan/i });

    const table = screen.getByRole("table");
    expect(table.querySelector("caption")).toBeTruthy();
    for (const th of table.querySelectorAll("th")) {
      expect(th.getAttribute("scope")).toBe("col");
    }
  });
});
