-- Remediation migration.
--
-- The 20260319_add_prompt_image_attachments migration was authored idempotently
-- (ADD COLUMN IF NOT EXISTS) but production logs show ongoing
--   ERROR: column Prompt.imageAttachment does not exist
-- which means the column was never actually created — most likely because the
-- _prisma_migrations row was inserted without the DDL succeeding, so Prisma
-- now considers the migration applied and will not re-run it.
--
-- This follow-up migration carries the same idempotent DDL under a fresh
-- migration id so `prisma migrate deploy` runs it against any environment
-- whose Prompt / ThreadTurn tables are missing the JSONB column. It is safe
-- on environments that already have the column — IF NOT EXISTS makes it a
-- no-op.

ALTER TABLE "Prompt"
ADD COLUMN IF NOT EXISTS "imageAttachment" JSONB;

ALTER TABLE "ThreadTurn"
ADD COLUMN IF NOT EXISTS "imageAttachment" JSONB;
