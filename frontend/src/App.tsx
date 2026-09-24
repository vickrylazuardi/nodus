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
import { useTheme } from "@/lib/useTheme";

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
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-neutral/95 backdrop-blur-sm">
      {/*
       * Two rows on a phone, one row from lg up.
       *
       * Measured at 320px before this: the wordmark took most of the row, so
       * `flex-wrap` squeezed the nav into an 81px column and the six links
       * stacked into six separate rows 284px tall. The nav was technically
       * "wrapped", which is why a class-level check missed it, but it was a
       * squeezed desktop row rather than a designed mobile state.
       *
       * The breakpoint is `lg`, not `sm`. At 640px the wordmark, six nav links
       * and the Admin button cannot share one row, and forcing it produced
       * three rows and a 113px header. Between 320 and 1023 the nav keeps its
       * own full-width row, which stays a deliberate two-row layout instead of
       * a cramped three-row accident.
       */}
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 lg:flex-nowrap lg:gap-x-6 lg:px-5 lg:py-2.5">
        <NavLink to="/peta" className="flex min-h-[44px] items-center">
          <span className="flex items-baseline gap-2.5">
            <span className="font-display text-[19px] font-bold tracking-[0.18em] text-primary-ink lg:text-[21px]">
              NODUS
            </span>
            {/*
             * The tagline carries the mission, not the category. "Peta relasi
             * politik" only said what the thing is, which the nav already says
             * five times. This says why it exists.
             */}
            <span className="hidden text-[11px] uppercase tracking-[0.12em] text-ink-soft sm:inline">
              Siapa bersekongkol dengan siapa
            </span>
          </span>
        </NavLink>

        {/*
         * The nav scrolls horizontally on narrow screens.
         *
         * No negative margins here. `-mx-4` made the nav wider than the header's
         * padding box, and because the nav IS the scroll container, the extra
         * width escaped to the document: measured at 320px on the admin table
         * routes, the page scrolled sideways by 206-402px. Containing the
         * scroller inside the padding box fixes it.
         */}
        <nav
          aria-label="Navigasi utama"
          className="order-last flex w-full min-w-0 gap-1 overflow-x-auto lg:order-none lg:w-auto lg:flex-1 lg:flex-wrap lg:overflow-visible"
        >
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cx(
                  // min-w as well as min-h: the shortest label ("Isu") is only
                  // 41px wide, so a height-only fix would still leave a target
                  // too narrow to hit.
                  "flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-sm px-3 py-1.5 text-[13px] transition-colors lg:px-2.5 lg:text-[13.5px]",
                  /*
                   * The active state is an underline rule plus ink, not a faint
                   * tinted fill. The previous pass used a 10% accent wash on a
                   * warm ground, and the visual audit found the contrast delta
                   * small enough that it was easy to miss which tab was active.
                   * A 2px rule is unambiguous at a glance and costs no colour.
                   */
                  isActive
                    ? "border-b-2 border-primary-ink font-semibold text-primary-ink"
                    : "border-b-2 border-transparent text-ink-soft hover:bg-neutral-sunk hover:text-ink",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1 lg:ml-0 lg:order-last">
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === "dark" ? "Ganti ke tema terang" : "Ganti ke tema gelap"}
            title={theme === "dark" ? "Tema terang" : "Tema gelap"}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-sm border border-control-border px-3 py-1.5 text-[12.5px] text-ink-soft transition-colors hover:border-primary hover:text-primary-ink"
          >
            {theme === "dark" ? "Terang" : "Gelap"}
          </button>

          <NavLink
            to="/admin"
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-sm border border-control-border px-3 py-1.5 text-[12.5px] text-ink-soft transition-colors hover:border-primary hover:text-primary-ink lg:px-2.5"
          >
            Admin
          </NavLink>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-12 border-t border-rule px-5 py-6">
      <div className="mx-auto max-w-[1600px] text-[11.5px] leading-relaxed text-ink-soft">
        {/*
         * The mission line goes first, then the honesty line. Order matters: the
         * reason the project exists is what a visitor came for, and the
         * disclaimer only means something once they know why the scores exist.
         */}
        <p>
          <strong className="font-semibold text-ink">
            Kekuatan yang seimbang adalah kunci.
          </strong>{" "}
          Supaya nepotisme bisa dikenali, aliansi harus terlihat lebih dulu. NODUS memetakan
          siapa bersekongkol dengan siapa, seberapa kuat, dan di isu apa.
        </p>
        <p className="mt-2">
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