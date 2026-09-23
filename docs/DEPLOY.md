# Panduan deployment ke layanan gratis

Panduan ini memasang PRISM ke layanan gratis: frontend statis, backend API, dan
database Postgres. Semua perintah bisa disalin apa adanya.

## Batasan yang perlu kamu tahu lebih dulu

Panduan ini disusun dari dua sumber: kebutuhan nyata kode di repo ini (dibaca
langsung dari `config.py`, `main.py`, `pyproject.toml`, dan `vite.config.ts`),
dan ketentuan resmi tiap platform yang diverifikasi saat panduan ini ditulis.
**Penulis belum pernah men-deploy aplikasi ini ke layanan gratis**, jadi angka
waktu dan perilaku platform bisa berubah. Kalau ada langkah yang tidak cocok,
cek dokumentasi resmi platform tersebut.

Ketentuan platform gratis berubah cukup sering. Yang paling sering menggigit:

| Platform | Jebakan | Akibatnya |
|---|---|---|
| Render, web service gratis | Tidur setelah 15 menit tanpa trafik | Request pertama setelah tidur butuh sekitar 1 menit |
| Render, Postgres gratis | **Kedaluwarsa 30 hari** | Datanya hilang, harus bikin database baru |
| Supabase, gratis | Project di-pause setelah 7 hari tidak aktif | Perlu dibangunkan manual dari dashboard |
| Neon, gratis | Compute di-suspend saat tidak ada trafik | Request pertama lambat, tapi bangun otomatis |
| Fly.io | Free tier sudah dihapus | Perlu kartu kredit |

Karena itu rekomendasinya: **Neon** untuk database (tidak kedaluwarsa, bangun
otomatis) dan **Render** untuk backend.

## Yang harus diubah di kode dulu

Ada satu hal yang wajib dikerjakan sebelum bisa pakai Postgres.

### 1. Tambahkan driver Postgres

Saat panduan ini ditulis, `backend/pyproject.toml` **belum punya driver
Postgres sama sekali**. Sudah dicek: `psycopg` dan `psycopg2` tidak terpasang.
Tanpa ini, `postgresql://` akan gagal dengan `ModuleNotFoundError`.

```bash
cd backend
/Users/macbook/.hermes/bin/uv add "psycopg[binary]>=3.2"
```

`[binary]` penting supaya tidak perlu compile dari sumber di server.

### 2. Setel `PRISM_SECRET_KEY`

`app/core/config.py` **menolak boot** kalau `PRISM_ENVIRONMENT` bukan
`development` dan `PRISM_SECRET_KEY` kosong:

```
ValueError: PRISM_SECRET_KEY must be set when PRISM_ENVIRONMENT is not 'development'.
```

Ini disengaja. Kunci default yang dipublikasikan berarti siapa pun bisa
memalsukan token admin. Buat kunci acak:

```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
```

Simpan hasilnya. Jangan pernah commit ke git.

## Arsitektur yang dipakai

```
Browser
  |
  |  https://nodus.<akun>.workers.dev        (Cloudflare Workers, statis)
  |      fetch langsung ke backend, lintas origin
  |      (CORS, bukan proxy: Cloudflare TIDAK BISA mem-proxy ke domain luar)
  v
https://nodus-0qo0.onrender.com               (Render, FastAPI)
  |
  v
postgresql://...neon.tech                     (Neon, Postgres)
```

Frontend memanggil API lewat dua cara berbeda:

| | Alamat API | Kenapa |
|---|---|---|
| Lokal | `/api` (relatif) | `vite.config.ts` mem-proxy ke `127.0.0.1:8000`, jadi browser tetap satu origin |
| Production | URL absolut Render | Frontend dan backend beda host; browser memanggil Render langsung |

Di production, alamat backend diisi lewat `VITE_API_BASE_URL` saat build
(`frontend/src/lib/api.ts`). Vite menanam nilainya ke dalam bundle saat build,
jadi ini **bukan** rahasia dan **wajib di-set ulang setiap kali URL backend
berubah**, bukan sekadar di-set sekali di runtime.

### Kenapa bukan proxy `/api/*`?

Rencana awal panduan ini adalah meneruskan `/api/*` dari Cloudflare ke Render,
supaya browser tetap satu origin dan CORS tidak perlu diatur. **Itu tidak
mungkin.** Dokumentasi Cloudflare menyatakannya langsung:

> "Proxying will only support relative URLs on your site. You cannot proxy
> external domains."

Build akan ditolak dengan pesan:

```
Invalid _redirects configuration:
Line 15: Proxy (200) redirects can only point to relative paths.
Got https://nodus-0qo0.onrender.com/api/:splat
```

Hanya Worker dengan kode (`main`) yang bisa mem-proxy ke luar platform, dan
proyek ini tidak punya kode Worker. Karena itu rute yang benar adalah
**panggilan lintas origin + CORS**. Langkah 2 di bawah jadi wajib, bukan opsional.

## Langkah 1: Database di Neon

1. Daftar di <https://neon.tech> lalu buat project. Pilih region terdekat
   (Singapore untuk Indonesia).
2. Salin connection string. Bentuknya:

   ```
   postgresql://user:password@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

3. Ubah skemanya supaya SQLAlchemy memakai driver `psycopg`:

   ```
   postgresql+psycopg://user:password@ep-xxx.../neondb?sslmode=require
   ```

   Perhatikan `+psycopg` setelah `postgresql`. Kalau ini terlewat, SQLAlchemy
   akan mencari `psycopg2` dan gagal.

4. Simpan sebagai `PRISM_DATABASE_URL`.

### Kalau tetap ingin SQLite

SQLite gratis dan tanpa batas, tapi di hosting gratis **filenya hilang setiap
deploy ulang**, karena filesystem-nya sementara. Render bahkan tidak
mengizinkan persistent disk di instance gratis. SQLite hanya cocok kalau kamu
siap memakai ulang data setiap kali deploy.

## Langkah 2: Backend di Render

1. Daftar di <https://render.com>, hubungkan GitHub.
2. **New > Web Service**, pilih repo ini.
3. Setelan:

   | Kolom | Nilai |
   |---|---|
   | Root Directory | `backend` |
   | Runtime | Python 3 |
   | Build Command | `pip install uv && uv sync --frozen --no-dev` |
   | Start Command | `uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
   | Instance Type | Free |

   Perhatikan `--port $PORT`. Render memberi port lewat environment variable;
   port tetap 8000 akan gagal.

   `alembic upgrade head` dijalankan lebih dulu karena `app/main.py` baris 25
   menyatakan bahwa di production Alembic yang memiliki skema. Tanpa langkah
   ini tabelnya belum ada dan setiap request akan error.

4. **Environment Variables:**

   | Nama | Nilai |
   |---|---|
   | `PRISM_DATABASE_URL` | `postgresql+psycopg://...` dari Neon |
   | `PRISM_SECRET_KEY` | hasil dari langkah 2 di atas |
   | `PRISM_ENVIRONMENT` | `production` |

   **`PRISM_CORS_ORIGINS` wajib diisi.** Frontend (Cloudflare) dan backend
   (Render) berbeda origin, jadi tanpa ini setiap panggilan API diblokir
   browser dengan error CORS, meskipun `curl` terlihat baik-baik saja.

   Isinya daftar JSON berisi origin frontend, **tanpa** garis miring di akhir
   dan **tanpa** path:

   ```
   PRISM_CORS_ORIGINS=["https://nodus.namamu.workers.dev"]
   ```

   Menulis `https://nodus.namamu.workers.dev` tanpa tanda kurung siku akan
   membuat aplikasi gagal start, karena pydantic-settings membaca nilainya
   sebagai JSON. Garis miring di akhir juga membuat origin tidak cocok, karena
   browser mengirim `Origin` tanpa garis miring.

   Kalau memakai custom domain, daftarkan **keduanya** supaya preview dan
   domain utama sama-sama jalan:

   ```
   PRISM_CORS_ORIGINS=["https://nodus.namamu.workers.dev","https://nodus.example.com"]
   ```

   Cara memastikan sudah benar, dari terminal lokal. Ganti origin di bawah
   dengan domain Cloudflare kamu. Yang dicari adalah baris
   `access-control-allow-origin`:

   ```bash
   curl -s -i -X OPTIONS \
     -H "Origin: https://nodus.namamu.workers.dev" \
     -H "Access-Control-Request-Method: GET" \
     https://nodus-0qo0.onrender.com/api/health | grep -i "access-control-allow-origin"
   ```

   Kalau baris itu tidak muncul, CORS belum benar dan frontend akan tampil
   kosong walau backend sehat.

5. Deploy, lalu cek:

   ```bash
   curl https://prism-api.onrender.com/api/health
   ```

6. Isi database dengan data awal. Dari terminal lokal, dengan
   `PRISM_DATABASE_URL` diarahkan ke Neon:

   ```bash
   cd backend
   PRISM_DATABASE_URL='postgresql+psycopg://...' \
     /Users/macbook/.hermes/bin/uv run python -m app.seed
   ```

   Perintah ini mencetak password admin yang diacak. **Catat sekarang**, karena
   hanya hash-nya yang disimpan dan password aslinya tidak bisa dipulihkan.

## Langkah 3: Frontend di Cloudflare

Cloudflare punya dua produk yang mirip tapi berbeda, dan panduan ini memakai
**Workers** (bukan Pages) karena itulah yang dipakai di lapangan: log build
menampilkan `wrangler deploy` dan memanggil API `workers/scripts`. Bedanya
penting:

| | Workers (dipakai di sini) | Pages |
|---|---|---|
| SPA fallback | **harus diatur** lewat `wrangler.jsonc` | otomatis |
| `_redirects` | dibaca, tapi hanya rule relatif | sama |
| Konfigurasi | `wrangler.jsonc` + `assets.directory` | `pages_build_output_dir` |

1. Daftar di <https://dash.cloudflare.com>, lalu **Workers & Pages > Create >
   Workers > Connect to Git** (atau impor repo lewat alur Workers Builds).
2. Setelan build:

   | Kolom | Nilai |
   |---|---|
   | Root directory | `frontend` |
   | Build command | `npm ci && npm run build` |
   | Deploy command | `npx wrangler deploy` |
   | Environment variable | `NODE_VERSION` = `20` |
   | Environment variable | `VITE_API_BASE_URL` = `https://nodus-0qo0.onrender.com/api` |

   `VITE_API_BASE_URL` **wajib**. Tanpa itu, bundle memakai `/api` relatif dan
   request akan menabrak host statis, bukan Render. Nilai ini ditanam saat
   build, jadi mengubahnya butuh build ulang, bukan restart.

3. File `frontend/wrangler.jsonc` sudah ada di repo dan berisi:

   ```jsonc
   {
     "name": "nodus",
     "compatibility_date": "2026-09-23",
     "assets": {
       "directory": "./dist",
       "not_found_handling": "single-page-application"
     }
   }
   ```

   `not_found_handling` itu yang menggantikan rule `/* /index.html 200`.
   Tanpa itu, membuka `/figur/1` langsung akan 404. Rule `_redirects` tidak bisa
   dipakai untuk ini karena ditolak sebagai infinite loop.

   Sesuaikan `name` dengan nama Worker kamu.

4. `frontend/public/_redirects` sengaja **hanya berisi komentar**. Jangan
   menambahkan baris `200` ke sana: proxy ke domain luar akan ditolak, dan
   `/* /index.html 200` juga ditolak.

5. Deploy. Buka URL `*.workers.dev` yang diberikan Cloudflare.

### Kalau memakai Cloudflare Pages

Tetap bisa, dengan catatan Pages **tidak butuh** rule SPA (sudah otomatis).
Hapus `wrangler.jsonc`, lalu:

| Kolom | Nilai |
|---|---|
| Framework preset | None |
| Root directory | `frontend` |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| Environment variable | `NODE_VERSION` = `20` |
| Environment variable | `VITE_API_BASE_URL` = `https://nodus-0qo0.onrender.com/api` |

`_redirects` tetap harus dibiarkan berisi komentar saja, dan
`PRISM_CORS_ORIGINS` tetap wajib diisi di Render.

### Alternatif: Netlify

Netlify **bisa** mem-proxy ke domain luar, jadi di sana pendekatan satu-origin
tetap mungkin. Tambahkan dua baris ini ke `frontend/public/_redirects`:

```
/api/*  https://nodus-0qo0.onrender.com/api/:splat  200
/*      /index.html                                200
```

Kalau memakai cara ini, `VITE_API_BASE_URL` **tidak perlu** diisi, dan
`PRISM_CORS_ORIGINS` juga tidak perlu diubah. Setelan build: base `frontend`,
command `npm run build`, publish `frontend/dist`.

### Alternatif: Vercel

Vercel juga bisa mem-proxy. Buat `frontend/vercel.json`:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://nodus-0qo0.onrender.com/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Sama seperti Netlify, `VITE_API_BASE_URL` dan CORS tidak perlu diubah.

## Setelah deploy

Periksa satu per satu, karena kegagalan yang paling umum adalah halaman tampil
tapi datanya kosong:

- [ ] `https://nodus-0qo0.onrender.com/api/health` mengembalikan JSON
- [ ] `https://nodus-0qo0.onrender.com/api/figures` mengembalikan 58 figur
- [ ] `https://nodus-0qo0.onrender.com/api/docs` menampilkan dokumentasi API
- [ ] **Preflight CORS dari origin frontend** mengembalikan
      `access-control-allow-origin` (perintahnya di Langkah 2). Ini yang paling
      sering terlewat, dan gejalanya identik dengan backend mati.
- [ ] Situs frontend terbuka dan daftar figur terisi
- [ ] `/peta` menampilkan 58 node
- [ ] `/matriks` menampilkan tabel
- [ ] `/admin` bisa login dengan password dari langkah seed
- [ ] Refresh langsung di `/figur/1` tidak menghasilkan 404
- [ ] `/cara-baca` memuat halaman bantuan
- [ ] Buka DevTools > Console: tidak ada error CORS

Urutan mendiagnosis kalau halaman tampil tapi kosong:

1. **Console penuh error CORS** → `PRISM_CORS_ORIGINS` di Render belum memuat
   origin Cloudflare, atau ada garis miring di akhir.
2. **Request menuju domain Cloudflare, bukan Render** → `VITE_API_BASE_URL`
   belum di-set saat build. Cek bundle: buka DevTools > Network, lihat URL yang
   dipanggil. Kalau alamatnya `https://<worker>.workers.dev/api/...`, berarti
   variabelnya kosong waktu build dan perlu deploy ulang.
3. **Request menuju Render tapi 404 di `/api/...`** → path di
   `VITE_API_BASE_URL` salah. Nilainya harus diakhiri `/api`.
4. **Refresh di `/figur/1` menghasilkan 404** → `not_found_handling` belum
   terpasang, atau `wrangler.jsonc` tidak terbaca. Pastikan file itu ada di
   root `frontend/`, bukan di root repo.
5. **Daftar figur kosong tapi `/api/health` OK** → `alembic upgrade head` atau
   seeding belum dijalankan.

## Memperbarui data di production

Setelah data diubah lewat dashboard admin, tidak ada yang perlu di-deploy:
perubahannya langsung tersimpan di Neon.

Untuk mengisi ulang data dari seed:

```bash
cd backend
PRISM_DATABASE_URL='postgresql+psycopg://...' \
  /Users/macbook/.hermes/bin/uv run python -m app.seed --force
```

**`--force` menghapus seluruh data lebih dulu.** Jangan dijalankan kalau sudah
ada data asli.

Perhatikan: `--force` tidak menghapus akun admin, dan akan merotasi password
kalau hash yang tersimpan masih cocok dengan default lama yang bocor. Password
admin tidak diubah kalau kamu tidak memakai `--force`.
