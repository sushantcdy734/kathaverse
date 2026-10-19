# Social System Notes

This feature set uses PostgreSQL/Prisma records, not frontend-only counters. See `BOTH-PROMPTS-IMPLEMENTATION.md` for the detailed implementation and verification status.

## Key routes
- `GET /api/social/stories/:storyId` — aggregate likes, average rating, rating count/distribution, and comment count.
- `GET|POST /api/social/stories/:storyId/like` — authenticated toggle; unique key is `(userId, targetType, targetId)`.
- `GET|PUT|DELETE /api/social/stories/:storyId/rating` — current rating and upsert/removal.
- `GET|POST /api/social/stories/:storyId/comments` — paginated threaded comments and replies.
- `PATCH|DELETE /api/social/comments/:id`, `POST /api/social/comments/:id/report`.
- `GET|POST /api/social/stories/:storyId/reviews`, `PATCH|DELETE /api/social/reviews/:id`, `POST /api/social/reviews/:id/helpful`, `POST /api/social/reviews/:id/report`.
- `GET /api/creators/:creatorId`, `GET /api/social/creators/:creatorId/following`, `POST /api/social/creators/:creatorId/follow`.
- `GET|POST /api/bookmarks/:storyId`, `GET /api/bookmarks`.
- `GET /api/messages`, `POST /api/messages/conversations`, `GET|POST /api/messages/:conversationId`, `PATCH /api/messages/:conversationId/settings`, `PATCH|DELETE /api/messages/message/:messageId`, and block/unblock routes.
- `GET /api/notifications`, mark-one/read-all routes, and `GET|PUT /api/notification-preferences`.
- `GET /api/me/activity`, `GET /api/creator/analytics`.
- `GET|PUT /api/reading-progress/:chapterId`.
- `POST /api/messages/message/:messageId/report`; admin-only `GET /api/admin/message-reports` and `PATCH /api/admin/message-reports/:id`.

All protected endpoints use the session bearer token and enforce participant/ownership checks on the server. A successful source implementation is not a substitute for generating the Prisma client, deploying migrations, and running live acceptance tests.
