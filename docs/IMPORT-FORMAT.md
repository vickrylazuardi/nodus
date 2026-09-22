# Format kontribusi data

PRISM menerima data dari luar lewat dua format. Keduanya melewati pemeriksaan
yang sama, jadi tidak ada cara untuk menyelundupkan data yang tidak valid.

**Aturan pertama: rujukan memakai nama, bukan id.** Id database hanya berarti di
dalam satu instalasi. Kontributor luar tidak tahu id apa pun, jadi setiap
rujukan ditulis sebagai nama yang persis sama.

## Ringkas: mana yang sebaiknya dipakai

| Keadaan | Format |
|---|---|
| Punya data lengkap dengan skor per isu | **JSON** (satu file, semua sekaligus) |
| Bekerja di Excel atau Google Sheets | **CSV** (satu file per jenis data) |
| Baru pertama kali | Unduh contoh dari dashboard admin, lalu isi |

---

# Format 1: JSON

Satu file berisi semuanya. Ini format yang disarankan: urutan tidak penting,
hubungan bisa menyertakan skor per isu, dan seluruhnya masuk dalam satu
transaksi.

```json
{
  "format": "prism-bundle",
  "version": 1,
  "figures": [
    {
      "name": "Prabowo Subianto",
      "full_name": "Prabowo Subianto Djojohadikusumo",
      "role": "Presiden",
      "party": "Gerindra",
      "bloc": "KIM",
      "region": "Nasional",
      "influence": 95,
      "bio": "Kalimat singkat.",
      "tags": ["ekonomi", "pertahanan"]
    }
  ],
  "issues": [
    {
      "name": "Dinasti Politik & Rekrutmen Kader",
      "category": "Struktur Kekuasaan",
      "description": "Seberapa jauh kedekatan keluarga memengaruhi jabatan.",
      "default_weight": 1.5,
      "sort_order": 1
    }
  ],
  "relationships": [
    {
      "source": "Prabowo Subianto",
      "target": "Gibran Rakabuming Raka",
      "rel_type": "coalition",
      "status": "active",
      "since": "2024",
      "notes": "Catatan singkat.",
      "source_url": "https://contoh.go.id/sumber",
      "issues": [
        {
          "issue": "Dinasti Politik & Rekrutmen Kader",
          "score": 80,
          "weight": 1.5,
          "stance": "Satu komando.",
          "evidence_url": "https://contoh.go.id/bukti"
        }
      ],
      "modifiers": [
        {
          "label": "Dukungan terbuka di rapat umum",
          "value": 10,
          "kind": "support",
          "active": true,
          "expires_at": "2027-01-01T00:00:00Z",
          "note": "Mereda setelah setahun."
        }
      ]
    }
  ]
}
```

`format` dan `version` wajib ada. Kalau versinya tidak dikenali, impor berhenti
dengan pesan yang jelas, bukan menebak.

Hanya `figures` yang wajib. `issues` dan `relationships` boleh kosong atau
tidak ada.

---

# Format 2: CSV

Satu file per jenis data. Kontributor boleh mengirim hanya sebagian: mengirim
`figures.csv` saja itu sah.

## figures.csv

```csv
name,full_name,role,party,bloc,region,influence,bio,tags
Prabowo Subianto,Prabowo Subianto Djojohadikusumo,Presiden,Gerindra,KIM,Nasional,95,Kalimat singkat.,ekonomi;pertahanan
```

`tags` dipisah dengan titik koma, bukan koma, karena koma sudah dipakai sebagai
pemisah kolom.

## issues.csv

```csv
name,category,description,default_weight,sort_order
Dinasti Politik & Rekrutmen Kader,Struktur Kekuasaan,Seberapa jauh kedekatan keluarga memengaruhi jabatan.,1.5,1
```

## relationships.csv

```csv
source,target,rel_type,status,since,notes,source_url
Prabowo Subianto,Gibran Rakabuming Raka,coalition,active,2024,Catatan singkat.,https://contoh.go.id/sumber
```

## relationship_issues.csv

Skor per isu untuk tiap relasi. Kolom `source` dan `target` merujuk relasi yang
sudah ada, baik dari `relationships.csv` di unggahan yang sama maupun yang sudah
ada di database.

```csv
source,target,issue,score,weight,stance,evidence_url
Prabowo Subianto,Gibran Rakabuming Raka,Dinasti Politik & Rekrutmen Kader,80,1.5,Satu komando.,https://contoh.go.id/bukti
```

## modifiers.csv

Peristiwa yang menggeser skor lalu memudar. Sama seperti
`relationship_issues.csv`, kolom `source` dan `target` merujuk relasi yang sudah
ada.

```csv
source,target,label,value,kind,active,expires_at,note
Prabowo Subianto,Gibran Rakabuming Raka,Dukungan terbuka di rapat umum,10,support,true,2027-01-01T00:00:00Z,Mereda setelah setahun.
```

**Penting:** baris di `relationship_issues.csv` dan `modifiers.csv` hanya perlu
mengisi `source` dan `target`. Kolom lain di file itu boleh dibiarkan kosong, dan
kolom yang kosong **tidak akan mengubah** nilai yang sudah tersimpan. Sebelumnya
`rel_type` yang kosong berubah menjadi `political`, sehingga satu baris peristiwa
bisa diam-diam mengubah jenis relasi yang tersimpan.

---

# Aturan yang ditegakkan

Semua aturan di bawah diperiksa **sebelum** ada satu baris pun yang ditulis.
Kalau ada satu kesalahan, tidak ada yang berubah sama sekali.

## Rujukan

- `source` dan `target` harus merujuk figur yang ada, baik dari file yang sama
  maupun dari database.
- `issue` harus merujuk isu yang ada.
- Nama dicocokkan **tanpa membedakan huruf besar-kecil dan spasi berlebih**.
  `"prabowo subianto"` dan `" Prabowo  Subianto "` dianggap sama. Ini disengaja:
  kontributor sering menyalin nama dari sumber yang berbeda.

## Relasi tidak berarah

Relasi disimpan **sekali per pasangan**, bukan dua kali. `(A, B)` dan `(B, A)`
adalah relasi yang sama.

Ini penting karena **database tidak mencegahnya sendiri**. Kunci unik yang ada
hanya pada pasangan `(source_id, target_id)` yang berurutan, jadi menulis `(A,B)`
lalu `(B,A)` akan menghasilkan dua baris. Relasi ganda membuat matriks menghitung
dua kali dan peta menggambar dua garis.

Karena itu importer menormalkan pasangan sebelum menulis:

- Kalau satu file memuat `A,B` **dan** `B,A`, impor **berhenti** dan melaporkan
  kedua nomor barisnya. Importer tidak menebak mana yang benar.
- Kalau `B,A` diunggah sementara `A,B` sudah ada di database, baris yang ada
  **diperbarui**, bukan diduplikasi.

## Batas nilai

| Kolom | Batas |
|---|---|
| `name` | wajib, 1 sampai 120 karakter, unik |
| `influence` | 0 sampai 100 |
| `default_weight` | 0 sampai 10 |
| `score` | -100 sampai 100 |
| `weight` | 0 sampai 10 |
| `rel_type` | `political`, `coalition`, `family`, `business`, `party`, `government` |
| `score_mode` | `computed`, `manual`, `blended` |
| `kind` | `event`, `scandal`, `deal`, `betrayal`, `support`, `endorsement`, `legal` |
| `expires_at` | ISO 8601, contoh `2027-01-01T00:00:00Z` |

`source` dan `target` tidak boleh figur yang sama.

## Yang diperbarui dan yang dibuat

Baris dicocokkan berdasarkan nama:

- **Nama belum ada** berarti dibuat.
- **Nama sudah ada** berarti diperbarui. Kolom yang tidak ada di file
  dibiarkan apa adanya, tidak dikosongkan.

---

# Cara memakai

1. Buka **Dashboard admin > Impor**.
2. Pilih file JSON, atau pilih beberapa file CSV sekaligus.
3. Klik **Periksa dulu**. Tidak ada yang ditulis pada langkah ini.
4. Baca laporannya. Kalau ada kesalahan, perbaiki filenya lalu ulangi.
5. Kalau sudah bersih, klik **Terapkan**.

## Selalu periksa dulu

Tombol **Periksa dulu** menjalankan pemeriksaan yang sama persis dengan
**Terapkan**, termasuk pencocokan nama dan deteksi pasangan terbalik. Bedanya
hanya satu: periksa tidak menulis. Jadi laporan yang bersih berarti penerapan
akan berhasil.

## Membatalkan

Impor berjalan dalam satu transaksi. Kalau ada satu baris gagal, seluruh
unggahan dibatalkan dan database kembali seperti sebelumnya. Tidak ada kondisi
setengah jadi.

## Setelah impor

Setiap impor dicatat di `audit_log` dengan jumlah baris yang dibuat dan
diperbarui. Lihat di **Dashboard admin > Audit**.

Skor tidak perlu diisi untuk relasi yang memakai `score_mode: "computed"`.
Skornya dihitung dari skor per isu dan peristiwa, jadi mengisi `manual_score`
pada mode itu tidak berpengaruh.
