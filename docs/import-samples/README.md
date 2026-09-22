# Contoh berkas impor

Berkas di folder ini untuk **menguji fitur impor**, bukan untuk langsung dipakai
sebagai data final. Isinya perubahan yang punya tanggal dan sumber, dikumpulkan
pada **22 September 2026**.

Dua berkas berisi data yang sama dalam dua format:

| Berkas | Format |
|---|---|
| `prism-update-2026-09.json` | Satu bundle JSON, termasuk peristiwa |
| `figures.csv`, `issues.csv`, `relationships.csv`, `relationship_issues.csv`, `modifiers.csv` | Lima berkas CSV |

Keduanya sudah diuji: diterapkan ke salinan database asli, hasilnya identik.
Figur 58 menjadi 60, relasi 150 menjadi 153, peristiwa 90 menjadi 94.

## Peringatan sebelum memakai

Berkas ini **belum diterapkan ke database mana pun**. Semuanya masih berupa
usulan. Sebelum menerapkan ke data sungguhan, periksa dua hal:

1. **Angka pengaruh dan skor isu adalah taksiran penulis**, bukan hasil ukur.
   Sama seperti seluruh data lain di proyek ini. Kalau kamu punya angka yang
   lebih baik, ganti dulu.
2. **Beberapa peristiwa masih berjalan.** Amnesti Hasto dan gugatan MK soal
   Gibran keduanya baru berjalan pada September 2026 dan hasilnya belum final.

## Yang diubah, dan dasarnya

### Dua figur baru

| Figur | Jabatan | Dasar |
|---|---|---|
| Suahasil Nazara | Menteri Keuangan | Dilantik Prabowo 14 September 2026, menggantikan Purbaya Yudhi Sadewa. Sebelumnya Wakil Menteri Keuangan. |
| Purbaya Yudhi Sadewa | Mantan Menteri Keuangan | Dicopot 14 September 2026 dalam reshuffle keenam. Menyatakan tidak ingin kembali ke pemerintahan. |

### Dua jabatan yang sudah tidak benar

| Figur | Sebelumnya | Menjadi | Dasar |
|---|---|---|---|
| Anies Baswedan | Gubernur DKI Jakarta | Mantan Gubernur DKI Jakarta | Kursi gubernur dipegang Pramono Anung, dilantik 20 Februari 2025. Data lama membuat **dua figur sekaligus** mengaku Gubernur DKI. |
| Sri Mulyani Indrawati | Menteri Keuangan | Ketua Independen IDA22, Bank Dunia | Menunjuk Sri Mulyani sebagai Ketua Independen Asosiasi Pengembangan Internasional pada Agustus 2026. |

Kesalahan Anies adalah yang paling merusak: dua figur memegang jabatan yang sama
membuat perbandingan jabatan di seluruh aplikasi tidak bisa dipercaya.

### Satu isu yang deskripsinya kedaluwarsa

`Agraria & Konflik Lahan`: RUU Pengaturan Reforma Agraria **disahkan menjadi
undang-undang pada 22 September 2026**. Deskripsi lama menyebutnya masih rancangan.

### Tiga relasi baru

| Relasi | Jenis | Dasar |
|---|---|---|
| Prabowo - Suahasil Nazara | coalition | Pelantikan Menkeu 14 September 2026 |
| Sri Mulyani - Suahasil Nazara | government | Rekan satu kementerian sejak 2016 |
| Gibran - Denny Indrayana | political | Gugatan syarat pendidikan cawapres ke MK, 21 September 2026 |

### Empat peristiwa baru

| Relasi | Peristiwa | Nilai | Dasar |
|---|---|---|---|
| Prabowo - Hasto Kristiyanto | Amnesti Presiden | +30 | KPK menghentikan seluruh proses hukum Hasto setelah amnesti Prabowo. Dibaca sebagai upaya merangkul PDI-P. |
| Prabowo - Nusron Wahid | KPK usut suap ATR/BPN | -16 | Delapan tersangka dugaan korupsi HGB ditetapkan 15 September 2026. |
| Prabowo - Puan Maharani | UU Reforma Agraria disahkan | +12 | DPR mengesahkan 22 September 2026, agenda yang didorong pemerintah. |
| Prabowo - Anies Baswedan | Elektabilitas Anies naik | -8 | Beberapa survei 2026 menempatkan Anies di peringkat kedua. |

## Yang **tidak** diubah, dan alasannya

Sengaja dibiarkan, supaya kamu tahu ini pilihan dan bukan kelalaian:

- **Hasto Kristiyanto tetap tersangka di data lama.** Peristiwa amnesti
  ditambahkan sebagai penggeser skor, tetapi status hukum lamanya tidak dihapus.
  Menghapus jejaknya akan menyembunyikan bahwa proses itu pernah ada.
- **Skor relasi tidak diubah langsung.** Semuanya memakai `score_mode: computed`,
  jadi skor dihitung dari skor per isu dan peristiwa. Mengubah angkanya langsung
  tidak akan berpengaruh.
- **Isu tidak ditambah.** Perubahan politik September 2026 masuk ke isu yang sudah
  ada, bukan membuat isu baru.
- **Survei tidak dipakai sebagai skor.** Angka elektabilitas bergerak tiap bulan
  dan tiap lembaga berbeda metodologi. Yang dicatat hanya peristiwanya.

## Cara menguji

1. Masuk ke **Dashboard admin > Impor**.
2. Pilih **salah satu**: `prism-update-2026-09.json`, atau kelima berkas CSV.
   Jangan mencampur keduanya dalam satu unggahan.
3. Klik **Periksa dulu**. Tidak ada yang ditulis.
4. Baca laporannya. Harusnya bersih, dengan angka:

   | Jenis | Baru | Diperbarui |
   |---|---:|---:|
   | Figur | 2 | 2 |
   | Isu | 0 | 1 |
   | Relasi | 3 | 4 |
   | Peristiwa | 4 | 0 |

5. Kalau sudah yakin, klik **Terapkan**.

Karena kedua format menghasilkan data yang sama, keduanya bisa dipakai untuk
membandingkan perilaku antarmuka. Untuk membatalkan, pulihkan dari cadangan
database: impor tidak punya tombol undo.
