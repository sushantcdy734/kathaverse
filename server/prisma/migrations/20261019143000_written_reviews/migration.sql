CREATE TABLE "Review" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "storyId" TEXT NOT NULL, "body" VARCHAR(3000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Review_userId_storyId_key" ON "Review"("userId", "storyId");
CREATE INDEX "Review_storyId_createdAt_idx" ON "Review"("storyId", "createdAt");
CREATE INDEX "Review_userId_updatedAt_idx" ON "Review"("userId", "updatedAt");
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "ReviewHelpful" (
  "id" TEXT NOT NULL, "reviewId" TEXT NOT NULL, "userId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewHelpful_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReviewHelpful_reviewId_userId_key" ON "ReviewHelpful"("reviewId", "userId");
CREATE INDEX "ReviewHelpful_reviewId_createdAt_idx" ON "ReviewHelpful"("reviewId", "createdAt");
ALTER TABLE "ReviewHelpful" ADD CONSTRAINT "ReviewHelpful_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewHelpful" ADD CONSTRAINT "ReviewHelpful_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentReport" ADD COLUMN "reviewId" TEXT;
CREATE INDEX "ContentReport_reviewId_idx" ON "ContentReport"("reviewId");
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
