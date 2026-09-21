# Akses database lewat DBeaver

Database PRISM adalah **SQLite biasa**: satu file, tanpa server, tanpa user dan
password. Tidak ada yang perlu "dihubungkan" selain menunjuk DBeaver ke filenya.

## Lokasi file

```
/Users/macbook/civ-politics-v2/backend/prism.db
```

Sekitar 311 KB. Isinya:

| Tabel | Baris | Isi |
|---|---:|---|
| `figures` | 58 | Figur politik |
| `relationships` | 150 | Satu baris per pasangan figur |
| `issues` | 24 | Isu yang dipakai untuk menilai |
| `relationship_issues` | 901 | Skor per isu untuk tiap relasi |
| `modifiers` | 90 | Peristiwa yang menggeser skor |
| `users` | 1 | Akun admin |
| `audit_log` | 5 | Catatan perubahan dari dashboard admin |
| `alembic_version` | 1 | Versi skema |

## Hal paling penting sebelum menulis query

**Tidak ada kolom `score` di tabel `relationships`.** Skor dihitung saat dibaca,
bukan disimpan. Kolom yang ada hanya:

```
id, source_id, target_id, rel_type, status, score_mode,
manual_score, since, notes, source_url, created_at, updated_at
```

Kalau kamu menulis `SELECT score FROM relationships`, SQLite akan menjawab
`no such column: score`. Ini disengaja: skor bergantung pada waktu, karena
peristiwa memudar. Skor yang disimpan akan langsung basi.

Rumusnya ada di `backend/app/services/scoring.py`:

```
dasar    = SUM(skor_isu x bobot) / SUM(bobot)
modifier = SUM(nilai x fade)          # hanya modifier yang aktif
mentah   = clamp(dasar + modifier, -100, 100)
skor     = soft_clamp(mentah)         # dibulatkan
```

`soft_clamp` menekan nilai di atas 85 agar mendekati 100 tanpa pernah
melewatinya. Karena itu skor tertinggi di dataset ini 94, bukan 100.

## Menghubungkan DBeaver

1. **Database > New Database Connection**
2. Pilih **SQLite**, klik **Next**
3. Isi **Path**:

   ```
   /Users/macbook/civ-politics-v2/backend/prism.db
   ```

4. **Test Connection**. Kalau muncul dialog mengunduh driver SQLite, setujui.
5. **Finish**

Tidak perlu username, password, host, atau port.

Kalau file terkunci (`database is locked`), hentikan backend dulu. SQLite hanya
mengizinkan satu penulis. Membaca biasanya tetap aman.

## Query yang sudah diuji

Semua query di bawah sudah dijalankan terhadap database ini. Yang paling
penting: **query skor lengkap** di bagian akhir, yang sudah diverifikasi
menghasilkan angka identik dengan aplikasi untuk seluruh 150 relasi.

### Relasi paling bersahabat

```sql
SELECT f.name AS figur, r.rel_type, r.status
FROM relationships r
JOIN figures f ON f.id = r.source_id
ORDER BY r.id
LIMIT 20;
```

Perhatikan: karena skor tidak disimpan, mengurutkan berdasarkan skor butuh
query skor di bagian akhir.

### Isu yang paling memecah

Skor per isu **memang** tersimpan, di `relationship_issues`.

```sql
SELECT i.name AS isu,
       COUNT(*) AS jumlah_relasi,
       ROUND(AVG(ri.score), 1) AS rata_rata,
       MIN(ri.score) AS terendah,
       MAX(ri.score) AS tertinggi
FROM relationship_issues ri
JOIN issues i ON i.id = ri.issue_id
GROUP BY i.id
ORDER BY rata_rata ASC;
```

Hasil nyata dari database ini:

| isu | relasi | rata-rata | terendah | tertinggi |
|---|---:|---:|---:|---:|
| Dinasti Politik & Rekrutmen Kader | 54 | -12.7 | -75 | 60 |
| Hak Asasi Manusia & Pelanggaran Masa Lalu | 35 | -7.7 | -80 | 78 |
| Demokrasi & Integritas Pemilu | 61 | -6.7 | -85 | 72 |

### Relasi satu figur, kedua arah

**Ini jebakan yang paling mudah kena.** Relasi disimpan **sekali per pasangan**,
tanpa arah. Kalau kamu menulis `WHERE source_id = 5`, kamu hanya mendapat
sekitar separuh relasi figur itu.

Sudah dibuktikan: untuk Prabowo Subianto, filter satu sisi hanya menemukan
**27** dari 46 relasinya. Sisa 19 baris menyimpan dia sebagai `target_id`.

Jadi selalu periksa kedua kolom:

```sql
SELECT CASE WHEN f1.name = 'Prabowo Subianto' THEN f2.name ELSE f1.name END AS lawan,
       r.rel_type, r.status
FROM relationships r
JOIN figures f1 ON f1.id = r.source_id
JOIN figures f2 ON f2.id = r.target_id
WHERE f1.name = 'Prabowo Subianto' OR f2.name = 'Prabowo Subianto'
ORDER BY lawan;
```

### Peristiwa yang masih berpengaruh

`fade` tidak disimpan sebagai kolom. Ia dihitung dari `expires_at` dan
`created_at`:

- tanpa `expires_at` berarti permanen, `fade` = 1
- sudah lewat `expires_at`, `fade` = 0 dan peristiwa diabaikan
- selama sisa umurnya masih di atas 25 persen, `fade` = 1
- di bawah itu `fade` turun linear menuju 0

Di dataset ini seluruh 90 modifier punya `expires_at`, dan **hanya 1 yang
`active`**. Jadi hampir semua peristiwa di data contoh sudah kedaluwarsa dan
tidak lagi memengaruhi skor.

```sql
SELECT f.name AS figur, m.label, m.value, m.active, m.expires_at
FROM modifiers m
JOIN relationships r ON r.id = m.relationship_id
JOIN figures f ON f.id = r.source_id
WHERE m.active = 1
ORDER BY m.value DESC;
```

### Rentang skor per isu

```sql
SELECT MIN(score) AS terendah, MAX(score) AS tertinggi, COUNT(*) AS total
FROM relationship_issues;
```

### Skor lengkap, sama persis dengan aplikasi

Query ini meniru `compute_score()` di SQL. Sudah diverifikasi: hasilnya
**identik dengan aplikasi untuk 150 dari 150 relasi**.

```sql
WITH params AS (SELECT julianday('now') AS now),
issue_base AS (
  SELECT relationship_id, SUM(score * weight) AS wsum, SUM(weight) AS wtotal
  FROM relationship_issues GROUP BY relationship_id
),
mod AS (
  SELECT m.relationship_id,
         SUM(m.value * CASE
             WHEN m.expires_at IS NULL THEN 1.0
             WHEN julianday(m.expires_at) <= p.now THEN 0.0
             WHEN m.created_at IS NULL THEN 1.0
             WHEN (julianday(m.expires_at) - julianday(m.created_at)) <= 0 THEN 1.0
             WHEN ((julianday(m.expires_at) - p.now)
                   / (julianday(m.expires_at) - julianday(m.created_at))) >= 0.25 THEN 1.0
             ELSE MAX(0.0, ((julianday(m.expires_at) - p.now)
                   / (julianday(m.expires_at) - julianday(m.created_at))) / 0.25)
           END) AS mtotal
  FROM modifiers m, params p
  WHERE m.active = 1
  GROUP BY m.relationship_id
),
raw AS (
  SELECT r.id,
         COALESCE(ib.wsum, 0) / NULLIF(ib.wtotal, 0) AS base,
         COALESCE(mo.mtotal, 0) AS mtotal
  FROM relationships r
  LEFT JOIN issue_base ib ON ib.relationship_id = r.id
  LEFT JOIN mod mo ON mo.relationship_id = r.id
),
bounded AS (
  SELECT id, MAX(-100, MIN(100, COALESCE(base, 0) + mtotal)) AS v FROM raw
)
SELECT b.id,
       f1.name AS figur_a,
       f2.name AS figur_b,
       CAST(ROUND(
         CASE WHEN ABS(b.v) <= 85 THEN b.v
              ELSE SIGN(b.v) * (85 + 15 * (1 - EXP(-(ABS(b.v) - 85) / 15.0)))
         END
       ) AS INTEGER) AS skor
FROM bounded b
JOIN relationships r ON r.id = b.id
JOIN figures f1 ON f1.id = r.source_id
JOIN figures f2 ON f2.id = r.target_id
ORDER BY skor DESC;
```

Catatan: `EXP()` dan `SIGN()` tersedia di SQLite 3.35 ke atas. Yang dipakai di
sini versi 3.53, jadi aman. Kalau kamu memakai SQLite lama, fungsi-fungsi ini
tidak ada.

## Peringatan sebelum mengubah data langsung

**Jangan menulis langsung ke database saat backend berjalan.** Alasannya:

1. Skor dihitung dari `relationship_issues` dan `modifiers`. Mengubah satu baris
   saja membuat angkanya tidak konsisten dengan yang ditampilkan aplikasi.
2. `modifiers.fade` bergantung pada waktu, jadi skor berubah sendiri seiring
   berjalannya waktu tanpa ada yang menulis apa pun.
3. SQLite hanya mengizinkan satu penulis.

Kalau perlu mengubah data, pakai dashboard admin di
<http://localhost:5173/admin>. Di situ skornya dihitung ulang dan perubahannya
dicatat ke `audit_log`.

## Soal password admin

Password **tidak bisa dilihat**, dan itu memang benar. Kolom
`users.hashed_password` berisi hash bcrypt satu arah:

```
$2b$12$kdFzWzYbT6naPxEISAuGz.G6HZjr4pllMuF...
```

Tidak ada perintah yang bisa mengembalikannya menjadi password, baik lewat
DBeaver maupun lewat aplikasi. Bcrypt memang dirancang begitu. Yang bisa
dilakukan hanya menggantinya, dan itu dijelaskan di bagian berikut.

## Mengganti password admin tanpa menyentuh data

Password admin dibuat acak saat seeding dan hanya dicetak sekali. Kalau sudah
hilang, ganti saja:

```bash
cd /Users/macbook/civ-politics-v2/backend
/Users/macbook/.hermes/bin/uv run python -m app.set_admin_password
```

Perintah ini mencetak password acak baru. Untuk menentukan sendiri:

```bash
/Users/macbook/.hermes/bin/uv run python -m app.set_admin_password --password 'pilihan-kamu'
```

Keduanya hanya mengubah baris admin. Figur, relasi, dan isu tidak tersentuh.
Sudah diuji: setelah mengganti password, login berhasil dan jumlah data tetap
58 figur / 150 relasi / 24 isu.

Untuk database yang sudah di-deploy, tambahkan `PRISM_DATABASE_URL` di depan
perintahnya.

## Melihat database yang sudah di-deploy

Setelah mengikuti `docs/DEPLOY.md`, datanya pindah ke Postgres. DBeaver bisa
menyambung ke sana:

1. **New Database Connection > PostgreSQL**
2. Isi dari connection string Neon:

   | Kolom | Nilai |
   |---|---|
   | Host | `ep-xxx.ap-southeast-1.aws.neon.tech` |
   | Port | `5432` |
   | Database | `neondb` |
   | Username | dari connection string |
   | Password | dari connection string |

3. Tab **SSL**: centang **Use SSL**. Neon menolak koneksi tanpa SSL.
4. **Test Connection**

Kalau koneksi menggantung lalu gagal, compute Neon kemungkinan sedang
di-suspend. Buka dashboard Neon untuk membangunkannya, lalu coba lagi.

Di Postgres, query di atas tetap jalan dengan dua penyesuaian:

1. Ganti `julianday(x)` menjadi `EXTRACT(EPOCH FROM x)`. Keduanya mengubah waktu
   menjadi angka, dan angkanya hanya dipakai dalam pembagian, jadi satuannya
   saling menghapus. Sudah diuji terhadap Postgres 18 dan hasilnya sama.
2. Ganti `MAX(a, b)` / `MIN(a, b)` menjadi `GREATEST(a, b)` / `LEAST(a, b)`.

Poin kedua mudah terlewat. Di SQLite, `MAX` dan `MIN` dengan dua argumen
bertindak sebagai pembanding skalar. Di Postgres, `MAX` dan `MIN` adalah fungsi
agregat, jadi `MAX(-100, MIN(100, x))` akan error atau memberi hasil yang tidak
kamu maksud. Di Postgres pakai `GREATEST(-100, LEAST(100, x))`.

Perbedaan lain: `m.active = 1` di SQLite menjadi `m.active = true` di Postgres,
karena kolomnya bertipe boolean asli.
