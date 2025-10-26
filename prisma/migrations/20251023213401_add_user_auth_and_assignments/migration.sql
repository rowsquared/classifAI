/*
  Warnings:

  - Added the required column `password` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
-- Add columns with defaults first, then remove defaults
ALTER TABLE "User" ADD COLUMN     "lastLogin" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN     "mustResetPassword" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN     "password" TEXT;
ALTER TABLE "User" ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- Set temp password for existing users (bcrypt hash of "temp-change-me")
UPDATE "User" 
SET "password" = '$2a$10$rCCqEz7.gLFHGJZKLxq8Ke7sOhXE8YQvzF5z7F.aH8ZnFxNKxC9Da',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "password" IS NULL;

-- Make password and updatedAt required
ALTER TABLE "User" ALTER COLUMN "password" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "SentenceAssignment" (
    "id" TEXT NOT NULL,
    "sentenceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,

    CONSTRAINT "SentenceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SentenceAssignment_userId_idx" ON "SentenceAssignment"("userId");

-- CreateIndex
CREATE INDEX "SentenceAssignment_sentenceId_idx" ON "SentenceAssignment"("sentenceId");

-- CreateIndex
CREATE UNIQUE INDEX "SentenceAssignment_sentenceId_userId_key" ON "SentenceAssignment"("sentenceId", "userId");

-- AddForeignKey
ALTER TABLE "SentenceAssignment" ADD CONSTRAINT "SentenceAssignment_sentenceId_fkey" FOREIGN KEY ("sentenceId") REFERENCES "Sentence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentenceAssignment" ADD CONSTRAINT "SentenceAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
