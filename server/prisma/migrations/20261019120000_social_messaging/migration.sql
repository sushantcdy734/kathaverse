
CREATE TYPE "SocialTargetType" AS ENUM ('STORY','CHAPTER','VIDEO','CREATOR');
ALTER TABLE "Comment" ADD COLUMN "parentId" TEXT;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");
CREATE TABLE "Like" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "targetType" "SocialTargetType" NOT NULL, "targetId" TEXT NOT NULL,
 "storyId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Like_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Like_userId_targetType_targetId_key" ON "Like"("userId","targetType","targetId");
CREATE INDEX "Like_targetType_targetId_createdAt_idx" ON "Like"("targetType","targetId","createdAt");
CREATE INDEX "Like_storyId_idx" ON "Like"("storyId");
ALTER TABLE "Like" ADD CONSTRAINT "Like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Like" ADD CONSTRAINT "Like_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "CreatorFollow" (
 "id" TEXT NOT NULL, "followerId" TEXT NOT NULL, "creatorId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "CreatorFollow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CreatorFollow_followerId_creatorId_key" ON "CreatorFollow"("followerId","creatorId");
CREATE INDEX "CreatorFollow_creatorId_createdAt_idx" ON "CreatorFollow"("creatorId","createdAt");
CREATE INDEX "CreatorFollow_followerId_createdAt_idx" ON "CreatorFollow"("followerId","createdAt");
ALTER TABLE "CreatorFollow" ADD CONSTRAINT "CreatorFollow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreatorFollow" ADD CONSTRAINT "CreatorFollow_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "Conversation" ("id" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id"));
CREATE INDEX "Conversation_updatedAt_idx" ON "Conversation"("updatedAt");
CREATE TABLE "ConversationParticipant" (
 "id" TEXT NOT NULL,"conversationId" TEXT NOT NULL,"userId" TEXT NOT NULL,"archivedAt" TIMESTAMP(3),"muted" BOOLEAN NOT NULL DEFAULT false,"lastReadAt" TIMESTAMP(3),
 CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_userId_key" ON "ConversationParticipant"("conversationId","userId");
CREATE INDEX "ConversationParticipant_userId_archivedAt_idx" ON "ConversationParticipant"("userId","archivedAt");
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "Message" (
 "id" TEXT NOT NULL,"conversationId" TEXT NOT NULL,"senderId" TEXT NOT NULL,"body" VARCHAR(4000) NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"editedAt" TIMESTAMP(3),"deletedAt" TIMESTAMP(3),
 CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId","createdAt");
CREATE INDEX "Message_senderId_createdAt_idx" ON "Message"("senderId","createdAt");
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "Notification" (
 "id" TEXT NOT NULL,"userId" TEXT NOT NULL,"type" VARCHAR(60) NOT NULL,"title" VARCHAR(180) NOT NULL,"body" VARCHAR(500) NOT NULL,"link" VARCHAR(500),"readAt" TIMESTAMP(3),"dedupeKey" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId","readAt","createdAt");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "UserBlock" ("id" TEXT NOT NULL,"blockerId" TEXT NOT NULL,"blockedId" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId","blockedId");
CREATE INDEX "UserBlock_blockedId_blockerId_idx" ON "UserBlock"("blockedId","blockerId");
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
