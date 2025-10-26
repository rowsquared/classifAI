/*
  Warnings:

  - You are about to drop the column `meta` on the `Sentence` table. All the data in the column will be lost.
  - You are about to drop the column `text` on the `Sentence` table. All the data in the column will be lost.
  - You are about to drop the `SentencePrediction` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `field1` to the `Sentence` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fieldMapping` to the `Sentence` table without a default value. This is not possible if the table is not empty.
  - Added the required column `importId` to the `Sentence` table without a default value. This is not possible if the table is not empty.
  - Added the required column `importOrder` to the `Sentence` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Taxonomy` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."SentencePrediction" DROP CONSTRAINT "SentencePrediction_sentenceId_fkey";

-- DropForeignKey
ALTER TABLE "public"."SentencePrediction" DROP CONSTRAINT "SentencePrediction_taxonomyId_fkey";

-- AlterTable
ALTER TABLE "Sentence" DROP COLUMN "meta",
DROP COLUMN "text",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "field1" TEXT NOT NULL,
ADD COLUMN     "field2" TEXT,
ADD COLUMN     "field3" TEXT,
ADD COLUMN     "field4" TEXT,
ADD COLUMN     "field5" TEXT,
ADD COLUMN     "fieldMapping" JSONB NOT NULL,
ADD COLUMN     "importId" TEXT NOT NULL,
ADD COLUMN     "importOrder" INTEGER NOT NULL,
ADD COLUMN     "support1" TEXT,
ADD COLUMN     "support2" TEXT,
ADD COLUMN     "support3" TEXT,
ADD COLUMN     "support4" TEXT,
ADD COLUMN     "support5" TEXT,
ADD COLUMN     "supportMapping" JSONB;

-- AlterTable
ALTER TABLE "Taxonomy" ADD COLUMN     "description" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "levelNames" JSONB,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "TaxonomyNode" ALTER COLUMN "path" DROP NOT NULL,
ALTER COLUMN "isLeaf" DROP NOT NULL;

-- DropTable
DROP TABLE "public"."SentencePrediction";

-- CreateTable
CREATE TABLE "SentenceImport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,
    "totalRows" INTEGER NOT NULL,

    CONSTRAINT "SentenceImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SentenceImport_uploadedAt_idx" ON "SentenceImport"("uploadedAt");

-- CreateIndex
CREATE INDEX "Sentence_importId_idx" ON "Sentence"("importId");

-- CreateIndex
CREATE INDEX "Sentence_status_idx" ON "Sentence"("status");

-- CreateIndex
CREATE INDEX "Sentence_field1_idx" ON "Sentence"("field1");

-- CreateIndex
CREATE INDEX "Sentence_importId_importOrder_idx" ON "Sentence"("importId", "importOrder");

-- AddForeignKey
ALTER TABLE "SentenceImport" ADD CONSTRAINT "SentenceImport_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sentence" ADD CONSTRAINT "Sentence_importId_fkey" FOREIGN KEY ("importId") REFERENCES "SentenceImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sentence" ADD CONSTRAINT "Sentence_lastEditorId_fkey" FOREIGN KEY ("lastEditorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
