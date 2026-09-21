# Contributing

Terima kasih. Panduan ini singkat dan spesifik untuk repo ini.

## Sebelum membuka PR

```bash
cd backend  && uv run pytest -q            # 67 tes
cd frontend && npm test                    # 49 tes (butuh backend jalan)
cd frontend && npx tsc --noEmit
cd frontend && npm run build
npx -y @google/design.md lint DESIGN.md    # harus 0 error, 0 warning
```

PR yang tidak lolos pemeriksaan ini akan diminta memperbaikinya lebih dulu.

## Aturan yang tidak bisa dinegosiasikan

**Jangan ubah warna tanpa mengubah `DESIGN.md`.** Palet muncul di tiga berkas
(`theme.css`, `format.ts`, `scoring.py`) karena masing-masing punya peran.
`DESIGN.md` yang menjaga ketiganya sepakat. Setelah mengubahnya, jalankan
linter dan ekspor ulang tokennya.

**Jangan tambahkan warna tingkat tanpa memeriksa kontras.** Setiap warna tingkat
membawa label putih di chip dan sel matriks, jadi harus melewati 4.5:1 terhadap
putih. Palet sebelumnya terlihat bagus dan punya empat tingkat tidak terbaca.

**Jangan sunting data skor tanpa sumber publik.** Setiap skor isu punya kolom
`evidence_url`. Isi dengan sumber yang bisa diverifikasi. Skor adalah perkiraan
ilustratif, bukan fakta, dan tidak boleh disajikan sebagai fakta.

**Jangan gunakan `text-primary` untuk teks.** Itu warna isian (3.75:1 di atas
parchment, gagal WCAG AA). Teks memakai `text-primary-ink`.

**Pertahankan soft clamp.** Pembatasan keras merusak urutan di ujung skala.
Alasannya ada di `DESIGN.md` dan di `references/scoring-model.md`.

## Menambah migrasi

```bash
cd backend
uv run alembic revision --autogenerate -m "deskripsi singkat"
uv run alembic upgrade head
uv run alembic downgrade -1 && uv run alembic upgrade head   # uji bolak-balik
```

Selalu uji `downgrade` lalu `upgrade`. Migrasi yang tidak bisa dibalik akan
ditolak.

## Gaya kode

- **Python**: `ruff` mengatur format. Jalankan `uv run ruff check .`.
  Baris maksimum 100 karakter.
- **TypeScript**: `tsc --noEmit` harus bersih dengan `strict` dan
  `noUncheckedIndexedAccess`. Hindari `any`; tipe yang benar lebih baik.
- **Komentar**: jelaskan *mengapa*, bukan *apa*. Kode yang jelas tidak perlu
  komentar. Komentar yang baik menjelaskan keputusan yang tidak terlihat dari
  kodenya, terutama yang terlihat salah tetapi disengaja.

## Melaporkan bug

Sertakan langkah reproduksi, yang diharapkan, yang terjadi, dan keluaran
`npm run build` atau `pytest` bila relevan. Untuk masalah tampilan, sebutkan
peramban dan lebar layar.

## Pertanyaan tentang data

Kalau Anda merasa sebuah skor salah, buka issue dengan sumber publik yang
mendukung. Skor memang dirancang untuk diperdebatkan dan diperbarui, itu inti
dari alat ini. Sertakan sumbernya agar perubahannya bisa ditelusuri.
