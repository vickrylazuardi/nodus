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
  ScoreRule,
  ScoreValue,
  TierChip,
  inputClass,
} from "@/components/ui";
import { ConfirmDialog } from "@/pages/admin/AdminApp";
import { api } from "@/lib/api";
import { formatSigned, scoreColor, tierColor } from "@/lib/format";
import type { Issue, Relationship } from "@/lib/types";

/* --------------------------------------------------------- score row schema */

/**
 * One row of the per-issue score editor. Mirrors the backend's
 * RelationshipIssueIn (app/schemas/__init__.py): score -100..100, weight 0..10,
 * stance optional.
 *
 * `invalid_type_error` is set on both numeric fields because a cleared
 * <input type="number"> registered with `valueAsNumber` stores NaN, and zod's
 * default message for that ("Expected number, received nan") is not something
 * an admin should read.
 */
const rowSchema = z.object({
  score: z
    .number({ invalid_type_error: "Isi skor dengan angka." })
    .min(-100, "Skor minimal -100.")
    .max(100, "Skor maksimal 100."),
  weight: z
    .number({ invalid_type_error: "Isi bobot dengan angka." })
    .min(0, "Bobot minimal 0.")
    .max(10, "Bobot maksimal 10."),
  stance: z.string(),
});

const scoreSchema = z.object({
  // Keyed by issue id as a string: the record only needs the rows the editor
  // renders, and `form.trigger(["rows.<id>.score", ...])` validates one row
  // without touching the rest.
  rows: z.record(z.string(), rowSchema),
});

type ScoreForm = z.infer<typeof scoreSchema>;
type RowValues = z.infer<typeof rowSchema>;

const rowField = (id: number, field: keyof RowValues) =>
  `rows.${id}.${field}` as const;
const rowInputId = (id: number, field: keyof RowValues) =>
  `rel-issue-${id}-${field}`;

/* ------------------------------------------------------- modifier schema */

const modifierSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Nama peristiwa wajib diisi.")
    .max(240, "Nama peristiwa maksimal 240 karakter."),
  value: z
    .number({ invalid_type_error: "Isi nilai dengan angka." })
    .int("Nilai harus bilangan bulat.")
    .min(-100, "Nilai minimal -100.")
    .max(100, "Nilai maksimal 100."),
  kind: z.string().min(1),
  expires_at: z.string(),
});

type ModifierForm = z.infer<typeof modifierSchema>;

const MODIFIER_FIELDS = [
  { field: "label", id: "modifier-label" },
  { field: "value", id: "modifier-value" },
  { field: "kind", id: "modifier-kind" },
  { field: "expires_at", id: "modifier-expires-at" },
] as const;

/* -------------------------------------------------- new relationship schema */

const relationshipSchema = z
  .object({
    source_id: z
      .number({ invalid_type_error: "Pilih figur A." })
      .int()
      .min(1, "Pilih figur A."),
    target_id: z
      .number({ invalid_type_error: "Pilih figur B." })
      .int()
      .min(1, "Pilih figur B."),
    rel_type: z.string().min(1),
  })
  // The backend rejects a self-pair ("source_id and target_id must differ"), so
  // the form says so before the round trip.
  .superRefine((values, ctx) => {
    if (values.source_id > 0 && values.source_id === values.target_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target_id"],
        message: "Figur A dan Figur B harus berbeda.",
      });
    }
  });

type RelationshipForm = z.infer<typeof relationshipSchema>;

const RELATIONSHIP_FIELDS = [
  { field: "source_id", id: "rel-source" },
  { field: "target_id", id: "rel-target" },
  { field: "rel_type", id: "rel-type" },
] as const;

/* ------------------------------------------------------------------ shared */

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

/** Narrows a possibly-missing error message away, preserving the item's own type. */
function hasMessage<T extends { message?: string }>(
  item: T,
): item is T & { message: string } {
  return typeof item.message === "string" && item.message.length > 0;
}

/** Focusable error summary shared by all three forms in this file. */
function ErrorSummary({
  summaryRef,
  heading,
  items,
}: {
  summaryRef: React.RefObject<HTMLDivElement | null>;
  heading: string;
  items: Array<{ id: string; message: string }>;
}) {
  if (items.length === 0) return null;
  return (
    <div
      ref={summaryRef}
      tabIndex={-1}
      role="alert"
      className="rounded-sm border border-hostile/40 bg-hostile/5 px-3.5 py-3"
    >
      <h3 className="text-[13px] font-semibold text-ink">{heading}</h3>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
        {items.map((item) => (
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
  );
}

/* ----------------------------------------------------------- score editor */

/**
 * The score editor is the heart of the admin: one slider per issue, live
 * recomputation, and the event modifiers that make a score decay over time.
 */
function ScoreEditor({
  relationship,
  kinds,
  onClose,
}: {
  relationship: Relationship;
  kinds: string[];
  onClose: () => void;
}) {
  const issuesQuery = useQuery({
    queryKey: ["issues"],
    queryFn: () => api.issues.list(),
  });

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

  // Mounted only once the issue list is known, so the form's default values can
  // be built synchronously from it: every issue gets a row, and issues that
  // already carry a score are seeded from the relationship.
  return (
    <ScoreEditorForm
      relationship={relationship}
      issues={issuesQuery.data.issues}
      kinds={kinds}
      onClose={onClose}
    />
  );
}

function ScoreEditorForm({
  relationship,
  issues,
  kinds,
  onClose,
}: {
  relationship: Relationship;
  issues: Issue[];
  kinds: string[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const seed = useMemo(() => {
    const saved = new Map(
      relationship.issues.map((issue) => [issue.issue_id, issue]),
    );
    const rows: Record<string, RowValues> = {};
    for (const issue of issues) {
      const existing = saved.get(issue.id);
      rows[String(issue.id)] = {
        score: existing?.score ?? 0,
        weight: existing?.weight ?? issue.default_weight,
        stance: existing?.stance ?? "",
      };
    }
    return rows;
  }, [relationship.issues, issues]);

  const form = useForm<ScoreForm>({
    resolver: zodResolver(scoreSchema),
    defaultValues: { rows: seed },
    shouldFocusError: false,
  });
  const { errors } = form.formState;
  const rows = form.watch("rows");

  const [savedIds, setSavedIds] = useState<Set<number>>(
    () => new Set(relationship.issues.map((issue) => issue.issue_id)),
  );
  const [showAll, setShowAll] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [failedAttempt, setFailedAttempt] = useState(0);
  const summaryRef = useRef<HTMLDivElement | null>(null);

  // Every validation failure re-focuses the summary, including repeated ones.
  useEffect(() => {
    if (failedAttempt > 0) summaryRef.current?.focus();
  }, [failedAttempt]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["relationships"] });
    void queryClient.invalidateQueries({
      queryKey: ["figure", relationship.source_id],
    });
    void queryClient.invalidateQueries({
      queryKey: ["figure", relationship.target_id],
    });
    void queryClient.invalidateQueries({ queryKey: ["stats"] });
  };

  const saveIssue = useMutation({
    mutationFn: async (issueId: number) => {
      const row = form.getValues(`rows.${issueId}`);
      await api.relationships.upsertIssue(relationship.id, {
        issue_id: issueId,
        score: row.score,
        weight: row.weight,
        stance: row.stance.trim() || null,
      });
    },
    onSuccess: (_data, issueId) => {
      setSavedIds((prev) => new Set(prev).add(issueId));
      setServerError(null);
      refresh();
    },
    onError: (err) => setServerError((err as Error).message),
  });

  const clearIssue = useMutation({
    mutationFn: (issueId: number) =>
      api.relationships.removeIssue(relationship.id, issueId),
    onSuccess: (_data, issueId) => {
      const issue = issues.find((i) => i.id === issueId);
      form.setValue(`rows.${issueId}`, {
        score: 0,
        weight: issue?.default_weight ?? 1,
        stance: "",
      });
      form.clearErrors(`rows.${issueId}`);
      setSavedIds((prev) => {
        const next = new Set(prev);
        next.delete(issueId);
        return next;
      });
      refresh();
    },
  });

  const addModifier = useMutation({
    mutationFn: (values: ModifierForm) =>
      api.relationships.addModifier(relationship.id, {
        label: values.label.trim(),
        value: values.value,
        kind: values.kind,
        expires_at: values.expires_at
          ? `${values.expires_at}T23:59:59+00:00`
          : null,
      }),
    onSuccess: () => {
      modifierForm.reset({
        label: "",
        value: 0,
        kind: "event",
        expires_at: new Date(Date.now() + 180 * 86_400_000)
          .toISOString()
          .slice(0, 10),
      });
      setServerError(null);
      refresh();
    },
    onError: (err) => setServerError((err as Error).message),
  });

  const removeModifier = useMutation({
    mutationFn: (id: number) => api.modifiers.remove(id),
    onSuccess: refresh,
  });

  const modifierForm = useForm<ModifierForm>({
    resolver: zodResolver(modifierSchema),
    defaultValues: {
      label: "",
      value: 0,
      kind: "event",
      expires_at: new Date(Date.now() + 180 * 86_400_000)
        .toISOString()
        .slice(0, 10),
    },
    shouldFocusError: false,
  });
  const modifierErrors = modifierForm.formState.errors;
  const modifierSummaryRef = useRef<HTMLDivElement | null>(null);
  const [modifierFailed, setModifierFailed] = useState(0);

  useEffect(() => {
    if (modifierFailed > 0) modifierSummaryRef.current?.focus();
  }, [modifierFailed]);

  const modifierSummaryItems = MODIFIER_FIELDS.map(({ field, id }) => ({
    id,
    message: modifierErrors[field]?.message,
  })).filter(hasMessage);

  const onAddModifier = modifierForm.handleSubmit(
    (values) => {
      setServerError(null);
      addModifier.mutate(values);
    },
    () => setModifierFailed((n) => n + 1),
  );

  /*
   * Per-row save. `trigger` with dotted paths validates only this row — the
   * rest of the record is untouched — and it works before the form has ever
   * been submitted, which is what makes inline per-row errors possible.
   */
  const saveRow = async (issue: Issue) => {
    const valid = await form.trigger([
      rowField(issue.id, "score"),
      rowField(issue.id, "weight"),
    ]);
    if (!valid) {
      setFailedAttempt((n) => n + 1);
      return;
    }
    setServerError(null);
    saveIssue.mutate(issue.id);
  };

  // Live preview mirrors the backend formula so the admin sees the effect
  // before saving: weighted mean of issue scores, plus active modifiers.
  const preview = useMemo(() => {
    let weighted = 0;
    let totalWeight = 0;
    let filled = 0;

    for (const issue of issues) {
      if (!savedIds.has(issue.id)) continue;
      const row = rows[String(issue.id)];
      if (!row) continue;
      weighted += row.score * row.weight;
      totalWeight += row.weight;
      filled += 1;
    }

    const base = totalWeight > 0 ? weighted / totalWeight : 0;
    const modifierTotal = relationship.modifiers.reduce(
      (sum, m) => sum + m.effective_value,
      0,
    );
    const raw = base + modifierTotal;

    // Mirror the server's soft clamp so the preview matches the published score.
    const sign = raw < 0 ? -1 : 1;
    const bounded = Math.min(100, Math.max(-100, raw));
    const soft =
      Math.abs(bounded) <= 85
        ? bounded
        : sign * (85 + 15 * (1 - Math.exp(-(Math.abs(bounded) - 85) / 15)));

    return { base, modifierTotal, total: soft, filled };
  }, [rows, savedIds, issues, relationship.modifiers]);

  const filledIssues = issues.filter((issue) => savedIds.has(issue.id));
  const emptyIssues = issues.filter((issue) => !savedIds.has(issue.id));
  const visible = showAll ? issues : filledIssues;

  // The summary lists every failing row, labelled with its issue name, and
  // each entry links to the exact input.
  const summaryItems = useMemo(() => {
    const rowErrors = errors.rows ?? {};
    const items: Array<{ id: string; message: string }> = [];
    for (const [id, rowError] of Object.entries(rowErrors)) {
      const issue = issues.find((i) => String(i.id) === id);
      for (const field of ["score", "weight", "stance"] as const) {
        const message = rowError?.[field]?.message;
        if (!message) continue;
        items.push({
          id: rowInputId(Number(id), field),
          message: `${issue?.name ?? "Isu"}: ${message}`,
        });
      }
    }
    return items;
  }, [errors.rows, issues]);

  return (
    <Panel>
      <PanelHeader
        title={`${relationship.source_name} ↔ ${relationship.target_name}`}
        description="Atur skor tiap isu. Skor akhir dihitung otomatis dari rata-rata berbobot, ditambah modifier peristiwa."
        actions={
          <Button onClick={onClose} disabled={saveIssue.isPending}>
            Tutup
          </Button>
        }
      />

      {summaryItems.length > 0 ? (
        <div className="mb-4">
          <ErrorSummary
            summaryRef={summaryRef}
            heading="Periksa kembali skor berikut."
            items={summaryItems}
          />
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-sm border border-rule bg-neutral-sunk px-4 py-3 text-[13px]">
        <span>
          Isu terisi:{" "}
          <strong className="tabular font-semibold">{preview.filled}</strong>
        </span>
        <span>
          Dasar (rata-rata berbobot):{" "}
          <strong
            className="tabular font-semibold"
            style={{ color: scoreColor(preview.base) }}
          >
            {formatSigned(preview.base)}
          </strong>
        </span>
        <span>
          Modifier:{" "}
          <strong
            className="tabular font-semibold"
            style={{ color: scoreColor(preview.modifierTotal) }}
          >
            {formatSigned(preview.modifierTotal)}
          </strong>
        </span>
        <span>
          Skor akhir:{" "}
          <strong
            className="tabular font-semibold"
            style={{ color: scoreColor(preview.total) }}
          >
            {formatSigned(preview.total)}
          </strong>
        </span>
        {relationship.score_mode !== "computed" ? (
          <span className="rounded-sm border border-rule bg-neutral-raised px-2 py-0.5 text-[11px]">
            mode {relationship.score_mode}, skor publik memakai{" "}
            {relationship.manual_score}
          </span>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[14px]">Skor per isu</h3>
        <div className="flex gap-2">
          <Button onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Ringkas" : `Buka semua (${issues.length})`}
          </Button>
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {visible.map((issue) => {
          const row = rows[String(issue.id)] ?? {
            score: 0,
            weight: issue.default_weight,
            stance: "",
          };
          const scoreError = errors.rows?.[String(issue.id)]?.score?.message;
          const weightError = errors.rows?.[String(issue.id)]?.weight?.message;
          const isSaved = savedIds.has(issue.id);

          return (
            <li
              key={issue.id}
              className="rounded-md border border-rule bg-neutral-sunk/40 p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="text-[13.5px] font-semibold">
                    {issue.name}
                  </span>
                  <span className="ml-2 text-[11.5px] text-ink-soft">
                    {issue.category ?? "–"} · bobot bawaan ×
                    {issue.default_weight}
                    {isSaved ? " · sudah diisi" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <ScoreValue
                    score={row.score}
                    color={scoreColor(row.score)}
                    size="md"
                  />
                  {isSaved ? (
                    <Button
                      variant="danger"
                      aria-label={`Kosongkan skor isu ${issue.name}`}
                      onClick={() => clearIssue.mutate(issue.id)}
                    >
                      Kosongkan
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <input
                  {...form.register(rowField(issue.id, "score"), {
                    valueAsNumber: true,
                  })}
                  id={rowInputId(issue.id, "score")}
                  type="range"
                  min={-100}
                  max={100}
                  step={5}
                  aria-label={`Skor untuk ${issue.name}`}
                  aria-invalid={scoreError ? true : undefined}
                  aria-describedby={
                    scoreError
                      ? `${rowInputId(issue.id, "score")}-error`
                      : undefined
                  }
                  className="flex-1 accent-[#9A6B2F]"
                />
              </div>
              <FieldError
                id={`${rowInputId(issue.id, "score")}-error`}
                message={scoreError}
              />

              <div className="mt-3 grid gap-3 sm:grid-cols-[130px_1fr]">
                <div>
                  <Field label="Bobot">
                    <input
                      {...form.register(rowField(issue.id, "weight"), {
                        valueAsNumber: true,
                      })}
                      id={rowInputId(issue.id, "weight")}
                      className={inputClass}
                      type="number"
                      step={0.1}
                      min={0}
                      max={10}
                      // The visible label repeats down the list, so the
                      // accessible name carries the issue.
                      aria-label={`Bobot untuk ${issue.name}`}
                      aria-invalid={weightError ? true : undefined}
                      aria-describedby={
                        weightError
                          ? `${rowInputId(issue.id, "weight")}-error`
                          : undefined
                      }
                    />
                  </Field>
                  <FieldError
                    id={`${rowInputId(issue.id, "weight")}-error`}
                    message={weightError}
                  />
                </div>
                <Field label="Posisi atau sikap">
                  <input
                    {...form.register(rowField(issue.id, "stance"))}
                    id={rowInputId(issue.id, "stance")}
                    className={inputClass}
                    placeholder="misalnya “Menolak RUU prioritas pemerintah”"
                    aria-label={`Posisi atau sikap untuk ${issue.name}`}
                  />
                </Field>
              </div>

              <div className="mt-3 flex justify-end">
                <Button
                  variant="primary"
                  onClick={() => void saveRow(issue)}
                  disabled={saveIssue.isPending}
                  aria-label={`Simpan isu ${issue.name}`}
                >
                  Simpan isu ini
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {!showAll && emptyIssues.length > 0 ? (
        <p className="mt-3 text-[12.5px] text-ink-soft">
          {emptyIssues.length} isu belum diisi dan disembunyikan. Klik “Buka
          semua” untuk mengisinya.
        </p>
      ) : null}

      <h3 className="mb-3 mt-7 text-[14px]">Peristiwa dan modifier</h3>
      <p className="mb-3 text-[12.5px] text-ink-soft">
        Peristiwa memberi tambahan sementara pada skor. Nilainya memudar
        otomatis saat mendekati tanggal kedaluwarsa.
      </p>

      {relationship.modifiers.length === 0 ? (
        <EmptyState title="Belum ada peristiwa untuk relasi ini." />
      ) : (
        <ul className="mb-4 flex flex-col gap-2">
          {relationship.modifiers.map((modifier) => (
            <li
              key={modifier.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-rule px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold">
                  {modifier.label}
                </div>
                <div className="text-[11.5px] text-ink-soft">
                  {modifier.kind} · nilai asli {formatSigned(modifier.value, 0)}{" "}
                  · efektif {formatSigned(modifier.effective_value)} (faktor{" "}
                  {modifier.fade})
                  {modifier.expires_at
                    ? ` · sampai ${modifier.expires_at.slice(0, 10)}`
                    : " · permanen"}
                </div>
              </div>
              {modifier.id !== null ? (
                <Button
                  variant="danger"
                  aria-label={`Hapus peristiwa ${modifier.label}`}
                  onClick={() => removeModifier.mutate(modifier.id as number)}
                >
                  Hapus
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <form
        className="grid gap-3 rounded-md border border-dashed border-rule p-4 sm:grid-cols-[1fr_110px_140px_150px_auto]"
        onSubmit={onAddModifier}
        noValidate
      >
        {modifierSummaryItems.length > 0 ? (
          <div className="sm:col-span-5">
            <ErrorSummary
              summaryRef={modifierSummaryRef}
              heading="Periksa kembali isian berikut."
              items={modifierSummaryItems}
            />
          </div>
        ) : null}

        <div>
          <Field label="Peristiwa baru">
            <input
              {...modifierForm.register("label")}
              id="modifier-label"
              className={inputClass}
              placeholder="misalnya “PDI-P bergabung ke pemerintahan”"
              aria-invalid={modifierErrors.label ? true : undefined}
              aria-describedby={
                modifierErrors.label ? "modifier-label-error" : undefined
              }
            />
          </Field>
          <FieldError
            id="modifier-label-error"
            message={modifierErrors.label?.message}
          />
        </div>
        <div>
          <Field label="Nilai">
            <input
              {...modifierForm.register("value", { valueAsNumber: true })}
              id="modifier-value"
              className={inputClass}
              type="number"
              min={-100}
              max={100}
              aria-invalid={modifierErrors.value ? true : undefined}
              aria-describedby={
                modifierErrors.value ? "modifier-value-error" : undefined
              }
            />
          </Field>
          <FieldError
            id="modifier-value-error"
            message={modifierErrors.value?.message}
          />
        </div>
        <Field label="Jenis">
          <select
            {...modifierForm.register("kind")}
            id="modifier-kind"
            className={inputClass}
          >
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kedaluwarsa">
          <input
            {...modifierForm.register("expires_at")}
            id="modifier-expires-at"
            className={inputClass}
            type="date"
          />
        </Field>
        <div className="flex items-end">
          <Button
            variant="primary"
            type="submit"
            disabled={addModifier.isPending}
          >
            {addModifier.isPending ? "…" : "Tambah"}
          </Button>
        </div>
      </form>

      {serverError ? (
        <p role="alert" className="mt-3 text-[13px] text-hostile">
          {serverError}
        </p>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------- list */

export function AdminRelationships() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Relationship | null>(null);
  const [deleting, setDeleting] = useState<Relationship | null>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  /*
   * Relationship kinds come from the API rather than a literal in this file.
   * There were three copies of this list (scoring.py, the importer, and a
   * hardcoded array here) and they had already drifted: `alliance` was missing
   * from all three while 25 rows of the real dataset use it, so this dropdown
   * could not express the kind of a fifth of the data.
   */
  const tiersQuery = useQuery({ queryKey: ["tiers"], queryFn: api.tiers });
  const relTypes = tiersQuery.data?.rel_types ?? ["political"];
  const modifierKinds = tiersQuery.data?.modifier_kinds ?? ["event"];

  const relationshipsQuery = useQuery({
    queryKey: ["relationships"],
    queryFn: () => api.relationships.list(),
  });
  const figuresQuery = useQuery({
    queryKey: ["figures"],
    queryFn: () => api.figures.list(),
  });

  const createForm = useForm<RelationshipForm>({
    resolver: zodResolver(relationshipSchema),
    defaultValues: { source_id: 0, target_id: 0, rel_type: "political" },
    shouldFocusError: false,
  });
  const createErrors = createForm.formState.errors;
  const createSummaryRef = useRef<HTMLDivElement | null>(null);
  const [createFailed, setCreateFailed] = useState(0);

  useEffect(() => {
    if (createFailed > 0) createSummaryRef.current?.focus();
  }, [createFailed]);

  const createSummaryItems = RELATIONSHIP_FIELDS.map(({ field, id }) => ({
    id,
    message: createErrors[field]?.message,
  })).filter(hasMessage);

  const createRel = useMutation({
    mutationFn: (values: RelationshipForm) =>
      api.relationships.create({
        source_id: values.source_id,
        target_id: values.target_id,
        rel_type: values.rel_type,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["relationships"] });
      setCreating(false);
      createForm.reset({ source_id: 0, target_id: 0, rel_type: "political" });
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.relationships.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["relationships"] });
      void queryClient.invalidateQueries({ queryKey: ["figures"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
      setDeleting(null);
    },
  });

  const filtered = useMemo(() => {
    const relationships = relationshipsQuery.data?.relationships ?? [];
    if (!query.trim()) return relationships;
    const needle = query.trim().toLowerCase();
    return relationships.filter((r) =>
      `${r.source_name} ${r.target_name}`.toLowerCase().includes(needle),
    );
  }, [relationshipsQuery.data, query]);

  if (editing)
    return (
      <ScoreEditor
        relationship={editing}
        kinds={modifierKinds}
        onClose={() => setEditing(null)}
      />
    );

  if (relationshipsQuery.isPending || figuresQuery.isPending) {
    return (
      <Panel>
        <LoadingState what="relasi" />
      </Panel>
    );
  }

  if (relationshipsQuery.isError || figuresQuery.isError) {
    const error = (relationshipsQuery.error ?? figuresQuery.error) as Error;
    return (
      <Panel>
        <ErrorState
          message={error.message}
          onRetry={() => {
            void relationshipsQuery.refetch();
            void figuresQuery.refetch();
          }}
        />
      </Panel>
    );
  }

  const figures = figuresQuery.data.figures;
  const relationships = relationshipsQuery.data.relationships;

  const onCreateSubmit = createForm.handleSubmit(
    (values) => createRel.mutate(values),
    () => setCreateFailed((n) => n + 1),
  );

  return (
    <>
      <Panel>
        <PanelHeader
          title="Relasi"
          description={`${relationships.length} relasi terpetakan. Klik “Skor dan isu” untuk mengubah skor per isu dan peristiwa.`}
          actions={
            <>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter nama…"
                aria-label="Filter relasi"
                className={
                  // min-h-[44px] is the touch-target floor. This field
                  // hand-rolls the input styles instead of using inputClass,
                  // so it missed the shared fix and measured 38px.
                  "min-h-[44px] w-[200px] rounded-sm border border-rule bg-neutral-raised px-2.5 py-2 text-[13px]"
                }
              />
              <Button variant="primary" onClick={() => setCreating((v) => !v)}>
                Relasi baru
              </Button>
            </>
          }
        />

        {creating ? (
          <form
            className="mb-5 grid gap-3 rounded-md border border-dashed border-rule p-4 sm:grid-cols-[1fr_1fr_150px_auto]"
            onSubmit={onCreateSubmit}
            noValidate
          >
            {createSummaryItems.length > 0 ? (
              <div className="sm:col-span-4">
                <ErrorSummary
                  summaryRef={createSummaryRef}
                  heading="Periksa kembali isian berikut."
                  items={createSummaryItems}
                />
              </div>
            ) : null}

            <div>
              <Field label="Figur A">
                <select
                  {...createForm.register("source_id", { valueAsNumber: true })}
                  id="rel-source"
                  className={inputClass}
                  aria-invalid={createErrors.source_id ? true : undefined}
                  aria-describedby={
                    createErrors.source_id ? "rel-source-error" : undefined
                  }
                >
                  <option value={0}>Pilih figur…</option>
                  {figures.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </Field>
              <FieldError
                id="rel-source-error"
                message={createErrors.source_id?.message}
              />
            </div>
            <div>
              <Field label="Figur B">
                <select
                  {...createForm.register("target_id", { valueAsNumber: true })}
                  id="rel-target"
                  className={inputClass}
                  aria-invalid={createErrors.target_id ? true : undefined}
                  aria-describedby={
                    createErrors.target_id ? "rel-target-error" : undefined
                  }
                >
                  <option value={0}>Pilih figur…</option>
                  {figures.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </Field>
              <FieldError
                id="rel-target-error"
                message={createErrors.target_id?.message}
              />
            </div>
            <Field label="Jenis">
              <select
                {...createForm.register("rel_type")}
                id="rel-type"
                className={inputClass}
              >
                {relTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-end">
              <Button
                variant="primary"
                type="submit"
                disabled={createRel.isPending}
              >
                {createRel.isPending ? "…" : "Simpan"}
              </Button>
            </div>
          </form>
        ) : null}

        {createRel.isError ? (
          <p role="alert" className="mb-4 text-[13px] text-hostile">
            {(createRel.error as Error).message}
          </p>
        ) : null}

        {filtered.length === 0 ? (
          <EmptyState
            title={`Tidak ada relasi yang cocok dengan "${query}".`}
            action={<Button onClick={() => setQuery("")}>Hapus filter</Button>}
          />
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <caption className="sr-only">
                Daftar relasi antar figur dengan skor, dasar, modifier, jumlah
                isu, dan tingkat hubungan.
              </caption>
              <thead>
                <tr className="border-b border-rule text-left">
                  {[
                    "Figur A",
                    "Figur B",
                    "Skor",
                    "Dasar",
                    "Modifier",
                    "Isu",
                    "Tingkat",
                  ].map((head) => (
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
                {filtered.map((rel) => (
                  <tr
                    key={rel.id}
                    className="border-b border-rule/60 hover:bg-neutral-sunk/50"
                  >
                    <th
                      scope="row"
                      className="px-3 py-2.5 text-left font-normal"
                    >
                      {rel.source_name}
                    </th>
                    <td className="px-3 py-2.5">{rel.target_name}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <ScoreValue
                          score={rel.score}
                          color={scoreColor(rel.score)}
                          size="sm"
                        />
                        <span className="w-[70px]">
                          <ScoreRule
                            score={rel.score}
                            color={scoreColor(rel.score)}
                            height={4}
                            label={`Skor ${rel.score}`}
                          />
                        </span>
                      </div>
                    </td>
                    <td className="tabular px-3 py-2.5 text-ink-soft">
                      {formatSigned(rel.base_score)}
                    </td>
                    <td
                      className="tabular px-3 py-2.5"
                      style={{ color: scoreColor(rel.modifier_total) }}
                    >
                      {formatSigned(rel.modifier_total)}
                    </td>
                    <td className="tabular px-3 py-2.5">{rel.issues.length}</td>
                    <td className="px-3 py-2.5">
                      <TierChip
                        label={rel.tier.label}
                        color={tierColor(rel.tier)}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <Button
                        variant="primary"
                        className="mr-1.5"
                        aria-label={`Ubah skor ${rel.source_name} dan ${rel.target_name}`}
                        onClick={() => setEditing(rel)}
                      >
                        Skor dan isu
                      </Button>
                      <Button
                        variant="danger"
                        aria-label={`Hapus relasi ${rel.source_name} dan ${rel.target_name}`}
                        onClick={() => setDeleting(rel)}
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
          title="Hapus relasi"
          body={
            <>
              Hapus relasi antara{" "}
              <strong className="font-semibold text-ink">
                {deleting.source_name}
              </strong>{" "}
              dan{" "}
              <strong className="font-semibold text-ink">
                {deleting.target_name}
              </strong>
              ? Semua skor isu dan peristiwa pada relasi ini ikut terhapus.
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
