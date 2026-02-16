-- CreateTable
CREATE TABLE "AILearningJob" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "taxonomyId" TEXT NOT NULL,
    "status" "AILabelingJobStatus" NOT NULL DEFAULT 'pending',
    "totalSentences" INTEGER NOT NULL,
    "processedSentences" INTEGER NOT NULL DEFAULT 0,
    "failedSentences" INTEGER NOT NULL DEFAULT 0,
    "batchSize" INTEGER NOT NULL DEFAULT 100,
    "filterCriteria" JSONB,
    "externalJobId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "AILearningJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AILearningJob_status_idx" ON "AILearningJob"("status");

-- CreateIndex
CREATE INDEX "AILearningJob_createdById_idx" ON "AILearningJob"("createdById");

-- CreateIndex
CREATE INDEX "AILearningJob_taxonomyId_idx" ON "AILearningJob"("taxonomyId");

-- CreateIndex
CREATE INDEX "AILearningJob_startedAt_idx" ON "AILearningJob"("startedAt");

-- AddForeignKey
ALTER TABLE "AILearningJob" ADD CONSTRAINT "AILearningJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AILearningJob" ADD CONSTRAINT "AILearningJob_taxonomyId_fkey" FOREIGN KEY ("taxonomyId") REFERENCES "Taxonomy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
