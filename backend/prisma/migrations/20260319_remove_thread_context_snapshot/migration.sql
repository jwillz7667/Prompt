ALTER TABLE "Thread"
DROP COLUMN IF EXISTS "attachedContextId",
DROP COLUMN IF EXISTS "attachedContextName",
DROP COLUMN IF EXISTS "attachedContextDescription",
DROP COLUMN IF EXISTS "attachedContextTags",
DROP COLUMN IF EXISTS "attachedContextSummary";
