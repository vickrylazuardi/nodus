# NODUS

Peta relasi antar figur politik Indonesia, dengan skor per isu. Terinspirasi
sistem opini dan diplomasi **Civilization VI**.

**Kekuatan yang seimbang adalah kunci.** Supaya nepotisme bisa dikenali, aliansi
harus terlihat lebih dulu. NODUS memetakan siapa bersekongkol dengan siapa,
seberapa kuat, dan di isu apa. Namanya dari bahasa Latin untuk simpul tali:
sebuah simpul yang harus diurai, sekaligus titik di jaringan.

> **Skor di sini ilustratif.** Angka dihitung dari data yang diisi admin
> berdasarkan dinamika yang dilaporkan publik. Ini bukan pengukuran faktual dan
> bukan penilaian atas tokoh mana pun. Setiap skor isu punya kolom sumber agar
> bisa ditelusuri.

Dua antarmuka dalam satu repo:

| | URL pengembangan | Untuk |
|---|---|---|
| Visualisasi publik | <http://localhost:5173/peta> | Masyarakat umum, hanya baca |
| Dashboard admin | <http://localhost:5173/admin> | Admin, tambah dan ubah data |

---

## Menjalankan

Butuh **Python 3.11+**, **[uv](https://docs.astral.sh/uv/)**, dan **Node 20+**.

```bash
git clone <repo> && cd prism

# Terminal 1, backend
cd backend
uv sync
uv run alembic upgrade head          # buat skema
uv run python -m app.seed            # isi data contoh, cetak password admin
uv run uvicorn app.main:app --reload # http://127.0.0.1:8000

# Terminal 2, frontend
cd frontend
npm install
npm run dev                          # http://localhost:5173
```

Dokumentasi API otomatis di <http://127.0.0.1:8000/api/docs>.

Saat pertama dijalankan, `app.seed` mencetak password admin acak. **Catat dan
segera ganti** lewat menu admin. Password tidak disimpan dalam bentuk terbaca.

### Sebelum deploy

Setidaknya tiga hal ini:

```bash
export PRISM_ENVIRONMENT=production
export PRISM_SECRET_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
export PRISM_DATABASE_URL="postgresql+psycopg://user:pass@host/prism"
```

Backend **menolak start** di luar `development` tanpa `PRISM_SECRET_KEY`, karena
kunci publik berarti siapa pun bisa memalsukan token admin.

---

## Cara kerja skor

```
dasar        = Σ(skor_isu × bobot_isu) / Σ(bobot_isu)
modifier     = Σ(nilai_peristiwa × faktor_pudar)
skor_mentah  = dasar + modifier
skor_akhir   = soft_clamp(skor_mentah)        # dibatasi −100…+100
```

| Civ VI | PRISM |
|---|---|
| Opinion score | Skor relasi −100…+100 |
| Access level (Denounced, Ally) | Sembilan tingkat, dari Bermusuhan sampai Blok Solid |
| Diplomatic modifiers (berjangka waktu) | Modifier peristiwa yang memudar otomatis |
| Agenda, Casus Belli | Isu penilaian dengan bobot masing-masing |
| Alliance | Blok dan koalisi |

**Soft clamp.** Pembatasan keras akan menempelkan semua relasi sangat bermusuhan
tepat di −100 sehingga urutannya hilang. Nilai di dalam ±85 lewat apa adanya;
di luar itu mendekati ±100 secara asimtotik dan tetap terurut. Lihat
`references/scoring-model.md` di skill `prism-political-relations`.

---

## Struktur

```
.
├── DESIGN.md              # arah visual: palet, tipografi, dials, alasan
├── AGENTS.md              # instruksi agen: skill mana dibaca untuk tugas apa
├── backend/
│   ├── app/
│   │   ├── core/          # config, database, security
│   │   ├── models/        # ORM SQLAlchemy 2.0
│   │   ├── schemas/       # kontrak Pydantic v2
│   │   ├── services/      # scoring.py (mesin skor), repository.py (query)
│   │   ├── api/routes/    # public.py, admin.py
│   │   ├── seed.py        # pengisi data
│   │   └── seed_data.py   # dataset ilustratif
│   ├── alembic/           # migrasi
│   └── tests/             # 67 tes
└── frontend/
    ├── src/
    │   ├── components/    # primitif design system, peta canvas
    │   ├── pages/         # halaman publik dan admin
    │   ├── lib/           # klien API, tipe, format
    │   └── styles/        # token Tailwind, diturunkan dari DESIGN.md
    └── src/**/*.test.ts   # 49 tes, termasuk kontrak OpenAPI
```

---

## Mengubah tampilan

**`DESIGN.md` adalah sumber tunggal untuk warna dan tipografi.** Jangan sunting
warna di `theme.css`, `format.ts`, atau `scoring.py` tanpa mengubah `DESIGN.md`
lebih dulu, lalu jalankan:

```bash
npx -y @google/design.md lint DESIGN.md    # harus 0 error, 0 warning
npx -y @google/design.md export --format css-tailwind DESIGN.md
```

Linter memeriksa kontras WCAG dan referensi token. Ia pernah menangkap palet
yang terlihat bagus tetapi punya empat tingkat warna yang tidak terbaca.

Palet hidup di tiga tempat karena kebutuhan: CSS untuk gaya, TypeScript untuk
pewarnaan canvas, Python karena API mengembalikan warna tingkat. `DESIGN.md`
yang menjaga ketiganya sepakat.

---

## Menguji

```bash
cd backend  && uv run pytest -q            # 67 tes
cd frontend && npm test                    # 49 tes
cd frontend && npx tsc --noEmit            # pemeriksaan tipe
cd frontend && npm run build               # build produksi
npx -y @google/design.md lint DESIGN.md    # kontras dan token
```

Tes kontrak frontend membaca skema OpenAPI backend dan gagal bila tipe
TypeScript tidak lagi cocok, sehingga perubahan skema backend tidak lolos
diam-diam. Tes itu butuh backend berjalan; setel `PRISM_SKIP_CONTRACT=1` untuk
melewatinya dengan sengaja.

---

## Berkontribusi

Lihat [CONTRIBUTING.md](CONTRIBUTING.md). Ringkasnya: buka issue sebelum PR
besar, jalankan seluruh pemeriksaan di atas, dan jangan mengubah skor data
tanpa menyertakan sumber publik.

### Mengirim data dalam jumlah banyak

Kalau kamu punya data yang lebih akurat, tidak perlu menyentuh database. Masuk
ke **Dashboard admin > Impor**, lalu unggah satu file JSON atau beberapa file
CSV. Rujukan memakai **nama figur dan nama isu**, bukan id, karena id hanya
berarti di dalam satu instalasi.

Alurnya dua langkah: **Periksa dulu** memvalidasi tanpa menulis apa pun, lalu
**Terapkan** menyimpan. Kalau ada satu baris bermasalah, seluruh unggahan
dibatalkan, jadi tidak ada kondisi setengah jadi.

Format lengkapnya, termasuk aturan yang ditegakkan dan batas tiap kolom, ada di
[docs/IMPORT-FORMAT.md](docs/IMPORT-FORMAT.md). Untuk memulai, unduh contoh dari
halaman Impor: tombol ekspor menghasilkan file yang bisa langsung diunggah
kembali tanpa mengubah apa pun.

Satu aturan yang paling mudah terlewat: relasi bersifat **tidak berarah** dan
disimpan sekali per pasangan. Menulis `A,B` dan `B,A` akan ditolak, bukan
digabung, karena kedua baris itu bisa berbeda di semua kolom.

## Lisensi

MIT. Lihat [LICENSE](LICENSE).

Civilization VI adalah merek dagang Firaxis Games dan 2K. Proyek ini tidak
berafiliasi dan tidak disponsori; kemiripan visual adalah penghormatan atas
mekanisme diplomasi yang menginspirasi sistem skornya.
