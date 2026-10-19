import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { disconnectPrisma, getPrisma } from "./db.js";

const app = express();
const port = Number(process.env.PORT) || 4000;
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173").split(",").map((origin) => origin.trim()).filter(Boolean);
const here = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(here, "../../uploads");
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: "12mb", strict: true }));
app.use("/uploads", express.static(uploadsDir, { maxAge: "1d" }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));
const authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many authentication attempts. Please try again in 15 minutes." } });
const communityRateLimit = rateLimit({ windowMs: 10 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "You are interacting too quickly. Please wait a few minutes." } });

type AuthUser = { id: string; username: string; email: string; displayName: string | null; role: "USER" | "CREATOR" | "ADMIN"; accountStatus: "ACTIVE" | "SUSPENDED" | "DISABLED" };
type AuthRequest = express.Request & { user?: AuthUser };
const safeUser = (user: AuthUser) => ({ id: user.id, username: user.username, email: user.email, displayName: user.displayName, role: user.role });
const fail = (res: express.Response, status: number, message: string) => res.status(status).json({ success: false, message });

function databaseUnavailable(res: express.Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Database is unavailable";
  const missingConfig = message.includes("DATABASE_URL is not configured");
  console.error("Database request failed:", message);
  return res.status(503).json({ success: false, message: missingConfig ? "Database is not configured. Set DATABASE_URL in server/.env, then restart the API." : "Database connection failed. Confirm PostgreSQL is running and DATABASE_URL is correct.", code: missingConfig ? "DATABASE_CONFIG_MISSING" : "DATABASE_UNAVAILABLE" });
}
async function auth(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  try {
    const header = req.header("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return fail(res, 401, "Please log in to continue.");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const session = await getPrisma().session.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!session || session.expiresAt <= new Date()) return fail(res, 401, "Your session has expired. Please log in again.");
    if (session.user.accountStatus !== "ACTIVE") return fail(res, 403, "This account is not active.");
    req.user = { ...safeUser(session.user as AuthUser), accountStatus: session.user.accountStatus };
    next();
  } catch (error) { return databaseUnavailable(res, error); }
}
function roles(...roles: AuthUser["role"][]) {
  return (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return fail(res, 403, "You do not have permission to perform this action.");
    next();
  };
}
function slugify(value: string) { return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "story"; }
async function removeLocalUpload(publicPath: string | null | undefined): Promise<void> {
  if (!publicPath || !publicPath.startsWith("/uploads/")) return;
  const filename = path.basename(publicPath);
  if (!/^[a-f0-9-]+\.(?:jpg|png|webp|gif)$/i.test(filename)) return;
  try { await fs.rm(path.join(uploadsDir, filename), { force: true }); }
  catch (error) { console.warn("Could not remove an orphaned upload:", error instanceof Error ? error.message : error); }
}

async function saveImageData(data: unknown): Promise<string> {
  if (typeof data !== "string") throw new Error("Choose an image file first.");
  const match = data.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("Only JPG, PNG, WEBP, and GIF images are supported.");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) throw new Error("Each image must be smaller than 8 MB.");
  const mime = match[1];
  const validSignature = mime === "image/jpeg" ? buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    : mime === "image/png" ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mime === "image/gif" ? (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a")
    : mime === "image/webp" ? buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP" : false;
  if (!validSignature) throw new Error("The selected file does not match its declared image type.");
  const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[match[1]];
  await fs.mkdir(uploadsDir, { recursive: true });
  const filename = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(uploadsDir, filename), buffer, { flag: "wx" });
  return `/uploads/${filename}`;
}


// Video media is streamed to disk (not buffered in memory). MP4/MOV and WebM are accepted;
// playback uses the browser's native HTML5 player and Express static supports byte ranges.
const VIDEO_MAX_BYTES = 200 * 1024 * 1024;
app.get("/api/videos", async (req, res) => {
  try {
    const type = req.query.type === "SHORT" ? "SHORT" : req.query.type === "VIDEO" ? "VIDEO" : undefined;
    const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.max(1, Math.min(24, Number.parseInt(String(req.query.limit || "12"), 10) || 12));
    const where: Prisma.VideoWhereInput = type ? { type } : {};
    const [total, data] = await Promise.all([
      getPrisma().video.count({ where }),
      getPrisma().video.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
        select: { id: true, title: true, description: true, type: true, category: true, tags: true, filePath: true, mimeType: true, sizeBytes: true, createdAt: true, uploader: { select: { username: true, displayName: true } } } })
    ]);
    return res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { return databaseUnavailable(res, error); }
});
app.delete("/api/videos/:id", auth, roles("CREATOR", "ADMIN"), async (req: AuthRequest, res) => {
  try {
    const db = getPrisma();
    const video = await db.video.findUnique({ where: { id: String(req.params.id) }, select: { id: true, filePath: true, uploaderId: true } });
    if (!video) return fail(res, 404, "Video not found.");
    if (req.user!.role !== "ADMIN" && video.uploaderId !== req.user!.id) return fail(res, 403, "You can only delete your own videos.");
    await db.video.delete({ where: { id: video.id } });
    if (video.filePath.startsWith("/uploads/")) {
      const filename = path.basename(video.filePath);
      if (/^[a-f0-9-]+\.(?:mp4|webm)$/i.test(filename)) await fs.rm(path.join(uploadsDir, filename), { force: true }).catch(() => {});
    }
    return res.json({ success: true });
  } catch (error) { return databaseUnavailable(res, error); }
});
app.get("/api/videos/:id", async (req, res) => {
  try {
    const data = await getPrisma().video.findUnique({ where: { id: String(req.params.id) },
      select: { id: true, title: true, description: true, type: true, category: true, tags: true, filePath: true, mimeType: true, sizeBytes: true, createdAt: true, uploader: { select: { username: true, displayName: true } } } });
    if (!data) return fail(res, 404, "Video not found.");
    return res.json({ success: true, data });
  } catch (error) { return databaseUnavailable(res, error); }
});
app.post("/api/videos", auth, roles("CREATOR", "ADMIN"), async (req: AuthRequest, res) => {
  const title = String(req.query.title || "").trim().slice(0, 160);
  const description = String(req.query.description || "").trim().slice(0, 3000);
  const type = req.query.type === "SHORT" ? "SHORT" : "VIDEO";
  const category = String(req.query.category || "").trim().slice(0, 80) || null;
  const tags = String(req.query.tags || "").split(",").map(tag => tag.trim().slice(0, 30)).filter(Boolean).slice(0, 10);
  if (title.length < 2) return fail(res, 400, "Video title must be at least 2 characters.");
  if (!req.is("video/*") && !req.is("application/octet-stream")) return fail(res, 415, "Upload a video as a binary request body.");
  const tempName = `${crypto.randomUUID()}.upload`;
  const tempPath = path.join(uploadsDir, tempName);
  let size = 0;
  let tooLarge = false;
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
    const limiter = new Transform({ transform(chunk, _encoding, callback) {
      size += chunk.length;
      if (size > VIDEO_MAX_BYTES) { tooLarge = true; return callback(null); }
      callback(null, chunk);
    }});
    await pipeline(req, limiter, createWriteStream(tempPath, { flags: "wx" }));
    if (tooLarge) throw new Error("VIDEO_TOO_LARGE");
    if (size < 12) throw new Error("INVALID_VIDEO");
    const handle = await fs.open(tempPath, "r");
    const header = Buffer.alloc(16);
    await handle.read(header, 0, 16, 0);
    await handle.close();
    let ext = ""; let mimeType = "";
    if (header.toString("ascii", 4, 8) === "ftyp") { ext = "mp4"; mimeType = "video/mp4"; }
    else if (header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) { ext = "webm"; mimeType = "video/webm"; }
    else throw new Error("UNSUPPORTED_VIDEO");
    const filename = `${crypto.randomUUID()}.${ext}`;
    const filePath = path.join(uploadsDir, filename);
    await fs.rename(tempPath, filePath);
    try {
      const data = await getPrisma().video.create({ data: { title, description, type, category, tags, filePath: `/uploads/${filename}`, mimeType, sizeBytes: size, uploaderId: req.user!.id },
        select: { id: true, title: true, description: true, type: true, category: true, tags: true, filePath: true, mimeType: true, sizeBytes: true, createdAt: true } });
      return res.status(201).json({ success: true, data, message: "Video uploaded successfully." });
    } catch (error) { await fs.rm(filePath, { force: true }); throw error; }
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    if (error instanceof Error && error.message === "VIDEO_TOO_LARGE") return fail(res, 413, "Video exceeds the 200 MB upload limit.");
    if (error instanceof Error && error.message === "INVALID_VIDEO") return fail(res, 400, "The uploaded file is empty or too small to be a valid video.");
    if (error instanceof Error && error.message === "UNSUPPORTED_VIDEO") return fail(res, 415, "Only MP4/MOV files with an MP4 container signature and WebM videos are supported.");
    return databaseUnavailable(res, error);
  }
});


// Social interaction APIs. All mutations are authenticated and counts are derived from the database.
const socialText = (value: unknown, max = 4000) => typeof value === "string" ? value.trim().slice(0, max) : "";
app.get("/api/social/stories/:storyId", async (req, res) => {
  try {
    const db = getPrisma(), storyId = String(req.params.storyId);
    const [likes, rating, ratings, comments] = await Promise.all([
      db.like.count({ where: { targetType: "STORY", targetId: storyId } }),
      db.rating.aggregate({ where: { storyId }, _avg: { score: true }, _count: { _all: true } }),
      db.rating.groupBy({ by: ["score"], where: { storyId }, _count: { _all: true } }),
      db.comment.count({ where: { storyId } })
    ]);
    return res.json({ success: true, data: { likes, averageRating: rating._avg.score ?? 0, ratingCount: rating._count._all, ratingDistribution: ratings, comments } });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.get("/api/social/stories/:storyId/like", auth, async (req: AuthRequest, res) => {
  try {
    const item = await getPrisma().like.findUnique({ where: { userId_targetType_targetId: { userId: req.user!.id, targetType: "STORY", targetId: String(req.params.storyId) } } });
    return res.json({ success: true, liked: Boolean(item) });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.post("/api/social/stories/:storyId/like", auth, async (req: AuthRequest, res) => {
  try {
    const db = getPrisma(), storyId = String(req.params.storyId);
    const story = await db.story.findUnique({ where: { id: storyId }, select: { id: true, creatorId: true, title: true } });
    if (!story) return fail(res, 404, "Story not found.");
    const key = { userId_targetType_targetId: { userId: req.user!.id, targetType: "STORY" as const, targetId: storyId } };
    const existing = await db.like.findUnique({ where: key });
    if (existing) await db.like.delete({ where: { id: existing.id } });
    else {
      await db.like.create({ data: { userId: req.user!.id, targetType: "STORY", targetId: storyId, storyId } });
      if (story.creatorId !== req.user!.id) {
        const preference = await db.notificationPreference.findUnique({ where: { userId: story.creatorId } });
        if (preference?.likes !== false) await db.notification.create({ data: { userId: story.creatorId, type: "LIKE", title: "Your story got a like", body: `${req.user!.username} liked â€œ${story.title}â€.`, link: `/story/${storyId}` } });
      }
    }
    const likes = await db.like.count({ where: { targetType: "STORY", targetId: storyId } });
    return res.json({ success: true, liked: !existing, likes });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.get("/api/social/stories/:storyId/rating", auth, async (req: AuthRequest, res) => {
  try {
    const rating = await getPrisma().rating.findUnique({ where: { userId_storyId: { userId: req.user!.id, storyId: String(req.params.storyId) } }, select: { score: true } });
    return res.json({ success: true, score: rating?.score ?? 0 });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.put("/api/social/stories/:storyId/rating", auth, async (req: AuthRequest, res) => {
  const score = Number(req.body?.score);
  if (!Number.isInteger(score) || score < 1 || score > 5) return fail(res, 400, "Rating must be an integer from 1 to 5.");
  try {
    const db = getPrisma(), storyId = String(req.params.storyId);
    const story = await db.story.findUnique({ where: { id: storyId }, select: { id: true, creatorId: true, title: true } });
    if (!story) return fail(res, 404, "Story not found.");
    const rating = await db.rating.upsert({ where: { userId_storyId: { userId: req.user!.id, storyId } }, create: { userId: req.user!.id, storyId, score }, update: { score } });
    const aggregate = await db.rating.aggregate({ where: { storyId }, _avg: { score: true }, _count: { _all: true } });
    return res.json({ success: true, data: rating, averageRating: aggregate._avg.score ?? 0, ratingCount: aggregate._count._all });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.delete("/api/social/stories/:storyId/rating", auth, async (req: AuthRequest, res) => {
  try {
    const db = getPrisma(), storyId = String(req.params.storyId);
    await db.rating.deleteMany({ where: { userId: req.user!.id, storyId } });
    const aggregate = await db.rating.aggregate({ where: { storyId }, _avg: { score: true }, _count: { _all: true } });
    return res.json({ success: true, averageRating: aggregate._avg.score ?? 0, ratingCount: aggregate._count._all });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.get("/api/social/stories/:storyId/reviews", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1), limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const sort = req.query.sort === "helpful" ? "helpful" : "recent";
  try {
    const db = getPrisma();
    const data = await db.review.findMany({ where: { storyId: String(req.params.storyId) }, orderBy: sort === "recent" ? { createdAt: "desc" } : [{ helpfulVotes: { _count: "desc" } }, { createdAt: "desc" }], skip: (page - 1) * limit, take: limit,
      include: { user: { select: { id: true, username: true, displayName: true, avatarPath: true } }, _count: { select: { helpfulVotes: true } } } });
    const total = await db.review.count({ where: { storyId: String(req.params.storyId) } });
    return res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.post("/api/social/stories/:storyId/reviews", auth, communityRateLimit, async (req: AuthRequest, res) => {
  const body = socialText(req.body?.body, 3000);
  if (body.length < 10) return fail(res, 400, "A written review must contain at least 10 characters.");
  try {
    const db = getPrisma(), storyId = String(req.params.storyId);
    const story = await db.story.findFirst({ where: { id: storyId, publication: "PUBLISHED" }, select: { id: true, creatorId: true, title: true, slug: true } });
    if (!story) return fail(res, 404, "Published story not found.");
    const review = await db.review.upsert({ where: { userId_storyId: { userId: req.user!.id, storyId } }, create: { userId: req.user!.id, storyId, body }, update: { body } });
    if (story.creatorId !== req.user!.id) {
      const preference = await db.notificationPreference.findUnique({ where: { userId: story.creatorId } });
      if (preference?.comments !== false) await db.notification.create({ data: { userId: story.creatorId, type: "REVIEW", title: "New reader review", body: `${req.user!.username} reviewed â€œ${story.title}â€.`, link: `/story/${story.slug}`, dedupeKey: `review:${review.id}:updated:${review.updatedAt.getTime()}` } });
    }
    return res.status(201).json({ success: true, data: review });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.patch("/api/social/reviews/:id", auth, async (req: AuthRequest, res) => {
  const body = socialText(req.body?.body, 3000); if (body.length < 10) return fail(res, 400, "A written review must contain at least 10 characters.");
  try { const db = getPrisma(), review = await db.review.findUnique({ where: { id: String(req.params.id) } }); if (!review) return fail(res, 404, "Review not found."); if (review.userId !== req.user!.id) return fail(res, 403, "You can only edit your own review."); return res.json({ success: true, data: await db.review.update({ where: { id: review.id }, data: { body } }) }); }
  catch (e) { return databaseUnavailable(res, e); }
});
app.delete("/api/social/reviews/:id", auth, async (req: AuthRequest, res) => {
  try { const db = getPrisma(), review = await db.review.findUnique({ where: { id: String(req.params.id) } }); if (!review) return fail(res, 404, "Review not found."); if (review.userId !== req.user!.id && req.user!.role !== "ADMIN") return fail(res, 403, "You can only delete your own review."); await db.review.delete({ where: { id: review.id } }); return res.json({ success: true }); }
  catch (e) { return databaseUnavailable(res, e); }
});
app.post("/api/social/reviews/:id/helpful", auth, async (req: AuthRequest, res) => {
  try { const db = getPrisma(), reviewId = String(req.params.id); if (!await db.review.findUnique({ where: { id: reviewId }, select: { id: true } })) return fail(res, 404, "Review not found."); const key = { reviewId_userId: { reviewId, userId: req.user!.id } }; const existing = await db.reviewHelpful.findUnique({ where: key }); if (existing) await db.reviewHelpful.delete({ where: { id: existing.id } }); else await db.reviewHelpful.create({ data: { reviewId, userId: req.user!.id } }); return res.json({ success: true, helpful: !existing, count: await db.reviewHelpful.count({ where: { reviewId } }) }); }
  catch (e) { return databaseUnavailable(res, e); }
});
app.post("/api/social/reviews/:id/report", auth, communityRateLimit, async (req: AuthRequest, res) => {
  const reason = socialText(req.body?.reason, 1000); if (reason.length < 5) return fail(res, 400, "Please provide a reason of at least 5 characters.");
  try { const db = getPrisma(), review = await db.review.findUnique({ where: { id: String(req.params.id) }, select: { id: true, storyId: true } }); if (!review) return fail(res, 404, "Review not found."); const existing = await db.contentReport.findFirst({ where: { reporterId: req.user!.id, reviewId: review.id, status: "PENDING" } }); if (existing) return fail(res, 409, "You have already reported this review."); await db.contentReport.create({ data: { reporterId: req.user!.id, reviewId: review.id, storyId: review.storyId, reason } }); return res.status(201).json({ success: true, message: "Review reported for moderation." }); }
  catch (e) { return databaseUnavailable(res, e); }
});

app.get("/api/social/stories/:storyId/comments", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1), limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  try {
    const db = getPrisma(), storyId = String(req.params.storyId);
    const [data, total] = await Promise.all([
      db.comment.findMany({ where: { storyId, parentId: null }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
        include: { user: { select: { id: true, username: true, displayName: true, avatarPath: true } }, replies: { orderBy: { createdAt: "asc" }, include: { user: { select: { id: true, username: true, displayName: true, avatarPath: true } } } } } }),
      db.comment.count({ where: { storyId, parentId: null } })
    ]);
    return res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.post("/api/social/stories/:storyId/comments", auth, communityRateLimit, async (req: AuthRequest, res) => {
  const body = socialText(req.body?.body, 3000), parentId = req.body?.parentId ? String(req.body.parentId) : null;
  if (body.length < 1) return fail(res, 400, "Comment cannot be empty.");
  try {
    const db = getPrisma(), storyId = String(req.params.storyId);
    const story = await db.story.findUnique({ where: { id: storyId }, select: { id: true } });
    if (!story) return fail(res, 404, "Story not found.");
    if (parentId) {
      const parent = await db.comment.findFirst({ where: { id: parentId, storyId } });
      if (!parent) return fail(res, 400, "Reply target does not belong to this story.");
    }
    const comment = await db.comment.create({ data: { userId: req.user!.id, storyId, body, parentId }, include: { user: { select: { id: true, username: true, displayName: true, avatarPath: true } } } });
    const recipients = new Set<string>();
    const storyOwner = await db.story.findUnique({ where: { id: storyId }, select: { creatorId: true, slug: true, title: true } });
    if (storyOwner && storyOwner.creatorId !== req.user!.id) recipients.add(storyOwner.creatorId);
    if (parentId) {
      const parent = await db.comment.findUnique({ where: { id: parentId }, select: { userId: true } });
      if (parent && parent.userId !== req.user!.id) recipients.add(parent.userId);
    }
    if (recipients.size) {
      const recipientIds = [...recipients];
      const prefs = await db.notificationPreference.findMany({ where: { userId: { in: recipientIds } }, select: { userId: true, comments: true } });
      const disabled = new Set(prefs.filter(p => !p.comments).map(p => p.userId));
      const notifications = recipientIds.filter(id => !disabled.has(id)).map(id => ({ userId: id, type: "COMMENT", title: parentId ? "New reply to a comment" : "New comment on your story", body: `${req.user!.username} commented on â€œ${storyOwner?.title || "a story"}â€.`, link: `/story/${storyId}`, dedupeKey: `comment:${comment.id}:user:${id}` }));
      if (notifications.length) await db.notification.createMany({ data: notifications, skipDuplicates: true });
    }
    return res.status(201).json({ success: true, data: comment });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.patch("/api/social/comments/:id", auth, async (req: AuthRequest, res) => {
  const body = socialText(req.body?.body, 3000);
  if (!body) return fail(res, 400, "Comment cannot be empty.");
  try {
    const db = getPrisma(), old = await db.comment.findUnique({ where: { id: String(req.params.id) } });
    if (!old) return fail(res, 404, "Comment not found.");
    if (old.userId !== req.user!.id) return fail(res, 403, "You can only edit your own comments.");
    return res.json({ success: true, data: await db.comment.update({ where: { id: old.id }, data: { body } }) });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.delete("/api/social/comments/:id", auth, async (req: AuthRequest, res) => {
  try {
    const db = getPrisma(), old = await db.comment.findUnique({ where: { id: String(req.params.id) } });
    if (!old) return fail(res, 404, "Comment not found.");
    if (old.userId !== req.user!.id && req.user!.role !== "ADMIN") return fail(res, 403, "You can only delete your own comments.");
    await db.comment.delete({ where: { id: old.id } }); return res.json({ success: true });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.get("/api/creators/:creatorId", async (req, res) => {
  try {
    const db = getPrisma(), creatorId = String(req.params.creatorId);
    const creator = await db.user.findFirst({ where: { id: creatorId, role: "CREATOR", accountStatus: "ACTIVE" }, select: { id: true, username: true, displayName: true, bio: true, avatarPath: true, websiteUrl: true, instagramUrl: true, facebookUrl: true, youtubeUrl: true, tiktokUrl: true, githubUrl: true, linkedinUrl: true, createdAt: true, stories: { where: { publication: "PUBLISHED" }, orderBy: { updatedAt: "desc" }, select: { id: true, slug: true, title: true, synopsis: true, coverPath: true, contentType: true, status: true, genres: { include: { genre: { select: { name: true, slug: true } } } }, _count: { select: { chapters: true, ratings: true } } } } } });
    if (!creator) return fail(res, 404, "Creator not found.");
    const [followers, likes, ratings] = await Promise.all([
      db.creatorFollow.count({ where: { creatorId } }),
      db.like.count({ where: { targetType: "CREATOR", targetId: creatorId } }),
      db.rating.findMany({ where: { story: { creatorId, publication: "PUBLISHED" } }, select: { score: true } })
    ]);
    return res.json({ success: true, data: { ...creator, followers, likes, averageRating: ratings.length ? Math.round(ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length * 100) / 100 : 0, ratingCount: ratings.length } });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.get("/api/social/creators/:creatorId/following", auth, async (req: AuthRequest, res) => {
  try { const following = await getPrisma().creatorFollow.findUnique({ where: { followerId_creatorId: { followerId: req.user!.id, creatorId: String(req.params.creatorId) } }, select: { id: true } }); return res.json({ success: true, following: Boolean(following) }); }
  catch (e) { return databaseUnavailable(res, e); }
});

app.post("/api/social/creators/:creatorId/follow", auth, async (req: AuthRequest, res) => {
  const creatorId = String(req.params.creatorId);
  if (creatorId === req.user!.id) return fail(res, 400, "You cannot follow yourself.");
  try {
    const db = getPrisma(), creator = await db.user.findUnique({ where: { id: creatorId }, select: { id: true, role: true } });
    if (!creator || creator.role !== "CREATOR") return fail(res, 404, "Creator not found.");
    const key = { followerId_creatorId: { followerId: req.user!.id, creatorId } };
    const existing = await db.creatorFollow.findUnique({ where: key });
    if (existing) await db.creatorFollow.delete({ where: { id: existing.id } });
    else {
      await db.creatorFollow.create({ data: { followerId: req.user!.id, creatorId } });
      const preference = await db.notificationPreference.findUnique({ where: { userId: creatorId } });
      if (preference?.follows !== false) await db.notification.create({ data: { userId: creatorId, type: "FOLLOW", title: "New creator follower", body: `${req.user!.username} followed your creator profile.`, link: "/profile" } });
    }
    return res.json({ success: true, following: !existing, followers: await db.creatorFollow.count({ where: { creatorId } }) });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.get("/api/social/creators/:creatorId/followers", async (req, res) => {
  try { const creatorId = String(req.params.creatorId); return res.json({ success: true, count: await getPrisma().creatorFollow.count({ where: { creatorId } }) }); }
  catch (e) { return databaseUnavailable(res, e); }
});
app.get("/api/messages", auth, async (req: AuthRequest, res) => {
  try {
    const db = getPrisma();
    const memberships = await db.conversationParticipant.findMany({
      where: { userId: req.user!.id, archivedAt: null },
      include: {
        conversation: {
          include: {
            participants: { include: { user: { select: { id: true, username: true, displayName: true, avatarPath: true } } } },
            messages: { orderBy: { createdAt: "desc" }, take: 1 }
          }
        }
      },
      orderBy: { conversation: { updatedAt: "desc" } }
    });
    const data = await Promise.all(memberships.map(async m => ({ id: m.conversationId, muted: m.muted, lastReadAt: m.lastReadAt,
      participants: m.conversation.participants.map(p => p.user), lastMessage: m.conversation.messages[0] ? { ...m.conversation.messages[0], body: m.conversation.messages[0].deletedAt ? "Message deleted" : m.conversation.messages[0].body } : null,
      unread: await db.message.count({ where: { conversationId: m.conversationId, senderId: { not: req.user!.id }, createdAt: { gt: m.lastReadAt ?? new Date(0) }, deletedAt: null } }) })));
    return res.json({ success: true, data });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.post("/api/messages/conversations", auth, async (req: AuthRequest, res) => {
  const recipientId = socialText(req.body?.recipientId, 100);
  if (!recipientId || recipientId === req.user!.id) return fail(res, 400, "Choose another user to message.");
  try {
    const db = getPrisma(), recipient = await db.user.findUnique({ where: { id: recipientId }, select: { id: true, accountStatus: true } });
    if (!recipient || recipient.accountStatus !== "ACTIVE") return fail(res, 404, "Recipient not found.");
    const blocked = await db.userBlock.findFirst({ where: { OR: [{ blockerId: req.user!.id, blockedId: recipientId }, { blockerId: recipientId, blockedId: req.user!.id }] } });
    if (blocked) return fail(res, 403, "Messaging is unavailable between these accounts.");
    const existing = await db.conversation.findFirst({ where: { AND: [{ participants: { some: { userId: req.user!.id } } }, { participants: { some: { userId: recipientId } } }] }, include: { participants: true } });
    if (existing && existing.participants.length === 2) return res.json({ success: true, data: existing });
    const conversation = await db.conversation.create({ data: { participants: { create: [{ userId: req.user!.id }, { userId: recipientId }] } }, include: { participants: true } });
    return res.status(201).json({ success: true, data: conversation });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.get("/api/messages/:conversationId", auth, async (req: AuthRequest, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  try {
    const db = getPrisma(), conversationId = String(req.params.conversationId);
    const participant = await db.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId, userId: req.user!.id } } });
    if (!participant) return fail(res, 403, "You are not a participant in this conversation.");
    const before = req.query.before ? new Date(String(req.query.before)) : undefined;
    const messages = await db.message.findMany({ where: { conversationId, ...(before && !Number.isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}) }, orderBy: { createdAt: "desc" }, take: limit,
      include: { sender: { select: { id: true, username: true, displayName: true, avatarPath: true } } } });
    await db.conversationParticipant.update({ where: { id: participant.id }, data: { lastReadAt: new Date() } });
    return res.json({ success: true, data: messages.reverse().map(m => ({ ...m, body: m.deletedAt ? "Message deleted" : m.body })) });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.post("/api/messages/:conversationId", auth, communityRateLimit, async (req: AuthRequest, res) => {
  const body = socialText(req.body?.body, 4000);
  if (!body) return fail(res, 400, "Message cannot be empty.");
  try {
    const db = getPrisma(), conversationId = String(req.params.conversationId);
    const members = await db.conversationParticipant.findMany({ where: { conversationId }, select: { userId: true } });
    if (!members.some(m => m.userId === req.user!.id)) return fail(res, 403, "You are not a participant in this conversation.");
    if (members.length !== 2) return fail(res, 400, "This conversation is not available.");
    const otherId = members.find(m => m.userId !== req.user!.id)!.userId;
    const blocked = await db.userBlock.findFirst({ where: { OR: [{ blockerId: req.user!.id, blockedId: otherId }, { blockerId: otherId, blockedId: req.user!.id }] } });
    if (blocked) return fail(res, 403, "Messaging is unavailable between these accounts.");
    const message = await db.$transaction(async tx => {
      const created = await tx.message.create({ data: { conversationId, senderId: req.user!.id, body }, include: { sender: { select: { id: true, username: true, displayName: true, avatarPath: true } } } });
      await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      const preference = await tx.notificationPreference.findUnique({ where: { userId: otherId } });
      if (preference?.messages !== false) await tx.notification.create({ data: { userId: otherId, type: "MESSAGE", title: "New private message", body: `New message from ${req.user!.username}.`, link: `/messages/${conversationId}` } });
      return created;
    });
    return res.status(201).json({ success: true, data: message });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.patch("/api/messages/message/:messageId", auth, async (req: AuthRequest, res) => {
  const body = socialText(req.body?.body, 4000);
  if (!body) return fail(res, 400, "Message cannot be empty.");
  try {
    const db = getPrisma(), message = await db.message.findUnique({ where: { id: String(req.params.messageId) } });
    if (!message || message.deletedAt) return fail(res, 404, "Message not found.");
    if (message.senderId !== req.user!.id) return fail(res, 403, "You can only edit messages you sent.");
    if (Date.now() - message.createdAt.getTime() > 15 * 60 * 1000) return fail(res, 409, "Messages can only be edited within 15 minutes of sending.");
    const member = await db.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId: message.conversationId, userId: req.user!.id } } });
    if (!member) return fail(res, 403, "You are not a participant in this conversation.");
    const data = await db.message.update({ where: { id: message.id }, data: { body, editedAt: new Date() }, include: { sender: { select: { id: true, username: true, displayName: true, avatarPath: true } } } });
    return res.json({ success: true, data });
  } catch (e) { return databaseUnavailable(res, e); }
});

app.patch("/api/messages/:conversationId/settings", auth, async (req: AuthRequest, res) => {
  const conversationId = String(req.params.conversationId);
  const update: { muted?: boolean; archivedAt?: Date | null } = {};
  if (typeof req.body?.muted === "boolean") update.muted = req.body.muted;
  if (typeof req.body?.archived === "boolean") update.archivedAt = req.body.archived ? new Date() : null;
  if (!Object.keys(update).length) return fail(res, 400, "Provide muted and/or archived settings.");
  try {
    const db = getPrisma();
    const member = await db.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId, userId: req.user!.id } } });
    if (!member) return fail(res, 403, "You are not a participant in this conversation.");
    await db.conversationParticipant.update({ where: { id: member.id }, data: update });
    return res.json({ success: true });
  } catch (e) { return databaseUnavailable(res, e); }
});

app.post("/api/messages/message/:messageId/report", auth, communityRateLimit, async (req: AuthRequest, res) => {
  const reason = socialText(req.body?.reason, 1000); if (reason.length < 5) return fail(res, 400, "Please provide a reason of at least 5 characters.");
  try {
    const db = getPrisma(), message = await db.message.findUnique({ where: { id: String(req.params.messageId) }, select: { id: true, conversationId: true, senderId: true } });
    if (!message) return fail(res, 404, "Message not found.");
    const participant = await db.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId: message.conversationId, userId: req.user!.id } }, select: { id: true } });
    if (!participant) return fail(res, 403, "Only conversation participants can report a message.");
    if (message.senderId === req.user!.id) return fail(res, 400, "You cannot report your own message.");
    const existing = await db.messageReport.findFirst({ where: { reporterId: req.user!.id, messageId: message.id, status: "PENDING" } });
    if (existing) return fail(res, 409, "You have already reported this message.");
    await db.messageReport.create({ data: { reporterId: req.user!.id, messageId: message.id, reason } });
    return res.status(201).json({ success: true, message: "Message report submitted to the restricted moderation queue." });
  } catch (e) { return databaseUnavailable(res, e); }
});

app.delete("/api/messages/message/:messageId", auth, async (req: AuthRequest, res) => {
  try {
    const db = getPrisma(), message = await db.message.findUnique({ where: { id: String(req.params.messageId) } });
    if (!message) return fail(res, 404, "Message not found.");
    const member = await db.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId: message.conversationId, userId: req.user!.id } } });
    if (!member) return fail(res, 403, "You are not a participant in this conversation.");
    if (message.senderId !== req.user!.id && req.user!.role !== "ADMIN") return fail(res, 403, "You can only delete messages you sent.");
    await db.message.update({ where: { id: message.id }, data: { deletedAt: new Date(), body: "[deleted]" } });
    return res.json({ success: true });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.post("/api/users/:userId/block", auth, async (req: AuthRequest, res) => {
  const blockedId = String(req.params.userId);
  if (blockedId === req.user!.id) return fail(res, 400, "You cannot block yourself.");
  try {
    const db = getPrisma();
    if (!await db.user.findUnique({ where: { id: blockedId }, select: { id: true } })) return fail(res, 404, "User not found.");
    await db.userBlock.upsert({ where: { blockerId_blockedId: { blockerId: req.user!.id, blockedId } }, create: { blockerId: req.user!.id, blockedId }, update: {} });
    return res.json({ success: true });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.delete("/api/users/:userId/block", auth, async (req: AuthRequest, res) => {
  try { await getPrisma().userBlock.deleteMany({ where: { blockerId: req.user!.id, blockedId: String(req.params.userId) } }); return res.json({ success: true }); }
  catch (e) { return databaseUnavailable(res, e); }
});
app.get("/api/notifications", auth, async (req: AuthRequest, res) => {
  try {
    const db = getPrisma(), page = Math.max(1, Number(req.query.page) || 1), limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const [data, unread] = await Promise.all([
      db.notification.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      db.notification.count({ where: { userId: req.user!.id, readAt: null } })
    ]);
    return res.json({ success: true, data, unread });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.patch("/api/notifications/:id/read", auth, async (req: AuthRequest, res) => {
  try {
    const result = await getPrisma().notification.updateMany({ where: { id: String(req.params.id), userId: req.user!.id }, data: { readAt: new Date() } });
    if (!result.count) return fail(res, 404, "Notification not found.");
    return res.json({ success: true });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.post("/api/notifications/read-all", auth, async (req: AuthRequest, res) => {
  try { await getPrisma().notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } }); return res.json({ success: true }); }
  catch (e) { return databaseUnavailable(res, e); }
});


// Generic like endpoints for chapter, video, and creator targets. Story-specific routes remain backward-compatible.
app.get("/api/social/targets/:targetType/:targetId/like", auth, async (req: AuthRequest, res) => {
  const targetType = String(req.params.targetType).toUpperCase();
  if (!["CHAPTER", "VIDEO", "CREATOR"].includes(targetType)) return fail(res, 400, "Unsupported like target.");
  try {
    const item = await getPrisma().like.findUnique({ where: { userId_targetType_targetId: { userId: req.user!.id, targetType: targetType as any, targetId: String(req.params.targetId) } } });
    return res.json({ success: true, liked: Boolean(item) });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.post("/api/social/targets/:targetType/:targetId/like", auth, async (req: AuthRequest, res) => {
  const targetType = String(req.params.targetType).toUpperCase();
  const targetId = String(req.params.targetId);
  if (!["CHAPTER", "VIDEO", "CREATOR"].includes(targetType)) return fail(res, 400, "Unsupported like target.");
  try {
    const db = getPrisma();
    let ownerId: string | null = null, targetName = "your content";
    if (targetType === "CHAPTER") {
      const target = await db.chapter.findUnique({ where: { id: targetId }, include: { story: { select: { creatorId: true, title: true, publication: true } } } });
      if (!target || target.publication !== "PUBLISHED" || target.story.publication !== "PUBLISHED") return fail(res, 404, "Published chapter not found.");
      ownerId = target.story.creatorId; targetName = `${target.story.title} â€” ${target.title}`;
    } else if (targetType === "VIDEO") {
      const target = await db.video.findUnique({ where: { id: targetId }, select: { id: true, title: true, uploaderId: true } });
      if (!target) return fail(res, 404, "Video not found.");
      ownerId = target.uploaderId; targetName = target.title;
    } else {
      const target = await db.user.findUnique({ where: { id: targetId }, select: { id: true, role: true, username: true } });
      if (!target || target.role !== "CREATOR") return fail(res, 404, "Creator not found.");
      if (target.id === req.user!.id) return fail(res, 400, "You cannot like your own creator profile.");
      ownerId = target.id; targetName = `${target.username}'s creator profile`;
    }
    const key = { userId_targetType_targetId: { userId: req.user!.id, targetType: targetType as any, targetId } };
    const existing = await db.like.findUnique({ where: key });
    if (existing) await db.like.delete({ where: { id: existing.id } });
    else {
      await db.like.create({ data: { userId: req.user!.id, targetType: targetType as any, targetId } });
      if (ownerId && ownerId !== req.user!.id) {
        const preference = await db.notificationPreference.findUnique({ where: { userId: ownerId } });
        if (preference?.likes !== false) await db.notification.create({ data: { userId: ownerId, type: "LIKE", title: "New appreciation", body: `${req.user!.username} liked ${targetName}.`, link: targetType === "CREATOR" ? `/profile` : targetType === "VIDEO" ? `/videos` : `/`, dedupeKey: null } });
      }
    }
    const likes = await db.like.count({ where: { targetType: targetType as any, targetId } });
    return res.json({ success: true, liked: !existing, likes });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.post("/api/social/comments/:id/report", auth, communityRateLimit, async (req: AuthRequest, res) => {
  const reason = socialText(req.body?.reason, 1000);
  if (reason.length < 5) return fail(res, 400, "Please provide a reason of at least 5 characters.");
  try {
    const db = getPrisma(), comment = await db.comment.findUnique({ where: { id: String(req.params.id) }, select: { id: true, storyId: true } });
    if (!comment) return fail(res, 404, "Comment not found.");
    const existing = await db.contentReport.findFirst({ where: { reporterId: req.user!.id, commentId: comment.id, status: "PENDING" } });
    if (existing) return fail(res, 409, "You have already reported this comment.");
    await db.contentReport.create({ data: { reporterId: req.user!.id, commentId: comment.id, storyId: comment.storyId, reason } });
    return res.status(201).json({ success: true, message: "Report submitted for moderation." });
  } catch (e) { return databaseUnavailable(res, e); }
});

app.get("/api/notification-preferences", auth, async (req: AuthRequest, res) => {
  try {
    const preferences = await getPrisma().notificationPreference.upsert({ where: { userId: req.user!.id }, create: { userId: req.user!.id }, update: {} });
    return res.json({ success: true, data: preferences });
  } catch (e) { return databaseUnavailable(res, e); }
});
app.put("/api/notification-preferences", auth, async (req: AuthRequest, res) => {
  const allowed = ["likes", "follows", "comments", "messages", "newChapters"] as const;
  const data: { likes?: boolean; follows?: boolean; comments?: boolean; messages?: boolean; newChapters?: boolean } = {};
  for (const key of allowed) if (typeof req.body?.[key] === "boolean") data[key] = req.body[key];
  if (!Object.keys(data).length) return fail(res, 400, "Provide at least one notification preference.");
  try {
    const preferences = await getPrisma().notificationPreference.upsert({ where: { userId: req.user!.id }, create: { userId: req.user!.id, ...data }, update: data });
    return res.json({ success: true, data: preferences });
  } catch (e) { return databaseUnavailable(res, e); }
});

app.get("/api/health", async (_req, res) => {
  try { await getPrisma().$queryRaw`SELECT 1`; return res.json({ success: true, message: "KathaVerse API is running", database: "connected" }); }
  catch (error) { return databaseUnavailable(res, error); }
});

// An administrator is created only when the owner explicitly configures ADMIN_EMAIL and ADMIN_PASSWORD.
async function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase(); const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12 || password.includes("CHANGE_THIS")) return;
  const existing = await getPrisma().user.findUnique({ where: { email } });
  if (existing) {
    // Never silently promote an existing account or reset its password on every server start.
    // Provisioning is intentionally create-only; account changes belong in an authenticated admin workflow.
    console.warn(`Admin bootstrap skipped because an account already uses ${email}. No credentials or role were changed.`);
    return;
  }
  const username = (process.env.ADMIN_USERNAME || "siteadmin").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24) || "siteadmin";
  const usernameTaken = await getPrisma().user.findUnique({ where: { username } });
  await getPrisma().user.create({ data: { username: usernameTaken ? `admin_${crypto.randomBytes(3).toString("hex")}` : username, email, passwordHash: await bcrypt.hash(password, 12), displayName: "Site Administrator", role: "ADMIN" } });
  console.log(`Initial admin account provisioned for ${email}.`);
}

app.post("/api/auth/register", authRateLimit, async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim().toLowerCase(); const email = String(req.body?.email || "").trim().toLowerCase(); const password = String(req.body?.password || ""); const displayName = String(req.body?.displayName || "").trim().slice(0, 80); const role = req.body?.role === "CREATOR" ? "CREATOR" : "USER";
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return fail(res, 400, "Username must be 3â€“24 characters using letters, numbers, or underscores.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return fail(res, 400, "Enter a valid email address.");
    if (password.length < 10 || password.length > 128) return fail(res, 400, "Password must be between 10 and 128 characters.");
    const db = getPrisma();
    if (await db.user.findFirst({ where: { OR: [{ username }, { email }] } })) return fail(res, 409, "That username or email is already registered.");
    const user = await db.user.create({ data: { username, email, displayName: displayName || username, passwordHash: await bcrypt.hash(password, 12), role } });
    const token = crypto.randomBytes(32).toString("base64url"); const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await db.session.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } });
    return res.status(201).json({ success: true, token, user: safeUser(user as AuthUser), message: role === "CREATOR" ? "Creator account created. You can publish stories immediately." : "Reader account created." });
  } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return fail(res, 409, "That username or email is already registered."); return databaseUnavailable(res, error); }
});
app.post("/api/auth/login", authRateLimit, async (req, res) => {
  try {
    const login = String(req.body?.login || req.body?.email || "").trim().toLowerCase(); const password = String(req.body?.password || "");
    if (!login || !password) return fail(res, 400, "Enter your username/email and password.");
    const user = await getPrisma().user.findFirst({ where: { OR: [{ email: login }, { username: login }] } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return fail(res, 401, "Invalid username/email or password.");
    if (user.accountStatus !== "ACTIVE") return fail(res, 403, "This account is not active.");
    const token = crypto.randomBytes(32).toString("base64url"); const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await getPrisma().session.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } });
    return res.json({ success: true, token, user: safeUser(user as AuthUser) });
  } catch (error) { return databaseUnavailable(res, error); }
});
app.get("/api/auth/me", auth, async (req: AuthRequest, res) => {
  try {
    const user = await getPrisma().user.findUnique({ where: { id: req.user!.id }, select: { id: true, username: true, email: true, displayName: true, bio: true, avatarPath: true, websiteUrl: true, instagramUrl: true, facebookUrl: true, youtubeUrl: true, tiktokUrl: true, githubUrl: true, linkedinUrl: true, role: true, accountStatus: true } });
    if (!user) return fail(res, 404, "User not found.");
    return res.json({ success: true, user });
  } catch (error) { return databaseUnavailable(res, error); }
});

app.patch("/api/me/profile", auth, communityRateLimit, async (req: AuthRequest, res) => {
  try {
    const db = getPrisma();
    const textFields = ["displayName", "bio"] as const;
    const urlFields = ["websiteUrl", "instagramUrl", "facebookUrl", "youtubeUrl", "tiktokUrl", "githubUrl", "linkedinUrl"] as const;
    const data: Record<string, any> = {};
    for (const field of textFields) {
      if (req.body?.[field] !== undefined) {
        if (typeof req.body[field] !== "string") return fail(res, 400, `${field} must be text.`);
        const value = req.body[field].trim();
        const max = field === "bio" ? 500 : 80;
        if (value.length > max) return fail(res, 400, `${field} must be ${max} characters or fewer.`);
        data[field] = value || null;
      }
    }
    for (const field of urlFields) {
      if (req.body?.[field] !== undefined) {
        if (typeof req.body[field] !== "string") return fail(res, 400, `${field} must be a URL.`);
        const value = req.body[field].trim();
        if (!value) { data[field] = null; continue; }
        let parsed: URL;
        try { parsed = new URL(value); } catch { return fail(res, 400, `${field} must be a valid URL starting with https://.`); }
        if (parsed.protocol !== "https:" || !parsed.hostname.includes(".")) return fail(res, 400, `${field} must be a valid HTTPS URL.`);
        if (value.length > 300) return fail(res, 400, `${field} is too long.`);
        data[field] = parsed.toString();
      }
    }
    let newAvatar: string | undefined;
    if (req.body?.avatarData !== undefined) {
      try { newAvatar = await saveImageData(req.body.avatarData); }
      catch (error) { return fail(res, 400, error instanceof Error ? error.message : "Invalid profile image."); }
      data.avatarPath = newAvatar;
    }
    const user = await db.user.update({ where: { id: req.user!.id }, data, select: { id: true, username: true, email: true, displayName: true, bio: true, avatarPath: true, websiteUrl: true, instagramUrl: true, facebookUrl: true, youtubeUrl: true, tiktokUrl: true, githubUrl: true, linkedinUrl: true, role: true, accountStatus: true } });
    return res.json({ success: true, user, message: "Profile updated successfully." });
  } catch (error) { return databaseUnavailable(res, error); }
});
app.post("/api/auth/logout", auth, async (req: AuthRequest, res) => {
  try { const token = (req.header("authorization") || "").slice(7).trim(); await getPrisma().session.deleteMany({ where: { tokenHash: crypto.createHash("sha256").update(token).digest("hex") } }); return res.json({ success: true }); }
  catch (error) { return databaseUnavailable(res, error); }
});

app.get("/api/genres", async (_req, res) => {
  try { const genres = await getPrisma().genre.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } }); return res.json({ success: true, data: genres }); }
  catch (error) { return databaseUnavailable(res, error); }
});
app.get("/api/stories", async (req, res) => {
  try {
    const db = getPrisma(); const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : ""; const genre = typeof req.query.genre === "string" ? req.query.genre.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status.toUpperCase() : ""; const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1); const limit = Math.max(1, Math.min(48, Number.parseInt(String(req.query.limit ?? "24"), 10) || 24)); const sort = typeof req.query.sort === "string" ? req.query.sort : "updated";
    const where: Prisma.StoryWhereInput = { publication: "PUBLISHED", ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { creator: { username: { contains: q, mode: "insensitive" } } }] } : {}), ...(genre ? { genres: { some: { genre: { slug: genre.toLowerCase().replace(/\s+/g, "-") } } } } : {}), ...( ["ONGOING", "COMPLETED", "HIATUS"].includes(status) ? { status: status as "ONGOING" | "COMPLETED" | "HIATUS" } : {}) };
    const orderBy: Prisma.StoryOrderByWithRelationInput = sort === "newest" ? { publishedAt: "desc" } : sort === "title" ? { title: "asc" } : { updatedAt: "desc" };
    const [total, stories] = await db.$transaction([db.story.count({ where }), db.story.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit, select: { id: true, slug: true, title: true, synopsis: true, coverPath: true, status: true, contentType: true, createdAt: true, updatedAt: true, publishedAt: true, creator: { select: { username: true, displayName: true } }, genres: { include: { genre: { select: { name: true, slug: true } } } }, _count: { select: { chapters: true, bookmarks: true, ratings: true } } } })]);
    return res.json({ success: true, data: stories, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { return databaseUnavailable(res, error); }
});
app.get("/api/stories/:slug", async (req, res) => {
  try {
    const story = await getPrisma().story.findFirst({ where: { slug: String(req.params.slug), publication: "PUBLISHED" }, select: { id: true, slug: true, title: true, synopsis: true, coverPath: true, status: true, contentType: true, createdAt: true, updatedAt: true, publishedAt: true, creator: { select: { id: true, username: true, displayName: true, bio: true } }, genres: { include: { genre: { select: { name: true, slug: true } } } }, chapters: { where: { publication: "PUBLISHED" }, orderBy: { number: "asc" }, select: { id: true, number: true, title: true, publishedAt: true } }, _count: { select: { bookmarks: true, ratings: true, comments: true } } } });
    if (!story) return fail(res, 404, "Story not found"); return res.json({ success: true, data: story });
  } catch (error) { return databaseUnavailable(res, error); }
});
app.get("/api/reading-progress/:chapterId", auth, async (req: AuthRequest, res) => {
  try { const chapterId = String(req.params.chapterId); const chapter = await getPrisma().chapter.findFirst({ where: { id: chapterId, publication: "PUBLISHED", story: { publication: "PUBLISHED" } }, select: { id: true } }); if (!chapter) return fail(res, 404, "Published chapter not found."); const progress = await getPrisma().readingProgress.findUnique({ where: { userId_chapterId: { userId: req.user!.id, chapterId } } }); return res.json({ success: true, data: progress }); }
  catch (e) { return databaseUnavailable(res, e); }
});
app.put("/api/reading-progress/:chapterId", auth, async (req: AuthRequest, res) => {
  const scrollPercentage = Number(req.body?.scrollPercentage); const lastPanelPosition = Number(req.body?.lastPanelPosition ?? 0);
  if (!Number.isFinite(scrollPercentage) || scrollPercentage < 0 || scrollPercentage > 100 || !Number.isInteger(lastPanelPosition) || lastPanelPosition < 0 || lastPanelPosition > 10000) return fail(res, 400, "Invalid reading progress.");
  try { const db = getPrisma(), chapterId = String(req.params.chapterId); const chapter = await db.chapter.findFirst({ where: { id: chapterId, publication: "PUBLISHED", story: { publication: "PUBLISHED" } }, select: { id: true } }); if (!chapter) return fail(res, 404, "Published chapter not found."); const data = await db.readingProgress.upsert({ where: { userId_chapterId: { userId: req.user!.id, chapterId } }, create: { userId: req.user!.id, chapterId, scrollPercentage, lastPanelPosition }, update: { scrollPercentage, lastPanelPosition } }); return res.json({ success: true, data }); }
  catch (e) { return databaseUnavailable(res, e); }
});

app.get("/api/chapters/:chapterId", async (req, res) => {
  try {
    const chapter = await getPrisma().chapter.findFirst({ where: { id: String(req.params.chapterId), publication: "PUBLISHED", story: { publication: "PUBLISHED" } }, select: { id: true, number: true, title: true, content: true, publishedAt: true, story: { select: { slug: true, title: true, contentType: true } }, panels: { orderBy: { position: "asc" }, select: { id: true, imagePath: true, position: true, width: true, height: true } } } });
    if (!chapter) return fail(res, 404, "Chapter not found"); return res.json({ success: true, data: chapter });
  } catch (error) { return databaseUnavailable(res, error); }
});

// Creator workspace: any registered account starts as CREATOR and may publish immediately.
app.get("/api/bookmarks", auth, async (req: AuthRequest, res) => {
  try { const data = await getPrisma().bookmark.findMany({ where: { userId: req.user!.id, story: { publication: "PUBLISHED" } }, orderBy: { createdAt: "desc" }, include: { story: { select: { id: true, slug: true, title: true, synopsis: true, coverPath: true, status: true, contentType: true, genres: { include: { genre: { select: { name: true } } } } } } } }); return res.json({ success: true, data }); }
  catch (e) { return databaseUnavailable(res, e); }
});
app.get("/api/bookmarks/:storyId", auth, async (req: AuthRequest, res) => {
  try { const exists = await getPrisma().bookmark.findUnique({ where: { userId_storyId: { userId: req.user!.id, storyId: String(req.params.storyId) } }, select: { id: true } }); return res.json({ success: true, saved: Boolean(exists) }); }
  catch (e) { return databaseUnavailable(res, e); }
});
app.post("/api/bookmarks/:storyId", auth, async (req: AuthRequest, res) => {
  try {
    const db = getPrisma(), storyId = String(req.params.storyId);
    const story = await db.story.findFirst({ where: { id: storyId, publication: "PUBLISHED" }, select: { id: true } });
    if (!story) return fail(res, 404, "Published story not found.");
    const key = { userId_storyId: { userId: req.user!.id, storyId } };
    const existing = await db.bookmark.findUnique({ where: key });
    if (existing) await db.bookmark.delete({ where: { id: existing.id } }); else await db.bookmark.create({ data: { userId: req.user!.id, storyId } });
    return res.json({ success: true, saved: !existing });
  } catch (e) { return databaseUnavailable(res, e); }
});

app.get("/api/me/activity", auth, async (req: AuthRequest, res) => {
  try {
    const db = getPrisma(), userId = req.user!.id;
    const [likes, ratings, comments, follows, bookmarks, readingProgress, _unreadNotifications] = await Promise.all([
      db.like.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, targetType: true, targetId: true, story: { select: { title: true, slug: true } }, createdAt: true } }),
      db.rating.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 50, include: { story: { select: { title: true, slug: true } } } }),
      db.comment.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50, include: { story: { select: { title: true, slug: true } } } }),
      db.creatorFollow.findMany({ where: { followerId: userId }, orderBy: { createdAt: "desc" }, include: { creator: { select: { id: true, username: true, displayName: true, avatarPath: true } } } }),
      db.bookmark.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, include: { story: { select: { id: true, title: true, slug: true, coverPath: true } } } }),
      db.readingProgress.findMany({ where: { userId, chapter: { publication: "PUBLISHED", story: { publication: "PUBLISHED" } } }, orderBy: { updatedAt: "desc" }, take: 10, include: { chapter: { include: { story: { select: { title: true, slug: true } } } } } }),
      db.notification.count({ where: { userId, readAt: null } })
    ]);
    const memberships = await db.conversationParticipant.findMany({ where: { userId }, select: { conversationId: true, lastReadAt: true } });
    const unreadCounts = await Promise.all(memberships.map(m => db.message.count({ where: { conversationId: m.conversationId, senderId: { not: userId }, deletedAt: null, createdAt: { gt: m.lastReadAt ?? new Date(0) } } })));
    const unreadMessages = unreadCounts.reduce((sum, count) => sum + count, 0);
    const unreadNotifications = _unreadNotifications;
    return res.json({ success: true, data: { likes, ratings, comments, follows, bookmarks, readingProgress, unreadMessages, unreadNotifications } });
  } catch (e) { return databaseUnavailable(res, e); }
});

app.get("/api/creator/analytics", auth, roles("CREATOR", "ADMIN"), async (req: AuthRequest, res) => {
  try {
    const db = getPrisma();
    const stories = await db.story.findMany({ where: req.user!.role === "ADMIN" && req.query.creatorId ? { creatorId: String(req.query.creatorId) } : req.user!.role === "ADMIN" ? {} : { creatorId: req.user!.id }, select: { id: true, title: true, slug: true, creatorId: true, ratings: { select: { score: true } }, _count: { select: { comments: true, chapters: true } } }, orderBy: { updatedAt: "desc" }, take: 100 });
    const creatorIds = req.user!.role === "ADMIN" && req.query.creatorId ? [String(req.query.creatorId)] : req.user!.role === "ADMIN" ? [...new Set(stories.map(story => story.creatorId))] : [req.user!.id];
    const [storyLikes, chapterLikes, follows, videos] = await Promise.all([
      db.like.groupBy({ by: ["targetId"], where: { targetType: "STORY", targetId: { in: stories.map(story => story.id) } }, _count: { _all: true } }),
      db.chapter.findMany({ where: { storyId: { in: stories.map(story => story.id) } }, select: { id: true, storyId: true } }),
      db.creatorFollow.count({ where: { creatorId: { in: creatorIds } } }),
      db.video.findMany({ where: { uploaderId: { in: creatorIds } }, select: { id: true, title: true, createdAt: true } })
    ]);
    const chapterLikeCounts = chapterLikes.length ? await db.like.groupBy({ by: ["targetId"], where: { targetType: "CHAPTER", targetId: { in: chapterLikes.map(chapter => chapter.id) } }, _count: { _all: true } }) : [];
    const videoLikeCounts = videos.length ? await db.like.groupBy({ by: ["targetId"], where: { targetType: "VIDEO", targetId: { in: videos.map(video => video.id) } }, _count: { _all: true } }) : [];
    const totalVideoLikes = videoLikeCounts.reduce((sum, row) => sum + row._count._all, 0);
    const topVideos = videos.map(video => ({ id: video.id, title: video.title, likes: videoLikeCounts.find(row => row.targetId === video.id)?._count._all || 0, createdAt: video.createdAt })).sort((a,b)=>b.likes-a.likes);
    const chapterToStory = new Map(chapterLikes.map(chapter => [chapter.id, chapter.storyId]));
    const byStory = new Map<string, number>();
    for (const row of chapterLikeCounts) { const storyId = chapterToStory.get(row.targetId); if (storyId) byStory.set(storyId, (byStory.get(storyId) || 0) + row._count._all); }
    const data = stories.map(story => { const likeCount = storyLikes.find(row => row.targetId === story.id)?._count._all || 0; const average = story.ratings.length ? story.ratings.reduce((sum, r) => sum + r.score, 0) / story.ratings.length : 0; return { id: story.id, title: story.title, slug: story.slug, likes: likeCount + (byStory.get(story.id) || 0), averageRating: Math.round(average * 100) / 100, ratingCount: story.ratings.length, comments: story._count.comments, chapters: story._count.chapters }; });
    return res.json({ success: true, data: { totalLikes: data.reduce((sum, item) => sum + item.likes, 0) + totalVideoLikes, averageRating: data.length ? Math.round(data.reduce((sum, item) => sum + item.averageRating, 0) / data.length * 100) / 100 : 0, totalRatings: data.reduce((sum, item) => sum + item.ratingCount, 0), totalComments: data.reduce((sum, item) => sum + item.comments, 0), followers: follows, stories: data.sort((a, b) => b.likes - a.likes), videos: topVideos } });
  } catch (e) { return databaseUnavailable(res, e); }
});

app.get("/api/creator/stories", auth, roles("CREATOR", "ADMIN"), async (req: AuthRequest, res) => {
  try { const data = await getPrisma().story.findMany({ where: req.user!.role === "ADMIN" ? {} : { creatorId: req.user!.id }, orderBy: { updatedAt: "desc" }, include: { genres: { include: { genre: true } }, chapters: { orderBy: { number: "asc" }, include: { _count: { select: { panels: true } } } } } }); return res.json({ success: true, data }); }
  catch (error) { return databaseUnavailable(res, error); }
});
app.post("/api/creator/stories", auth, roles("CREATOR", "ADMIN"), async (req: AuthRequest, res) => {
  try {
    const title = String(req.body?.title || "").trim().slice(0, 160); const synopsis = String(req.body?.synopsis || "").trim().slice(0, 5000); const contentType = req.body?.contentType === "MANHWA" ? "MANHWA" : req.body?.contentType === "BOTH" ? "BOTH" : "NOVEL";
    if (title.length < 2 || synopsis.length < 10) return fail(res, 400, "Enter a title and a synopsis of at least 10 characters.");
    let coverPath: string | null = null; if (req.body?.coverData) coverPath = await saveImageData(req.body.coverData); else if (typeof req.body?.coverUrl === "string" && /^https:\/\//i.test(req.body.coverUrl)) coverPath = req.body.coverUrl;
    const db = getPrisma(); let slug = slugify(title); if (await db.story.findUnique({ where: { slug } })) slug = `${slug}-${crypto.randomBytes(3).toString("hex")}`;
    const rawGenres: unknown[] = Array.isArray(req.body?.genres) ? req.body.genres : []; const genreNames: string[] = [...new Set<string>(rawGenres.map((g: unknown) => String(g).trim().slice(0, 40)).filter(Boolean))].slice(0, 8);
    const story = await db.story.create({ data: { title, slug, synopsis, coverPath, contentType, status: ["ONGOING", "COMPLETED", "HIATUS"].includes(req.body?.status) ? req.body.status : "ONGOING", creatorId: req.user!.id, publication: "PUBLISHED", publishedAt: new Date(), genres: { create: await Promise.all(genreNames.map(async (name: string) => { const genreSlug = slugify(name); const genre = await db.genre.upsert({ where: { name }, create: { name, slug: `${genreSlug}-${crypto.randomBytes(2).toString("hex")}` }, update: {} }); return { genreId: genre.id }; })) } } });
    return res.status(201).json({ success: true, data: story, message: "Story published." });
  } catch (error) { if (error instanceof Error && (error.message.startsWith("Only ") || error.message.startsWith("The selected file") || error.message.startsWith("Each image") || error.message.startsWith("Choose an image"))) return fail(res, 400, error.message); return databaseUnavailable(res, error); }
});
app.patch("/api/creator/stories/:id", auth, roles("CREATOR", "ADMIN"), async (req: AuthRequest, res) => {
  try {
    const db = getPrisma(); const existing = await db.story.findUnique({ where: { id: String(req.params.id) } }); if (!existing) return fail(res, 404, "Story not found"); if (req.user!.role !== "ADMIN" && existing.creatorId !== req.user!.id) return fail(res, 403, "You can only edit your own stories.");
    const data: Prisma.StoryUpdateInput = {}; if (typeof req.body?.title === "string" && req.body.title.trim()) data.title = req.body.title.trim().slice(0, 160); if (typeof req.body?.synopsis === "string") data.synopsis = req.body.synopsis.trim().slice(0, 5000); if (["NOVEL", "MANHWA", "BOTH"].includes(req.body?.contentType)) data.contentType = req.body.contentType; if (["ONGOING", "COMPLETED", "HIATUS"].includes(req.body?.status)) data.status = req.body.status; if (req.body?.coverData) data.coverPath = await saveImageData(req.body.coverData); else if (typeof req.body?.coverUrl === "string" && /^https:\/\//i.test(req.body.coverUrl)) data.coverPath = req.body.coverUrl;
    const story = await db.story.update({ where: { id: existing.id }, data }); return res.json({ success: true, data: story });
  } catch (error) { return databaseUnavailable(res, error); }
});
app.post("/api/creator/stories/:id/chapters", auth, roles("CREATOR", "ADMIN"), async (req: AuthRequest, res) => {
  try {
    const db = getPrisma(); const story = await db.story.findUnique({ where: { id: String(req.params.id) } }); if (!story) return fail(res, 404, "Story not found"); if (req.user!.role !== "ADMIN" && story.creatorId !== req.user!.id) return fail(res, 403, "You can only add chapters to your own stories.");
    const title = String(req.body?.title || "").trim().slice(0, 160); const content = typeof req.body?.content === "string" ? req.body.content.trim().slice(0, 500000) : ""; const number = Number.parseInt(String(req.body?.number || ""), 10);
    const panelInputs = Array.isArray(req.body?.panels) ? req.body.panels.slice(0, 100) : [];
    if (!title || (!content && !panelInputs.length)) return fail(res, 400, "Add a chapter title and text content or at least one manhwa page.");
    const nextNumber = Number.isInteger(number) && number > 0 ? number : (await db.chapter.aggregate({ where: { storyId: story.id }, _max: { number: true } }))._max.number! + 1;
    const panels = []; for (const [index, panel] of panelInputs.entries()) { const imagePath = await saveImageData(panel?.data); panels.push({ imagePath, position: index + 1 }); }
    const chapter = await db.chapter.create({ data: { storyId: story.id, number: nextNumber, title, content: content || null, publication: "PUBLISHED", publishedAt: new Date(), panels: { create: panels } } });
    await db.story.update({ where: { id: story.id }, data: { publication: "PUBLISHED", publishedAt: story.publishedAt || new Date() } });
    const followers = await db.creatorFollow.findMany({ where: { creatorId: story.creatorId }, select: { followerId: true } });
    if (followers.length) {
      const prefs = await db.notificationPreference.findMany({ where: { userId: { in: followers.map(f => f.followerId) } }, select: { userId: true, newChapters: true } });
      const disabled = new Set(prefs.filter(p => !p.newChapters).map(p => p.userId));
      const data = followers.filter(f => f.followerId !== story.creatorId && !disabled.has(f.followerId)).map(f => ({ userId: f.followerId, type: "NEW_CHAPTER", title: "New chapter published", body: `${story.title}: ${title}`, link: `/story/${story.slug}`, dedupeKey: `chapter:${chapter.id}:user:${f.followerId}` }));
      if (data.length) await db.notification.createMany({ data, skipDuplicates: true });
    }
    return res.status(201).json({ success: true, data: chapter, message: "Chapter published." });
  } catch (error) { if (error instanceof Error && (error.message.startsWith("Only ") || error.message.startsWith("The selected file") || error.message.startsWith("Each image") || error.message.startsWith("Choose an image"))) return fail(res, 400, error.message); if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return fail(res, 409, "That chapter number already exists for this story."); return databaseUnavailable(res, error); }
});
app.delete("/api/creator/stories/:id", auth, roles("CREATOR", "ADMIN"), async (req: AuthRequest, res) => {
  try {
    const db = getPrisma();
    const story = await db.story.findUnique({ where: { id: String(req.params.id) }, include: { chapters: { include: { panels: { select: { imagePath: true } } } } } });
    if (!story) return fail(res, 404, "Story not found");
    if (req.user!.role !== "ADMIN" && story.creatorId !== req.user!.id) return fail(res, 403, "You can only delete your own stories.");
    const uploads = [story.coverPath, ...story.chapters.flatMap(chapter => chapter.panels.map(panel => panel.imagePath))];
    await db.story.delete({ where: { id: story.id } });
    await Promise.all(uploads.map(removeLocalUpload));
    return res.json({ success: true });
  }
  catch (error) { return databaseUnavailable(res, error); }
});

app.get("/api/admin/overview", auth, roles("ADMIN"), async (_req, res) => {
  try { const db = getPrisma(); const [users, creators, stories, chapters, reports, pendingReports] = await Promise.all([db.user.count(), db.user.count({ where: { role: "CREATOR" } }), db.story.count(), db.chapter.count(), db.contentReport.count(), db.contentReport.count({ where: { status: "PENDING" } })]); return res.json({ success: true, data: { users, creators, stories, chapters, reports, pendingReports } }); }
  catch (error) { return databaseUnavailable(res, error); }
});
app.get("/api/admin/users", auth, roles("ADMIN"), async (_req, res) => {
  try { const users = await getPrisma().user.findMany({ orderBy: { createdAt: "desc" }, take: 300, select: { id: true, username: true, email: true, displayName: true, role: true, accountStatus: true, createdAt: true } }); return res.json({ success: true, data: users }); }
  catch (error) { return databaseUnavailable(res, error); }
});
app.patch("/api/admin/users/:id", auth, roles("ADMIN"), async (req: AuthRequest, res) => {
  try {
    if (String(req.params.id) === req.user!.id) return fail(res, 400, "You cannot change your own admin account here.");
    const role = ["USER", "CREATOR", "ADMIN"].includes(req.body?.role) ? req.body.role : undefined;
    const accountStatus = ["ACTIVE", "SUSPENDED", "DISABLED"].includes(req.body?.accountStatus) ? req.body.accountStatus : undefined;
    if (!role && !accountStatus) return fail(res, 400, "Provide a valid role or accountStatus.");
    const db = getPrisma();
    const target = await db.user.findUnique({ where: { id: String(req.params.id) }, select: { id: true, role: true, accountStatus: true } });
    if (!target) return fail(res, 404, "User not found.");
    if (target.role === "ADMIN" && ((role && role !== "ADMIN") || (accountStatus && accountStatus !== "ACTIVE"))) {
      const activeAdmins = await db.user.count({ where: { role: "ADMIN", accountStatus: "ACTIVE" } });
      if (activeAdmins <= 1) return fail(res, 409, "The last active administrator cannot be demoted or disabled.");
    }
    const user = await db.user.update({ where: { id: String(req.params.id) }, data: { ...(role ? { role } : {}), ...(accountStatus ? { accountStatus } : {}) }, select: { id: true, username: true, email: true, role: true, accountStatus: true } });
    if (accountStatus && accountStatus !== "ACTIVE") await db.session.deleteMany({ where: { userId: user.id } });
    return res.json({ success: true, data: user });
  }
  catch (error) { return databaseUnavailable(res, error); }
});
app.get("/api/admin/stories", auth, roles("ADMIN"), async (_req, res) => {
  try { const data = await getPrisma().story.findMany({ orderBy: { createdAt: "desc" }, take: 300, include: { creator: { select: { username: true, email: true } }, _count: { select: { chapters: true } } } }); return res.json({ success: true, data }); }
  catch (error) { return databaseUnavailable(res, error); }
});
app.patch("/api/admin/stories/:id", auth, roles("ADMIN"), async (req, res) => {
  try { const publication = ["DRAFT", "PUBLISHED", "UNPUBLISHED"].includes(req.body?.publication) ? req.body.publication : undefined; const status = ["ONGOING", "COMPLETED", "HIATUS"].includes(req.body?.status) ? req.body.status : undefined; if (!publication && !status) return fail(res, 400, "Provide a valid publication or status."); const data = await getPrisma().story.update({ where: { id: String(req.params.id) }, data: { ...(publication ? { publication } : {}), ...(status ? { status } : {}), ...(publication === "PUBLISHED" ? { publishedAt: new Date() } : {}) } }); return res.json({ success: true, data }); }
  catch (error) { return databaseUnavailable(res, error); }
});
app.get("/api/admin/message-reports", auth, roles("ADMIN"), async (_req, res) => {
  try { const data = await getPrisma().messageReport.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { reporter: { select: { id: true, username: true } }, message: { select: { id: true, body: true, deletedAt: true, createdAt: true, sender: { select: { id: true, username: true } } } } } }); return res.json({ success: true, data }); }
  catch (e) { return databaseUnavailable(res, e); }
});
app.patch("/api/admin/message-reports/:id", auth, roles("ADMIN"), async (req: AuthRequest, res) => {
  const status = ["REVIEWED", "RESOLVED", "DISMISSED"].includes(req.body?.status) ? req.body.status : undefined;
  if (!status) return fail(res, 400, "Provide a valid moderation status.");
  try { const report = await getPrisma().messageReport.update({ where: { id: String(req.params.id) }, data: { status } }); return res.json({ success: true, data: report }); }
  catch (e) { return databaseUnavailable(res, e); }
});
app.get("/api/admin/reports", auth, roles("ADMIN"), async (_req, res) => {
  try { const data = await getPrisma().contentReport.findMany({ orderBy: { createdAt: "desc" }, take: 300, include: { reporter: { select: { username: true } }, story: { select: { title: true, slug: true } }, comment: { select: { body: true } }, review: { select: { body: true, story: { select: { title: true, slug: true } } } } } }); return res.json({ success: true, data }); }
  catch (error) { return databaseUnavailable(res, error); }
});
app.patch("/api/admin/reports/:id", auth, roles("ADMIN"), async (req, res) => {
  try { const status = ["PENDING", "REVIEWED", "RESOLVED", "DISMISSED"].includes(req.body?.status) ? req.body.status : undefined; if (!status) return fail(res, 400, "Provide a valid report status."); const data = await getPrisma().contentReport.update({ where: { id: String(req.params.id) }, data: { status } }); return res.json({ success: true, data }); }
  catch (error) { return databaseUnavailable(res, error); }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error && typeof error === "object" && "type" in error && error.type === "entity.too.large") return fail(res, 413, "Request is too large. Reduce the image size or upload fewer pages at once.");
  if (error instanceof SyntaxError) return fail(res, 400, "Request body contains invalid JSON.");
  console.error("Unhandled API error:", error instanceof Error ? error.message : error);
  return fail(res, 500, "An unexpected server error occurred.");
});
app.use((_req, res) => res.status(404).json({ success: false, message: "API endpoint not found" }));
const server = app.listen(port, async () => {
  console.log(`KathaVerse API running at http://localhost:${port}`);
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("YOUR_PASSWORD")) console.warn("DATABASE_URL is not configured. API is running, but database endpoints will return HTTP 503 until server/.env is configured.");
  else { try { await bootstrapAdmin(); } catch (error) { console.error("Admin bootstrap skipped:", error instanceof Error ? error.message : error); } }
});
let shuttingDown = false;
async function shutdown() { if (shuttingDown) return; shuttingDown = true; server.close(async () => { await disconnectPrisma(); process.exit(0); }); }
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
