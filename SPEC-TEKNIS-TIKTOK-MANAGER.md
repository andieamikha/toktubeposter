# Spesifikasi Teknis: Assisted TikTok Posting Manager

**Versi:** 1.0.0
**Tanggal:** 11 Februari 2026
**Penulis:** Lead Engineer & Product Architect
**Status:** Draft Final — Siap Implementasi

---

## Daftar Isi

1. [Ringkasan Produk & Non-Goals](#1-ringkasan-produk--non-goals)
2. [Persona & Flow Operasional Harian](#2-persona--flow-operasional-harian)
3. [Data Model](#3-data-model)
4. [API Design](#4-api-design)
5. [Job/Queue Design](#5-jobqueue-design)
6. [Bulk Generator](#6-bulk-generator)
7. [AI Prompting](#7-ai-prompting)
8. [UX Copy Bahasa Indonesia](#8-ux-copy-bahasa-indonesia)
9. [Security & Compliance](#9-security--compliance)
10. [MVP Plan](#10-mvp-plan)

---

## 1. Ringkasan Produk & Non-Goals

### 1.1 Ringkasan

**Assisted TikTok Posting Manager** adalah aplikasi web dashboard internal untuk mengelola posting konten TikTok secara manual-assisted pada 100+ akun TikTok personal, dioperasikan oleh 3+ operator. Aplikasi **tidak** melakukan posting otomatis; operator tetap memposting melalui TikTok Web secara manual. Aplikasi menyediakan:

- **Scheduler** — penjadwalan posting per akun dengan window 08:00–22:00.
- **Task Management** — daftar tugas harian per operator.
- **Execution Page** — halaman eksekusi dengan tombol copy caption+hashtag, checklist, dan input URL bukti posting.
- **AI Caption & Hashtag Generator** — generate 5 opsi caption+hashtag berbasis brief per niche.
- **Notifikasi Telegram DM** — reminder otomatis ke operator via Telegram bot.
- **Dashboard Monitoring** — pemantauan real-time posting harian per akun/operator.

### 1.2 Non-Goals (Hal yang TIDAK dilakukan)

| # | Non-Goal | Alasan |
|---|----------|--------|
| 1 | **Auto-upload video ke TikTok** | Melanggar ToS TikTok; tidak ada TikTok API resmi untuk posting |
| 2 | **Import cookies / session TikTok** | Risiko keamanan tinggi; melanggar ToS |
| 3 | **Web automation / Puppeteer / Selenium upload** | Tidak reliable; melanggar ToS; deteksi bot |
| 4 | **Scraping TikTok** | Melanggar ToS; IP blocking |
| 5 | **Login ke akun TikTok operator** | Sistem tidak pernah menyentuh credential TikTok |
| 6 | **Menyimpan/upload video ke server** | Hanya menyimpan Google Drive link |
| 7 | **Analytics TikTok** | Di luar scope; tidak ada API resmi |

### 1.3 Batasan Arsitektural

- Video disimpan di Google Drive; aplikasi hanya menyimpan URL Google Drive.
- Semua posting dilakukan manual oleh operator melalui browser TikTok Web.
- URL TikTok yang diinput sebagai bukti posting harus format lengkap (`https://www.tiktok.com/...`), short link ditolak.
- 1 konten video hanya untuk 1 akun (tidak reuse).

---

## 2. Persona & Flow Operasional Harian

### 2.1 Persona

#### Admin (Pemilik/Manager)
- Mengelola akun TikTok (CRUD, assign operator default).
- Membuat konten/asset (brief + drive link + generate AI caption).
- Membuat jadwal manual atau bulk generate.
- Memonitor dashboard harian.
- Mengelola operator (CRUD, re-assign akun massal).

#### Operator
- Melihat daftar tugas harian ("Tugas Saya").
- Mengeksekusi posting: buka TikTok Web → upload video → copy caption+hashtag → paste → posting.
- Mark done + tempel URL TikTok sebagai bukti.
- Menerima notifikasi Telegram.

### 2.2 Flow Operasional Harian — Admin

```
┌─────────────────────────────────────────────────────────────┐
│                    FLOW HARIAN ADMIN                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  07:00  Admin login ke dashboard                            │
│    │                                                        │
│    ▼                                                        │
│  07:15  Admin membuat konten/asset baru                     │
│         → Input: Google Drive link + brief                  │
│         → Generate AI: 5 opsi caption+hashtag               │
│         → Pilih & edit final → Status: READY                │
│    │                                                        │
│    ▼                                                        │
│  07:30  Admin buka "Generate Massal"                        │
│         → Pilih tanggal (hari ini atau besok)               │
│         → Set frekuensi: 1–3 post/akun/hari                 │
│         → Sistem generate preview jadwal                    │
│         → Admin review → klik "Publish Jadwal"              │
│    │                                                        │
│    ▼                                                        │
│  08:00+ Jadwal mulai berjalan                               │
│    │    Notifikasi Telegram terkirim ke operator             │
│    │                                                        │
│    ▼                                                        │
│  Sepanjang hari: Monitor dashboard                          │
│         → Lihat scheduled vs done vs overdue vs missed      │
│         → Per akun, per operator                            │
│         → Tindak lanjut jika ada overdue/missed             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Flow Operasional Harian — Operator

```
┌─────────────────────────────────────────────────────────────┐
│                   FLOW HARIAN OPERATOR                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Terima notif Telegram: "Posting untuk @akun_xyz jam 09:00" │
│    │                                                        │
│    ▼                                                        │
│  Login ke dashboard → buka "Tugas Saya"                     │
│    │                                                        │
│    ▼                                                        │
│  Lihat daftar posting hari ini (diurutkan waktu)            │
│    │                                                        │
│    ▼                                                        │
│  Klik tugas → masuk Execution Page                          │
│    │                                                        │
│    ├─ [1] Buka Google Drive link → download video           │
│    │                                                        │
│    ├─ [2] Klik "Copy untuk TikTok"                          │
│    │       → Caption + hashtag ter-copy ke clipboard        │
│    │                                                        │
│    ├─ [3] Buka TikTok Web → upload video → paste caption    │
│    │       → publish di TikTok                              │
│    │                                                        │
│    ├─ [4] Copy URL posting TikTok                           │
│    │                                                        │
│    ├─ [5] Kembali ke Execution Page                         │
│    │       → Paste URL TikTok di field bukti                │
│    │       → Klik "Tandai Selesai"                          │
│    │                                                        │
│    ▼                                                        │
│  Status berubah: DONE ✓                                     │
│  Lanjut ke tugas berikutnya                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.4 Flow Setup Telegram (Satu Kali per Operator)

```
1. Operator login → buka halaman "Profil"
2. Klik "Hubungkan Telegram" → sistem generate kode unik (6 karakter, exp 10 menit)
3. Operator buka Telegram → chat bot → kirim: /start ABC123
4. Bot verifikasi kode → simpan telegram_chat_id ke user
5. Operator menerima pesan konfirmasi: "Telegram berhasil dihubungkan!"
```

---

## 3. Data Model

### 3.1 ERD Deskriptif

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────────┐
│    users      │       │  tiktok_accounts │       │     contents     │
├──────────────┤       ├──────────────────┤       ├──────────────────┤
│ id (PK)      │◄──┐   │ id (PK)          │       │ id (PK)          │
│ email        │   │   │ username         │       │ tiktok_account_id│──► tiktok_accounts
│ password_hash│   │   │ display_name     │       │ drive_url        │
│ full_name    │   ├───│ default_operator │       │ brief_topic      │
│ role         │   │   │ niche            │       │ brief_points     │
│ tg_chat_id   │   │   │ is_active        │       │ target_audience  │
│ tg_link_code │   │   │ created_at       │       │ tone             │
│ tg_code_exp  │   │   │ updated_at       │       │ niche_template   │
│ created_at   │   │   └──────────────────┘       │ ai_options (JSON)│
│ updated_at   │   │                              │ final_caption    │
└──────────────┘   │                              │ final_hashtags   │
       ▲           │                              │ status           │
       │           │                              │ created_by (FK)  │──► users
       │           │                              │ created_at       │
       │           │                              │ updated_at       │
       │           │                              └──────────────────┘
       │           │                                      │
       │           │                                      ▼
       │           │                            ┌──────────────────┐
       │           │                            │ scheduled_posts  │
       │           │                            ├──────────────────┤
       │           │                            │ id (PK)          │
       │           └────────────────────────────│ assigned_operator│
       │                                        │ content_id (FK)  │──► contents
       │                                        │ tiktok_account_id│──► tiktok_accounts
       │                                        │ scheduled_at     │
       │                                        │ status           │
       │                                        │ tiktok_url       │
       │                                        │ posted_at        │
       │                                        │ created_by (FK)  │──► users
       │                                        │ batch_id         │
       │                                        │ created_at       │
       │                                        │ updated_at       │
       │                                        └──────────────────┘
       │
       │           ┌──────────────────┐       ┌──────────────────┐
       │           │   audit_logs     │       │  notifications   │
       │           ├──────────────────┤       ├──────────────────┤
       └───────────│ user_id (FK)     │       │ id (PK)          │
                   │ id (PK)          │       │ scheduled_post_id│──► scheduled_posts
                   │ action           │       │ user_id (FK)     │──► users
                   │ entity_type      │       │ type             │
                   │ entity_id        │       │ sent_at          │
                   │ old_value (JSON) │       │ status           │
                   │ new_value (JSON) │       │ error_message    │
                   │ ip_address       │       │ created_at       │
                   │ created_at       │       └──────────────────┘
                   └──────────────────┘
```

### 3.2 Daftar Tabel Lengkap

#### Tabel: `users`

| Kolom | Tipe | Constraints | Keterangan |
|-------|------|-------------|------------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | ID unik |
| `email` | `VARCHAR(255)` | NOT NULL, UNIQUE | Email login |
| `password_hash` | `VARCHAR(255)` | NOT NULL | Bcrypt hash |
| `full_name` | `VARCHAR(100)` | NOT NULL | Nama lengkap |
| `role` | `VARCHAR(20)` | NOT NULL, CHECK IN ('admin','operator') | Peran |
| `telegram_chat_id` | `VARCHAR(50)` | NULLABLE, UNIQUE | Chat ID Telegram |
| `telegram_link_code` | `VARCHAR(10)` | NULLABLE | Kode link sementara |
| `telegram_code_expires_at` | `TIMESTAMPTZ` | NULLABLE | Expiry kode link |
| `is_active` | `BOOLEAN` | NOT NULL DEFAULT true | Status aktif |
| `last_login_at` | `TIMESTAMPTZ` | NULLABLE | Terakhir login |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT NOW() | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT NOW() | |

**Index:**
- `idx_users_email` — UNIQUE pada `email`
- `idx_users_role` — B-tree pada `role`
- `idx_users_telegram_chat_id` — UNIQUE pada `telegram_chat_id` WHERE NOT NULL
- `idx_users_telegram_link_code` — pada `telegram_link_code` WHERE NOT NULL

---

#### Tabel: `tiktok_accounts`

| Kolom | Tipe | Constraints | Keterangan |
|-------|------|-------------|------------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | ID unik |
| `username` | `VARCHAR(100)` | NOT NULL, UNIQUE | Username TikTok (tanpa @) |
| `display_name` | `VARCHAR(200)` | NULLABLE | Nama tampilan |
| `niche` | `VARCHAR(50)` | NOT NULL, CHECK IN ('bisnis','kesehatan','fitnes') | Kategori niche |
| `default_operator_id` | `UUID` | FK → users(id), NULLABLE | Operator default |
| `notes` | `TEXT` | NULLABLE | Catatan internal |
| `is_active` | `BOOLEAN` | NOT NULL DEFAULT true | Status aktif |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT NOW() | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT NOW() | |

**Index:**
- `idx_tiktok_accounts_username` — UNIQUE pada `username`
- `idx_tiktok_accounts_default_operator` — B-tree pada `default_operator_id`
- `idx_tiktok_accounts_niche` — B-tree pada `niche`
- `idx_tiktok_accounts_active` — B-tree pada `is_active`

---

#### Tabel: `contents`

| Kolom | Tipe | Constraints | Keterangan |
|-------|------|-------------|------------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | ID unik |
| `tiktok_account_id` | `UUID` | FK → tiktok_accounts(id), NOT NULL | Akun tujuan |
| `drive_url` | `VARCHAR(500)` | NOT NULL | Google Drive link video |
| `brief_topic` | `VARCHAR(300)` | NOT NULL | Topik/judul brief |
| `brief_points` | `TEXT[]` | NOT NULL, CHECK array_length >= 3 AND <= 7 | 3–7 poin penting |
| `target_audience` | `VARCHAR(200)` | NULLABLE | Target audiens (opsional) |
| `tone` | `VARCHAR(100)` | NULLABLE | Tone konten (opsional) |
| `niche_template` | `VARCHAR(50)` | NOT NULL, CHECK IN ('bisnis','kesehatan','fitnes') | Template niche AI |
| `ai_options` | `JSONB` | NULLABLE | 5 opsi hasil AI [{caption, hashtags}] |
| `selected_option_index` | `SMALLINT` | NULLABLE, CHECK 0–4 | Index opsi yang dipilih |
| `final_caption` | `TEXT` | NULLABLE | Caption final (editable) |
| `final_hashtags` | `TEXT[]` | NULLABLE | Hashtags final tanpa # |
| `status` | `VARCHAR(20)` | NOT NULL DEFAULT 'draft', CHECK IN ('draft','ai_generated','ready','used') | Status konten |
| `created_by` | `UUID` | FK → users(id), NOT NULL | Pembuat |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT NOW() | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT NOW() | |

**Index:**
- `idx_contents_tiktok_account` — B-tree pada `tiktok_account_id`
- `idx_contents_status` — B-tree pada `status`
- `idx_contents_created_by` — B-tree pada `created_by`
- `idx_contents_status_account` — Composite pada `(status, tiktok_account_id)` — untuk bulk generator mencari konten ready per akun

**Constraint tambahan:**
- `chk_content_ready` — Jika `status = 'ready'`, maka `final_caption IS NOT NULL AND final_hashtags IS NOT NULL`
- `unique_content_per_account` — 1 konten hanya untuk 1 akun (inherent dari FK `tiktok_account_id`)

---

#### Tabel: `scheduled_posts`

| Kolom | Tipe | Constraints | Keterangan |
|-------|------|-------------|------------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | ID unik |
| `content_id` | `UUID` | FK → contents(id), NOT NULL, UNIQUE | 1 konten = 1 jadwal |
| `tiktok_account_id` | `UUID` | FK → tiktok_accounts(id), NOT NULL | Akun TikTok |
| `assigned_operator_id` | `UUID` | FK → users(id), NOT NULL | Operator yang ditugaskan |
| `scheduled_at` | `TIMESTAMPTZ` | NOT NULL | Waktu jadwal posting |
| `status` | `VARCHAR(20)` | NOT NULL DEFAULT 'scheduled', CHECK IN ('scheduled','due','overdue','missed','done','canceled') | Status |
| `tiktok_url` | `VARCHAR(500)` | NULLABLE | URL posting TikTok (bukti) |
| `posted_at` | `TIMESTAMPTZ` | NULLABLE | Waktu aktual posting |
| `batch_id` | `UUID` | NULLABLE | ID batch jika dari bulk generate |
| `notes` | `TEXT` | NULLABLE | Catatan |
| `created_by` | `UUID` | FK → users(id), NOT NULL | Pembuat jadwal |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT NOW() | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT NOW() | |

**Index:**
- `idx_sp_content` — UNIQUE pada `content_id`
- `idx_sp_account_scheduled` — Composite pada `(tiktok_account_id, scheduled_at)` — untuk cek gap 2 jam
- `idx_sp_operator_date` — Composite pada `(assigned_operator_id, scheduled_at)` — untuk "Tugas Saya"
- `idx_sp_status` — B-tree pada `status`
- `idx_sp_scheduled_at` — B-tree pada `scheduled_at` — untuk reconciler
- `idx_sp_batch` — B-tree pada `batch_id` WHERE NOT NULL
- `idx_sp_status_scheduled` — Composite pada `(status, scheduled_at)` — untuk query dashboard & reconciler

**Constraint tambahan:**
- `chk_tiktok_url_format` — CHECK (`tiktok_url IS NULL OR tiktok_url LIKE 'https://www.tiktok.com/%'`)
- `chk_done_requires_url` — CHECK (`status != 'done' OR tiktok_url IS NOT NULL`)

---

#### Tabel: `bulk_batches`

| Kolom | Tipe | Constraints | Keterangan |
|-------|------|-------------|------------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | ID batch |
| `target_date` | `DATE` | NOT NULL | Tanggal target |
| `frequency_min` | `SMALLINT` | NOT NULL DEFAULT 1 | Min post per akun |
| `frequency_max` | `SMALLINT` | NOT NULL DEFAULT 3 | Max post per akun |
| `total_scheduled` | `INTEGER` | NOT NULL DEFAULT 0 | Total jadwal dibuat |
| `accounts_with_insufficient_content` | `JSONB` | NULLABLE | Akun yang kekurangan konten |
| `status` | `VARCHAR(20)` | NOT NULL DEFAULT 'preview', CHECK IN ('preview','published','canceled') | Status batch |
| `created_by` | `UUID` | FK → users(id), NOT NULL | Pembuat |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT NOW() | |
| `published_at` | `TIMESTAMPTZ` | NULLABLE | Waktu publish |

---

#### Tabel: `notifications`

| Kolom | Tipe | Constraints | Keterangan |
|-------|------|-------------|------------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | ID unik |
| `scheduled_post_id` | `UUID` | FK → scheduled_posts(id), NOT NULL | Jadwal terkait |
| `user_id` | `UUID` | FK → users(id), NOT NULL | Operator target |
| `type` | `VARCHAR(30)` | NOT NULL, CHECK IN ('reminder_30m','reminder_5m','overdue') | Tipe notifikasi |
| `message` | `TEXT` | NOT NULL | Isi pesan |
| `telegram_message_id` | `VARCHAR(50)` | NULLABLE | ID pesan Telegram |
| `status` | `VARCHAR(20)` | NOT NULL DEFAULT 'pending', CHECK IN ('pending','sent','failed') | Status kirim |
| `error_message` | `TEXT` | NULLABLE | Error jika gagal |
| `sent_at` | `TIMESTAMPTZ` | NULLABLE | Waktu terkirim |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT NOW() | |

**Index:**
- `idx_notif_scheduled_post_type` — UNIQUE pada `(scheduled_post_id, type)` — cegah duplikasi
- `idx_notif_status` — B-tree pada `status` WHERE `status = 'pending'`

---

#### Tabel: `audit_logs`

| Kolom | Tipe | Constraints | Keterangan |
|-------|------|-------------|------------|
| `id` | `BIGSERIAL` | PK | ID auto-increment |
| `user_id` | `UUID` | FK → users(id), NULLABLE | Pelaku (NULL = sistem) |
| `action` | `VARCHAR(50)` | NOT NULL | Aksi yang dilakukan |
| `entity_type` | `VARCHAR(50)` | NOT NULL | Tipe entitas |
| `entity_id` | `VARCHAR(100)` | NOT NULL | ID entitas |
| `old_value` | `JSONB` | NULLABLE | Nilai sebelum |
| `new_value` | `JSONB` | NULLABLE | Nilai sesudah |
| `ip_address` | `INET` | NULLABLE | IP address |
| `user_agent` | `VARCHAR(500)` | NULLABLE | User agent |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT NOW() | |

**Index:**
- `idx_audit_entity` — Composite pada `(entity_type, entity_id)`
- `idx_audit_user` — B-tree pada `user_id`
- `idx_audit_created` — B-tree pada `created_at`
- Partition by range on `created_at` (monthly) — direkomendasikan untuk skala

---

### 3.3 State Machine — `scheduled_posts.status`

```
                          ┌──────────────────────────────────────┐
                          │        STATE MACHINE                 │
                          │      scheduled_posts.status          │
                          └──────────────────────────────────────┘

  ┌───────────┐     waktu =          ┌───────────┐    +30 menit     ┌───────────┐
  │           │   scheduled_at       │           │   dari           │           │
  │ SCHEDULED ├─────────────────────►│    DUE    ├─────────────────►│  OVERDUE  │
  │           │   (auto/reconciler)  │           │ scheduled_at     │           │
  └─────┬─────┘                      └─────┬─────┘  (auto)         └─────┬─────┘
        │                                  │                             │
        │  cancel                          │  mark done                  │  +2 jam dari
        │  (admin)                         │  + URL TikTok               │  scheduled_at
        ▼                                  │                             │  (auto)
  ┌───────────┐                            │     mark done               ▼
  │           │                            │    + URL TikTok       ┌───────────┐
  │ CANCELED  │                            │                       │           │
  │           │                            │  ┌────────────────────│  MISSED   │
  └───────────┘                            │  │                    │           │
                                           │  │  mark done         └───────────┘
                                           ▼  ▼  + URL TikTok
                                     ┌───────────┐
                                     │           │
                                     │   DONE    │  ← Terminal state
                                     │           │
                                     └───────────┘
```

#### Aturan Transisi

| Dari | Ke | Trigger | Kondisi |
|------|----|---------|---------|
| `scheduled` | `due` | Reconciler cron / waktu tercapai | `NOW() >= scheduled_at` |
| `scheduled` | `canceled` | Admin manual cancel | Role = admin |
| `due` | `overdue` | Reconciler cron | `NOW() >= scheduled_at + 30 menit` |
| `due` | `done` | Operator mark done | `tiktok_url` valid + format benar |
| `overdue` | `missed` | Reconciler cron | `NOW() >= scheduled_at + 2 jam` |
| `overdue` | `done` | Operator mark done | `tiktok_url` valid + format benar |
| `missed` | `done` | Operator mark done (late) | `tiktok_url` valid + format benar; tetap tercatat sebagai late |
| `canceled` | — | Terminal | Tidak bisa transisi keluar |
| `done` | — | Terminal | Tidak bisa transisi keluar |

**Catatan:** `missed → done` diperbolehkan agar operator tetap bisa menyelesaikan posting yang terlambat. Field `posted_at` akan merekam waktu aktual, dan dashboard tetap menampilkan bahwa posting ini awalnya missed.

---

## 4. API Design

### 4.1 Konvensi Umum

- **Base URL:** `/api/v1`
- **Auth:** Header `Authorization: Bearer <JWT>`
- **Response envelope:**
```json
{
  "success": true,
  "data": { ... },
  "meta": { "page": 1, "limit": 20, "total": 100 }
}
```
- **Error envelope:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "URL TikTok wajib diawali https://www.tiktok.com/",
    "details": [ ... ]
  }
}
```
- **Timezone:** Semua timestamp dalam UTC (TIMESTAMPTZ). Frontend konversi ke WIB (UTC+7).

### 4.2 Daftar Endpoint

#### Auth
| Method | Path | Deskripsi | Auth |
|--------|------|-----------|------|
| POST | `/auth/login` | Login | No |
| POST | `/auth/refresh` | Refresh token | Bearer |
| POST | `/auth/logout` | Logout / invalidate | Bearer |

#### Users / Operators
| Method | Path | Deskripsi | Auth |
|--------|------|-----------|------|
| GET | `/users` | List operator | Admin |
| POST | `/users` | Buat operator baru | Admin |
| GET | `/users/:id` | Detail operator | Admin |
| PATCH | `/users/:id` | Update operator | Admin |
| DELETE | `/users/:id` | Soft-delete operator | Admin |
| POST | `/users/:id/bulk-reassign` | Re-assign akun massal | Admin |
| GET | `/users/me` | Profil sendiri | Bearer |
| PATCH | `/users/me` | Update profil sendiri | Bearer |
| POST | `/users/me/telegram-link` | Generate kode link Telegram | Bearer |

#### TikTok Accounts
| Method | Path | Deskripsi | Auth |
|--------|------|-----------|------|
| GET | `/tiktok-accounts` | List akun | Bearer |
| POST | `/tiktok-accounts` | Buat akun | Admin |
| GET | `/tiktok-accounts/:id` | Detail akun | Bearer |
| PATCH | `/tiktok-accounts/:id` | Update akun | Admin |
| DELETE | `/tiktok-accounts/:id` | Soft-delete akun | Admin |

#### Contents / Assets
| Method | Path | Deskripsi | Auth |
|--------|------|-----------|------|
| GET | `/contents` | List konten (filter: status, account) | Bearer |
| POST | `/contents` | Buat konten baru (draft) | Admin |
| GET | `/contents/:id` | Detail konten | Bearer |
| PATCH | `/contents/:id` | Update konten | Admin |
| DELETE | `/contents/:id` | Hapus konten (jika belum used) | Admin |
| POST | `/contents/:id/ai-generate` | Generate 5 opsi AI | Admin |
| POST | `/contents/:id/finalize` | Pilih & finalize opsi | Admin |

#### Schedules
| Method | Path | Deskripsi | Auth |
|--------|------|-----------|------|
| GET | `/schedules` | List jadwal (filter: date, status, operator, account) | Bearer |
| POST | `/schedules` | Buat jadwal manual (1 buah) | Admin |
| GET | `/schedules/:id` | Detail jadwal | Bearer |
| PATCH | `/schedules/:id` | Update jadwal (sebelum due) | Admin |
| DELETE | `/schedules/:id` | Cancel jadwal | Admin |
| POST | `/schedules/:id/mark-done` | Mark done + URL | Bearer (operator) |

#### Bulk Generator
| Method | Path | Deskripsi | Auth |
|--------|------|-----------|------|
| POST | `/bulk/preview` | Preview jadwal massal | Admin |
| POST | `/bulk/:batchId/publish` | Publish jadwal massal | Admin |
| DELETE | `/bulk/:batchId` | Cancel batch preview | Admin |

#### My Tasks (Operator)
| Method | Path | Deskripsi | Auth |
|--------|------|-----------|------|
| GET | `/my-tasks` | Daftar tugas operator hari ini | Bearer (operator) |
| GET | `/my-tasks/:scheduleId` | Execution page data | Bearer (operator) |

#### Dashboard
| Method | Path | Deskripsi | Auth |
|--------|------|-----------|------|
| GET | `/dashboard/daily` | Statistik harian | Admin |
| GET | `/dashboard/by-operator` | Statistik per operator | Admin |
| GET | `/dashboard/by-account` | Statistik per akun | Admin |

#### Telegram Webhook
| Method | Path | Deskripsi | Auth |
|--------|------|-----------|------|
| POST | `/webhook/telegram` | Webhook dari Telegram bot | Telegram token |

---

### 4.3 Request/Response JSON — Endpoint Utama

#### POST `/api/v1/auth/login`

**Request:**
```json
{
  "email": "operator1@company.com",
  "password": "SecureP@ss123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
    "expires_in": 3600,
    "user": {
      "id": "a1b2c3d4-...",
      "email": "operator1@company.com",
      "full_name": "Budi Santoso",
      "role": "operator",
      "has_telegram": true
    }
  }
}
```

**Response (401):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email atau password salah."
  }
}
```

---

#### POST `/api/v1/contents`

**Request:**
```json
{
  "tiktok_account_id": "uuid-akun-123",
  "drive_url": "https://drive.google.com/file/d/abc123/view",
  "brief_topic": "5 Tips Memulai Bisnis Online dari Nol",
  "brief_points": [
    "Tentukan niche yang spesifik",
    "Riset kompetitor di TikTok",
    "Buat konten edukasi yang relatable",
    "Konsisten posting minimal 1x sehari",
    "Gunakan hashtag yang relevan"
  ],
  "target_audience": "Anak muda 18-30 yang ingin memulai bisnis",
  "tone": "santai, motivatif",
  "niche_template": "bisnis"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-content-456",
    "tiktok_account_id": "uuid-akun-123",
    "drive_url": "https://drive.google.com/file/d/abc123/view",
    "brief_topic": "5 Tips Memulai Bisnis Online dari Nol",
    "brief_points": [
      "Tentukan niche yang spesifik",
      "Riset kompetitor di TikTok",
      "Buat konten edukasi yang relatable",
      "Konsisten posting minimal 1x sehari",
      "Gunakan hashtag yang relevan"
    ],
    "target_audience": "Anak muda 18-30 yang ingin memulai bisnis",
    "tone": "santai, motivatif",
    "niche_template": "bisnis",
    "ai_options": null,
    "selected_option_index": null,
    "final_caption": null,
    "final_hashtags": null,
    "status": "draft",
    "created_at": "2026-02-11T07:30:00Z"
  }
}
```

---

#### POST `/api/v1/contents/:id/ai-generate`

**Request:** (tidak perlu body; menggunakan brief yang sudah tersimpan)
```json
{}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "content_id": "uuid-content-456",
    "options": [
      {
        "index": 0,
        "caption": "Mau mulai bisnis tapi bingung dari mana? Ini 5 langkah simpel yang bisa kamu mulai HARI INI! 🚀\n\nDimulai dari niche, riset, sampai konsisten posting — semuanya harus terencana.\n\nSave video ini biar gak lupa! 💡",
        "hashtags": [
          "bisnisOnline", "tipsUsaha", "mulaiDariNol", "bisnisMuda",
          "entrepreneurIndonesia", "bisnisDigital", "usahaSampingan",
          "motivasiBisnis", "tipsBisnis", "suksesUsaha",
          "kontenBisnis", "fyp", "viral", "tiktokIndonesia"
        ]
      },
      {
        "index": 1,
        "caption": "STOP scroll dulu! Kalau kamu pengen punya bisnis sendiri, coba terapin 5 tips ini 👇\n\n1. Pilih niche spesifik\n2. Intip kompetitor\n3. Bikin konten edukasi\n4. Posting konsisten\n5. Pakai hashtag bener\n\nMana yang udah kamu lakuin?",
        "hashtags": [
          "bisnisOnline", "tipsBisnisOnline", "mulaiUsaha", "bisnisRumahan",
          "usahaOnline", "bisnisAnakMuda", "caraBisnis", "bisnisUKM",
          "digitalMarketing", "contentCreator", "fyp", "fypシ",
          "trending", "edukasi"
        ]
      },
      {
        "index": 2,
        "caption": "\"Aku gak punya modal\" — itu BUKAN alasan! 💪\n\nBisnis online bisa dimulai dari HP kamu aja. Yang penting:\n✅ Niche jelas\n✅ Riset pasar\n✅ Konten yang relate\n✅ Konsisten\n✅ Strategy hashtag\n\nKalau bukan sekarang, kapan?",
        "hashtags": [
          "bisnisModal", "bisnisHPaja", "mulaiSekarang", "bisnisOnline",
          "motivasiUsaha", "tipsSukses", "bisnisTanpaModal", "usahaMuda",
          "entrepreneurship", "bisnisPemula", "fypシ", "viral2026",
          "tiktokers", "suksesOnline"
        ]
      },
      {
        "index": 3,
        "caption": "5 tips buat kamu yang baru mau terjun ke dunia bisnis online! 🎯\n\nIni bukan teori doang ya, tapi step-by-step yang udah terbukti works.\n\nComment \"BISNIS\" kalau kamu mau tips lanjutannya! 👇",
        "hashtags": [
          "bisnisOnline", "tipsUsaha", "bisnisDigital", "caraBisnisOnline",
          "panduanBisnis", "belajarBisnis", "bisnisKecil", "startupIndonesia",
          "onlineBusiness", "digitalEntrepreneur", "fyp", "tiktokindonesia",
          "berkembang", "ilmuBisnis"
        ]
      },
      {
        "index": 4,
        "caption": "Jangan cuma jadi penonton, jadi pemain! 🔥\n\nIni 5 cara memulai bisnis online dari nol yang cocok buat pemula. Gak perlu modal besar, yang penting ACTION!\n\nShare ke temen kamu yang butuh ini! 🤝",
        "hashtags": [
          "actionSekarang", "bisnisOnline", "memulaiUsaha", "tipsPemula",
          "bisnisGratis", "usahaDariRumah", "penghasilanOnline", "kerjaDariRumah",
          "financialFreedom", "bisnisModern", "fyp", "viral",
          "inspirasi", "growthMindset"
        ]
      }
    ],
    "status": "ai_generated"
  }
}
```

---

#### POST `/api/v1/contents/:id/finalize`

**Request:**
```json
{
  "selected_option_index": 1,
  "final_caption": "STOP scroll dulu! Kalau kamu pengen punya bisnis sendiri, coba terapin 5 tips ini 👇\n\n1. Pilih niche spesifik\n2. Intip kompetitor\n3. Bikin konten edukasi\n4. Posting konsisten\n5. Pakai hashtag bener\n\nKomen \"MAU\" kalau kamu tertarik!",
  "final_hashtags": [
    "bisnisOnline", "tipsBisnisOnline", "mulaiUsaha", "bisnisRumahan",
    "usahaOnline", "bisnisAnakMuda", "caraBisnis", "bisnisUKM",
    "digitalMarketing", "contentCreator", "fyp", "fypシ",
    "trending", "edukasi"
  ]
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-content-456",
    "status": "ready",
    "final_caption": "STOP scroll dulu! ...",
    "final_hashtags": ["bisnisOnline", "tipsBisnisOnline", "..."],
    "copy_text": "STOP scroll dulu! Kalau kamu pengen punya bisnis sendiri, coba terapin 5 tips ini 👇\n\n1. Pilih niche spesifik\n2. Intip kompetitor\n3. Bikin konten edukasi\n4. Posting konsisten\n5. Pakai hashtag bener\n\nKomen \"MAU\" kalau kamu tertarik!\n\n#bisnisOnline #tipsBisnisOnline #mulaiUsaha #bisnisRumahan #usahaOnline #bisnisAnakMuda #caraBisnis #bisnisUKM #digitalMarketing #contentCreator #fyp #fypシ #trending #edukasi"
  }
}
```

---

#### POST `/api/v1/schedules`

**Request:**
```json
{
  "content_id": "uuid-content-456",
  "tiktok_account_id": "uuid-akun-123",
  "assigned_operator_id": "uuid-operator-789",
  "scheduled_at": "2026-02-12T03:00:00Z"
}
```
*(03:00 UTC = 10:00 WIB)*

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-schedule-001",
    "content_id": "uuid-content-456",
    "tiktok_account_id": "uuid-akun-123",
    "tiktok_account_username": "bisnis_muda_id",
    "assigned_operator_id": "uuid-operator-789",
    "assigned_operator_name": "Budi Santoso",
    "scheduled_at": "2026-02-12T03:00:00Z",
    "status": "scheduled",
    "created_at": "2026-02-11T08:00:00Z"
  }
}
```

**Validasi penting:**
- `scheduled_at` harus di masa depan.
- `scheduled_at` harus dalam window 08:00–22:00 WIB (01:00–15:00 UTC).
- Cek gap ≥ 2 jam dari posting terdekat di akun yang sama.
- `content_id` harus status `ready` dan belum `used`.
- `content_id.tiktok_account_id` harus cocok dengan `tiktok_account_id`.

---

#### POST `/api/v1/bulk/preview`

**Request:**
```json
{
  "target_date": "2026-02-12",
  "frequency_min": 1,
  "frequency_max": 3,
  "account_ids": null
}
```
*(null = semua akun aktif)*

**Response (200):**
```json
{
  "success": true,
  "data": {
    "batch_id": "uuid-batch-001",
    "target_date": "2026-02-12",
    "summary": {
      "total_accounts": 95,
      "total_schedules": 207,
      "accounts_with_full_content": 88,
      "accounts_with_partial_content": 5,
      "accounts_with_no_content": 2
    },
    "insufficient_content": [
      {
        "account_id": "uuid-akun-050",
        "username": "fitness_indo",
        "requested": 3,
        "available": 1,
        "scheduled": 1
      },
      {
        "account_id": "uuid-akun-051",
        "username": "sehat_alami",
        "requested": 2,
        "available": 0,
        "scheduled": 0
      }
    ],
    "preview": [
      {
        "tiktok_account_id": "uuid-akun-001",
        "username": "bisnis_muda_id",
        "operator": "Budi Santoso",
        "schedules": [
          {
            "content_id": "uuid-content-456",
            "brief_topic": "5 Tips Memulai Bisnis Online dari Nol",
            "scheduled_at": "2026-02-12T02:15:00Z",
            "scheduled_at_wib": "09:15"
          },
          {
            "content_id": "uuid-content-457",
            "brief_topic": "Cara Riset Produk di TikTok Shop",
            "scheduled_at": "2026-02-12T07:42:00Z",
            "scheduled_at_wib": "14:42"
          }
        ]
      }
    ]
  }
}
```

---

#### POST `/api/v1/bulk/:batchId/publish`

**Request:**
```json
{}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "batch_id": "uuid-batch-001",
    "status": "published",
    "total_created": 207,
    "published_at": "2026-02-11T08:30:00Z"
  }
}
```

---

#### POST `/api/v1/schedules/:id/mark-done`

**Request:**
```json
{
  "tiktok_url": "https://www.tiktok.com/@bisnis_muda_id/video/7123456789012345678"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-schedule-001",
    "status": "done",
    "tiktok_url": "https://www.tiktok.com/@bisnis_muda_id/video/7123456789012345678",
    "posted_at": "2026-02-12T03:12:00Z"
  }
}
```

**Validasi:**
- URL wajib diawali `https://www.tiktok.com/`
- Status harus `due`, `overdue`, atau `missed` (bukan `scheduled` atau `canceled`)
- Operator hanya bisa mark done tugas yang di-assign ke mereka

**Response Error (400):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_TIKTOK_URL",
    "message": "URL TikTok wajib diawali https://www.tiktok.com/ — link pendek atau format lain tidak diterima."
  }
}
```

---

#### GET `/api/v1/my-tasks?date=2026-02-12`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "date": "2026-02-12",
    "operator": {
      "id": "uuid-operator-789",
      "full_name": "Budi Santoso"
    },
    "summary": {
      "total": 12,
      "scheduled": 5,
      "due": 2,
      "overdue": 1,
      "done": 3,
      "missed": 1,
      "canceled": 0
    },
    "tasks": [
      {
        "id": "uuid-schedule-001",
        "tiktok_account": {
          "id": "uuid-akun-123",
          "username": "bisnis_muda_id",
          "display_name": "Bisnis Muda ID"
        },
        "content": {
          "id": "uuid-content-456",
          "brief_topic": "5 Tips Memulai Bisnis Online dari Nol",
          "drive_url": "https://drive.google.com/file/d/abc123/view"
        },
        "scheduled_at": "2026-02-12T03:00:00Z",
        "status": "due",
        "tiktok_url": null,
        "posted_at": null
      }
    ]
  }
}
```

---

#### GET `/api/v1/dashboard/daily?date=2026-02-12`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "date": "2026-02-12",
    "overall": {
      "total": 207,
      "scheduled": 95,
      "due": 12,
      "overdue": 3,
      "done": 90,
      "missed": 5,
      "canceled": 2,
      "completion_rate": 0.4444
    },
    "by_operator": [
      {
        "operator_id": "uuid-op-1",
        "operator_name": "Budi Santoso",
        "total": 70,
        "done": 35,
        "overdue": 1,
        "missed": 2,
        "completion_rate": 0.50
      }
    ],
    "by_account": [
      {
        "account_id": "uuid-akun-001",
        "username": "bisnis_muda_id",
        "total": 3,
        "done": 2,
        "overdue": 0,
        "missed": 0,
        "next_scheduled_at": "2026-02-12T07:42:00Z"
      }
    ]
  }
}
```

---

### 4.4 Validasi Penting

| Rule | Endpoint | Detail |
|------|----------|--------|
| URL TikTok format | `mark-done` | Regex: `^https:\/\/www\.tiktok\.com\/.+` — Tolak short link, URL lain |
| Status transisi | `mark-done` | Hanya dari `due`/`overdue`/`missed` ke `done` |
| Gap 2 jam | `schedules`, `bulk` | `ABS(new_scheduled_at - existing_scheduled_at) >= 2 hours` per akun |
| Window posting | `schedules`, `bulk` | `scheduled_at` harus antara 08:00–22:00 WIB |
| Konten ready | `schedules` | Content `status` harus `ready` |
| 1 konten 1 jadwal | `schedules` | `content_id` UNIQUE di `scheduled_posts` |
| Brief points | `contents` | Array 3–7 item string |
| Hashtags count | `finalize` | 10–25 hashtag |
| Hashtags format | `finalize` | Tanpa karakter `#` |
| Password strength | `auth/register` | Min 8 char, 1 uppercase, 1 number |
| Rate limit login | `auth/login` | 5 attempts / 15 menit per IP |

---

## 5. Job/Queue Design

### 5.1 Arsitektur

```
┌──────────────────────────────────────────────────────────────┐
│                     BullMQ + Redis                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Queue: "status-reconciler"                                  │
│    └─ Repeatable job: setiap 1 menit                         │
│                                                              │
│  Queue: "notifications"                                      │
│    ├─ Job: send-reminder-30m                                 │
│    ├─ Job: send-reminder-5m                                  │
│    └─ Job: send-overdue-alert                                │
│                                                              │
│  Queue: "ai-generate"                                        │
│    └─ Job: generate-caption-hashtags                         │
│                                                              │
│  Queue: "bulk-generate"                                      │
│    └─ Job: process-bulk-batch                                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Detail Job

#### Job: `status-reconciler` (Cron setiap 1 menit)

```
Queue      : status-reconciler
Schedule   : Repeatable, setiap 60 detik
Payload    : {} (tidak perlu payload)
Retry      : 3x, backoff exponential (1s, 2s, 4s)
Idempotency: Ya — query berdasarkan waktu dan status saat ini; re-run aman
Concurrency: 1 (hanya 1 worker)
```

**Logika:**
```sql
-- 1. scheduled → due
UPDATE scheduled_posts
SET status = 'due', updated_at = NOW()
WHERE status = 'scheduled'
  AND scheduled_at <= NOW();

-- 2. due → overdue
UPDATE scheduled_posts
SET status = 'overdue', updated_at = NOW()
WHERE status = 'due'
  AND scheduled_at + INTERVAL '30 minutes' <= NOW();

-- 3. overdue → missed
UPDATE scheduled_posts
SET status = 'missed', updated_at = NOW()
WHERE status = 'overdue'
  AND scheduled_at + INTERVAL '2 hours' <= NOW();
```

**Setelah setiap transisi ke `overdue`**, enqueue job `send-overdue-alert` untuk setiap post yang baru overdue.

---

#### Job: `send-reminder-30m`

```
Queue      : notifications
Job Name   : send-reminder-30m
Trigger    : Reconciler menemukan post yang scheduled_at - 30m <= NOW()
             DAN belum ada notifikasi tipe 'reminder_30m' untuk post ini
Payload    : { scheduled_post_id: UUID }
Retry      : 3x, backoff exponential (2s, 4s, 8s)
Idempotency: UNIQUE constraint pada (scheduled_post_id, type) di tabel notifications
Concurrency: 5
```

#### Job: `send-reminder-5m`

```
Queue      : notifications
Job Name   : send-reminder-5m
Trigger    : Reconciler menemukan post yang scheduled_at - 5m <= NOW()
             DAN belum ada notifikasi tipe 'reminder_5m'
Payload    : { scheduled_post_id: UUID }
Retry      : 3x, backoff exponential (2s, 4s, 8s)
Idempotency: UNIQUE constraint pada (scheduled_post_id, type)
Concurrency: 5
```

#### Job: `send-overdue-alert`

```
Queue      : notifications
Job Name   : send-overdue-alert
Trigger    : Setelah reconciler mengubah status ke 'overdue'
Payload    : { scheduled_post_id: UUID }
Retry      : 3x, backoff exponential (2s, 4s, 8s)
Idempotency: UNIQUE constraint pada (scheduled_post_id, type='overdue')
Concurrency: 5
```

#### Job: `generate-caption-hashtags`

```
Queue      : ai-generate
Job Name   : generate-caption-hashtags
Trigger    : POST /contents/:id/ai-generate
Payload    : {
               content_id: UUID,
               brief_topic: string,
               brief_points: string[],
               target_audience: string | null,
               tone: string | null,
               niche_template: "bisnis" | "kesehatan" | "fitnes"
             }
Retry      : 2x, backoff exponential (5s, 15s)
Timeout    : 60 detik
Idempotency: Menyimpan result ke content.ai_options; re-run overwrite
Concurrency: 3 (limit API rate)
```

#### Job: `process-bulk-batch`

```
Queue      : bulk-generate
Job Name   : process-bulk-batch
Trigger    : POST /bulk/preview
Payload    : {
               batch_id: UUID,
               target_date: string (YYYY-MM-DD),
               frequency_min: number,
               frequency_max: number,
               account_ids: UUID[] | null
             }
Retry      : 1x (karena operasi besar, lebih baik retry manual)
Timeout    : 300 detik
Idempotency: batch_id unik; jika sudah ada preview, gagalkan
Concurrency: 1
```

### 5.3 Strategi Reconciler Detail

```
┌────────────────────────────────────────────────────────┐
│              RECONCILER CRON (setiap 1 menit)          │
├────────────────────────────────────────────────────────┤
│                                                        │
│  1. Query scheduled_posts yang perlu transisi          │
│                                                        │
│  2. Enqueue notifikasi:                                │
│     ├─ Cari post dengan scheduled_at - 30m <= NOW()    │
│     │   DAN belum ada notif reminder_30m → enqueue     │
│     │                                                  │
│     ├─ Cari post dengan scheduled_at - 5m <= NOW()     │
│     │   DAN belum ada notif reminder_5m → enqueue      │
│     │                                                  │
│     └─ Post yang baru jadi overdue → enqueue alert     │
│                                                        │
│  3. Update status secara batch:                        │
│     ├─ scheduled → due                                 │
│     ├─ due → overdue                                   │
│     └─ overdue → missed                                │
│                                                        │
│  4. Log hasil: "Diproses X transisi, Y notifikasi"     │
│                                                        │
│  Catatan:                                              │
│  - Semua query memakai SELECT ... FOR UPDATE SKIP      │
│    LOCKED untuk menghindari race condition              │
│  - Batch UPDATE dikerjakan dalam 1 transaksi per jenis │
│  - Jika reconciler crash dan restart, data tetap       │
│    konsisten karena query berbasis waktu aktual         │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## 6. Bulk Generator

### 6.1 Algoritma Detail

```
FUNGSI: generateBulkSchedule(targetDate, freqMin, freqMax, accountIds)

INPUT:
  targetDate  : DATE          — tanggal target
  freqMin     : INT (1–5)     — minimum post per akun per hari
  freqMax     : INT (1–5)     — maximum post per akun per hari, freqMax >= freqMin
  accountIds  : UUID[] | null — filter akun (null = semua aktif)

OUTPUT:
  BatchPreview — daftar jadwal yang akan dibuat

LANGKAH:

1.  accounts ← QUERY semua tiktok_accounts aktif
    FILTER accountIds jika tidak null
    SORT BY username ASC

2.  UNTUK SETIAP account di accounts:

    2.1  existingSchedules ← QUERY scheduled_posts
         WHERE tiktok_account_id = account.id
           AND DATE(scheduled_at AT TIME ZONE 'Asia/Jakarta') = targetDate
           AND status != 'canceled'
         ORDER BY scheduled_at ASC

    2.2  existingTimes ← [s.scheduled_at UNTUK SETIAP s di existingSchedules]

    2.3  targetCount ← RANDOM(freqMin, freqMax)
         remainingSlots ← targetCount - LENGTH(existingSchedules)

         JIKA remainingSlots <= 0:
           SKIP akun ini (sudah cukup jadwal)
           CONTINUE

    2.4  readyContents ← QUERY contents
         WHERE tiktok_account_id = account.id
           AND status = 'ready'
         ORDER BY created_at ASC
         LIMIT remainingSlots

    2.5  JIKA LENGTH(readyContents) < remainingSlots:
           Catat ke insufficient_content:
             { account, requested: remainingSlots, available: LENGTH(readyContents) }
           remainingSlots ← LENGTH(readyContents)

    2.6  JIKA remainingSlots = 0:
           CONTINUE

    2.7  slots ← generateTimeSlots(targetDate, remainingSlots, existingTimes)
         — Lihat sub-algoritma di bawah

    2.8  UNTUK i = 0 TO remainingSlots - 1:
           Buat preview entry:
             content  = readyContents[i]
             time     = slots[i]
             operator = account.default_operator_id

3.  RETURN BatchPreview
```

### 6.2 Sub-Algoritma: `generateTimeSlots`

```
FUNGSI: generateTimeSlots(targetDate, count, existingTimes)

INPUT:
  targetDate    : DATE
  count         : INT           — jumlah slot yang dibutuhkan
  existingTimes : TIMESTAMPTZ[] — waktu jadwal yang sudah ada di hari itu

OUTPUT:
  TIMESTAMPTZ[] — array waktu yang valid

LANGKAH:

1.  windowStart ← targetDate 08:00 WIB (01:00 UTC)
    windowEnd   ← targetDate 22:00 WIB (15:00 UTC)
    minGap      ← 2 JAM
    allTimes    ← COPY(existingTimes)
    result      ← []

2.  totalMinutes ← (windowEnd - windowStart) dalam menit  // = 840 menit
    maxSlots ← FLOOR(totalMinutes / 120) + 1              // = 8 slot max

3.  JIKA count + LENGTH(existingTimes) > maxSlots:
      count ← maxSlots - LENGTH(existingTimes)
      LOG WARNING "Dikurangi ke {count} karena melebihi kapasitas slot"

4.  attempts ← 0
    maxAttempts ← count * 100  // safety limit

5.  SELAMA LENGTH(result) < count DAN attempts < maxAttempts:

    5.1  randomMinute ← RANDOM(0, totalMinutes)
         candidateTime ← windowStart + randomMinute MENIT

    5.2  isValid ← TRUE
         UNTUK SETIAP t di allTimes:
           JIKA ABS(candidateTime - t) < minGap:
             isValid ← FALSE
             BREAK

    5.3  JIKA isValid:
           result.APPEND(candidateTime)
           allTimes.APPEND(candidateTime)

    5.4  attempts ← attempts + 1

6.  JIKA LENGTH(result) < count:
      // Fallback: distribusi merata
      result ← []
      allSorted ← SORT(existingTimes)
      // Cari celah terbesar di antara waktu yang ada & window
      // Tempatkan slot di tengah celah terbesar
      gaps ← hitungCelah(allSorted, windowStart, windowEnd)
      SORT gaps BY durasi DESC
      UNTUK SETIAP gap di gaps SELAMA LENGTH(result) < count:
        midpoint ← gap.start + (gap.end - gap.start) / 2
        JIKA midpoint valid (gap >= minGap dari semua neighbors):
          result.APPEND(midpoint)
          // Update gaps

7.  SORT result ASC
    RETURN result
```

### 6.3 Pseudo-code Implementasi (TypeScript-style)

```typescript
async function generateBulkPreview(
  targetDate: string,       // "2026-02-12"
  freqMin: number,          // 1
  freqMax: number,          // 3
  accountIds: string[] | null,
): Promise<BulkPreview> {
  const batch = await createBatch(targetDate, freqMin, freqMax);
  const accounts = await getActiveAccounts(accountIds);

  const preview: SchedulePreviewItem[] = [];
  const insufficient: InsufficientContent[] = [];

  for (const account of accounts) {
    // Jadwal yang sudah ada di hari itu
    const existing = await getExistingSchedules(account.id, targetDate);
    const existingTimes = existing.map(e => e.scheduledAt);

    // Random frekuensi dalam range
    const targetCount = randomInt(freqMin, freqMax);
    let remainingSlots = Math.max(0, targetCount - existing.length);

    if (remainingSlots === 0) continue;

    // Ambil konten yang ready
    const readyContents = await getReadyContents(account.id, remainingSlots);

    if (readyContents.length < remainingSlots) {
      insufficient.push({
        accountId: account.id,
        username: account.username,
        requested: remainingSlots,
        available: readyContents.length,
        scheduled: readyContents.length,
      });
      remainingSlots = readyContents.length;
    }

    if (remainingSlots === 0) continue;

    // Generate time slots dengan minimum gap 2 jam
    const slots = generateTimeSlots(targetDate, remainingSlots, existingTimes);

    for (let i = 0; i < slots.length; i++) {
      preview.push({
        batchId: batch.id,
        contentId: readyContents[i].id,
        tiktokAccountId: account.id,
        assignedOperatorId: account.defaultOperatorId,
        scheduledAt: slots[i],
        briefTopic: readyContents[i].briefTopic,
      });
    }
  }

  await saveBatchPreview(batch.id, preview, insufficient);

  return { batchId: batch.id, preview, insufficient, summary: computeSummary(preview) };
}

function generateTimeSlots(
  targetDate: string,
  count: number,
  existingTimes: Date[],
): Date[] {
  const windowStart = parseWIB(targetDate, '08:00'); // → UTC
  const windowEnd   = parseWIB(targetDate, '22:00'); // → UTC
  const minGapMs    = 2 * 60 * 60 * 1000; // 2 jam dalam ms
  const totalMs     = windowEnd.getTime() - windowStart.getTime();

  const allTimes = [...existingTimes];
  const result: Date[] = [];
  let attempts = 0;
  const maxAttempts = count * 100;

  while (result.length < count && attempts < maxAttempts) {
    const randomMs = Math.floor(Math.random() * totalMs);
    const candidate = new Date(windowStart.getTime() + randomMs);

    const valid = allTimes.every(
      t => Math.abs(candidate.getTime() - t.getTime()) >= minGapMs,
    );

    if (valid) {
      result.push(candidate);
      allTimes.push(candidate);
    }
    attempts++;
  }

  // Fallback jika random gagal menemukan cukup slot
  if (result.length < count) {
    const fallbackSlots = distributeEvenly(
      windowStart, windowEnd, count - result.length, allTimes, minGapMs,
    );
    result.push(...fallbackSlots);
  }

  result.sort((a, b) => a.getTime() - b.getTime());
  return result;
}
```

### 6.4 Penanganan Kekurangan Konten Ready

| Situasi | Penanganan |
|---------|-----------|
| Konten ready cukup | Normal — semua slot terisi |
| Konten ready kurang | Isi sebanyak yang tersedia; tampilkan warning di preview |
| Konten ready = 0 | Skip akun; tampilkan di `insufficient_content` |
| Akun sudah punya jadwal cukup | Skip akun (sudah memenuhi `targetCount`) |
| Slot waktu tidak cukup (gap terlalu padat) | Kurangi jumlah jadwal; warning di preview |

### 6.5 Aturan Minimum Gap 2 Jam

- Dihitung dari semua `scheduled_posts` pada akun di hari tersebut (termasuk yang sudah ada sebelum bulk).
- Termasuk jadwal yang status `canceled` dikecualikan.
- Jika akun sudah punya 8 jadwal (08:00, 10:00, 12:00, 14:00, 16:00, 18:00, 20:00, 22:00), tidak bisa menambah jadwal lagi.
- Waktu random dipilih dalam resolusi menit (bukan detik).

---

## 7. AI Prompting

### 7.1 Template Prompt — Niche: Bisnis

```
Kamu adalah seorang content creator TikTok Indonesia yang ahli di bidang bisnis dan kewirausahaan.

TUGAS: Buatkan 5 opsi caption dan hashtag untuk video TikTok berdasarkan brief berikut.

BRIEF:
- Topik: {{brief_topic}}
- Poin penting:
{{#each brief_points}}
  • {{this}}
{{/each}}
{{#if target_audience}}- Target audiens: {{target_audience}}{{/if}}
{{#if tone}}- Tone: {{tone}}{{/if}}

ATURAN:
1. Bahasa Indonesia, gaya santai dan engaging untuk TikTok.
2. Setiap caption maksimal 300 karakter (termasuk emoji).
3. Gunakan hook yang kuat di kalimat pertama.
4. Sertakan call-to-action (like, follow, comment, save, share).
5. JANGAN menggunakan janji seperti "pasti kaya", "jaminan sukses", "penghasilan X juta dijamin", atau klaim berlebihan.
6. Boleh gunakan emoji secukupnya.
7. Hashtag tanpa karakter # (hanya teks), 10–25 hashtag per opsi.
8. Hashtag harus campuran: niche-specific + trending umum + Indonesia.

FORMAT OUTPUT (JSON):
{
  "options": [
    {
      "index": 0,
      "caption": "...",
      "hashtags": ["tag1", "tag2", ...]
    },
    ... (5 opsi total)
  ]
}

Berikan HANYA JSON, tanpa penjelasan tambahan.
```

### 7.2 Template Prompt — Niche: Kesehatan

```
Kamu adalah seorang content creator TikTok Indonesia yang ahli di bidang kesehatan dan wellness.

TUGAS: Buatkan 5 opsi caption dan hashtag untuk video TikTok berdasarkan brief berikut.

BRIEF:
- Topik: {{brief_topic}}
- Poin penting:
{{#each brief_points}}
  • {{this}}
{{/each}}
{{#if target_audience}}- Target audiens: {{target_audience}}{{/if}}
{{#if tone}}- Tone: {{tone}}{{/if}}

ATURAN:
1. Bahasa Indonesia, gaya informatif tapi tetap engaging untuk TikTok.
2. Setiap caption maksimal 300 karakter (termasuk emoji).
3. Gunakan hook edukatif yang menarik perhatian.
4. Sertakan call-to-action (like, follow, comment, save, share).
5. WAJIB PATUHI GUARDRAILS KESEHATAN:
   - JANGAN membuat klaim medis tanpa dasar (mis. "obat ini menyembuhkan ...").
   - JANGAN memberikan janji penurunan berat badan berlebihan (mis. "turun 10 kg dalam seminggu").
   - JANGAN menggantikan nasihat dokter.
   - Jika topik sensitif secara medis, TAMBAHKAN disclaimer ringan di akhir caption, contoh: "Konsultasikan dengan dokter untuk kondisi spesifik kamu ya 🙏"
   - Gunakan frasa aman: "bisa membantu", "menurut beberapa penelitian", "disarankan untuk".
6. Boleh gunakan emoji secukupnya.
7. Hashtag tanpa karakter # (hanya teks), 10–25 hashtag per opsi.
8. Hashtag harus campuran: niche kesehatan + trending umum + Indonesia.

FORMAT OUTPUT (JSON):
{
  "options": [
    {
      "index": 0,
      "caption": "...",
      "hashtags": ["tag1", "tag2", ...]
    },
    ... (5 opsi total)
  ]
}

Berikan HANYA JSON, tanpa penjelasan tambahan.
```

### 7.3 Template Prompt — Niche: Fitnes

```
Kamu adalah seorang content creator TikTok Indonesia yang ahli di bidang fitness dan olahraga.

TUGAS: Buatkan 5 opsi caption dan hashtag untuk video TikTok berdasarkan brief berikut.

BRIEF:
- Topik: {{brief_topic}}
- Poin penting:
{{#each brief_points}}
  • {{this}}
{{/each}}
{{#if target_audience}}- Target audiens: {{target_audience}}{{/if}}
{{#if tone}}- Tone: {{tone}}{{/if}}

ATURAN:
1. Bahasa Indonesia, gaya motivatif dan energik untuk TikTok.
2. Setiap caption maksimal 300 karakter (termasuk emoji).
3. Gunakan hook kuat: tantangan, fakta, atau motivasi pembuka.
4. Sertakan call-to-action (like, follow, comment, save, share).
5. WAJIB PATUHI GUARDRAILS FITNESS:
   - JANGAN menjanjikan hasil penurunan berat badan berlebihan (mis. "sixpack dalam 7 hari", "turun 15 kg tanpa diet").
   - JANGAN menyarankan latihan ekstrem tanpa peringatan.
   - Jika gerakan berat atau berisiko cedera, TAMBAHKAN: "Pastikan pemanasan dulu dan sesuaikan dengan kemampuan kamu ya! 💪"
   - Gunakan frasa aman: "bisa membantu", "hasil bervariasi", "konsisten adalah kunci".
   - JANGAN membuat klaim medis (mis. "olahraga ini menyembuhkan diabetes").
6. Boleh gunakan emoji fitness secukupnya (💪🏋️‍♂️🔥).
7. Hashtag tanpa karakter # (hanya teks), 10–25 hashtag per opsi.
8. Hashtag campuran: niche fitness + trending umum + Indonesia.

FORMAT OUTPUT (JSON):
{
  "options": [
    {
      "index": 0,
      "caption": "...",
      "hashtags": ["tag1", "tag2", ...]
    },
    ... (5 opsi total)
  ]
}

Berikan HANYA JSON, tanpa penjelasan tambahan.
```

### 7.4 Format Output JSON yang Konsisten

Semua niche template menghasilkan format identik:

```json
{
  "options": [
    {
      "index": 0,
      "caption": "string — caption lengkap termasuk emoji dan CTA",
      "hashtags": [
        "string — hashtag TANPA # — hanya teks",
        "..."
      ]
    },
    {
      "index": 1,
      "caption": "...",
      "hashtags": ["..."]
    },
    {
      "index": 2,
      "caption": "...",
      "hashtags": ["..."]
    },
    {
      "index": 3,
      "caption": "...",
      "hashtags": ["..."]
    },
    {
      "index": 4,
      "caption": "...",
      "hashtags": ["..."]
    }
  ]
}
```

**Validasi backend setelah menerima output AI:**
- Pastikan ada tepat 5 opsi.
- Setiap `caption` ≤ 300 karakter.
- Setiap `hashtags` berisi 10–25 item.
- Tidak ada karakter `#` di dalam hashtags.
- Jika tidak valid, retry 1x dengan prompt yang sama.

### 7.5 Konstruksi "Copy untuk TikTok"

Saat user menekan tombol "Copy untuk TikTok", sistem menggabungkan:

```
{final_caption}\n\n{final_hashtags.map(h => '#' + h).join(' ')}
```

Contoh output ke clipboard:

```
STOP scroll dulu! Kalau kamu pengen punya bisnis sendiri, coba terapin 5 tips ini 👇

1. Pilih niche spesifik
2. Intip kompetitor
3. Bikin konten edukasi
4. Posting konsisten
5. Pakai hashtag bener

Komen "MAU" kalau kamu tertarik!

#bisnisOnline #tipsBisnisOnline #mulaiUsaha #bisnisRumahan #usahaOnline #bisnisAnakMuda #caraBisnis #bisnisUKM #digitalMarketing #contentCreator #fyp #fypシ #trending #edukasi
```

---

## 8. UX Copy Bahasa Indonesia

### 8.1 Notifikasi Telegram

#### Reminder H-30 menit

```
📋 Pengingat Posting

Hai {{operator_name}}! Kamu punya jadwal posting dalam 30 menit:

📱 Akun: @{{tiktok_username}}
⏰ Jadwal: {{scheduled_at_wib}} WIB
📝 Konten: {{brief_topic}}

👉 Buka halaman eksekusi:
{{execution_page_url}}
```

#### Reminder H-5 menit

```
⚡ Posting Segera!

Hai {{operator_name}}, 5 menit lagi waktunya posting!

📱 Akun: @{{tiktok_username}}
⏰ Jadwal: {{scheduled_at_wib}} WIB
📝 Konten: {{brief_topic}}

Segera buka TikTok Web dan upload video ya!

👉 {{execution_page_url}}
```

#### Alert Overdue

```
🚨 Posting Terlambat!

Hai {{operator_name}}, posting berikut sudah TERLAMBAT (lewat 30 menit dari jadwal):

📱 Akun: @{{tiktok_username}}
⏰ Jadwal awal: {{scheduled_at_wib}} WIB
📝 Konten: {{brief_topic}}

⚠️ Segera selesaikan sebelum menjadi MISSED (batas +2 jam dari jadwal).

👉 {{execution_page_url}}
```

### 8.2 Label Tombol

| Konteks | Teks Tombol |
|---------|-------------|
| Copy caption+hashtag | **Salin untuk TikTok** |
| Mark done | **Tandai Selesai** |
| Submit URL | **Simpan URL Posting** |
| Generate AI | **Generate Caption & Hashtag** |
| Finalize option | **Pilih & Simpan Final** |
| Bulk preview | **Preview Jadwal Massal** |
| Bulk publish | **Publish Semua Jadwal** |
| Cancel schedule | **Batalkan Jadwal** |
| Create content | **Buat Konten Baru** |
| Create schedule | **Buat Jadwal** |
| Edit | **Ubah** |
| Delete | **Hapus** |
| Hubungkan Telegram | **Hubungkan Telegram** |
| Generate link code | **Buat Kode Link** |
| Login | **Masuk** |
| Logout | **Keluar** |
| Save | **Simpan** |
| Back | **Kembali** |
| Filter | **Filter** |
| Search | **Cari** |
| Refresh | **Muat Ulang** |

### 8.3 Pesan Error

| Kode | Pesan Error |
|------|-------------|
| `INVALID_CREDENTIALS` | Email atau password salah. |
| `INVALID_TIKTOK_URL` | URL TikTok wajib diawali `https://www.tiktok.com/` — link pendek atau format lain tidak diterima. |
| `CONTENT_NOT_READY` | Konten belum di-finalize. Selesaikan caption & hashtag terlebih dahulu. |
| `CONTENT_ALREADY_USED` | Konten ini sudah digunakan untuk jadwal lain. |
| `SCHEDULE_GAP_VIOLATION` | Jarak antar posting di akun ini minimal 2 jam. Silakan pilih waktu lain. |
| `SCHEDULE_OUTSIDE_WINDOW` | Jadwal harus berada dalam rentang 08:00 – 22:00 WIB. |
| `SCHEDULE_IN_PAST` | Tidak bisa membuat jadwal di waktu yang sudah lewat. |
| `CANNOT_MARK_DONE` | Posting ini belum waktunya atau sudah selesai/dibatalkan. |
| `UNAUTHORIZED` | Sesi kamu sudah habis. Silakan login kembali. |
| `FORBIDDEN` | Kamu tidak memiliki akses untuk melakukan aksi ini. |
| `OPERATOR_NO_TELEGRAM` | Operator belum menghubungkan Telegram. Notifikasi tidak bisa dikirim. |
| `TELEGRAM_CODE_EXPIRED` | Kode link Telegram sudah kedaluwarsa. Buat kode baru. |
| `BRIEF_POINTS_INVALID` | Brief harus memiliki 3–7 poin penting. |
| `HASHTAGS_COUNT_INVALID` | Jumlah hashtag harus antara 10–25. |
| `RATE_LIMIT_EXCEEDED` | Terlalu banyak percobaan login. Coba lagi dalam 15 menit. |
| `AI_GENERATION_FAILED` | Gagal generate caption. Silakan coba lagi. |
| `BULK_NO_CONTENT` | Tidak ada konten ready untuk akun ini. Buat konten terlebih dahulu. |

### 8.4 Label Status (Badge)

| Status | Label | Warna |
|--------|-------|-------|
| `scheduled` | Terjadwal | 🔵 Biru |
| `due` | Saatnya Posting | 🟡 Kuning |
| `overdue` | Terlambat | 🟠 Oranye |
| `missed` | Terlewat | 🔴 Merah |
| `done` | Selesai | 🟢 Hijau |
| `canceled` | Dibatalkan | ⚪ Abu-abu |

### 8.5 Teks Halaman

#### Dashboard Harian
- **Judul:** "Dashboard Hari Ini"
- **Subtitle:** "Ringkasan posting tanggal {{date}}"
- **Metric cards:**
  - "Total Jadwal: {{total}}"
  - "Selesai: {{done}}/{{total}} ({{completion_rate}}%)"
  - "Terlambat: {{overdue}}"
  - "Terlewat: {{missed}}"

#### Tugas Saya
- **Judul:** "Tugas Saya — {{date}}"
- **Empty state:** "Tidak ada tugas untuk hari ini. Semua sudah selesai! 🎉"
- **Card tugas:**
  - "@{{username}} — {{brief_topic}}"
  - "Jadwal: {{scheduled_at_wib}} WIB"
  - Badge status

#### Execution Page
- **Judul:** "Eksekusi Posting"
- **Checklist:**
  - "☐ Sudah download video dari Google Drive"
  - "☐ Sudah copy caption & hashtag"
  - "☐ Sudah upload dan publish di TikTok Web"
  - "☐ Sudah paste URL posting TikTok"
- **Field URL:** placeholder "https://www.tiktok.com/@username/video/..."
- **Help text:** "Paste URL lengkap posting TikTok kamu. Link pendek tidak diterima."

---

## 9. Security & Compliance

### 9.1 Autentikasi & Password

| Aspek | Implementasi |
|-------|-------------|
| Hashing password | **bcrypt** dengan cost factor **12** |
| JWT Access Token | Expiry **1 jam**, signed dengan HS256 + secret key ≥ 256-bit |
| JWT Refresh Token | Expiry **7 hari**, disimpan di database (revocable) |
| Password policy | Min 8 karakter, min 1 huruf besar, min 1 angka |
| Login rate limit | 5 percobaan per 15 menit per IP (Redis-based) |
| Logout | Invalidate refresh token di database |
| Token rotation | Refresh token di-rotate setiap kali digunakan (one-time use) |

### 9.2 Otorisasi

| Role | Akses |
|------|-------|
| `admin` | Full CRUD semua resource; dashboard; bulk generate; manage operators |
| `operator` | My tasks; execution; mark done; profil sendiri; lihat akun/konten yang di-assign |

**Implementasi:** NestJS Guards + decorator `@Roles('admin')`.

### 9.3 Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /auth/login` | 5 request | 15 menit per IP |
| `POST /contents/:id/ai-generate` | 10 request | 1 menit per user |
| `POST /bulk/preview` | 3 request | 5 menit per user |
| Global API | 100 request | 1 menit per user |

**Implementasi:** `@nestjs/throttler` dengan Redis store.

### 9.4 Audit Log

Semua aksi berikut dicatat di tabel `audit_logs`:

| Aksi | Entity | Keterangan |
|------|--------|------------|
| `user.login` | users | IP, user agent |
| `user.login_failed` | users | IP, user agent, email yang dicoba |
| `account.create` | tiktok_accounts | Data akun baru |
| `account.update` | tiktok_accounts | Old + new value |
| `account.delete` | tiktok_accounts | |
| `content.create` | contents | |
| `content.ai_generate` | contents | |
| `content.finalize` | contents | Opsi yang dipilih |
| `schedule.create` | scheduled_posts | |
| `schedule.mark_done` | scheduled_posts | URL TikTok |
| `schedule.cancel` | scheduled_posts | |
| `bulk.preview` | bulk_batches | |
| `bulk.publish` | bulk_batches | Total jadwal |
| `operator.create` | users | |
| `operator.update` | users | |
| `operator.telegram_linked` | users | |

### 9.5 Risiko Data & Mitigasi

| Risiko | Deskripsi | Mitigasi |
|--------|-----------|----------|
| **Data username TikTok bocor** | Penyerang bisa melihat daftar 100+ akun TikTok | Akses hanya via login; database tidak publik; username TikTok bersifat publik (bukan credential) |
| **URL Google Drive bocor** | Video bisa diakses pihak ketiga | Edukasi admin untuk set Google Drive sharing = "restricted"; aplikasi tidak menyimpan file |
| **JWT dicuri** | Akses tidak sah | Short-lived access token (1 jam); refresh token one-time use; HTTPS wajib |
| **Password database bocor** | Credential terekspos | Bcrypt cost 12; password hashing best practice |
| **Telegram chat_id terekspos** | Bisa spam notifikasi | Hanya disimpan di database yang di-protect; bot hanya kirim ke verified chat_id |
| **SQL Injection** | Manipulasi query | TypeORM parameterized queries; Joi/class-validator input validation |
| **XSS** | Script injection | Next.js auto-escape JSX; CSP headers; sanitize user input |
| **CSRF** | Cross-site request | JWT berbasis header (bukan cookie), sehingga CSRF tidak relevan |
| **Mass assignment** | Update field tidak sah | DTO validation dengan whitelist properties |
| **Server overload akibat bulk** | 100 akun × 3 post = 300 jadwal sekaligus | BullMQ queue processing; rate limit; concurrency limit |

### 9.6 Rekomendasi Deployment

- **HTTPS wajib** di production.
- **Environment variables** untuk semua secret (JWT_SECRET, DB password, Telegram bot token, AI API key).
- **Database** tidak langsung accessible dari internet — private network.
- **Redis** juga di private network, dengan password.
- Backup database **harian** dengan retention 30 hari.
- **CORS** hanya mengizinkan domain frontend.

---

## 10. MVP Plan

### 10.1 Sprint 1 — Fondasi & Manual Flow (2 minggu)

**Tujuan:** Admin bisa buat akun, konten, AI generate, dan jadwal manual. Operator bisa lihat tugas dan mark done.

| # | Task | Estimasi | Prioritas |
|---|------|----------|-----------|
| 1.1 | Setup project: Next.js frontend + NestJS backend + PostgreSQL + Redis | 2 hari | P0 |
| 1.2 | Auth module: login, JWT, refresh token, guard, rate limit | 2 hari | P0 |
| 1.3 | Database migration: semua tabel | 1 hari | P0 |
| 1.4 | CRUD Users/Operators | 1 hari | P0 |
| 1.5 | CRUD TikTok Accounts + assign default operator | 1 hari | P0 |
| 1.6 | CRUD Contents + brief + AI generate (integrasi LLM API) | 2 hari | P0 |
| 1.7 | Finalize content (pilih opsi, edit, save final) | 1 hari | P0 |
| 1.8 | Create schedule (manual, 1 per 1) + validasi gap & window | 1 hari | P0 |
| 1.9 | My Tasks page + Execution page + mark done + validasi URL | 2 hari | P0 |
| 1.10 | Halaman Login + layout + navigasi | 1 hari | P0 |
|   | **Total Sprint 1** | **14 hari** | |

**Deliverable:**
- Admin bisa login, buat akun TikTok, buat konten dengan AI caption, buat jadwal manual.
- Operator bisa login, lihat tugas, eksekusi, mark done.
- Validasi URL TikTok berjalan.

---

### 10.2 Sprint 2 — Notifikasi + Dashboard + Status Machine (2 minggu)

**Tujuan:** Status otomatis (reconciler), notifikasi Telegram, dan dashboard monitoring.

| # | Task | Estimasi | Prioritas |
|---|------|----------|-----------|
| 2.1 | BullMQ setup + Redis connection | 0.5 hari | P0 |
| 2.2 | Status reconciler cron job (scheduled→due→overdue→missed) | 1.5 hari | P0 |
| 2.3 | Telegram bot setup + webhook endpoint | 1 hari | P0 |
| 2.4 | Telegram link flow: generate code + /start verification | 1 hari | P0 |
| 2.5 | Notifikasi queue: reminder 30m, 5m, overdue alert | 2 hari | P0 |
| 2.6 | Profil operator: hubungkan Telegram UI | 0.5 hari | P1 |
| 2.7 | Dashboard harian: overall stats | 1.5 hari | P0 |
| 2.8 | Dashboard per operator & per akun | 1.5 hari | P1 |
| 2.9 | Audit log middleware + tabel | 1 hari | P1 |
| 2.10 | Cancel schedule + soft-delete routes | 0.5 hari | P1 |
| 2.11 | Filter & sort pada halaman jadwal, konten, akun | 1 hari | P1 |
| 2.12 | Error handling & UX polish + Bahasa Indonesia | 2 hari | P1 |
|   | **Total Sprint 2** | **14 hari** | |

**Deliverable:**
- Status otomatis berubah sesuai waktu.
- Operator menerima notifikasi Telegram.
- Admin punya dashboard monitoring.
- Audit log aktif.

---

### 10.3 Sprint 3 — Bulk Generator + Polish (2 minggu)

**Tujuan:** Bulk generate jadwal massal, reassing operator massal, dan finalisasi UI.

| # | Task | Estimasi | Prioritas |
|---|------|----------|-----------|
| 3.1 | Bulk preview endpoint + algoritma time slot | 2 hari | P0 |
| 3.2 | Bulk publish endpoint + create scheduled_posts batch | 1 hari | P0 |
| 3.3 | Halaman UI: Generate Massal + preview table + publish | 2 hari | P0 |
| 3.4 | Insufficient content warning di bulk preview | 0.5 hari | P0 |
| 3.5 | Re-assign akun massal (operator) | 1 hari | P1 |
| 3.6 | Responsive design + mobile optimization | 2 hari | P1 |
| 3.7 | Performance optimization: query, indexing, caching | 1.5 hari | P1 |
| 3.8 | E2E testing: auth, content, schedule, mark done, bulk | 2 hari | P1 |
| 3.9 | Deployment setup: Docker, CI/CD, env config | 1.5 hari | P1 |
| 3.10 | User acceptance testing (UAT) + bug fix | 1.5 hari | P0 |
|   | **Total Sprint 3** | **15 hari** | |

**Deliverable:**
- Admin bisa bulk generate 100+ jadwal sekaligus.
- Semua fitur MVP berjalan end-to-end.
- Siap deploy ke production.

---

### 10.4 Ringkasan Milestone

```
Sprint 1 (Minggu 1–2):  Manual Flow             → Admin & Operator bisa kerja
Sprint 2 (Minggu 3–4):  Notif + Dashboard        → Otomasi status & monitoring
Sprint 3 (Minggu 5–6):  Bulk + Deploy            → Skala 100 akun & production
─────────────────────────────────────────────────────
Total estimasi: ~6 minggu (1 developer full-time)
                ~3 minggu (2 developer full-time)
```

### 10.5 Post-MVP (Future Enhancements)

| Fitur | Prioritas | Sprint |
|-------|-----------|--------|
| Multi-niche template tambahan (Edukasi, Hiburan, dll.) | P2 | 4 |
| Export laporan CSV/Excel | P2 | 4 |
| Kalendar visual untuk jadwal per akun | P2 | 4 |
| Duplikasi konten (copy brief + re-generate AI) | P3 | 5 |
| Role tambahan (supervisor, viewer) | P3 | 5 |
| Mobile PWA | P3 | 5 |
| Performance analytics (tracking view/like via input manual) | P3 | 6 |

---

## Lampiran A: Technology Stack Detail

| Layer | Teknologi | Versi Min | Keterangan |
|-------|-----------|-----------|------------|
| Frontend | Next.js | 14+ | App Router, Server Components |
| UI Library | Tailwind CSS + shadcn/ui | - | Komponen konsisten, Bahasa Indonesia |
| State Management | Zustand / React Query | - | Server state: React Query; Client state: Zustand |
| Backend | NestJS | 10+ | Express adapter, modular architecture |
| ORM | TypeORM / Prisma | - | Prisma recommended untuk type safety |
| Database | PostgreSQL | 15+ | TIMESTAMPTZ, JSONB, array types |
| Cache & Queue | Redis | 7+ | BullMQ adapter |
| Queue | BullMQ | 5+ | Job scheduling, repeatable jobs |
| AI | OpenAI API / Anthropic | - | GPT-4 / Claude untuk caption generation |
| Telegram | node-telegram-bot-api / grammy | - | Webhook mode |
| Auth | @nestjs/jwt + @nestjs/passport | - | JWT strategy |
| Validation | class-validator + class-transformer | - | DTO validation |
| Rate Limit | @nestjs/throttler | - | Redis-backed |
| Testing | Jest | - | Unit + integration |
| E2E Testing | Playwright / Cypress | - | Frontend E2E |

---

## Lampiran B: Struktur Folder Proyek

```
tiktok-posting-manager/
├── frontend/                          # Next.js
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   └── login/
│   │   │   │       └── page.tsx
│   │   │   ├── (dashboard)/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx           # Dashboard harian
│   │   │   │   ├── akun/
│   │   │   │   │   ├── page.tsx       # List akun
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx   # Detail/edit akun
│   │   │   │   ├── operator/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx
│   │   │   │   ├── konten/
│   │   │   │   │   ├── page.tsx       # List konten
│   │   │   │   │   ├── baru/
│   │   │   │   │   │   └── page.tsx   # Buat konten + AI
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx   # Detail/finalize
│   │   │   │   ├── jadwal/
│   │   │   │   │   ├── page.tsx       # List jadwal
│   │   │   │   │   └── baru/
│   │   │   │   │       └── page.tsx   # Buat jadwal manual
│   │   │   │   ├── bulk/
│   │   │   │   │   └── page.tsx       # Generate massal
│   │   │   │   ├── tugas/
│   │   │   │   │   ├── page.tsx       # Tugas Saya (operator)
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx   # Execution page
│   │   │   │   └── profil/
│   │   │   │       └── page.tsx       # Profil + Telegram
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── ui/                    # shadcn/ui components
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Header.tsx
│   │   │   │   └── Navbar.tsx
│   │   │   ├── dashboard/
│   │   │   │   ├── StatCards.tsx
│   │   │   │   ├── OperatorTable.tsx
│   │   │   │   └── AccountTable.tsx
│   │   │   ├── content/
│   │   │   │   ├── ContentForm.tsx
│   │   │   │   ├── AiOptionsSelector.tsx
│   │   │   │   └── FinalizeForm.tsx
│   │   │   ├── schedule/
│   │   │   │   ├── ScheduleForm.tsx
│   │   │   │   └── ScheduleList.tsx
│   │   │   ├── execution/
│   │   │   │   ├── ExecutionChecklist.tsx
│   │   │   │   ├── CopyButton.tsx
│   │   │   │   └── MarkDoneForm.tsx
│   │   │   └── bulk/
│   │   │       ├── BulkConfigForm.tsx
│   │   │       └── BulkPreviewTable.tsx
│   │   ├── lib/
│   │   │   ├── api.ts                 # API client (axios/fetch wrapper)
│   │   │   ├── auth.ts                # Auth helpers
│   │   │   ├── utils.ts               # Utilities
│   │   │   └── constants.ts           # Constants
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useTasks.ts
│   │   │   └── useDashboard.ts
│   │   └── types/
│   │       └── index.ts               # TypeScript types
│   ├── public/
│   ├── tailwind.config.ts
│   ├── next.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── backend/                           # NestJS
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── common/
│   │   │   ├── decorators/
│   │   │   │   └── roles.decorator.ts
│   │   │   ├── guards/
│   │   │   │   ├── jwt-auth.guard.ts
│   │   │   │   └── roles.guard.ts
│   │   │   ├── filters/
│   │   │   │   └── http-exception.filter.ts
│   │   │   ├── interceptors/
│   │   │   │   └── audit-log.interceptor.ts
│   │   │   ├── pipes/
│   │   │   │   └── validation.pipe.ts
│   │   │   └── constants.ts
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── jwt.strategy.ts
│   │   │   └── dto/
│   │   │       ├── login.dto.ts
│   │   │       └── refresh.dto.ts
│   │   ├── users/
│   │   │   ├── users.module.ts
│   │   │   ├── users.controller.ts
│   │   │   ├── users.service.ts
│   │   │   ├── entities/
│   │   │   │   └── user.entity.ts
│   │   │   └── dto/
│   │   │       ├── create-user.dto.ts
│   │   │       └── update-user.dto.ts
│   │   ├── tiktok-accounts/
│   │   │   ├── tiktok-accounts.module.ts
│   │   │   ├── tiktok-accounts.controller.ts
│   │   │   ├── tiktok-accounts.service.ts
│   │   │   ├── entities/
│   │   │   │   └── tiktok-account.entity.ts
│   │   │   └── dto/
│   │   │       ├── create-account.dto.ts
│   │   │       └── update-account.dto.ts
│   │   ├── contents/
│   │   │   ├── contents.module.ts
│   │   │   ├── contents.controller.ts
│   │   │   ├── contents.service.ts
│   │   │   ├── ai-generator.service.ts
│   │   │   ├── entities/
│   │   │   │   └── content.entity.ts
│   │   │   └── dto/
│   │   │       ├── create-content.dto.ts
│   │   │       ├── finalize-content.dto.ts
│   │   │       └── ai-options.dto.ts
│   │   ├── schedules/
│   │   │   ├── schedules.module.ts
│   │   │   ├── schedules.controller.ts
│   │   │   ├── schedules.service.ts
│   │   │   ├── entities/
│   │   │   │   └── scheduled-post.entity.ts
│   │   │   └── dto/
│   │   │       ├── create-schedule.dto.ts
│   │   │       └── mark-done.dto.ts
│   │   ├── bulk/
│   │   │   ├── bulk.module.ts
│   │   │   ├── bulk.controller.ts
│   │   │   ├── bulk.service.ts
│   │   │   └── entities/
│   │   │       └── bulk-batch.entity.ts
│   │   ├── dashboard/
│   │   │   ├── dashboard.module.ts
│   │   │   ├── dashboard.controller.ts
│   │   │   └── dashboard.service.ts
│   │   ├── tasks/
│   │   │   ├── tasks.module.ts
│   │   │   ├── tasks.controller.ts
│   │   │   └── tasks.service.ts
│   │   ├── telegram/
│   │   │   ├── telegram.module.ts
│   │   │   ├── telegram.controller.ts
│   │   │   ├── telegram.service.ts
│   │   │   └── telegram-bot.service.ts
│   │   ├── notifications/
│   │   │   ├── notifications.module.ts
│   │   │   └── notifications.service.ts
│   │   ├── jobs/
│   │   │   ├── jobs.module.ts
│   │   │   ├── reconciler.processor.ts
│   │   │   ├── notification.processor.ts
│   │   │   ├── ai-generate.processor.ts
│   │   │   └── bulk-generate.processor.ts
│   │   └── audit/
│   │       ├── audit.module.ts
│   │       ├── audit.service.ts
│   │       └── entities/
│   │           └── audit-log.entity.ts
│   ├── prisma/                        # atau typeorm migrations/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── test/
│   ├── tsconfig.json
│   └── package.json
│
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

---

## Lampiran C: Docker Compose (Development)

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: tiktok_manager
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres_dev_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass redis_dev_password
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      DATABASE_URL: postgresql://postgres:postgres_dev_password@postgres:5432/tiktok_manager
      REDIS_URL: redis://:redis_dev_password@redis:6379
      JWT_SECRET: dev-secret-key-change-in-prod
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
      AI_API_KEY: ${AI_API_KEY}
      FRONTEND_URL: http://localhost:3000
    depends_on:
      - postgres
      - redis

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001/api/v1
    depends_on:
      - backend

volumes:
  postgres_data:
  redis_data:
```

---

## Lampiran D: Environment Variables

```env
# === Database ===
DATABASE_URL=postgresql://user:password@host:5432/tiktok_manager

# === Redis ===
REDIS_URL=redis://:password@host:6379

# === JWT ===
JWT_SECRET=your-256-bit-secret-key-here
JWT_ACCESS_EXPIRY=1h
JWT_REFRESH_EXPIRY=7d

# === Telegram ===
TELEGRAM_BOT_TOKEN=123456789:ABCDefGhIjKlMnOpQrStUvWxYz
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/api/v1/webhook/telegram

# === AI / LLM ===
AI_PROVIDER=openai           # openai | anthropic
AI_API_KEY=sk-...
AI_MODEL=gpt-4o              # atau claude-3-sonnet-20240229

# === Application ===
FRONTEND_URL=https://yourdomain.com
PORT=3001
NODE_ENV=production

# === Timezone ===
TZ=Asia/Jakarta
```

---

*— Akhir Dokumen Spesifikasi —*
