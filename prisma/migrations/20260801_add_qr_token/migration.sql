-- Sub-PR 5a: Add qrToken to Questionnaire
--
-- qrToken is permanent and unguessable. @default(cuid()) in the Prisma schema
-- means Prisma generates a cuid() at insert time (application-level default).
-- For existing rows we use gen_random_uuid()::text as a DB-level default during
-- the ALTER TABLE so no existing row ends up NULL.
-- The DB default is removed after the column is populated; Prisma's application-
-- level @default(cuid()) takes over for all future inserts.

-- Step 1: Add column with a temporary DB default to backfill existing rows.
ALTER TABLE "Questionnaire"
  ADD COLUMN "qrToken" TEXT NOT NULL DEFAULT gen_random_uuid()::text;

-- Step 2: Create the unique index.
CREATE UNIQUE INDEX "Questionnaire_qrToken_key"
  ON "Questionnaire"("qrToken");

-- Step 3: Drop the DB default — Prisma will supply the value at insert time.
ALTER TABLE "Questionnaire"
  ALTER COLUMN "qrToken" DROP DEFAULT;
