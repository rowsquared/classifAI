-- AlterTable
ALTER TABLE "AILabelingJob" ADD COLUMN     "externalJobId" TEXT,
ALTER COLUMN "batchSize" SET DEFAULT 1000;

-- AlterTable
ALTER TABLE "SentenceAnnotation" ALTER COLUMN "updatedAt" DROP DEFAULT;
