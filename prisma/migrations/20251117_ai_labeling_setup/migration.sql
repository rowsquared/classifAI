-- CreateEnum
CREATE TYPE "AILabelingJobStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');

ALTER TABLE "SentenceAnnotation" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "nodeCode" SET DATA TYPE TEXT USING "nodeCode"::text;

-- AlterTable
ALTER TABLE "Taxonomy" ADD COLUMN     "lastAISyncAt" TIMESTAMP(3),
ADD COLUMN     "lastAISyncError" TEXT,
ADD COLUMN     "lastAISyncStatus" TEXT,
ADD COLUMN     "lastLearningAt" TIMESTAMP(3),
ADD COLUMN     "newAnnotationsSinceLastLearning" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

-- CreateTable
CREATE TABLE "SentenceAISuggestion" (
    "id" TEXT NOT NULL,
    "sentenceId" TEXT NOT NULL,
    "taxonomyId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "nodeCode" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "suggestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentenceAISuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AILabelingJob" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "taxonomyId" TEXT NOT NULL,
    "status" "AILabelingJobStatus" NOT NULL DEFAULT 'pending',
    "totalSentences" INTEGER NOT NULL,
    "processedSentences" INTEGER NOT NULL DEFAULT 0,
    "failedSentences" INTEGER NOT NULL DEFAULT 0,
    "batchSize" INTEGER NOT NULL DEFAULT 100,
    "filterCriteria" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "AILabelingJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SentenceAISuggestion_sentenceId_idx" ON "SentenceAISuggestion"("sentenceId");

-- CreateIndex
CREATE INDEX "SentenceAISuggestion_taxonomyId_nodeCode_idx" ON "SentenceAISuggestion"("taxonomyId", "nodeCode");

-- CreateIndex
CREATE INDEX "SentenceAISuggestion_confidenceScore_idx" ON "SentenceAISuggestion"("confidenceScore");

-- CreateIndex
CREATE INDEX "SentenceAISuggestion_suggestedAt_idx" ON "SentenceAISuggestion"("suggestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SentenceAISuggestion_sentenceId_taxonomyId_level_key" ON "SentenceAISuggestion"("sentenceId", "taxonomyId", "level");

-- CreateIndex
CREATE INDEX "AILabelingJob_status_idx" ON "AILabelingJob"("status");

-- CreateIndex
CREATE INDEX "AILabelingJob_createdById_idx" ON "AILabelingJob"("createdById");

-- CreateIndex
CREATE INDEX "AILabelingJob_taxonomyId_idx" ON "AILabelingJob"("taxonomyId");

-- CreateIndex
CREATE INDEX "AILabelingJob_startedAt_idx" ON "AILabelingJob"("startedAt");

-- AddForeignKey
ALTER TABLE "SentenceAISuggestion" ADD CONSTRAINT "SentenceAISuggestion_sentenceId_fkey" FOREIGN KEY ("sentenceId") REFERENCES "Sentence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentenceAISuggestion" ADD CONSTRAINT "SentenceAISuggestion_taxonomyId_fkey" FOREIGN KEY ("taxonomyId") REFERENCES "Taxonomy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AILabelingJob" ADD CONSTRAINT "AILabelingJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AILabelingJob" ADD CONSTRAINT "AILabelingJob_taxonomyId_fkey" FOREIGN KEY ("taxonomyId") REFERENCES "Taxonomy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

