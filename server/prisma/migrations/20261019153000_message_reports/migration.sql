CREATE TABLE "MessageReport" (
  "id" TEXT NOT NULL, "reporterId" TEXT NOT NULL, "messageId" TEXT NOT NULL, "reason" VARCHAR(1000) NOT NULL,
  "status" "ReportStatus" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessageReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MessageReport_status_createdAt_idx" ON "MessageReport"("status", "createdAt");
CREATE INDEX "MessageReport_reporterId_messageId_idx" ON "MessageReport"("reporterId", "messageId");
ALTER TABLE "MessageReport" ADD CONSTRAINT "MessageReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageReport" ADD CONSTRAINT "MessageReport_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
