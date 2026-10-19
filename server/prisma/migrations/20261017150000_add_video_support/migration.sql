CREATE TABLE "Video" (
  "id" TEXT NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "description" VARCHAR(3000) NOT NULL,
  "type" VARCHAR(10) NOT NULL DEFAULT 'VIDEO',
  "category" VARCHAR(80),
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "filePath" TEXT NOT NULL,
  "mimeType" VARCHAR(80) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaderId" TEXT NOT NULL,
  CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Video_filePath_key" ON "Video"("filePath");
CREATE INDEX "Video_createdAt_idx" ON "Video"("createdAt");
CREATE INDEX "Video_type_createdAt_idx" ON "Video"("type", "createdAt");
ALTER TABLE "Video" ADD CONSTRAINT "Video_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
