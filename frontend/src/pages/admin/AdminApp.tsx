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
import { AdminIssues } from "@/pages/admin/AdminIssues";
import { AdminRelationships } from "@/pages/admin/AdminRelationships";
import { AdminAudit } from "@/pages/admin/AdminAudit";
import { AdminOverview } from "@/pages/admin/AdminOverview";

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
            PRISM
          </div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-soft">
            Dashboard admin
          </div>
        </div>

        <p className="mb-5 text-[13px] text-ink-soft">
          Masuk untuk mengubah data figur, isu, skor relasi, dan peristiwa. Kredensial awal
          dicetak oleh <code className="rounded-sm bg-neutral-sunk px-1.5 py-0.5">seed</code> saat
          database pertama kali diisi.
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
          <p role="alert" className="mt-3 text-[13px] text-hostile">
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
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-rule bg-neutral-raised px-4 py-3">
          <div>
            <h1 className="text-[19px]">Dashboard admin</h1>
            <p className="text-[12px] text-ink-soft">
              Perubahan langsung tampil di antarmuka publik.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/"
              className="rounded-sm border border-rule px-2.5 py-1.5 text-[12.5px] text-ink-soft hover:border-primary hover:text-primary-ink"
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
                  "rounded-sm px-3 py-1.5 text-[13.5px] transition-colors",
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

        <Routes>
          <Route index element={<AdminOverview />} />
          <Route path="figur" element={<AdminFigures />} />
          <Route path="relasi" element={<AdminRelationships />} />
          <Route path="isu" element={<AdminIssues />} />
          <Route path="riwayat" element={<AdminAudit />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </div>
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
   * Tab walks the page underneath — the exact trap T6 exists to remove.
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