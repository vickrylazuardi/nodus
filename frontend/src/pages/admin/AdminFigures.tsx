import { useEffect, useMemo, useRef, useState } from "react";
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
import type { Figure } from "@/lib/types";

/**
 * Client-side mirror of the backend's FigureCreate/FigureUpdate rules
 * (app/schemas/__init__.py). Lengths match the Pydantic Field constraints, so a
 * name that validates here will not come back as a 422.
 *
 * `invalid_type_error` on `influence` matters: an <input type="number">
 * registered with `valueAsNumber` stores NaN when cleared, and zod's default
 * message for that is not something an admin should read.
 */
const figureSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nama tampil wajib diisi.")
    .max(120, "Nama tampil maksimal 120 karakter."),
  full_name: z.string().trim().max(200, "Nama lengkap maksimal 200 karakter."),
  role: z.string().trim().max(160, "Jabatan maksimal 160 karakter."),
  party: z.string().trim().max(120, "Partai maksimal 120 karakter."),
  bloc: z.string().trim().max(120, "Blok maksimal 120 karakter."),
  region: z.string().trim().max(120, "Wilayah maksimal 120 karakter."),
  bio: z.string(),
  tags: z.string(),
  influence: z
    .number({ invalid_type_error: "Isi pengaruh dengan angka." })
    .int("Pengaruh harus bilangan bulat.")
    .min(0, "Pengaruh minimal 0.")
    .max(100, "Pengaruh maksimal 100."),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof figureSchema>;

/**
 * Validated fields, paired with their input id. Drives the error summary, so
 * the summary and the inline messages cannot disagree.
 */
const VALIDATED_FIELDS = [
  { field: "name", id: "figure-name" },
  { field: "full_name", id: "figure-full-name" },
  { field: "role", id: "figure-role" },
  { field: "party", id: "figure-party" },
  { field: "bloc", id: "figure-bloc" },
  { field: "region", id: "figure-region" },
  { field: "influence", id: "figure-influence" },
] as const;

const EMPTY_FORM: FormValues = {
  name: "",
  full_name: "",
  role: "",
  party: "",
  bloc: "",
  region: "",
  bio: "",
  tags: "",
  influence: 50,
  is_active: true,
};

function toDefaults(figure: Figure): FormValues {
  return {
    name: figure.name,
    full_name: figure.full_name ?? "",
    role: figure.role ?? "",
    party: figure.party ?? "",
    bloc: figure.bloc ?? "",
    region: figure.region ?? "",
    bio: figure.bio ?? "",
    tags: figure.tags.join(", "),
    influence: figure.influence,
    is_active: figure.is_active,
  };
}

/**
 * Inline error for one field. Outside the <label> on purpose: inside, the
 * message would join the field's accessible name and be announced twice.
 */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-[12.5px] text-hostile">
      {message}
    </p>
  );
}

function FigureEditor({
  editing,
  onClose,
}: {
  editing: Figure | "new";
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { succeed, fail } = useStatus();
  const isNew = editing === "new";
  const summaryRef = useRef<HTMLDivElement | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(figureSchema),
    defaultValues: isNew ? EMPTY_FORM : toDefaults(editing),
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

  const showSummary = submitCount > 0 && summaryItems.length > 0;

  useEffect(() => {
    if (showSummary) summaryRef.current?.focus();
  }, [showSummary, submitCount]);

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      // Payload shape is pinned by the OpenAPI contract tests: trimmed strings,
      // blank optional fields becoming null, tags split on commas.
      const blank = (v: string) => (v.trim() ? v.trim() : null);
      const payload = {
        name: values.name.trim(),
        full_name: blank(values.full_name),
        role: blank(values.role),
        party: blank(values.party),
        bloc: blank(values.bloc),
        region: blank(values.region),
        bio: blank(values.bio),
        tags: values.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        influence: values.influence,
        is_active: values.is_active,
      };
      // Both branches return different shapes ({id} vs {ok}); the editor only
      // cares that it succeeded, so normalise to void.
      if (isNew) {
        await api.figures.create(payload);
      } else {
        await api.figures.update(editing.id, payload);
      }
      // Returned so the success message can name the record. The submitted
      // value is used rather than the prop, because a rename would otherwise
      // report the old name.
      return payload.name;
    },
    onSuccess: (savedName) => {
      void queryClient.invalidateQueries({ queryKey: ["figures"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
      // Name the record, not just the verb. "Tersimpan" alone still leaves the
      // admin wondering what was saved; the figure's name closes the question.
      succeed(
        isNew
          ? `Figur ${savedName} ditambahkan ke daftar.`
          : `Perubahan pada ${savedName} tersimpan.`,
      );
      onClose();
    },
    onError: (err) => {
      const message = (err as Error).message;
      setServerError(message);
      // Report it in the same place as every other result, so a failed save is
      // as visible as a successful one. The dialog deliberately stays open with
      // the typed values intact: closing it would discard the admin's work at
      // the moment they need it most.
      fail(
        `Perubahan pada figur tidak tersimpan, jadi data lama masih berlaku.`,
        message,
      );
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
      {/* No action button in the header: the form footer carries "Batal", and a
          second control with the same accessible name would be ambiguous and a
          redundant tab stop. */}
      <PanelHeader title={isNew ? "Figur baru" : `Ubah ${editing.name}`} />
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Field label="Nama tampil *" hint="Nama singkat, misalnya “Prabowo Subianto”.">
              <input
                {...form.register("name")}
                id="figure-name"
                className={inputClass}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? "figure-name-error" : undefined}
              />
            </Field>
            <FieldError id="figure-name-error" message={errors.name?.message} />
          </div>
          <div>
            <Field label="Nama lengkap">
              <input
                {...form.register("full_name")}
                id="figure-full-name"
                className={inputClass}
                aria-invalid={errors.full_name ? true : undefined}
                aria-describedby={errors.full_name ? "figure-full-name-error" : undefined}
              />
            </Field>
            <FieldError id="figure-full-name-error" message={errors.full_name?.message} />
          </div>
          <div>
            <Field label="Jabatan">
              <input
                {...form.register("role")}
                id="figure-role"
                className={inputClass}
                aria-invalid={errors.role ? true : undefined}
                aria-describedby={errors.role ? "figure-role-error" : undefined}
              />
            </Field>
            <FieldError id="figure-role-error" message={errors.role?.message} />
          </div>
          <div>
            <Field label="Partai">
              <input
                {...form.register("party")}
                id="figure-party"
                className={inputClass}
                aria-invalid={errors.party ? true : undefined}
                aria-describedby={errors.party ? "figure-party-error" : undefined}
              />
            </Field>
            <FieldError id="figure-party-error" message={errors.party?.message} />
          </div>
          <div>
            <Field label="Blok atau koalisi" hint="Dipakai untuk filter di peta relasi.">
              <input
                {...form.register("bloc")}
                id="figure-bloc"
                className={inputClass}
                aria-invalid={errors.bloc ? true : undefined}
                aria-describedby={errors.bloc ? "figure-bloc-error" : undefined}
              />
            </Field>
            <FieldError id="figure-bloc-error" message={errors.bloc?.message} />
          </div>
          <div>
            <Field label="Wilayah basis">
              <input
                {...form.register("region")}
                id="figure-region"
                className={inputClass}
                aria-invalid={errors.region ? true : undefined}
                aria-describedby={errors.region ? "figure-region-error" : undefined}
              />
            </Field>
            <FieldError id="figure-region-error" message={errors.region?.message} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Field label="Pengaruh (0–100)" hint="Menentukan ukuran titik di peta relasi.">
              <input
                {...form.register("influence", { valueAsNumber: true })}
                id="figure-influence"
                className={inputClass}
                type="number"
                min={0}
                max={100}
                aria-invalid={errors.influence ? true : undefined}
                aria-describedby={errors.influence ? "figure-influence-error" : undefined}
              />
            </Field>
            <FieldError id="figure-influence-error" message={errors.influence?.message} />
          </div>
          <Field label="Tag" hint="Pisahkan dengan koma.">
            <input {...form.register("tags")} id="figure-tags" className={inputClass} />
          </Field>
        </div>

        <Field label="Ringkasan">
          <textarea
            {...form.register("bio")}
            id="figure-bio"
            className={`${inputClass} min-h-[76px] resize-y`}
          />
        </Field>

        <label className="flex items-center gap-2 text-[13px]">
          <input
            {...form.register("is_active")}
            id="figure-is-active"
            type="checkbox"
            className="accent-[#9A6B2F]"
          />
          Tampilkan di situs publik
        </label>

        {serverError ? (
          <p role="alert" className="text-[13px] text-hostile">
            {serverError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-rule pt-4">
          <Button type="button" onClick={onClose} disabled={save.isPending}>
            Batal
          </Button>
          <Button variant="primary" type="submit" disabled={save.isPending}>
            {save.isPending ? "Menyimpan…" : isNew ? "Simpan figur" : "Perbarui"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

export function AdminFigures() {
  const queryClient = useQueryClient();
  const { succeed, fail } = useStatus();
  const [editing, setEditing] = useState<Figure | "new" | null>(null);
  const [deleting, setDeleting] = useState<Figure | null>(null);
  const [query, setQuery] = useState("");

  const figuresQuery = useQuery({ queryKey: ["figures"], queryFn: () => api.figures.list() });

  const remove = useMutation({
    mutationFn: (id: number) => api.figures.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["figures"] });
      void queryClient.invalidateQueries({ queryKey: ["relationships"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
      // `deleting` is still set at this point, so the name is available. Say how
      // many relationships went with it: deleting a figure cascades, and the
      // count is the difference between "removed a row" and "removed a row and
      // 46 ties", which is not something to discover later.
      const name = deleting?.name ?? "Figur";
      const tied = deleting?.relationship_count ?? 0;
      succeed(
        tied > 0
          ? `${name} dihapus, bersama ${tied} relasinya.`
          : `${name} dihapus.`,
      );
      setDeleting(null);
    },
    onError: (err) => {
      // The dialog stays open so the admin can retry without hunting for the
      // row again.
      fail(
        `${deleting?.name ?? "Figur"} tidak terhapus, jadi datanya masih ada.`,
        (err as Error).message,
      );
    },
  });

  const filtered = useMemo(() => {
    const figures = figuresQuery.data?.figures ?? [];
    if (!query.trim()) return figures;
    const needle = query.trim().toLowerCase();
    return figures.filter((f) =>
      [f.name, f.party, f.role, f.bloc].filter(Boolean).some((v) =>
        (v as string).toLowerCase().includes(needle),
      ),
    );
  }, [figuresQuery.data, query]);

  if (editing) {
    return <FigureEditor editing={editing} onClose={() => setEditing(null)} />;
  }

  if (figuresQuery.isPending) {
    return (
      <Panel>
        <LoadingState what="figur" />
      </Panel>
    );
  }

  if (figuresQuery.isError) {
    return (
      <Panel>
        <ErrorState
          message={(figuresQuery.error as Error).message}
          onRetry={() => void figuresQuery.refetch()}
        />
      </Panel>
    );
  }

  return (
    <>
      <Panel>
        <PanelHeader
          title="Figur"
          description={`${figuresQuery.data.figures.length} figur terdaftar.`}
          actions={
            <>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter…"
                aria-label="Filter figur"
                className={
                  // min-h-[44px] is the touch-target floor. This field
                  // hand-rolls the input styles instead of using inputClass,
                  // so it missed the shared fix and measured 38px.
                  "min-h-[44px] w-[200px] rounded-sm border border-rule bg-neutral-raised px-2.5 py-2 text-[13px]"
                }
              />
              <Button variant="primary" onClick={() => setEditing("new")}>
                Figur baru
              </Button>
            </>
          }
        />

        {filtered.length === 0 ? (
          <EmptyState
            title={`Tidak ada figur yang cocok dengan "${query}".`}
            action={<Button onClick={() => setQuery("")}>Hapus filter</Button>}
          />
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <caption className="sr-only">
                Daftar figur dengan jabatan, partai, pengaruh, jumlah relasi, dan rata-rata skor.
              </caption>
              <thead>
                <tr className="border-b border-rule text-left">
                  {["Nama", "Jabatan", "Partai", "Pengaruh", "Relasi", "Rata-rata"].map((head) => (
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
                {filtered.map((figure) => (
                  <tr key={figure.id} className="border-b border-rule/60 hover:bg-neutral-sunk/50">
                    <th scope="row" className="px-3 py-2.5 text-left font-normal">
                      <div className="font-semibold">{figure.name}</div>
                      {!figure.is_active ? (
                        <span className="text-[11px] text-ink-soft">nonaktif</span>
                      ) : null}
                    </th>
                    <td className="px-3 py-2.5 text-ink-soft">{figure.role ?? "–"}</td>
                    <td className="px-3 py-2.5">{figure.party ?? "–"}</td>
                    <td className="tabular px-3 py-2.5">{figure.influence}</td>
                    <td className="tabular px-3 py-2.5">{figure.relationship_count}</td>
                    <td className="px-3 py-2.5">
                      <ScoreValue
                        score={figure.avg_score}
                        color={scoreColor(figure.avg_score)}
                        size="sm"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      {/* The visible labels repeat down the column; the
                          accessible name says which figure each button acts on. */}
                      <Button
                        className="mr-1.5"
                        aria-label={`Ubah figur ${figure.name}`}
                        onClick={() => setEditing(figure)}
                      >
                        Ubah
                      </Button>
                      <Button
                        variant="danger"
                        aria-label={`Hapus figur ${figure.name}`}
                        onClick={() => setDeleting(figure)}
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
          title="Hapus figur"
          body={
            <>
              Hapus <strong className="font-semibold text-ink">{deleting.name}</strong>? Semua relasi
              yang melibatkan figur ini ({deleting.relationship_count}) juga akan terhapus. Tindakan
              ini tidak bisa dibatalkan.
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
