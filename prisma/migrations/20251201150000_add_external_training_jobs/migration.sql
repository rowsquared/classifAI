-- CreateEnum
CREATE TYPE "AIJobType" AS ENUM ('labeling', 'learning', 'taxonomy_sync', 'external_training');

-- CreateTable
CREATE TABLE "AIExternalTrainingJob" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "taxonomyId" TEXT NOT NULL,
    "status" "AILabelingJobStatus" NOT NULL DEFAULT 'pending',
    "jobType" "AIJobType" NOT NULL DEFAULT 'external_training',
    "trainingDataUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "AIExternalTrainingJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIExternalTrainingJob_status_idx" ON "AIExternalTrainingJob"("status");

-- CreateIndex
CREATE INDEX "AIExternalTrainingJob_createdById_idx" ON "AIExternalTrainingJob"("createdById");

-- CreateIndex
CREATE INDEX "AIExternalTrainingJob_taxonomyId_idx" ON "AIExternalTrainingJob"("taxonomyId");

-- CreateIndex
CREATE INDEX "AIExternalTrainingJob_startedAt_idx" ON "AIExternalTrainingJob"("startedAt");

-- AddForeignKey
ALTER TABLE "AIExternalTrainingJob" ADD CONSTRAINT "AIExternalTrainingJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIExternalTrainingJob" ADD CONSTRAINT "AIExternalTrainingJob_taxonomyId_fkey" FOREIGN KEY ("taxonomyId") REFERENCES "Taxonomy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

