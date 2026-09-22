import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Panel,
  PanelHeader,
  ScoreValue,
  inputClass,
} from "@/components/ui";
import { ConfirmDialog } from "@/pages/admin/AdminApp";
import { useStatus } from "@/pages/admin/status";
import { api } from "@/lib/api";
import { scoreColor } from "@/lib/format";
import type { Issue } from "@/lib/types";

/**
 * Client-side mirror of the backend's IssueCreate/IssueUpdate rules
 * (app/schemas/__init__.py): name 1-160 characters, category up to 80,
 * default_weight between 0 and 10. Validating here means the admin sees the
 * problem before a round trip; the API stays the authority.
 *
 * `invalid_type_error` is set on both numeric fields on purpose: an <input
 * type="number"> registered with `valueAsNumber` stores NaN the moment it is
 * cleared, and zod's default message for that ("Expected number, received
 * nan") is not something an admin should ever read.
 */
const issueSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nama isu wajib diisi.")
    .max(160, "Nama isu maksimal 160 karakter."),
  category: z.string().trim().max(80, "Kategori maksimal 80 karakter."),
  description: z.string(),
  default_weight: z
    .number({ invalid_type_error: "Isi bobot bawaan dengan angka." })
    .min(0, "Bobot bawaan minimal 0.")
    .max(10, "Bobot bawaan maksimal 10."),
  sort_order: z
    .number({ invalid_type_error: "Isi urutan tampil dengan angka." })
    .int("Urutan tampil harus bilangan bulat."),
});

type FormValues = z.infer<typeof issueSchema>;

/**
 * The fields that can fail validation, paired with their input id. Drives the
 * error summary, so the summary and the inline messages can never disagree
 * about which field is wrong or where to send the reader.
 */
const VALIDATED_FIELDS = [
  { field: "name", id: "issue-name" },
  { field: "category", id: "issue-category" },
  { field: "default_weight", id: "issue-default-weight" },
  { field: "sort_order", id: "issue-sort-order" },
] as const;

function toDefaults(editing: Issue | "new"): FormValues {
  if (editing === "new") {
    return { name: "", category: "", description: "", default_weight: 1.0, sort_order: 0 };
  }
  return {
    name: editing.name,
    category: editing.category ?? "",
    description: editing.description ?? "",
    default_weight: editing.default_weight,
    sort_order: editing.sort_order,
  };
}

/**
 * Inline error for one field. It sits outside the <label> on purpose: inside,
 * the message would join the field's accessible name and every reader would
 * hear "Nama isu wajib diisi" twice. The input points here via
 * `aria-describedby` instead.
 */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-[12.5px] text-hostile">
      {message}
    </p>
  );
}

function IssueEditor({ editing, onClose }: { editing: Issue | "new"; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { succeed, fail } = useStatus();
  const isNew = editing === "new";
  const summaryRef = useRef<HTMLDivElement | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(issueSchema),
    defaultValues: toDefaults(editing),
    // A failed submit moves focus to the error summary. RHF's own
    // focus-the-first-invalid-field runs on a timer afterwards, so it is turned
    // off here or it would steal the focus back.
    shouldFocusError: false,
  });
  const { errors, submitCount } = form.formState;
  const [serverError, setServerError] = useState<string | null>(null);

  const summaryItems = VALIDATED_FIELDS.map(({ field, id }) => ({
    id,
    message: errors[field]?.message,
  })).filter((item) => Boolean(item.message));

  // Only after a submit: errors raised while typing must not yank the caret
  // into the summary.
  const showSummary = submitCount > 0 && summaryItems.length > 0;

  useEffect(() => {
    if (showSummary) summaryRef.current?.focus();
  }, [showSummary, submitCount]);

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      // Payload shape is pinned by the OpenAPI contract tests: trimming, and
      // blank optional fields becoming null, happen exactly as before.
      const payload = {
        name: values.name.trim(),
        category: values.category.trim() || null,
        description: values.description.trim() || null,
        default_weight: values.default_weight,
        sort_order: values.sort_order,
      };
      if (isNew) {
        await api.issues.create(payload);
      } else {
        await api.issues.update(editing.id, payload);
      }
      return payload.name;
    },
    onSuccess: (savedName) => {
      void queryClient.invalidateQueries({ queryKey: ["issues"] });
      succeed(
        isNew
          ? `Isu ${savedName} ditambahkan. Isu baru belum punya skor di relasi mana pun.`
          : `Perubahan pada isu ${savedName} tersimpan.`,
      );
      onClose();
    },
    onError: (err) => {
      const message = (err as Error).message;
      setServerError(message);
      fail("Perubahan pada isu tidak tersimpan, jadi data lama masih berlaku.", message);
    },
  });

  const onSubmit = form.handleSubmit(
    (values) => {
      setServerError(null);
      save.mutate(values);
    },
    () => setServerError(null),
  );

  return (
    <Panel>
      {/*
       * No action button in the header: the form footer already carries
       * "Batal", and a second control with the same accessible name would be
       * ambiguous to a screen reader and a redundant tab stop.
       */}
      <PanelHeader title={isNew ? "Isu baru" : `Ubah ${editing.name}`} />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {showSummary ? (
          <div
            ref={summaryRef}
            tabIndex={-1}
            role="alert"
            className="rounded-sm border border-hostile/40 bg-hostile/5 px-3.5 py-3"
          >
            <h3 className="text-[13px] font-semibold text-ink">Periksa kembali isian berikut.</h3>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
              {summaryItems.map((item) => (
                <li key={item.id} className="text-[13px]">
                  <a
                    href={`#${item.id}`}
                    className="text-hostile underline underline-offset-2 hover:text-ink"
                  >
                    {item.message}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <Field label="Nama isu *">
            <input
              {...form.register("name")}
              id="issue-name"
              className={inputClass}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? "issue-name-error" : undefined}
            />
          </Field>
          <FieldError id="issue-name-error" message={errors.name?.message} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Field label="Kategori">
              <input
                {...form.register("category")}
                id="issue-category"
                className={inputClass}
                aria-invalid={errors.category ? true : undefined}
                aria-describedby={errors.category ? "issue-category-error" : undefined}
              />
            </Field>
            <FieldError id="issue-category-error" message={errors.category?.message} />
          </div>
          <div>
            <Field label="Bobot bawaan" hint="Bobot tinggi berarti isu ini lebih menentukan skor.">
              <input
                {...form.register("default_weight", { valueAsNumber: true })}
                id="issue-default-weight"
                className={inputClass}
                type="number"
                step={0.1}
                min={0}
                max={10}
                aria-invalid={errors.default_weight ? true : undefined}
                aria-describedby={errors.default_weight ? "issue-default-weight-error" : undefined}
              />
            </Field>
            <FieldError
              id="issue-default-weight-error"
              message={errors.default_weight?.message}
            />
          </div>
          <div>
            <Field label="Urutan tampil">
              <input
                {...form.register("sort_order", { valueAsNumber: true })}
                id="issue-sort-order"
                className={inputClass}
                type="number"
                aria-invalid={errors.sort_order ? true : undefined}
                aria-describedby={errors.sort_order ? "issue-sort-order-error" : undefined}
              />
            </Field>
            <FieldError id="issue-sort-order-error" message={errors.sort_order?.message} />
          </div>
        </div>

        <Field label="Deskripsi">
          <textarea
            {...form.register("description")}
            id="issue-description"
            className={`${inputClass} min-h-[76px] resize-y`}
          />
        </Field>

        {serverError ? (
          <p role="alert" className="text-[13px] text-hostile">
            {serverError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-rule pt-4">
          {/* type="button": inside a form the default is submit, and "Batal"
              must never save anything. */}
          <Button type="button" onClick={onClose} disabled={save.isPending}>
            Batal
          </Button>
          <Button variant="primary" type="submit" disabled={save.isPending}>
            {save.isPending ? "Menyimpan…" : isNew ? "Simpan isu" : "Perbarui"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

export function AdminIssues() {
  const queryClient = useQueryClient();
  const { succeed, fail } = useStatus();
  const [editing, setEditing] = useState<Issue | "new" | null>(null);
  const [deleting, setDeleting] = useState<Issue | null>(null);

  const issuesQuery = useQuery({ queryKey: ["issues"], queryFn: () => api.issues.list() });

  const remove = useMutation({
    mutationFn: (id: number) => api.issues.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["issues"] });
      void queryClient.invalidateQueries({ queryKey: ["relationships"] });
      // Say how many scores went with it. An issue carries a score on every
      // relationship that used it, so this is not a one-row deletion.
      const name = deleting?.name ?? "Isu";
      const used = deleting?.usage_count ?? 0;
      succeed(
        used > 0
          ? `Isu ${name} dihapus, bersama skornya di ${used} relasi.`
          : `Isu ${name} dihapus.`,
      );
      setDeleting(null);
    },
    onError: (err) => {
      fail(
        `Isu ${deleting?.name ?? "itu"} tidak terhapus, jadi datanya masih ada.`,
        (err as Error).message,
      );
    },
  });

  if (editing) return <IssueEditor editing={editing} onClose={() => setEditing(null)} />;

  if (issuesQuery.isPending) {
    return (
      <Panel>
        <LoadingState what="isu" />
      </Panel>
    );
  }

  if (issuesQuery.isError) {
    return (
      <Panel>
        <ErrorState
          message={(issuesQuery.error as Error).message}
          onRetry={() => void issuesQuery.refetch()}
        />
      </Panel>
    );
  }

  const issues = issuesQuery.data.issues;

  return (
    <>
      <Panel>
        <PanelHeader
          title="Isu penilaian"
          description="Daftar isu yang dinilai pada setiap relasi. Bobot bawaan menjadi nilai awal saat admin mengisi skor."
          actions={
            <Button variant="primary" onClick={() => setEditing("new")}>
              Isu baru
            </Button>
          }
        />

        {issues.length === 0 ? (
          <EmptyState
            title="Belum ada isu. Tambahkan minimal satu agar relasi bisa dinilai."
            action={
              <Button variant="primary" onClick={() => setEditing("new")}>
                Tambah isu pertama
              </Button>
            }
          />
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              {/* The caption is the table's accessible name; without it a
                  screen reader announces only "table, 6 columns". */}
              <caption className="sr-only">
                Daftar isu penilaian dengan kategori, bobot bawaan, jumlah relasi yang memakai,
                dan rata-rata skor.
              </caption>
              <thead>
                <tr className="border-b border-rule text-left">
                  {["Isu", "Kategori", "Bobot", "Dipakai", "Rata-rata"].map((head) => (
                    <th
                      key={head}
                      scope="col"
                      className="whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft"
                    >
                      {head}
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="relative whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft"
                  >
                    <span className="sr-only">Tindakan</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id} className="border-b border-rule/60 hover:bg-neutral-sunk/50">
                    {/* scope="row" makes the issue name the row's header, so a
                        reader lands on "Koalisi" before the row's numbers. */}
                    <th scope="row" className="px-3 py-2.5 text-left font-normal">
                      <div className="font-semibold">{issue.name}</div>
                      {issue.description ? (
                        <div className="max-w-[420px] text-[11.5px] text-ink-soft">
                          {issue.description}
                        </div>
                      ) : null}
                    </th>
                    <td className="px-3 py-2.5">
                      <span className="rounded-sm border border-rule bg-neutral-sunk px-2 py-0.5 text-[11px]">
                        {issue.category ?? "–"}
                      </span>
                    </td>
                    <td className="tabular px-3 py-2.5">×{issue.default_weight}</td>
                    <td className="tabular px-3 py-2.5 text-ink-soft">
                      {issue.usage_count} relasi
                    </td>
                    <td className="px-3 py-2.5">
                      {issue.avg_score === null ? (
                        <span className="text-ink-soft">–</span>
                      ) : (
                        <ScoreValue
                          score={Math.round(issue.avg_score)}
                          color={scoreColor(issue.avg_score)}
                          size="sm"
                        />
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      {/* The visible labels repeat down the column; the
                          accessible name says which issue each button acts on. */}
                      <Button
                        className="mr-1.5"
                        aria-label={`Ubah isu ${issue.name}`}
                        onClick={() => setEditing(issue)}
                      >
                        Ubah
                      </Button>
                      <Button
                        variant="danger"
                        aria-label={`Hapus isu ${issue.name}`}
                        onClick={() => setDeleting(issue)}
                      >
                        Hapus
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {deleting ? (
        <ConfirmDialog
          title="Hapus isu"
          body={
            <>
              Hapus <strong className="font-semibold text-ink">{deleting.name}</strong>? Skor isu
              ini di {deleting.usage_count} relasi ikut terhapus, dan skor relasi tersebut akan
              dihitung ulang tanpa isu ini.
            </>
          }
          pending={remove.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting.id)}
        />
      ) : null}
    </>
  );
}
