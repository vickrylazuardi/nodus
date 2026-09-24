import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";

import {
  Button,
  ErrorState,
  Field,
  LoadingState,
  Panel,
  inputClass,
} from "@/components/ui";
import { ApiError, api, tokenStore } from "@/lib/api";
import { cx } from "@/lib/format";
import { AdminFigures } from "@/pages/admin/AdminFigures";
import { AdminImport } from "@/pages/admin/AdminImport";
import { AdminIssues } from "@/pages/admin/AdminIssues";
import { AdminRelationships } from "@/pages/admin/AdminRelationships";
import { AdminAudit } from "@/pages/admin/AdminAudit";
import { AdminOverview } from "@/pages/admin/AdminOverview";
import { StatusProvider, StatusStrip } from "@/pages/admin/status";

/* ------------------------------------------------------------------ session */

interface Session {
  username: string;
  signOut: () => void;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside the admin session");
  return session;
}

/* -------------------------------------------------------------------- login */

function LoginPage({ onSignIn }: { onSignIn: (username: string) => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");

  const login = useMutation({
    mutationFn: () => api.auth.login(username, password),
    onSuccess: (token) => {
      tokenStore.set(token.access_token);
      onSignIn(token.username);
    },
  });

  return (
    <div className="mx-auto max-w-[420px] py-12">
      <Panel>
        <div className="mb-6">
          <div className="font-display text-[26px] font-bold tracking-[0.22em] text-primary-ink">
            NODUS
          </div>
          {/*
           * A real <h1>, not a styled div. Every route needs a heading so the
           * document outline has a root and a screen reader announces where it
           * has landed. This is the same defect T1 fixed on the public routes;
           * the admin login was missed because it renders outside that sweep.
           * The element changes, the visual weight does not.
           */}
          <h1 className="text-[11px] font-normal uppercase tracking-[0.14em] text-ink-soft">
            Dashboard admin
          </h1>
        </div>

        <p className="mb-5 text-[13px] text-ink-soft">
          Di sini data yang dibaca publik diisi dan diubah: figur, isu, skor relasi, dan
          peristiwa. Kredensial awal dicetak sekali oleh{" "}
          <code className="rounded-sm bg-neutral-sunk px-1.5 py-0.5">seed</code> saat database
          pertama kali diisi.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate();
          }}
        >
          <div className="mb-3">
            <Field label="Username">
              <input
                className={inputClass}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </Field>
          </div>
          <div className="mb-4">
            <Field label="Password">
              <input
                className={inputClass}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
          </div>

          <Button variant="primary" type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? "Memeriksa…" : "Masuk"}
          </Button>
        </form>

        {login.isError ? (
          <p role="alert" className="mt-3 text-[13px] text-hostile-text">
            {(login.error as Error).message}
          </p>
        ) : null}
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------------- app */

const ADMIN_NAV = [
  { to: "/admin", label: "Ringkasan", end: true },
  { to: "/admin/figur", label: "Figur" },
  { to: "/admin/relasi", label: "Relasi" },
  { to: "/admin/isu", label: "Isu" },
  { to: "/admin/impor", label: "Impor" },
  { to: "/admin/riwayat", label: "Riwayat" },
];

export function AdminApp() {
  const [username, setUsername] = useState<string | null>(() =>
    tokenStore.get() ? "admin" : null,
  );
  const queryClient = useQueryClient();

  const signOut = useCallback(() => {
    tokenStore.clear();
    setUsername(null);
    queryClient.clear();
  }, [queryClient]);

  // Verify the stored token is still valid before showing the dashboard.
  const probe = useQuery({
    queryKey: ["admin", "probe"],
    queryFn: () => api.auth.audit(1),
    enabled: username !== null,
    retry: false,
  });

  const session = useMemo<Session>(
    () => ({ username: username ?? "", signOut }),
    [username, signOut],
  );

  if (!username) {
    return <LoginPage onSignIn={setUsername} />;
  }

  if (probe.isPending) {
    return (
      <Panel>
        <LoadingState what="sesi" />
      </Panel>
    );
  }

  if (probe.isError) {
    const status = probe.error instanceof ApiError ? probe.error.status : 0;
    if (status === 401) {
      // Token expired or revoked: drop it and return to the login form.
      signOut();
      return <LoginPage onSignIn={setUsername} />;
    }
    return (
      <Panel>
        <ErrorState message={(probe.error as Error).message} onRetry={() => void probe.refetch()} />
      </Panel>
    );
  }

  return (
    <SessionContext.Provider value={session}>
      <StatusProvider>
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-rule bg-neutral-raised px-4 py-3">
            <div>
              <h1 className="text-[19px]">Dashboard admin NODUS</h1>
              <p className="text-[12px] text-ink-soft">
                Setiap perubahan langsung tampil di antarmuka publik.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/"
                className="inline-flex min-h-[44px] items-center rounded-sm border border-control-border px-2.5 py-1.5 text-[12.5px] text-ink-soft hover:border-primary hover:text-primary-ink"
              >
                Lihat situs publik
              </a>
              <Button onClick={signOut}>Keluar</Button>
            </div>
          </div>

        <nav aria-label="Navigasi admin" className="flex flex-wrap gap-1 border-b border-rule pb-2">
          {ADMIN_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx(
                  // min-h-[44px] is the touch-target floor. py-1.5 alone gave a
                  // 33px link, which is under the minimum and was missed because
                  // the earlier sweep only covered the public routes.
                  // min-w as well as min-h: the shortest label ("Isu") measured 41px
                  // wide, so a height-only floor still leaves a target too
                  // narrow for a thumb.
                  "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-sm px-3 py-1.5 text-[13.5px] transition-colors",
                  isActive
                    ? "bg-primary/10 font-semibold text-primary-ink"
                    : "text-ink-soft hover:bg-neutral-sunk hover:text-ink",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/*
         * The status strip sits directly under the nav, above the routed page.
         *
         * Position matters: every admin page changes data, and the answer to
         * "did that save?" has to appear where the admin is already looking,
         * not inside the panel that just closed. One strip for the whole
         * dashboard also means one live region, so a screen reader hears each
         * result once instead of hunting for it.
         */}
        <StatusStrip />

        <Routes>
          <Route index element={<AdminOverview />} />
          <Route path="figur" element={<AdminFigures />} />
          <Route path="relasi" element={<AdminRelationships />} />
          <Route path="isu" element={<AdminIssues />} />
          <Route path="impor" element={<AdminImport />} />
          <Route path="riwayat" element={<AdminAudit />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
        </div>
      </StatusProvider>
    </SessionContext.Provider>
  );
}

/* ---------------------------------------------------------------- confirm UI */

export function ConfirmDialog({
  title,
  body,
  confirmLabel = "Hapus",
  onConfirm,
  onCancel,
  pending,
}: {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  /*
   * Focus management. Without this the dialog is announced as a modal but focus
   * stays on the page behind it, so Escape never reaches the handler below and
   * Tab walks the page underneath.
   *
   * The container takes focus rather than a button: `Button` in ui.tsx does not
   * forward refs, and the destructive action must never be one stray Enter
   * away. From here the first Tab reaches Cancel. The previous position is
   * restored on close so the reader returns to the button they pressed.
   */
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  /*
   * Trap Tab inside the dialog, and hide the rest of the page from assistive
   * technology while it is open.
   *
   * `aria-modal` alone is not enough: it tells a screen reader the content is
   * modal, but the background still contains 127 focusable elements and nothing
   * stops Tab reaching them. Measured before this was added: focus left the
   * dialog and the page behind it stayed fully exposed.
   *
   * `inert` is the correct primitive. It removes the subtree from the tab order
   * AND from the accessibility tree in one attribute, and the browser enforces
   * it, so there is no key handling to get wrong. `aria-hidden` is set as well
   * because older assistive technology does not honour `inert`.
   */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const root = document.getElementById("root");
    // The dialog is rendered inside the app tree, so hide its siblings rather
    // than the tree itself, which would hide the dialog too.
    const siblings: HTMLElement[] = [];
    let node: HTMLElement | null = dialog.parentElement;
    while (node && node !== root?.parentElement) {
      for (const child of Array.from(node.children)) {
        if (child !== dialog && !child.contains(dialog) && child instanceof HTMLElement) {
          siblings.push(child);
        }
      }
      node = node.parentElement;
    }

    const touched = siblings.map((el) => ({
      el,
      inert: el.hasAttribute("inert"),
      ariaHidden: el.getAttribute("aria-hidden"),
    }));

    for (const el of siblings) {
      el.setAttribute("inert", "");
      el.setAttribute("aria-hidden", "true");
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusables = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;

      const active = document.activeElement;
      // Wrap at both ends. Without this, Tab on the last control moves into the
      // page behind the dialog.
      if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      for (const { el, inert, ariaHidden } of touched) {
        if (!inert) el.removeAttribute("inert");
        if (ariaHidden === null) el.removeAttribute("aria-hidden");
        else el.setAttribute("aria-hidden", ariaHidden);
      }
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/55 p-5"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-[460px] rounded-lg border border-rule bg-neutral-raised p-5 shadow-lg"
      >
        <h2 className="text-[17px]">{title}</h2>
        <div className="mt-2 text-[13.5px] text-ink-soft">{body}</div>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onCancel} disabled={pending}>
            Batal
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={pending}>
            {pending ? "Memproses…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}