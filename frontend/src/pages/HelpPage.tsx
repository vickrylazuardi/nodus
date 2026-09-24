import { useQuery } from "@tanstack/react-query";

import { ErrorState, LoadingState, Panel, PanelHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { formatScore, scoreTextColor } from "@/lib/format";

export function HelpPage() {
  const tiersQuery = useQuery({ queryKey: ["tiers"], queryFn: api.tiers });

  if (tiersQuery.isPending) {
    return (
      <Panel>
        <LoadingState what="panduan" />
      </Panel>
    );
  }

  if (tiersQuery.isError) {
    return (
      <Panel>
        <ErrorState
          message={(tiersQuery.error as Error).message}
          onRetry={() => void tiersQuery.refetch()}
        />
      </Panel>
    );
  }

  const tiers = tiersQuery.data.tiers;

  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <PanelHeader
          level={1}
          title="Cara membaca peta ini"
          description="Sistem skor terinspirasi mekanisme opini dan diplomasi Civilization VI, disesuaikan untuk politik Indonesia."
        />

        <div className="flex max-w-prose flex-col gap-6 text-[13.5px] leading-relaxed text-ink-soft">
          <section>
            <h3 className="mb-2 text-[15px] text-ink">1. Skor relasi (−100 sampai +100)</h3>
            <p>
              Setiap pasangan figur punya satu skor. Skor dihitung dari rata-rata berbobot skor per
              isu, lalu ditambah modifier dari peristiwa terbaru. Skor positif berarti sejalan,
              negatif berarti berselisih.
            </p>

            <table className="mt-4 w-full border-collapse text-[13px]">
              <caption className="sr-only">Tabel tingkat hubungan dan artinya.</caption>
              <thead>
                <tr className="border-b border-rule text-left">
                  <th
                    scope="col"
                    className="px-2.5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft"
                  >
                    Rentang
                  </th>
                  <th
                    scope="col"
                    className="px-2.5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft"
                  >
                    Tingkat
                  </th>
                  <th
                    scope="col"
                    className="px-2.5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft"
                  >
                    Artinya
                  </th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier, index) => {
                  const upper = index === 0 ? 100 : (tiers[index - 1]?.threshold ?? 100) - 1;
                  return (
                    <tr key={tier.key} className="border-b border-rule/60">
                      <td className="tabular px-2.5 py-2" style={{ color: scoreTextColor(tier.threshold) }}>
                        {formatScore(tier.threshold)} sampai {formatScore(upper)}
                      </td>
                      <td
                        className="px-2.5 py-2 font-semibold"
                        style={{ color: scoreTextColor(tier.threshold) }}
                      >
                        {tier.label}
                      </td>
                      <td className="px-2.5 py-2">{tier.description}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section>
            <h3 className="mb-2 text-[15px] text-ink">2. Skor per isu dan bobot</h3>
            <p>
              Sebuah relasi tidak dinilai sekadar baik atau buruk. Setiap relasi punya skor untuk
              tiap isu. Misalnya isu koalisi dan bagi kursi kabinet bisa +80 sementara isu hukum dan
              penegakan hukum −60. Bobot menentukan seberapa besar isu itu menarik skor akhir:
              kontribusi = skor × bobot.
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-[15px] text-ink">3. Modifier, peristiwa berjangka waktu</h3>
            <p>
              Seperti perjanjian diplomatik di Civ VI, peristiwa besar memberi tambahan sementara.
              Modifier punya tanggal kedaluwarsa dan memudar saat mendekati akhir masa berlakunya,
              jadi peta ikut berubah mengikuti berita terbaru.
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-[15px] text-ink">4. Peta relasi</h3>
            <ul className="ml-4 list-disc">
              <li>Ukuran titik menunjukkan tingkat pengaruh figur.</li>
              <li>
                Ketebalan dan kepekatan garis menunjukkan kekuatan hubungan. Semakin kuat, semakin
                tebal, baik untuk sekutu maupun lawan.
              </li>
              <li>Garis putus-putus menandakan hubungan bermusuhan.</li>
              <li>Warna mengikuti tabel tingkat hubungan di atas.</li>
              <li>
                Garis saling menarik untuk sekutu dan saling menjauh untuk rival, sehingga gugus
                koalisi terbentuk sendiri.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="mb-2 text-[15px] text-ink">5. Batasan yang perlu diketahui</h3>
            <p>
              Angka di sini <strong className="font-semibold text-ink">ilustratif</strong>. Skor
              diisi manual oleh admin berdasarkan dinamika yang dilaporkan publik, lalu dihitung
              otomatis oleh sistem. Ini alat bantu untuk memahami pola relasi, bukan penilaian
              faktual atas tokoh mana pun. Setiap skor isu menyediakan kolom sumber agar bisa
              ditelusuri.
            </p>
          </section>
        </div>
      </Panel>
    </div>
  );
}
