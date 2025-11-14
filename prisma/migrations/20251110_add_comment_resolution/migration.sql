-- Add resolved fields to Comment table
ALTER TABLE "Comment" ADD COLUMN "resolved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Comment" ADD COLUMN "resolvedAt" TIMESTAMP(3);

-- Add username column to User table
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Ensure usernames are unique
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- Add labelingStartedAt column and indexes to SentenceAnnotation
ALTER TABLE "SentenceAnnotation" ADD COLUMN "labelingStartedAt" TIMESTAMP(3);
CREATE INDEX "SentenceAnnotation_nodeCode_idx" ON "SentenceAnnotation"("nodeCode");
CREATE INDEX "SentenceAnnotation_createdById_createdAt_idx" ON "SentenceAnnotation"("createdById","createdAt");
