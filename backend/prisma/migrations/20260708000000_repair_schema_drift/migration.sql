-- Repair migration: reconcile production schema drift against schema.prisma.
--
-- Context. Production's core tables were created by a historical `prisma db
-- push` (window 2026-02-21..2026-03-19), not by the migration directory. The
-- 2026-07-07 squash (20260707000000_init) is a guarded no-op on databases
-- that already have the schema, so it can never repair drift on production.
-- Railway Postgres logs from 2026-05-20..05-27 prove Prompt.imageAttachment
-- was missing then; the migration that re-added it (20260529000000, commit
-- 23ac705d) most likely applied ~2026-05-29 but was deleted by the squash —
-- if it in fact never ran, nothing in the current directory re-adds those
-- columns. This migration closes every gap that analysis identified as
-- plausibly missing on production. Every statement is idempotent, so it is a
-- clean no-op wherever the objects already exist (the most likely prod state).
--
-- ORDERING RATIONALE — why this is timestamped AFTER 20260707210000:
--
-- 1. If it were timestamped BEFORE 20260707210000 and pre-added rootPromptId
--    / version / Template.modality / SharedPrompt, then on any database where
--    20260707210000 is still PENDING its plain (non-IF-NOT-EXISTS)
--    `ALTER TABLE "Prompt" ADD COLUMN "rootPromptId" ...` would fail with
--    "column already exists", wedging deploys with a new failed migration.
--    Timestamped AFTER, `migrate deploy` is guaranteed to run 20260707210000
--    first in every ordering, so no earlier migration's preconditions are
--    ever disturbed.
--
-- 2. If 20260707210000 is recorded as FAILED on production (finished_at NULL
--    in _prisma_migrations), `migrate deploy` exits P3009 before applying
--    ANY migration — including this one, regardless of its timestamp. An
--    earlier timestamp therefore buys nothing in the failed-state scenario;
--    the only remedy is the operator step documented in
--    backend/scripts/repair-drift-runbook.md:
--      npx prisma migrate resolve --rolled-back 20260707210000_add_shares_versions_template_modality
--    (On Postgres the whole failed file was rolled back atomically, so
--    --rolled-back is always the correct resolution; never --applied.)
--    After the resolve, deploy re-runs 20260707210000 (its plain ADDs succeed
--    because the atomic rollback left none of its DDL behind), then this
--    repair runs.
--
-- 3. Being AFTER also lets this migration double-cover 20260707210000's
--    objects with IF NOT EXISTS guards. That is deliberate belt-and-
--    suspenders: if anyone ever mistakenly resolves 20260707210000 with
--    --applied (recording it without its DDL having run), this migration
--    still converges the schema. (The built-in Template seed rows from
--    20260707210000 are data, not schema, and are NOT duplicated here —
--    another reason --rolled-back is the mandated resolution.)
--
-- Requires PostgreSQL >= 12 (ALTER TYPE ... ADD VALUE inside a transaction;
-- the new values are not referenced later in this same migration).

-- ----------------------------------------------------------------------------
-- 1. Prompt/ThreadTurn.imageAttachment — the May-2026-evidenced drift.
--    (services/schemaCompatibilityService.ts self-heals reads of these two
--    columns at runtime; this makes writes work again and retires the
--    fallback path.)
-- ----------------------------------------------------------------------------
ALTER TABLE "Prompt" ADD COLUMN IF NOT EXISTS "imageAttachment" JSONB;
ALTER TABLE "ThreadTurn" ADD COLUMN IF NOT EXISTS "imageAttachment" JSONB;

-- ----------------------------------------------------------------------------
-- 2. Prompt.version / Prompt.rootPromptId — normally added by 20260707210000;
--    guarded duplicates per ordering rationale (3).
-- ----------------------------------------------------------------------------
ALTER TABLE "Prompt" ADD COLUMN IF NOT EXISTS "rootPromptId" TEXT;
ALTER TABLE "Prompt" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- ----------------------------------------------------------------------------
-- 3. Template.modality — normally added by 20260707210000.
-- ----------------------------------------------------------------------------
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "modality" TEXT NOT NULL DEFAULT 'text';

-- ----------------------------------------------------------------------------
-- 4. SharedPrompt — normally created by 20260707210000.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "SharedPrompt" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "SharedPrompt_pkey" PRIMARY KEY ("id")
);

-- ----------------------------------------------------------------------------
-- 5. Indexes (CREATE INDEX IF NOT EXISTS is safe against both the db-push
--    state and a completed 20260707210000).
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "SharedPrompt_slug_key" ON "SharedPrompt"("slug");
CREATE INDEX IF NOT EXISTS "SharedPrompt_promptId_idx" ON "SharedPrompt"("promptId");
CREATE INDEX IF NOT EXISTS "SharedPrompt_userId_createdAt_idx" ON "SharedPrompt"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Prompt_rootPromptId_version_idx" ON "Prompt"("rootPromptId", "version" DESC);
CREATE INDEX IF NOT EXISTS "Template_isPublic_modality_createdAt_idx" ON "Template"("isPublic", "modality", "createdAt" DESC);

-- ----------------------------------------------------------------------------
-- 6. SharedPrompt -> Prompt FK. ALTER TABLE ADD CONSTRAINT has no
--    IF NOT EXISTS form, hence the catalog guard.
-- ----------------------------------------------------------------------------
DO $repair_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'SharedPrompt_promptId_fkey'
      AND conrelid = to_regclass('public."SharedPrompt"')
  ) THEN
    ALTER TABLE "SharedPrompt"
      ADD CONSTRAINT "SharedPrompt_promptId_fkey"
      FOREIGN KEY ("promptId") REFERENCES "Prompt"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$repair_fk$;

-- ----------------------------------------------------------------------------
-- 7. PlatformType enum values added to schema.prisma 2026-02-28/03-01. If the
--    historical db push predates 03-01 these are missing on production. Plain
--    appends (no BEFORE 'CUSTOM'): appending never depends on which values
--    already exist, and enum member order is cosmetic here (no ORDER BY on
--    this enum). No-ops when present, e.g. on databases built from the
--    squashed baseline, which creates the full value set.
-- ----------------------------------------------------------------------------
ALTER TYPE "PlatformType" ADD VALUE IF NOT EXISTS 'SORA';
ALTER TYPE "PlatformType" ADD VALUE IF NOT EXISTS 'RUNWAY';
ALTER TYPE "PlatformType" ADD VALUE IF NOT EXISTS 'SUNO';
ALTER TYPE "PlatformType" ADD VALUE IF NOT EXISTS 'UDIO';
ALTER TYPE "PlatformType" ADD VALUE IF NOT EXISTS 'FLUX';
ALTER TYPE "PlatformType" ADD VALUE IF NOT EXISTS 'PIKA';
ALTER TYPE "PlatformType" ADD VALUE IF NOT EXISTS 'KLING';
ALTER TYPE "PlatformType" ADD VALUE IF NOT EXISTS 'MUSICGEN';
ALTER TYPE "PlatformType" ADD VALUE IF NOT EXISTS 'MESHY';
ALTER TYPE "PlatformType" ADD VALUE IF NOT EXISTS 'TRIPO3D';
