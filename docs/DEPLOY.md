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
  |  https://prism.pages.dev          (Cloudflare Pages, statis)
  |      /api/*  --> diteruskan ke backend
  v
https://prism-api.onrender.com        (Render, FastAPI)
  |
  v
postgresql://...neon.tech             (Neon, Postgres)
```

Frontend memanggil API lewat path relatif `/api` (`src/lib/api.ts` baris 21:
`const BASE = "/api";`). Artinya browser selalu berada di satu origin, jadi
**tidak perlu mengatur CORS** selama penerusan `/api/*` dikonfigurasi. Ini juga
membuat cookie dan header berperilaku sama seperti di lokal.

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

   **Jangan** setel `PRISM_CORS_ORIGINS` kalau kamu memakai penerusan `/api/*`
   di Langkah 3. Kalau tidak, kamu harus mengisinya dengan JSON yang valid:

   ```
   PRISM_CORS_ORIGINS=["https://prism.pages.dev"]
   ```

   Nilai ini dibaca sebagai JSON oleh pydantic-settings. Menulis
   `https://prism.pages.dev` tanpa tanda kurung siku akan membuat aplikasi
   gagal start.

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

## Langkah 3: Frontend di Cloudflare Pages

1. Daftar di <https://pages.cloudflare.com>, hubungkan GitHub.
2. **Create application > Pages > Connect to Git**, pilih repo ini.
3. Setelan build:

   | Kolom | Nilai |
   |---|---|
   | Framework preset | None |
   | Root directory | `frontend` |
   | Build command | `npm ci && npm run build` |
   | Build output directory | `dist` |
   | Environment variable | `NODE_VERSION` = `20` |

4. Tambahkan file `frontend/public/_redirects` **sebelum** build. Isinya:

   ```
   /api/*  https://prism-api.onrender.com/api/:splat  200
   /*      /index.html                                200
   ```

   Baris pertama meneruskan API ke Render sehingga browser tetap di satu origin
   dan CORS tidak diperlukan. Baris kedua penting untuk React Router: tanpa itu,
   membuka `https://prism.pages.dev/figur/1` langsung akan menghasilkan 404,
   karena Cloudflare akan mencari file bernama `figur/1` yang tidak ada.

   Ganti `prism-api.onrender.com` dengan domain Render kamu.

5. Deploy. Buka URL yang diberikan Cloudflare Pages.

### Alternatif: Netlify

Format `_redirects` di atas sama persis, taruh di `frontend/public/`. Setelan
build: base `frontend`, command `npm run build`, publish `frontend/dist`.

### Alternatif: Vercel

Vercel tidak membaca `_redirects`. Buat `frontend/vercel.json`:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://prism-api.onrender.com/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

## Setelah deploy

Periksa satu per satu, karena kegagalan yang paling umum adalah halaman tampil
tapi datanya kosong:

- [ ] `https://prism-api.onrender.com/api/health` mengembalikan JSON
- [ ] `https://prism-api.onrender.com/api/figures` mengembalikan 58 figur
- [ ] `https://prism-api.onrender.com/docs` menampilkan dokumentasi API
- [ ] Situs frontend terbuka dan daftar figur terisi
- [ ] `/peta` menampilkan 58 node
- [ ] `/matriks` menampilkan tabel
- [ ] `/admin` bisa login dengan password dari langkah seed
- [ ] Refresh langsung di `/figur/1` tidak menghasilkan 404
- [ ] `/cara-baca` memuat halaman bantuan

Kalau daftar figur kosong tapi `/api/health` OK, berarti `alembic upgrade head`
atau seeding belum dijalankan. Kalau frontend terbuka tapi semua request API
gagal dengan error jaringan, periksa `_redirects`.

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
