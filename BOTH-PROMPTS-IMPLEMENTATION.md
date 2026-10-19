# NepaliStory — Integrated Platform Upgrade Status

This repository integrates work from both user specifications: the master publishing-platform upgrade and the advanced social interaction system. It retains the existing React + TypeScript + Vite frontend and Express + TypeScript + Prisma + PostgreSQL backend.

## Implemented in this revision

### Existing platform retained
- Public story discovery, genres, story details, novel text chapters, manhwa image panels, and a responsive reader.
- Registration/login with hashed passwords, hashed bearer-session tokens, role checks, and account-status checks. Registration permits USER or CREATOR; it does not permit self-registration as ADMIN.
- Creator story/chapter publishing, image upload validation, video upload/library, and admin user/story/report management.
- Existing security middleware, API rate limits, database indexes, and migrations.

### Social interactions
- Database-backed story likes with optimistic UI updates and rollback, unique user/target constraints, server-derived counts, and creator notifications.
- 1–5 star ratings with one current rating per reader/story, update/remove operations, and aggregate rating response.
- Threaded comments/replies; create, edit, and delete own comments; comment reporting; comment/reply notifications; community rate limits.
- Separate written reviews with one review per user/story, create/update, delete own review, helpful voting, sorting/pagination, and report submission.
- Creator follows, public creator profile, follower count, follow/unfollow, and message-creator entry point.
- Persistent database bookmarks and a reader library page.
- Authenticated reading-progress save/resume endpoint and a dashboard “Continue reading” list.
- Generic database-backed likes for chapters, videos, and creator profiles, with duplicate prevention and count responses.

### Messaging and notifications
- Private two-person conversations, persisted message history, participant checks on conversation/message APIs, blocked-user checks, soft deletion of own messages, and a 15-minute edit window for messages.
- Inbox archive/mute API, unread calculation based on participant last-read timestamp, and 5-second polling as a realtime fallback (no WebSocket server is configured).
- Notification center, unread badge in navigation, mark one/all as read, and notification preferences for likes, follows, comments, messages, and new chapters.
- New-chapter notifications to creator followers and message/like/follow/comment notifications, respecting the relevant preferences where implemented.
- Message reporting limited to conversation participants, with a restricted admin endpoint exposing only reported messages (not general inbox browsing).

### Reader and creator dashboards
- Reader dashboard summaries for liked items, ratings, follows, bookmarks, unread notifications, and message entry point.
- Creator engagement summary for story likes, average ratings, ratings count, comments, followers, and top content.

## Database migrations added

- `20261019120000_social_messaging` — social likes, follows, messaging, notifications, blocks, and threaded replies (already part of the supplied base).
- `20261019133000_notification_preferences` — per-user notification preference flags.
- `20261019143000_written_reviews` — written reviews, helpful votes, and review reports.
- `20261019153000_message_reports` — private-message abuse reports for a restricted moderation queue.

Back up an existing database before deploying migrations. Do not run destructive resets against real data.

## Verification performed here

- Frontend TypeScript project check passed: `tsc -b client/tsconfig.json`.
- TypeScript transpile/syntax parsing passed for `client/src/App.tsx` and `server/src/app.ts`.
- Full frontend production build could not finish because the extracted environment is missing the platform-specific optional Rollup package `@rollup/rollup-linux-x64-gnu`.
- Prisma Client generation could not run because the Prisma schema engine download was unavailable in this environment. The included generated Prisma Client is stale relative to the current schema, so backend type checking against the current schema is **not verified**. Generate Prisma Client on a network-enabled machine before building.
- No live PostgreSQL connection or browser-based multi-account acceptance test was available here. Therefore, the system is not claimed to be production-ready or fully acceptance-tested.

## Run on Windows

1. Install a current Node.js LTS release and start PostgreSQL.
2. Copy `server/.env.example` to `server/.env` and set a valid `DATABASE_URL` and the other values documented in the example file. Never commit `.env`.
3. From the repository root run:

```bash
npm install
npm run db:generate
npm run db:deploy
npm run build
npm run dev
```

If Prisma generation or migration fails, stop and fix that error before starting the app. The development frontend normally runs at `http://localhost:5173` and the API at `http://localhost:4000`.

## Remaining work before production

- Finish and verify all Prisma migrations/client generation and run backend type-check/build against the current schema.
- Add automated integration/e2e tests for the acceptance requirements with multiple reader/creator/admin accounts and a real PostgreSQL database.
- Implement WebSocket/SSE realtime delivery; current messaging uses polling fallback.
- Complete series-subscription controls and notification delivery for every video/episode/story content type.
- Add public creator profile likes UI, like buttons/counts on every chapter/video page, and complete all cross-content engagement aggregates. Generic endpoints exist for chapter/video/creator likes, but not every corresponding UI control is wired.
- Complete full admin moderation workflows/audit log for every sensitive action, review-report review/removal UI, creator analytics growth/time-series charts, and messaging report workflow.
- Complete password reset/email verification, secure HttpOnly-cookie session option/CSRF strategy, object storage/CDN, malware scanning, video transcoding/captions, monitoring, and deployment hardening.
- Add dedicated UI for managing muted/archived conversations, block list, comment reaction controls, and complete public/private messaging preferences.
- Recheck privacy/legal policy, content licensing, accessibility, performance, and backup/restore before launch.

This report intentionally distinguishes implemented source changes from functions that require additional UI wiring, external configuration, or runtime verification.

## Profile customization addition (2026-10-19)
- Added authenticated profile editing for display name and bio for readers and creators.
- Added profile-picture upload using the existing image-signature validation and local uploads storage, with an 8 MB limit.
- Added HTTPS-validated social profile links for website, Instagram, Facebook, YouTube, TikTok, GitHub, and LinkedIn.
- Exposed public creator social links and avatar on creator profile pages.
- Added migration `20261019170000_profile_social_links` for profile social URL columns.
- Apply with `npm run db:generate` and `npm run db:deploy` after backing up the database.
