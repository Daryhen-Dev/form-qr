-- CreateTable: Response model (Slice 5b)
-- One-per-day constraint: @@unique([userId, questionnaireId, businessDay]) — fully
-- declarative (unconditional compound unique — no raw SQL required, contrast with
-- the S3 partial/conditional unique on BranchAssignment which could not be expressed
-- declaratively and required a raw SQL migration comment).
CREATE TABLE "Response" (
    "id" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessDay" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Response_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Answer model (Slice 5b)
-- Per-question answer storage; @@unique([responseId, questionId]) ensures at most
-- one answer per question per response.
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Response indexes
CREATE INDEX "Response_questionnaireId_idx" ON "Response"("questionnaireId");
CREATE INDEX "Response_userId_idx" ON "Response"("userId");
CREATE INDEX "Response_businessDay_idx" ON "Response"("businessDay");
CREATE INDEX "Response_deletedAt_idx" ON "Response"("deletedAt");

-- CreateIndex: Response unique constraint (declarative — no conditional predicate)
CREATE UNIQUE INDEX "Response_userId_questionnaireId_businessDay_key"
    ON "Response"("userId", "questionnaireId", "businessDay");

-- CreateIndex: Answer indexes
CREATE INDEX "Answer_responseId_idx" ON "Answer"("responseId");

-- CreateIndex: Answer unique constraint
CREATE UNIQUE INDEX "Answer_responseId_questionId_key"
    ON "Answer"("responseId", "questionId");

-- AddForeignKey: Response → Questionnaire
ALTER TABLE "Response"
    ADD CONSTRAINT "Response_questionnaireId_fkey"
    FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Response → QuestionnaireVersion
ALTER TABLE "Response"
    ADD CONSTRAINT "Response_versionId_fkey"
    FOREIGN KEY ("versionId") REFERENCES "QuestionnaireVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Response → User
ALTER TABLE "Response"
    ADD CONSTRAINT "Response_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Answer → Response
ALTER TABLE "Answer"
    ADD CONSTRAINT "Answer_responseId_fkey"
    FOREIGN KEY ("responseId") REFERENCES "Response"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Answer → Question
ALTER TABLE "Answer"
    ADD CONSTRAINT "Answer_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "Question"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
