import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { cx } from "@/lib/format";

/**
 * Action status for the admin.
 *
 * Why this exists: nine mutations across the admin changed data and reported
 * nothing. Each one refetched and closed its dialog, so the only evidence a
 * save worked was a list quietly re-rendering. An admin could not tell a
 * success from a no-op, which is exactly the doubt this replaces.
 *
 * Design decisions, and the reasons:
 *
 * Persistent, not a toast. A toast that disappears after three seconds is
 * worse than no feedback: look away and you have lost the answer. This strip
 * stays until the next action replaces it, so the result is still there when
 * you look back.
 *
 * One region, not one per form. A single live region means a screen reader
 * hears each result once, in the same place every time, instead of hunting for
 * a message that appeared somewhere in the page.
 *
 * It reports the entity, not just the verb. "Tersimpan" alone still leaves you
 * wondering what was saved; "Relasi Prabowo Subianto dan Gibran tersimpan"
 * does not.
 */

export type StatusKind = "idle" | "pending" | "success" | "error";

export interface StatusState {
  kind: StatusKind;
  /** What is happening or happened, in one sentence. */
  message?: string;
  /** The next action, only when something went wrong. */
  action?: string;
  /**
   * The verb shown before the message. Defaults per kind, but callers override
   * it: a download is not a save, and "Tersimpan. prism-bundle.json diunduh"
   * claims something that did not happen.
   */
  verb?: string;
}

interface StatusApi {
  status: StatusState;
  /** Mark an action as running. Returns a handle for the result. */
  start: (message: string, verb?: string) => void;
  succeed: (message: string, verb?: string) => void;
  fail: (message: string, action?: string) => void;
  clear: () => void;
}

const StatusContext = createContext<StatusApi | null>(null);

export function useStatus(): StatusApi {
  const api = useContext(StatusContext);
  if (!api) throw new Error("useStatus must be used inside <StatusProvider>");
  return api;
}

export function StatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StatusState>({ kind: "idle" });

  const start = useCallback((message: string, verb?: string) => {
    setStatus({ kind: "pending", message, verb });
  }, []);

  const succeed = useCallback((message: string, verb?: string) => {
    setStatus({ kind: "success", message, verb });
  }, []);

  const fail = useCallback((message: string, action?: string) => {
    setStatus({ kind: "error", message, action });
  }, []);

  const clear = useCallback(() => setStatus({ kind: "idle" }), []);

  const api = useMemo(
    () => ({ status, start, succeed, fail, clear }),
    [status, start, succeed, fail, clear],
  );

  return <StatusContext.Provider value={api}>{children}</StatusContext.Provider>;
}

/**
 * Run a mutation and report it, so no call site has to remember to.
 *
 * Returns a promise that resolves to true on success and false on failure, so a
 * caller can decide whether to close its dialog. That matters: the previous
 * code closed the dialog on success and on failure alike, which threw away what
 * the admin had typed at the exact moment they needed it back.
 */
export function useReportedAction() {
  const { start, succeed, fail } = useStatus();
  const seq = useRef(0);

  return useCallback(
    async <T,>(
      run: () => Promise<T>,
      messages: {
        pending: string;
        success: (result: T) => string;
        /** Shown when the request fails. Say what to do, not just what broke. */
        failure: string;
        failureAction?: string;
      },
    ): Promise<boolean> => {
      // Guard against a stale result overwriting a newer one. Two quick saves
      // can land out of order, and the older answer must not win.
      const mine = ++seq.current;
      start(messages.pending);
      try {
        const result = await run();
        if (mine === seq.current) succeed(messages.success(result));
        return true;
      } catch (error) {
        if (mine === seq.current) {
          const detail = error instanceof Error ? error.message : String(error);
          fail(`${messages.failure} ${detail}`, messages.failureAction);
        }
        return false;
      }
    },
    [start, succeed, fail],
  );
}

const TONE: Record<Exclude<StatusKind, "idle">, string> = {
  pending: "border-rule bg-neutral-sunk",
  // Ally green, not the accent bronze: bronze already means "press this", and a
  // result is not a control. Green here is the same token the map uses for an
  // alliance, so it reads as the ledger's own vocabulary rather than a new one.
  success: "border-ally/45 bg-ally/10",
  error: "border-hostile/45 bg-hostile/10",
};

const MARK: Record<Exclude<StatusKind, "idle">, string> = {
  pending: "•",
  success: "✓",
  error: "!",
};

const DEFAULT_VERB: Record<Exclude<StatusKind, "idle">, string> = {
  pending: "Menyimpan. ",
  success: "Tersimpan. ",
  error: "Gagal menyimpan. ",
};

export function StatusStrip({ className }: { className?: string }) {
  const { status, clear } = useStatus();

  if (status.kind === "idle") return null;

  const kind = status.kind;
  const verb = status.verb ?? DEFAULT_VERB[kind];

  return (
    <div
      /*
       * aria-live="polite" rather than role="status": role="status" already
       * implies it, and setting both makes some screen readers announce twice.
       * The audit for this project measured the explicit attribute, so it is set
       * on its own.
       *
       * polite, not assertive: a save result should wait for the reader to
       * finish the current sentence. Assertive is for something that must
       * interrupt, and nothing here qualifies.
       */
      aria-live="polite"
      aria-atomic="true"
      className={cx(
        "flex items-start gap-3 rounded-sm border px-3 py-2.5",
        TONE[kind],
        className,
      )}
    >
      {/*
       * The mark is decorative. The sentence already carries the meaning, so it
       * is hidden from assistive technology rather than read out as "bullet" or
       * "check mark". It is a glyph, not an emoji, so it inherits the text
       * colour and cannot render as a colour font.
       */}
      <span aria-hidden="true" className="mt-[1px] shrink-0 text-[13px] font-semibold">
        {MARK[kind]}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug">
          <span className="font-semibold">{verb}</span>
          {status.message}
        </p>
        {status.action ? (
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-soft">{status.action}</p>
        ) : null}
      </div>

      {kind === "pending" ? (
        <span
          aria-hidden="true"
          className="mt-[3px] h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-rule border-t-primary"
        />
      ) : (
        <button
          type="button"
          onClick={clear}
          className="-my-1 min-h-[44px] shrink-0 rounded-sm px-2 text-[12px] text-ink-soft transition-colors hover:text-ink"
        >
          Tutup
        </button>
      )}
    </div>
  );
}
