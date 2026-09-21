import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  PanelHeader,
  ScoreRule,
  ScoreValue,
  Tag,
  TierChip,
} from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, formatSigned, initials, scoreColor, tierColor } from "@/lib/format";
import type { FigureRelationship } from "@/lib/types";

function IssueBreakdown({ relationship }: { relationship: FigureRelationship }) {
  return (
    <div className="mt-4 border-t border-dashed border-rule pt-4">
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ink-soft">
        <span>
          Skor dasar isu:{" "}
          <strong className="tabular font-semibold text-ink">
            {formatSigned(relationship.base_score)}
          </strong>
        </span>
        <span>
          Modifier aktif:{" "}
          <strong className="tabular font-semibold text-ink">
            {formatSigned(relationship.modifier_total)}
          </strong>
        </span>
        <span>
          Total:{" "}
          <strong
            className="tabular font-semibold"
            style={{ color: scoreColor(relationship.score) }}
          >
            {relationship.score > 0 ? "+" : ""}
            {relationship.score}
          </strong>
        </span>
        <span className="text-ink-soft">Mode: {relationship.score_mode}</span>
      </div>

      {relationship.notes ? (
        <p className="mb-4 max-w-prose text-[12.5px] italic text-ink-soft">
          {relationship.notes}
        </p>
      ) : null}

      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
        Rincian per isu
      </h4>
      <ul className="flex flex-col gap-2">
        {relationship.issues.map((issue) => (
          <li
            key={issue.issue_id}
            className="rounded-sm border border-rule bg-neutral-sunk/60 px-3 py-2.5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[13px] font-semibold">{issue.issue}</span>
              <ScoreValue score={issue.score} color={scoreColor(issue.score)} size="sm" />
            </div>
            <div className="mt-2">
              <ScoreRule
                score={issue.score}
                color={scoreColor(issue.score)}
                height={4}
                label={`${issue.issue}: ${issue.score}`}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-soft">
              <span className="rounded-sm border border-rule bg-neutral-raised px-1.5 py-0.5">
                bobot ×{issue.weight}
              </span>
              <span className="rounded-sm border border-rule bg-neutral-raised px-1.5 py-0.5">
                kontribusi {formatSigned(issue.contribution)}
              </span>
              {issue.category ? (
                <span className="rounded-sm border border-rule bg-neutral-raised px-1.5 py-0.5">
                  {issue.category}
                </span>
              ) : null}
              {issue.evidence_url ? (
                <a
                  href={issue.evidence_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center text-primary-ink underline"
                >
                  sumber
                </a>
              ) : null}
            </div>
            {issue.stance ? (
              <p className="mt-2 text-[12px] italic text-ink-soft">“{issue.stance}”</p>
            ) : null}
          </li>
        ))}
      </ul>

      {relationship.modifiers.length > 0 ? (
        <>
          <h4 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
            Peristiwa (memudar sesuai waktu)
          </h4>
          <ul className="flex flex-col gap-2">
            {relationship.modifiers.map((modifier) => (
              <li
                key={`${modifier.id}-${modifier.label}`}
                className="flex flex-wrap items-start gap-x-3 gap-y-1.5 rounded-sm border border-rule bg-neutral-sunk/60 px-3 py-2"
              >
                <span
                  className="tabular shrink-0 text-[15px] font-semibold"
                  style={{ color: scoreColor(modifier.value) }}
                >
                  {formatSigned(modifier.value, 0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px]">{modifier.label}</span>
                  {modifier.note ? (
                    <span className="block text-[11.5px] text-ink-soft">{modifier.note}</span>
                  ) : null}
                  <span className="mt-1 block h-[3px] w-full overflow-hidden rounded-full bg-neutral-raised">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${modifier.fade * 100}%` }}
                    />
                  </span>
                </span>
                {/*
                 * The kind and expiry drop to their own line on a phone.
                 *
                 * Measured at 320px: this column beside the label left the label
                 * only 66px, and a single word like "Kemenangan" needs 71px, so
                 * event labels were clipped mid-word. Full width on a phone,
                 * back inline from sm where there is room for three columns.
                 */}
                <span className="w-full text-left text-[10.5px] leading-tight text-ink-soft sm:w-auto sm:shrink-0 sm:text-right">
                  {modifier.kind}
                  {modifier.expires_at ? (
                    <>
                      <br />
                      s/d {formatDate(modifier.expires_at)}
                    </>
                  ) : (
                    <>
                      <br />
                      permanen
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function RelationshipRow({
  relationship,
  figureName,
}: {
  relationship: FigureRelationship;
  figureName: string;
}) {
  const [open, setOpen] = useState(false);
  const color = scoreColor(relationship.score);

  return (
    <li className="rounded-md border border-rule bg-neutral-raised">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="min-h-[44px] w-full px-3.5 py-3 text-left"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-rule bg-neutral-sunk font-display text-[11.5px] font-semibold text-primary-ink"
            >
              {initials(relationship.counterpart_name)}
            </span>
            <span className="min-w-0">
              {/*
               * Names wrap on a phone and truncate only where there is room.
               *
               * Measured at 320px: the row offers the name 123px beside the
               * avatar and the score chip, but Indonesian names run to 191px
               * ("Agus Gumiwang Kartasasmita"), so `truncate` was cutting
               * precisely the part that tells two similar names apart. The row
               * is already around 90px tall, so a second line of name costs
               * nothing and keeps the information.
               */}
              <span className="block text-[14px] font-semibold leading-snug sm:truncate">
                {relationship.counterpart_name}
              </span>
              {/*
               * The party and bloc wrap rather than truncate on a phone.
               *
               * Measured at 390px: this line needs 265px but the row only offers
               * 193px beside the score chip, so `truncate` was hiding the bloc
               * on 46 of 46 rows. A single line of metadata is not worth losing
               * the information for; it wraps to two lines instead.
               */}
              <span className="block text-[11.5px] leading-snug text-ink-soft sm:truncate">
                {relationship.counterpart_party ?? "–"}
                {relationship.counterpart_bloc ? ` · ${relationship.counterpart_bloc}` : ""}
              </span>
            </span>
          </span>
          <ScoreValue score={relationship.score} color={color} size="md" />
        </div>

        <div className="mt-2.5">
          <ScoreRule
            score={relationship.score}
            color={color}
            label={`${figureName} dan ${relationship.counterpart_name}: ${relationship.score}`}
          />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <TierChip label={relationship.tier.label} color={tierColor(relationship.tier)} />
          <span className="text-[11.5px] text-ink-soft">
            {relationship.issues.length} isu · {relationship.rel_type} ·{" "}
            {open ? "tutup rincian" : "lihat rincian"}
          </span>
        </div>
      </button>

      {open ? (
        <div className="px-3.5 pb-4">
          <IssueBreakdown relationship={relationship} />
        </div>
      ) : null}
    </li>
  );
}

export function FigureDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const detailQuery = useQuery({
    queryKey: ["figure", id],
    queryFn: () => api.figures.get(id),
    enabled: Number.isFinite(id) && id > 0,
  });

  if (!Number.isFinite(id) || id <= 0) {
    return (
      <Panel>
        <ErrorState message="Alamat figur tidak valid." />
      </Panel>
    );
  }

  if (detailQuery.isPending) {
    return (
      <Panel>
        <LoadingState what="profil figur" />
      </Panel>
    );
  }

  if (detailQuery.isError) {
    return (
      <Panel>
        <ErrorState
          message={(detailQuery.error as Error).message}
          onRetry={() => void detailQuery.refetch()}
        />
      </Panel>
    );
  }

  const { figure, relationships, issue_summary, summary, tier } = detailQuery.data;

  return (
    <div className="flex flex-col gap-5">
      <Link
        to="/figur"
        className="inline-flex min-h-[44px] w-fit items-center text-[13px] text-ink-soft hover:text-primary-ink"
      >
        ← Semua figur
      </Link>

      <Panel>
        {/*
         * Header layout, three states:
         *
         *   below sm  one column. The identity block takes the full width and
         *             the score rail sits underneath it.
         *   sm to lg  identity beside the rail, identity keeping a readable
         *             floor.
         *   lg up     the desktop arrangement.
         *
         * The mobile state exists because measurement at 390px showed the name
         * column squeezed to 47px with the name box itself at 0px: the avatar
         * is 76px, and `flex-1` on the identity block lost the space contest to
         * the 237px score rail, so the figure's own name was invisible. Stacking
         * removes the contest entirely rather than tuning it.
         */}
        <div className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-6">
          <div className="flex min-w-0 flex-1 gap-4 lg:min-w-[280px]">
            <span
              aria-hidden="true"
              className="grid h-[64px] w-[64px] shrink-0 place-items-center rounded-full border-2 border-rule bg-neutral-sunk font-display text-[22px] font-semibold text-primary-ink sm:h-[76px] sm:w-[76px] sm:text-[25px]"
            >
              {initials(figure.name)}
            </span>
            {/*
             * min-w-0 so long names and bios wrap instead of widening the
             * masthead past the viewport.
             */}
            <div className="min-w-0">
              <h1 className="text-[22px] leading-tight sm:text-[26px]">{figure.name}</h1>
              {figure.full_name ? (
                <p className="text-[12.5px] text-ink-soft">{figure.full_name}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {figure.role ? <Tag>{figure.role}</Tag> : null}
                {figure.party ? <Tag>{figure.party}</Tag> : null}
                {figure.bloc ? <Tag>{figure.bloc}</Tag> : null}
                {figure.region ? <Tag>{figure.region}</Tag> : null}
              </div>
              {figure.bio ? (
                <p className="mt-3 max-w-prose text-[13px] text-ink-soft">{figure.bio}</p>
              ) : null}
            </div>
          </div>

          {/*
           * On a phone the rail becomes a full-width row: the average score on
           * the left, the four counts filling the remaining width. It keeps its
           * own row rather than competing with the name for horizontal space.
           */}
          <div className="flex w-full flex-wrap items-center gap-5 border-t border-rule pt-4 sm:w-auto sm:gap-7 sm:border-0 sm:pt-0">
            <div className="text-center">
              <div
                className="tabular font-display text-[34px] font-bold leading-none sm:text-[40px]"
                style={{ color: scoreColor(summary.avg_score) }}
              >
                {summary.avg_score > 0 ? "+" : ""}
                {summary.avg_score}
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.08em] text-ink-soft">
                Rata-rata
              </div>
              <div className="mt-1.5">
                <TierChip label={tier.label} color={tierColor(tier)} />
              </div>
            </div>

            {/*
             * gap-x-2 rather than gap-x-3 on a phone: "Pengaruh" needs 59px at
             * 10.5px uppercase with 0.06em tracking, and at 320px the two
             * columns came to 57px each, so it clipped by 2px on figures whose
             * score string is widest. The tighter gutter buys the difference
             * without touching the type size or the tracking.
             */}
            <dl className="grid flex-1 grid-cols-2 gap-x-2 gap-y-3 sm:flex-none sm:gap-x-6">
              <div>
                <dd className="tabular text-[17px] font-semibold sm:text-[19px]">
                  {summary.relationship_count}
                </dd>
                <dt className="text-[10.5px] uppercase tracking-[0.06em] text-ink-soft">Relasi</dt>
              </div>
              <div>
                <dd className="tabular text-[17px] font-semibold sm:text-[19px]">
                  {figure.influence}
                </dd>
                {/*
                 * "Pengaruh" is the longest of the four labels: at 10.5px
                 * uppercase with tracking it needs 59px, and a 4-column phone
                 * grid only offered 47px, so it clipped. Two columns give it
                 * room without shrinking the type below the legibility floor.
                 */}
                <dt className="text-[10.5px] uppercase tracking-[0.06em] text-ink-soft">
                  Pengaruh
                </dt>
              </div>
              <div>
                <dd className="tabular text-[17px] font-semibold sm:text-[19px]">
                  {summary.allies.length}
                </dd>
                <dt className="text-[10.5px] uppercase tracking-[0.06em] text-ink-soft">
                  Sekutu
                </dt>
              </div>
              <div>
                <dd className="tabular text-[17px] font-semibold sm:text-[19px]">
                  {summary.rivals.length}
                </dd>
                <dt className="text-[10.5px] uppercase tracking-[0.06em] text-ink-soft">Rival</dt>
              </div>
            </dl>
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,0.95fr)]">
        {/*
         * min-w-0 on both tracks: a grid item defaults to min-width:auto, so
         * the single-column layout below lg could not shrink past the longest
         * unbreakable row inside it and the page scrolled sideways at 390px.
         *
         * Order is swapped on mobile. The relationship list is 46 rows and
         * measured 5751px tall in one column, so the two summary panels below
         * it were buried under roughly six thousand pixels of scrolling. On a
         * phone the compact overview comes first and the long list follows;
         * from lg up the list is back on the left where it belongs.
         */}
        <Panel className="order-2 min-w-0 lg:order-1">
          <PanelHeader
            title={`Relasi (${relationships.length})`}
            description="Klik satu relasi untuk melihat rincian skor per isu, bobotnya, dan peristiwa yang memengaruhi."
          />
          {relationships.length === 0 ? (
            <EmptyState title="Figur ini belum punya relasi terpetakan." />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {relationships.map((relationship) => (
                <RelationshipRow
                  key={relationship.id}
                  relationship={relationship}
                  figureName={figure.name}
                />
              ))}
            </ul>
          )}
        </Panel>

        <div className="order-1 flex min-w-0 flex-col gap-5 lg:order-2">
          <Panel>
            <PanelHeader
              title="Posisi per isu"
              description="Rata-rata skor figur ini pada tiap isu di seluruh relasinya."
            />
            {issue_summary.length === 0 ? (
              <EmptyState title="Belum ada skor isu." />
            ) : (
              <ul className="flex flex-col gap-2.5">
                {issue_summary.slice(0, 14).map((entry) => (
                  <li key={entry.issue_id} className="rounded-sm border border-rule px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12.5px] font-semibold">{entry.issue}</span>
                      <ScoreValue
                        score={entry.weighted_avg}
                        color={scoreColor(entry.weighted_avg)}
                        size="sm"
                      />
                    </div>
                    <div className="mt-1.5">
                      <ScoreRule
                        score={entry.weighted_avg}
                        color={scoreColor(entry.weighted_avg)}
                        height={4}
                        label={`${entry.issue}: ${entry.weighted_avg}`}
                      />
                    </div>
                    <div className="mt-1.5 text-[10.5px] text-ink-soft">
                      {entry.n} relasi · rentang {entry.min > 0 ? "+" : ""}
                      {entry.min} sampai {entry.max > 0 ? "+" : ""}
                      {entry.max}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Sekutu dan rival" />
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
              Sekutu terdekat
            </h3>
            {summary.allies.length === 0 ? (
              <p className="text-[12.5px] text-ink-soft">Belum ada sekutu (skor ≥ +30).</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {summary.allies.slice(0, 5).map((ally) => (
                  <li key={ally.id}>
                    <Link
                      to={`/figur/${ally.id}`}
                      className="flex min-h-[44px] items-center justify-between gap-3 rounded-sm border border-rule px-3 py-2 hover:border-primary"
                    >
                      <span className="truncate text-[13px]">{ally.name}</span>
                      <ScoreValue score={ally.score} color={scoreColor(ally.score)} size="sm" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
              Rival terberat
            </h3>
            {summary.rivals.length === 0 ? (
              <p className="text-[12.5px] text-ink-soft">Belum ada rival (skor ≤ −8).</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {summary.rivals.slice(0, 5).map((rival) => (
                  <li key={rival.id}>
                    <Link
                      to={`/figur/${rival.id}`}
                      className="flex min-h-[44px] items-center justify-between gap-3 rounded-sm border border-rule px-3 py-2 hover:border-primary"
                    >
                      <span className="truncate text-[13px]">{rival.name}</span>
                      <ScoreValue score={rival.score} color={scoreColor(rival.score)} size="sm" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}