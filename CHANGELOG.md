# Changelog

Semua perubahan penting pada proyek ini akan didokumentasikan di file ini.

---

## [1.3.0] - 2026-02-16

### Added
- **Import dari File TXT** — Di modal Edit Konten, sekarang bisa mengisi form otomatis dari file .txt metadata.
  - `title` → diisikan ke field **Topik**
  - `hashtags` → diisikan ke field **Hashtags**
  - `description` → diisikan ke field **Caption**
- **Pilih File .txt lokal** — Tombol untuk browse file .txt dari komputer.
- **Import dari Google Drive** — Paste URL/ID file .txt dari Google Drive, backend akan membaca dan mengurai isinya.
- **Backend endpoint `GET /google-drive/read-txt`** — Membaca file teks dari Google Drive dan mem-parse format `key: value`.
- **Google Drive listing** kini juga menampilkan file `.txt` (sebelumnya hanya video & folder).

---

## [1.2.0] - 2026-02-15

### Added
- **100% Portable** — Aplikasi sekarang bisa dijalankan dari folder/USB manapun tanpa instalasi.
- **start.bat** — Launcher satu klik yang menjalankan backend + frontend sekaligus. Otomatis install `node_modules` jika belum ada.
- **stop.bat** — Script untuk menghentikan semua layanan (backend & frontend) sekaligus.
- **install.bat** — Script setup pertama kali untuk install dependencies.

### Changed
- **start-backend.ps1** — Path diubah dari hardcoded absolute (`E:\OPUS2026\TIKTOK\...`) menjadi relative terhadap lokasi script, sehingga bisa jalan dari folder manapun.

---

## [1.1.0] - 2026-02-15

### Added
- **Edit Topik Konten** — Tombol edit (pencil) sekarang selalu tampil di setiap baris konten, bukan hanya untuk konten yang sudah punya caption.
- **Field Topik di Edit Modal** — Modal edit konten sekarang memiliki field "Topik" di bagian atas, sehingga pengguna bisa mengedit topik (`brief_topic`) langsung dari UI.

### Changed
- Modal "Edit Caption" diubah namanya menjadi **"Edit Konten"** karena sekarang mencakup pengeditan topik dan caption.
- Validasi tombol simpan berubah: memerlukan topik yang terisi (sebelumnya memerlukan caption).
- Request `PATCH /contents/:id` sekarang juga mengirimkan `brief_topic` saat menyimpan perubahan.

---

## [1.0.0] - Initial Release

### Features
- Manajemen konten TikTok & YouTube
- Upload video via browser automation & API
- AI caption & hashtag generator
- Penjadwalan posting
- Manajemen akun TikTok & YouTube
- Dashboard dengan statistik
- Integrasi Google Drive
- Notifikasi Telegram
- Manajemen bulk operations
- Sistem autentikasi & role-based access
