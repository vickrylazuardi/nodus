import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { Suspense, lazy } from "react";

import { FigureDetailPage } from "@/pages/FigureDetailPage";
import { FiguresPage } from "@/pages/FiguresPage";
import { HelpPage } from "@/pages/HelpPage";
import { IssuesPage } from "@/pages/IssuesPage";
import { MapPage } from "@/pages/MapPage";
import { MatrixPage } from "@/pages/MatrixPage";
import { StatsPage } from "@/pages/StatsPage";
import { LoadingState, Panel } from "@/components/ui";
import { cx } from "@/lib/format";

/*
 * The admin dashboard is loaded lazily.
 *
 * It was previously imported at the top of this file, which meant every public
 * visitor downloaded the whole admin bundle plus react-hook-form and zod,
 * measured at roughly 90 KB of the main chunk, for a route most of them never
 * open. The graph is split for the same reason; this is the same fix.
 */
const AdminApp = lazy(() => import("@/pages/admin/AdminApp").then((m) => ({ default: m.AdminApp })));

/*
 * Every nav item maps to a route that exists. There are no placeholder links
 * (antislop R-24): the admin link goes to a working dashboard.
 */
const NAV = [
  { to: "/peta", label: "Peta" },
  { to: "/figur", label: "Figur" },
  { to: "/matriks", label: "Matriks" },
  { to: "/isu", label: "Isu" },
  { to: "/statistik", label: "Statistik" },
  { to: "/cara-baca", label: "Cara baca" },
];

function Masthead() {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-neutral/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-2.5">
        {/*
         * The wordmark and every nav item carry min-h-[44px]: the masthead is
         * the one control cluster present on all routes, so its targets are
         * what a thumb meets first. Height is added, not padding, so the bar
         * keeps its compact printed-ledger proportions.
         */}
        <NavLink to="/peta" className="flex min-h-[44px] items-center">
          <span className="flex items-baseline gap-2.5">
            <span className="font-display text-[21px] font-bold tracking-[0.22em] text-primary-ink">
              PRISM
            </span>
            <span className="hidden text-[11px] uppercase tracking-[0.14em] text-ink-soft sm:inline">
              Peta relasi politik
            </span>
          </span>
        </NavLink>

        <nav aria-label="Navigasi utama" className="flex flex-1 flex-wrap gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cx(
                  // min-w as well as min-h: the shortest label ("Isu") is only
                  // 37px wide, so a height-only fix would still leave a target
                  // too narrow to hit.
                  "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-sm px-2.5 py-1.5 text-[13.5px] transition-colors",
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

        <NavLink
          to="/admin"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-sm border border-rule px-2.5 py-1.5 text-[12.5px] text-ink-soft transition-colors hover:border-primary hover:text-primary-ink"
        >
          Admin
        </NavLink>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-12 border-t border-rule px-5 py-6">
      <div className="mx-auto max-w-[1600px] text-[11.5px] leading-relaxed text-ink-soft">
        <p>
          <strong className="font-semibold text-ink">Skor di sini ilustratif.</strong> Angka
          dihitung dari data yang diisi admin berdasarkan dinamika yang dilaporkan publik, bukan
          pengukuran faktual dan bukan penilaian atas tokoh mana pun. Setiap skor isu menyertakan
          kolom sumber agar bisa ditelusuri.
        </p>
        <p className="mt-2">
          Terinspirasi sistem opini dan diplomasi Civilization VI. Kode terbuka, lisensi MIT.
        </p>
      </div>
    </footer>
  );
}

export function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <Masthead />
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-5 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/peta" replace />} />
          <Route path="/peta" element={<MapPage />} />
          <Route path="/figur" element={<FiguresPage />} />
          <Route path="/figur/:id" element={<FigureDetailPage />} />
          <Route path="/matriks" element={<MatrixPage />} />
          <Route path="/isu" element={<IssuesPage />} />
          <Route path="/statistik" element={<StatsPage />} />
          <Route path="/cara-baca" element={<HelpPage />} />
          <Route
            path="/admin/*"
            element={
              <Suspense
                fallback={
                  <Panel>
                    <LoadingState what="dasbor admin" />
                  </Panel>
                }
              >
                <AdminApp />
              </Suspense>
            }
          />
          <Route
            path="*"
            element={
              <div className="py-20 text-center">
                <h1 className="text-[24px]">Halaman tidak ditemukan</h1>
                <p className="mt-2 text-[13.5px] text-ink-soft">
                  Alamat yang Anda buka tidak ada.{" "}
                  <NavLink to="/peta" className="text-primary-ink underline">
                    Kembali ke peta
                  </NavLink>
                  .
                </p>
              </div>
            }
          />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}