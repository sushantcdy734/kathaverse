CREATE TYPE "StoryContentType" AS ENUM ('NOVEL', 'MANHWA', 'BOTH');
ALTER TABLE "Story" ADD COLUMN "contentType" "StoryContentType" NOT NULL DEFAULT 'NOVEL';
ALTER TABLE "Chapter" ADD COLUMN "content" TEXT;
