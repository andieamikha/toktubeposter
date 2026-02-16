# Assisted TikTok Posting Manager

Dashboard web untuk mengelola 100+ akun TikTok dengan 3+ operator, manual posting workflow, AI caption generation, notifikasi Telegram, bulk scheduling, **dan upload langsung ke TikTok dari Google Drive**.

## Tech Stack

| Layer     | Technology                          |
| --------- | ----------------------------------- |
| Backend   | NestJS 11 + TypeORM + SQLite        |
| Frontend  | Next.js 16 + Tailwind CSS 4         |
| Scheduler | @nestjs/schedule (Cron)              |
| AI        | OpenAI GPT-4o-mini                  |
| Notifikasi| Telegram Bot API                    |
| Upload    | TikTok Content Posting API v2       |
| Storage   | Google Drive API v3                 |

## Quick Start

### 1. Prerequisites

- Node.js 20+ (portable sudah tersedia di folder `node20/`)
- OpenAI API Key
- Telegram Bot Token (create via @BotFather)
- Google API Key (untuk Google Drive — opsional, hanya jika pakai fitur upload langsung)
- TikTok Developer App (Client Key + Secret — opsional, hanya jika pakai fitur upload langsung)

> **Tidak perlu Docker, PostgreSQL, atau Redis.** Aplikasi menggunakan SQLite (embedded).

### 2. Setup Environment

```bash
cp backend/.env.example backend/.env
# Edit .env sesuai kebutuhan (API keys)
```

### 3. Aktifkan Node.js 20 (jika sistem masih Node 14)

```powershell
$env:PATH = "E:\OPUS2026\TIKTOK\node20\node-v20.19.2-win-x64;" + $env:PATH
node --version  # harus v20.x
```

### 4. Start Backend

```bash
cd backend
npm install
npx nest start
```

Backend berjalan di `http://localhost:3001/api/v1`

Database SQLite otomatis dibuat di `backend/data/tiktok_manager.db`

Default admin: `admin@tiktokmanager.com` / `Admin123!`

### 5. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend berjalan di `http://localhost:3000`

## Fitur

### Core
- **Dashboard** — Overview harian: total, selesai, terlambat, terlewat + completion rate
- **Manajemen Akun TikTok** — CRUD akun dengan niche, operator default
- **Manajemen Operator** — CRUD user dengan role admin/operator
- **Konten** — Upload brief + AI caption generation (3 opsi) → finalize
- **Jadwal** — Buat jadwal manual per konten
- **Bulk Generate** — Auto-generate jadwal untuk semua konten finalized
- **Tugas Saya** — Operator view: daftar tugas, eksekusi (copy caption/hashtags → paste di TikTok → input URL)
- **Notifikasi Telegram** — H-30 menit reminder + tugas baru
- **Profil** — Link Telegram, ubah password

### Google Drive + TikTok Upload (Baru)
- **Google Drive Browser** — Browse folder Google Drive, lihat file video, salin URL untuk konten
- **TikTok OAuth** — Hubungkan akun TikTok via OAuth2 per akun (tombol Link/Unlink di halaman Akun)
- **Upload Langsung** — Download video dari Google Drive → upload otomatis ke TikTok via Content Posting API v2
- **Dual Mode Eksekusi** — Operator bisa pilih "Upload Langsung" (otomatis) atau "Upload Manual" (flow lama)
- **Upload Status** — Tracking real-time: idle → downloading → uploading → processing → published / failed
- **Upload dari Jadwal** — Tombol upload langsung di halaman Jadwal per baris

### Setup Google Drive API (Opsional)

1. Buka [Google Cloud Console](https://console.cloud.google.com/)
2. Buat project baru atau pilih yang ada
3. Enable **Google Drive API**
4. Buat **API Key** di Credentials
5. Copy API Key ke `GOOGLE_API_KEY` di `.env`
6. Pastikan file/folder di Google Drive di-share sebagai **"Anyone with the link"**

### Setup TikTok Developer App (Opsional)

1. Daftar di [TikTok for Developers](https://developers.tiktok.com/)
2. Buat aplikasi baru
3. Request akses scope: `user.info.basic`, `video.publish`, `video.upload`
4. Set Redirect URI: `http://localhost:3001/api/v1/tiktok-oauth/callback`
5. Copy **Client Key** dan **Client Secret** ke `.env`
6. Di halaman Akun TikTok, klik tombol **Link** untuk menghubungkan akun via OAuth

## Struktur Project

```
TIKTOK/
├── backend/
│   └── src/
│       ├── auth/            # Login, JWT, refresh token
│       ├── users/           # CRUD pengguna
│       ├── tiktok-accounts/ # CRUD akun TikTok + OAuth connect/disconnect
│       ├── contents/        # Konten + AI generation
│       ├── schedules/       # Jadwal posting
│       ├── bulk/            # Bulk generate jadwal
│       ├── dashboard/       # Statistik harian
│       ├── tasks/           # Tugas operator
│       ├── telegram/        # Webhook + notifikasi
│       ├── notifications/   # Entity notifikasi
│       ├── audit/           # Audit log
│       ├── jobs/            # Cron job processors (reconciler, notifications)
│       ├── google-drive/    # Google Drive API (list files, download video)
│       ├── tiktok-api/      # TikTok OAuth2 + Content Posting API v2
│       ├── upload/          # Upload orchestrator (Drive → TikTok pipeline)
│       ├── common/          # Guards, filters, interceptors, constants
│       └── database/        # Migrations
├── frontend/
│   └── src/
│       ├── app/             # Next.js App Router pages
│       │   └── dashboard/
│       │       ├── accounts/     # Akun TikTok + OAuth
│       │       ├── contents/     # Manajemen konten
│       │       ├── schedules/    # Jadwal + upload status
│       │       ├── tasks/        # Tugas + dual-mode eksekusi
│       │       ├── google-drive/ # Google Drive browser
│       │       ├── bulk/         # Bulk generate
│       │       ├── operators/    # Manajemen operator
│       │       └── profile/      # Profil user
│       ├── components/      # Reusable UI components
│       ├── lib/             # API client, utilities
│       ├── stores/          # Zustand auth store
│       ├── providers/       # React Query provider
│       └── types/           # TypeScript interfaces
└── SPEC-TEKNIS-TIKTOK-MANAGER.md
```

## API Endpoints

| Method | Endpoint                           | Auth   | Description                    |
| ------ | ---------------------------------- | ------ | ------------------------------ |
| POST   | /auth/login                        | Public | Login                          |
| POST   | /auth/refresh                      | Public | Refresh token                  |
| GET    | /users                             | Admin  | List users                     |
| POST   | /users                             | Admin  | Create user                    |
| GET    | /tiktok-accounts                   | Admin  | List accounts                  |
| POST   | /tiktok-accounts                   | Admin  | Create account                 |
| POST   | /tiktok-accounts/:id/connect       | Admin  | Get TikTok OAuth URL           |
| POST   | /tiktok-accounts/:id/disconnect    | Admin  | Disconnect TikTok OAuth        |
| GET    | /tiktok-accounts/api-status        | Admin  | Check TikTok API config status |
| GET    | /contents                          | Admin  | List contents                  |
| POST   | /contents                          | Admin  | Create content                 |
| POST   | /contents/:id/generate-ai          | Admin  | Generate AI caption            |
| POST   | /contents/:id/finalize             | Admin  | Finalize caption               |
| GET    | /schedules                         | Admin  | List schedules                 |
| POST   | /schedules                         | Admin  | Create schedule                |
| PATCH  | /schedules/:id/done                | All    | Mark done + URL                |
| POST   | /bulk/preview                      | Admin  | Preview bulk schedule          |
| POST   | /bulk/:id/publish                  | Admin  | Publish batch                  |
| GET    | /dashboard/stats                   | Admin  | Daily statistics               |
| GET    | /my-tasks                          | All    | My tasks today                 |
| GET    | /google-drive/files                | Admin  | List files in Drive folder     |
| GET    | /google-drive/file-info            | Admin  | Get single file info           |
| GET    | /tiktok-oauth/callback             | Public | OAuth redirect callback        |
| POST   | /upload/:scheduleId/tiktok         | Admin  | Upload video to TikTok         |
| GET    | /upload/:scheduleId/status         | Admin  | Get upload status              |
| POST   | /upload/:scheduleId/retry          | Admin  | Retry failed upload            |
| POST   | /upload/:scheduleId/refresh-status | Admin  | Refresh status from TikTok     |
