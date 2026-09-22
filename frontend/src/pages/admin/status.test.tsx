/**
 * The admin status strip.
 *
 * Why this file exists: nine mutations across the admin changed data and told
 * the admin nothing, so a save could not be told from a no-op. These tests pin
 * the behaviour that fixes it, including the parts that are easy to lose in a
 * later refactor: the strip stays until replaced, it announces itself once, and
 * the verb matches what actually happened.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { StatusProvider, StatusStrip, useStatus } from "@/pages/admin/status";

/** A button that reports a result, standing in for a real mutation. */
function Trigger({
  onRun,
  label = "Jalankan",
}: {
  onRun: (api: ReturnType<typeof useStatus>) => void;
  label?: string;
}) {
  const api = useStatus();
  return (
    <button type="button" onClick={() => onRun(api)}>
      {label}
    </button>
  );
}

function setup(onRun: (api: ReturnType<typeof useStatus>) => void) {
  return render(
    <StatusProvider>
      <StatusStrip />
      <Trigger onRun={onRun} />
    </StatusProvider>,
  );
}

describe("nothing is shown before an action", () => {
  it("renders no strip when idle", () => {
    setup(() => {});
    expect(screen.queryByText(/tersimpan|gagal|menyimpan/i)).toBeNull();
  });

  it("has no live region until there is something to say", () => {
    const { container } = setup(() => {});
    expect(container.querySelector('[aria-live]')).toBeNull();
  });
});

describe("a result is announced and stays", () => {
  it("shows a success message", async () => {
    const user = userEvent.setup();
    setup((api) => api.succeed("Isu Koalisi tersimpan."));

    await user.click(screen.getByRole("button", { name: "Jalankan" }));

    expect(screen.getByText(/Isu Koalisi tersimpan\./)).toBeTruthy();
    expect(screen.getByText(/Tersimpan\./)).toBeTruthy();
  });

  it("shows a failure with the next action", async () => {
    const user = userEvent.setup();
    setup((api) => api.fail("Isu tidak tersimpan.", "Periksa koneksi Anda."));

    await user.click(screen.getByRole("button", { name: "Jalankan" }));

    expect(screen.getByText(/Isu tidak tersimpan\./)).toBeTruthy();
    expect(screen.getByText(/Periksa koneksi Anda\./)).toBeTruthy();
    expect(screen.getByText(/Gagal menyimpan\./)).toBeTruthy();
  });

  it("does not disappear on its own", async () => {
    const user = userEvent.setup();
    setup((api) => api.succeed("Isu Koalisi tersimpan."));

    await user.click(screen.getByRole("button", { name: "Jalankan" }));

    /*
     * A toast that vanishes after a few seconds is worse than none: look away
     * and the answer is gone.
     *
     * The wait is deliberately longer than any plausible auto-dismiss. An
     * earlier version waited 1200ms, and a mutation that cleared the strip
     * after 2000ms passed it, so the guard proved nothing. It has to outlast
     * the mistake it is guarding against, not just the render.
     */
    await new Promise((r) => setTimeout(r, 3500));
    expect(screen.getByText(/Isu Koalisi tersimpan\./)).toBeTruthy();
  });

  it("uses exactly one live region, and it is polite", async () => {
    const user = userEvent.setup();
    const { container } = setup((api) => api.succeed("Tersimpan."));

    await user.click(screen.getByRole("button", { name: "Jalankan" }));

    const regions = container.querySelectorAll('[aria-live]');
    expect(regions).toHaveLength(1);
    // polite, not assertive: a save result waits for the reader to finish the
    // current sentence. role="status" is deliberately not used, because it
    // already implies aria-live and setting both double-announces.
    expect(regions[0]?.getAttribute("aria-live")).toBe("polite");
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});

describe("the verb describes what actually happened", () => {
  it("defaults to Tersimpan for a save", async () => {
    const user = userEvent.setup();
    setup((api) => api.succeed("Perubahan tersimpan."));

    await user.click(screen.getByRole("button", { name: "Jalankan" }));
    expect(screen.getByText(/Tersimpan\./)).toBeTruthy();
  });

  it("lets a caller override it, so a download does not claim to be a save", async () => {
    const user = userEvent.setup();
    setup((api) => api.succeed("Berkas diunduh.", "Terunduh. "));

    await user.click(screen.getByRole("button", { name: "Jalankan" }));

    expect(screen.getByText(/Terunduh\./)).toBeTruthy();
    // The lie this prevents: "Tersimpan. Berkas diunduh."
    expect(screen.queryByText(/Tersimpan\./)).toBeNull();
  });
});

describe("pending state", () => {
  it("says it is working and marks it as busy", async () => {
    const user = userEvent.setup();
    setup((api) => api.start("Menyimpan isu Koalisi."));

    await user.click(screen.getByRole("button", { name: "Jalankan" }));

    expect(screen.getByText(/Menyimpan\./)).toBeTruthy();
    expect(screen.getByText(/Menyimpan isu Koalisi\./)).toBeTruthy();
  });

  it("replaces the pending message with the result", async () => {
    const user = userEvent.setup();
    setup((api) => {
      api.start("Menyimpan isu Koalisi.");
      api.succeed("Isu Koalisi tersimpan.");
    });

    await user.click(screen.getByRole("button", { name: "Jalankan" }));

    expect(screen.queryByText(/Menyimpan isu Koalisi\./)).toBeNull();
    expect(screen.getByText(/Isu Koalisi tersimpan\./)).toBeTruthy();
  });
});

describe("dismissal", () => {
  it("clears the strip when dismissed", async () => {
    const user = userEvent.setup();
    setup((api) => api.succeed("Tersimpan."));

    await user.click(screen.getByRole("button", { name: "Jalankan" }));
    await user.click(screen.getByRole("button", { name: "Tutup" }));

    expect(screen.queryByText(/Tersimpan\./)).toBeNull();
  });

  it("does not offer dismissal while an action is still running", async () => {
    const user = userEvent.setup();
    setup((api) => api.start("Menyimpan."));

    await user.click(screen.getByRole("button", { name: "Jalankan" }));

    // Dismissing mid-flight would hide the outcome the admin is waiting for.
    expect(screen.queryByRole("button", { name: "Tutup" })).toBeNull();
  });

  it("keeps the dismiss target at 44px", async () => {
    const user = userEvent.setup();
    setup((api) => api.succeed("Tersimpan."));

    await user.click(screen.getByRole("button", { name: "Jalankan" }));
    const close = screen.getByRole("button", { name: "Tutup" });

    expect(close.className).toContain("min-h-[44px]");
  });
});

describe("a later result replaces an earlier one", () => {
  it("shows only the newest message", async () => {
    const user = userEvent.setup();
    let count = 0;
    setup((api) => {
      count += 1;
      api.succeed(count === 1 ? "Pesan pertama." : "Pesan kedua.");
    });

    const button = screen.getByRole("button", { name: "Jalankan" });
    await user.click(button);
    expect(screen.getByText(/Pesan pertama\./)).toBeTruthy();

    await user.click(button);
    expect(screen.getByText(/Pesan kedua\./)).toBeTruthy();
    expect(screen.queryByText(/Pesan pertama\./)).toBeNull();
  });
});
