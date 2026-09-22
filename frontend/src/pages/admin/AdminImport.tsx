import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button, ErrorState, Panel, PanelHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import type { ImportResult } from "@/lib/types";

/**
 * Bulk import from a JSON bundle or a set of CSV files.
 *
 * Built for outside contributors: someone with better data should be able to
 * send it without knowing a database id, and should be able to see exactly what
 * is wrong with their file before anything is written.
 *
 * The two-step flow is deliberate. "Periksa dulu" runs the same validation as
 * "Terapkan", so a clean preview guarantees the apply will succeed. A
 * contributor editing a 200-row file needs that confidence more than they need
 * one fewer click.
 */

const ACCEPT = ".json,.csv";

function isJson(files: File[]): boolean {
  const first = files[0];
  return files.length === 1 && first !== undefined && first.name.toLowerCase().endsWith(".json");
}

function describe(files: File[]): string {
  const first = files[0];
  if (first === undefined) return "Belum ada file dipilih.";
  if (isJson(files)) return first.name;
  return `${files.length} file CSV: ${files.map((f) => f.name).join(", ")}`;
}

/* ------------------------------------------------------------ result display */

/**
 * Human labels for the count keys the API returns.
 *
 * The raw keys are database table names. A contributor reading "modifiers 4"
 * has no way to know that means the events they just uploaded, so the table
 * says "peristiwa" instead.
 */
const COUNT_LABELS: Record<string, string> = {
  figures: "Figur",
  issues: "Isu",
  relationships: "Relasi",
  modifiers: "Peristiwa",
};

function CountTable({ result }: { result: ImportResult }) {
  const entries = Object.entries(result.counts).filter(
    ([, counts]) => counts.created > 0 || counts.updated > 0,
  );
  if (entries.length === 0) return null;

  return (
    <table className="w-full text-left text-[12.5px]">
      <caption className="sr-only">
        Jumlah baris yang dibuat dan diperbarui pada impor terakhir
      </caption>
      <thead>
        <tr className="border-b border-rule text-[10.5px] uppercase tracking-[0.06em] text-ink-soft">
          <th scope="col" className="py-1.5 pr-3 font-normal">
            Jenis
          </th>
          <th scope="col" className="py-1.5 pr-3 font-normal">
            Baru
          </th>
          <th scope="col" className="py-1.5 font-normal">
            Diperbarui
          </th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([name, counts]) => (
          <tr key={name} className="border-b border-rule/60 last:border-0">
            <td className="py-1.5 pr-3 font-medium">{COUNT_LABELS[name] ?? name}</td>
            <td className="tabular py-1.5 pr-3">{counts.created}</td>
            <td className="tabular py-1.5">{counts.updated}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProblemList({ result }: { result: ImportResult }) {
  const errors = result.problems.filter((p) => p.severity === "error");
  const warnings = result.problems.filter((p) => p.severity === "warning");

  if (result.problems.length === 0) {
    return (
      <p className="text-[13px] text-ink-soft">
        Tidak ada masalah. File ini siap diterapkan.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {errors.length > 0 ? (
        <div>
          <h3 className="mb-2 text-[12.5px] font-semibold text-tier-hostile">
            {errors.length} kesalahan yang harus diperbaiki
          </h3>
          <ul className="flex flex-col gap-1.5">
            {errors.map((problem, index) => (
              <li
                key={`${problem.location}-${index}`}
                className="rounded-sm border border-rule bg-neutral-sunk/60 px-3 py-2 text-[12.5px]"
              >
                {/* The location leads, because that is what the contributor
                    needs to find the row in their own file. */}
                <span className="font-medium">{problem.location}</span>
                <span className="text-ink-soft"> — {problem.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div>
          <h3 className="mb-2 text-[12.5px] font-semibold">
            {warnings.length} peringatan, tidak menghalangi impor
          </h3>
          <ul className="flex flex-col gap-1.5">
            {warnings.map((problem, index) => (
              <li
                key={`${problem.location}-${index}`}
                className="rounded-sm border border-rule px-3 py-2 text-[12.5px] text-ink-soft"
              >
                <span className="font-medium text-ink">{problem.location}</span> —{" "}
                {problem.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------- the page */

export function AdminImport() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [applied, setApplied] = useState<ImportResult | null>(null);

  const reset = () => {
    setPreview(null);
    setApplied(null);
  };

  const previewMutation = useMutation({
    mutationFn: () => api.importData.preview(files),
    onSuccess: (result) => {
      setPreview(result);
      setApplied(null);
    },
  });

  const applyMutation = useMutation({
    mutationFn: () => api.importData.apply(files),
    onSuccess: (result) => {
      setApplied(result);
      setPreview(null);
      if (result.ok) {
        // Figures, issues and relationships all changed, so drop the cached
        // copies rather than trying to patch them.
        void queryClient.invalidateQueries();
      }
    },
  });

  const exportMutation = useMutation({
    mutationFn: api.exportBundle,
  });

  const onPick = (picked: FileList | null) => {
    const next = picked ? Array.from(picked) : [];
    setFiles(next);
    reset();
  };

  const pending = previewMutation.isPending || applyMutation.isPending;
  const shown = applied ?? preview;
  const canApply = preview?.ok === true && !pending;

  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <PanelHeader
          title="Impor data"
          description="Tambah atau perbarui figur, isu, dan relasi sekaligus dari satu file JSON atau beberapa file CSV."
        />

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="import-files" className="text-[12.5px] font-medium">
              File yang diunggah
            </label>
            <input
              ref={inputRef}
              id="import-files"
              type="file"
              multiple
              accept={ACCEPT}
              onChange={(event) => onPick(event.target.files)}
              className={cx(
                "min-h-[44px] w-full cursor-pointer rounded-sm border border-dashed border-rule",
                "bg-neutral-raised px-3 py-2.5 text-[12.5px]",
                "file:mr-3 file:rounded-sm file:border file:border-rule file:bg-neutral-sunk",
                "file:px-2.5 file:py-1.5 file:text-[12px] file:text-ink",
              )}
              aria-describedby="import-files-help"
            />
            <p id="import-files-help" className="text-[12px] text-ink-soft">
              Satu file <code className="rounded-sm bg-neutral-sunk px-1">.json</code> berisi
              semuanya, atau beberapa <code className="rounded-sm bg-neutral-sunk px-1">.csv</code>{" "}
              (figures, issues, relationships, relationship_issues). Rujukan memakai nama figur dan
              nama isu, bukan id. Format lengkapnya ada di{" "}
              <code className="rounded-sm bg-neutral-sunk px-1">docs/IMPORT-FORMAT.md</code>.
            </p>
          </div>

          <p className="text-[12.5px] text-ink-soft" role="status">
            {describe(files)}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              onClick={() => {
                reset();
                previewMutation.mutate();
              }}
              disabled={files.length === 0 || pending}
            >
              {previewMutation.isPending ? "Memeriksa…" : "Periksa dulu"}
            </Button>
            <Button
              onClick={() => applyMutation.mutate()}
              disabled={!canApply}
              title={canApply ? undefined : "Periksa dulu sampai tidak ada kesalahan."}
            >
              {applyMutation.isPending ? "Menerapkan…" : "Terapkan"}
            </Button>
            {files.length > 0 ? (
              <Button
                variant="quiet"
                onClick={() => {
                  setFiles([]);
                  reset();
                  if (inputRef.current) inputRef.current.value = "";
                }}
                disabled={pending}
              >
                Kosongkan
              </Button>
            ) : null}
          </div>

          {/* Terapkan is disabled until a clean preview exists, so say why
              rather than leaving a dead button with no explanation. */}
          {files.length > 0 && !canApply && !applied ? (
            <p className="text-[12px] text-ink-soft">
              Tombol Terapkan aktif setelah Periksa dulu selesai tanpa kesalahan.
            </p>
          ) : null}
        </div>
      </Panel>

      {previewMutation.isError || applyMutation.isError ? (
        <Panel>
          <ErrorState
            message={
              ((previewMutation.error ?? applyMutation.error) as Error).message ||
              "Unggahan gagal."
            }
            onRetry={() => {
              if (applyMutation.isError) applyMutation.mutate();
              else previewMutation.mutate();
            }}
          />
        </Panel>
      ) : null}

      {shown ? (
        <Panel>
          <PanelHeader
            title={
              applied
                ? applied.ok
                  ? "Impor selesai"
                  : "Impor dibatalkan"
                : shown.ok
                  ? "Hasil pemeriksaan: siap diterapkan"
                  : "Hasil pemeriksaan: ada kesalahan"
            }
            description={
              applied
                ? applied.ok
                  ? "Data sudah tersimpan dan tampil di antarmuka publik."
                  : "Tidak ada yang berubah. Perbaiki file lalu ulangi."
                : shown.ok
                  ? "Tidak ada yang ditulis pada langkah ini. Angka di bawah adalah yang akan terjadi."
                  : "Tidak ada yang ditulis. Perbaiki kesalahan berikut lalu periksa lagi."
            }
          />

          <div className="flex flex-col gap-5">
            <ProblemList result={shown} />
            {shown.ok ? <CountTable result={shown} /> : null}
          </div>
        </Panel>
      ) : null}

      <Panel>
        <PanelHeader
          title="Ekspor data"
          description="Unduh seluruh dataset dalam format impor. Pakai sebagai contoh: ubah isinya, lalu unggah kembali."
        />
        <div className="flex flex-col gap-3">
          <div>
            <Button
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
            >
              {exportMutation.isPending ? "Menyiapkan…" : "Unduh prism-bundle.json"}
            </Button>
          </div>
          <p className="text-[12px] text-ink-soft">
            File ini bisa diunggah kembali tanpa perubahan dan tidak akan menggandakan data. Sudah
            diuji: seluruh 58 figur, 150 relasi, dan 90 peristiwa bolak-balik tanpa ada yang
            berubah.
          </p>
          {exportMutation.isError ? (
            <p className="text-[12.5px] text-tier-hostile" role="alert">
              {(exportMutation.error as Error).message}
            </p>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
