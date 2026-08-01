-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('boolean', 'single_choice', 'multiple_choice', 'scale', 'short_text', 'long_text', 'number', 'date', 'time', 'photo', 'file');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('draft', 'published');

-- CreateTable
CREATE TABLE "Questionnaire" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Questionnaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionnaireVersion" (
    "id" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionnaireVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionnaireBranch" (
    "id" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionnaireBranch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Questionnaire_currentVersionId_key" ON "Questionnaire"("currentVersionId");

-- CreateIndex
CREATE INDEX "Questionnaire_deletedAt_idx" ON "Questionnaire"("deletedAt");

-- CreateIndex
CREATE INDEX "QuestionnaireVersion_questionnaireId_idx" ON "QuestionnaireVersion"("questionnaireId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireVersion_questionnaireId_versionNumber_key" ON "QuestionnaireVersion"("questionnaireId", "versionNumber");

-- CreateIndex
CREATE INDEX "Question_versionId_idx" ON "Question"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "Question_versionId_order_key" ON "Question"("versionId", "order");

-- CreateIndex
CREATE INDEX "QuestionnaireBranch_branchId_idx" ON "QuestionnaireBranch"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireBranch_questionnaireId_branchId_key" ON "QuestionnaireBranch"("questionnaireId", "branchId");

-- AddForeignKey
ALTER TABLE "Questionnaire" ADD CONSTRAINT "Questionnaire_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "QuestionnaireVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireVersion" ADD CONSTRAINT "QuestionnaireVersion_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "QuestionnaireVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireBranch" ADD CONSTRAINT "QuestionnaireBranch_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireBranch" ADD CONSTRAINT "QuestionnaireBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
