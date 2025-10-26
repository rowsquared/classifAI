-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'supervisor', 'labeller');

-- CreateEnum
CREATE TYPE "SentenceStatus" AS ENUM ('pending', 'submitted', 'skipped', 'escalated');

-- CreateEnum
CREATE TYPE "AnnotationSource" AS ENUM ('user', 'ai');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL,
    "supervisorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Taxonomy" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "maxDepth" INTEGER NOT NULL DEFAULT 5,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Taxonomy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxonomySetting" (
    "id" TEXT NOT NULL,
    "taxonomyId" TEXT NOT NULL,
    "autoSelectThreshold" DOUBLE PRECISION,

    CONSTRAINT "TaxonomySetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxonomyNode" (
    "code" INTEGER NOT NULL,
    "id" TEXT NOT NULL,
    "taxonomyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "definition" TEXT,
    "parentCode" INTEGER,
    "level" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "isLeaf" BOOLEAN NOT NULL,

    CONSTRAINT "TaxonomyNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxonomySynonym" (
    "id" TEXT NOT NULL,
    "taxonomyId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "synonym" TEXT NOT NULL,

    CONSTRAINT "TaxonomySynonym_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sentence" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "meta" JSONB,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "status" "SentenceStatus" NOT NULL DEFAULT 'pending',
    "lastEditorId" TEXT,
    "lastEditedAt" TIMESTAMP(3),

    CONSTRAINT "Sentence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentencePrediction" (
    "id" TEXT NOT NULL,
    "sentenceId" TEXT NOT NULL,
    "taxonomyId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "nodeCode" INTEGER NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SentencePrediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentenceAnnotation" (
    "id" TEXT NOT NULL,
    "sentenceId" TEXT NOT NULL,
    "taxonomyId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "nodeCode" INTEGER NOT NULL,
    "source" "AnnotationSource" NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentenceAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "sentenceId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Taxonomy_key_key" ON "Taxonomy"("key");

-- CreateIndex
CREATE UNIQUE INDEX "TaxonomySetting_taxonomyId_key" ON "TaxonomySetting"("taxonomyId");

-- CreateIndex
CREATE INDEX "TaxonomyNode_taxonomyId_level_idx" ON "TaxonomyNode"("taxonomyId", "level");

-- CreateIndex
CREATE INDEX "TaxonomyNode_taxonomyId_parentCode_idx" ON "TaxonomyNode"("taxonomyId", "parentCode");

-- CreateIndex
CREATE UNIQUE INDEX "TaxonomyNode_taxonomyId_code_key" ON "TaxonomyNode"("taxonomyId", "code");

-- CreateIndex (removed unique constraint on label - labels can repeat)
-- CREATE UNIQUE INDEX "TaxonomyNode_taxonomyId_label_key" ON "TaxonomyNode"("taxonomyId", "label");

-- CreateIndex
CREATE INDEX "TaxonomySynonym_taxonomyId_nodeId_idx" ON "TaxonomySynonym"("taxonomyId", "nodeId");

-- CreateIndex
CREATE INDEX "SentencePrediction_sentenceId_taxonomyId_level_idx" ON "SentencePrediction"("sentenceId", "taxonomyId", "level");

-- CreateIndex
CREATE INDEX "SentenceAnnotation_sentenceId_taxonomyId_level_idx" ON "SentenceAnnotation"("sentenceId", "taxonomyId", "level");

-- CreateIndex
CREATE INDEX "Comment_sentenceId_idx" ON "Comment"("sentenceId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxonomySetting" ADD CONSTRAINT "TaxonomySetting_taxonomyId_fkey" FOREIGN KEY ("taxonomyId") REFERENCES "Taxonomy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxonomyNode" ADD CONSTRAINT "TaxonomyNode_taxonomyId_fkey" FOREIGN KEY ("taxonomyId") REFERENCES "Taxonomy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxonomySynonym" ADD CONSTRAINT "TaxonomySynonym_taxonomyId_fkey" FOREIGN KEY ("taxonomyId") REFERENCES "Taxonomy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxonomySynonym" ADD CONSTRAINT "TaxonomySynonym_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "TaxonomyNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentencePrediction" ADD CONSTRAINT "SentencePrediction_sentenceId_fkey" FOREIGN KEY ("sentenceId") REFERENCES "Sentence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentencePrediction" ADD CONSTRAINT "SentencePrediction_taxonomyId_fkey" FOREIGN KEY ("taxonomyId") REFERENCES "Taxonomy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentenceAnnotation" ADD CONSTRAINT "SentenceAnnotation_sentenceId_fkey" FOREIGN KEY ("sentenceId") REFERENCES "Sentence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentenceAnnotation" ADD CONSTRAINT "SentenceAnnotation_taxonomyId_fkey" FOREIGN KEY ("taxonomyId") REFERENCES "Taxonomy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentenceAnnotation" ADD CONSTRAINT "SentenceAnnotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_sentenceId_fkey" FOREIGN KEY ("sentenceId") REFERENCES "Sentence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
