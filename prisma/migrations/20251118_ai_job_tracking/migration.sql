-- AlterTable
ALTER TABLE "Taxonomy" ADD COLUMN     "lastAISyncJobId" TEXT,
ADD COLUMN     "lastLearningError" TEXT,
ADD COLUMN     "lastLearningJobId" TEXT,
ADD COLUMN     "lastLearningStatus" TEXT;

