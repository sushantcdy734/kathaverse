# NepaliStory

A full-stack community storytelling platform built with React, TypeScript, Vite, Express, PostgreSQL, and Prisma. It supports reader and creator accounts, story/chapter publishing (including image-based manhwa chapters), and an admin dashboard.

> **Project status:** This is a portfolio/development project, not a security-audited production service. See [Known limitations](#known-limitations) before deploying publicly.

## Features

- Responsive React + TypeScript reader interface
- Story discovery, search, genre filtering, and story/chapter pages
- Reader and creator registration with bcrypt password hashing
- Server-side bearer sessions stored as SHA-256 token hashes
- Creator studio for stories, text chapters, and image pages
- Creator/admin video uploads, short clips and regular video browsing with native HTML5 playback
- Admin dashboard for user roles/status and story publication
- PostgreSQL schema and versioned Prisma migrations
- Basic API rate limiting, Helmet security headers, input checks, and upload signature validation

## Requirements

- Node.js 20 or newer and npm
- PostgreSQL 14 or newer (or a compatible managed PostgreSQL service)

## Quick start (Windows)

1. Install Node.js and PostgreSQL.
2. Create a PostgreSQL database named `nepalistory`.
3. Extract this repository and run `START-NepaliStory.bat`.
4. On first run, the launcher creates `server/.env` from `.env.example` and opens it. Set `DATABASE_URL`; optionally set `ADMIN_EMAIL`, `ADMIN_USERNAME`, and a unique `ADMIN_PASSWORD` of at least 12 characters.
5. Save the file and run `START-NepaliStory.bat` again. It installs dependencies, generates Prisma Client, applies migrations, and starts the app.
6. Visit <http://localhost:5173>. API health endpoint: <http://localhost:4000/api/health>.

## Manual setup (Windows/macOS/Linux)

```bash
npm install
# Create server/.env from .env.example and configure DATABASE_URL first
npm run db:generate
npm run db:deploy
npm run dev
```

For a first-ever local database, `db:deploy` applies the committed migrations. If your database already contains tables but has no Prisma migration history, stop and inspect it before proceeding; do not reset or drop a database containing data you need.

Build both applications:

```bash
npm run build
```

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection URL, required for data operations |
| `PORT` | API port; defaults to `4000` |
| `CLIENT_URL` | Comma-separated allowed browser origins; defaults to Vite at `localhost:5173` |
| `NODE_ENV` | Runtime mode |
| `ADMIN_EMAIL` | Optional initial admin email; only provisions if no user with this email exists |
| `ADMIN_USERNAME` | Optional initial admin username |
| `ADMIN_PASSWORD` | Optional initial admin password (minimum 12 characters) |

**Never commit `.env` files, credentials, real user data, or uploaded files.** Admin provisioning is create-only: if an account already exists for `ADMIN_EMAIL`, startup will not promote it or reset its password. If you already registered the admin email as a normal user, the bootstrap will deliberately not promote it. To promote that existing account after reviewing the email, run `npm run admin:promote -- you@example.com` from the `server` workspace (`npm run admin:promote --workspace server -- you@example.com` from the repository root). This preserves the password and revokes current sessions.

## Roles and workflows

- **Reader:** browse published stories and read published chapters.
- **Creator:** create stories and publish text chapters or multiple manhwa pages.
- **Admin:** manage user roles/status and story publication; report-list/status endpoints are available in the API.

All creator/admin routes validate the bearer session and role on the server. A creator can manage only their own stories. Public registration cannot create an administrator account.

## API overview

- `GET /api/health`, `GET /api/genres`, `GET /api/stories`, `GET /api/stories/:slug`, `GET /api/chapters/:chapterId`
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET/POST /api/creator/stories`, `PATCH/DELETE /api/creator/stories/:id`, `POST /api/creator/stories/:id/chapters`
- `GET /api/videos`, `GET /api/videos/:id`, `POST /api/videos` (creator/admin only; binary request body)
- `GET /api/admin/overview`, `GET /api/admin/users`, `PATCH /api/admin/users/:id`
- `GET /api/admin/stories`, `PATCH /api/admin/stories/:id`, `GET /api/admin/reports`, `PATCH /api/admin/reports/:id`

## Repository quality and CI

- Dependency folders, build output, logs, local environment files, and uploads are excluded by `.gitignore`.
- GitHub Actions runs dependency installation, Prisma Client generation, and production builds on pushes and pull requests.
- Keep `package-lock.json` committed for reproducible installs.

## Known limitations

- Email verification, password recovery, MFA, audit logs, and automated content moderation are not implemented.
- Bookmarks, comments, ratings, and reading progress are represented in the database schema but are not yet complete end-to-end product workflows.
- Report APIs exist, but the report submission flow and full report-management UI need completion.
- Video uploads stream to local disk and are limited to 200 MB. MP4/MOV containers with an `ftyp` signature and WebM are accepted; browser playback depends on the codec. Local uploads are not durable on ephemeral hosting. Production should use private object storage, a CDN, malware scanning, quotas, and lifecycle cleanup.
- Video upload uses a raw binary request and streams to local disk. The browser upload form reports progress; it does not yet support pause/resume or generated thumbnails, captions, transcoding, or adaptive HLS.
- The short-clip category is supported in listing/filtering, but clips currently use the same card-based library rather than an auto-playing swipe feed.
- Browser authentication currently stores bearer tokens in `localStorage`; this is not ideal for a high-risk public deployment. Consider secure `HttpOnly` cookies, CSRF protection, and a reviewed session policy before production.
- Production deployment requires HTTPS, secure secrets, persistent upload storage, database backups, monitoring, and explicit production CORS configuration.
- The UI uses a generic cover image when a published story has no cover. No fake sample stories are inserted when the API/database returns an empty catalog.

## Video uploads

Creator/admin accounts can upload videos from `/videos`. Uploads are sent as a binary stream to `POST /api/videos` with a bearer token and title/description/type query parameters. Files are stored in the local `uploads/` directory; video metadata is stored in PostgreSQL. Express static file serving supports HTTP byte ranges for seeking. The initial migration creates the `Video` table; run `npm run db:deploy` after updating the code. Local filesystem storage is for development only and requires persistent storage in production.

## Before public deployment

1. Use a managed PostgreSQL database and least-privilege credentials.
2. Set `NODE_ENV=production`, HTTPS, and a strict `CLIENT_URL`.
3. Use persistent object storage for uploaded images and configure backups/retention.
4. Review auth/session storage, account recovery, privacy policy, and moderation/report workflows.
5. Run the build and test critical workflows against a clean staging database.

## License

No license is included by default. Add a license file only after deciding what permissions you want to grant to others.

### Profile picture and social accounts
Sign in and open **My Profile**. In **Edit your public profile**, select a JPG, PNG, WEBP, or GIF profile picture (maximum 8 MB), update your display name and bio, add any social profile URLs using HTTPS, and click **Save profile**. Public creator profiles show the saved avatar, bio, and provided social links. Apply the `20261019170000_profile_social_links` Prisma migration before using these fields.
