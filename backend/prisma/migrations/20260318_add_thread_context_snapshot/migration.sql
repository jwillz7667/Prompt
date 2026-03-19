ALTER TABLE "Thread"
ADD COLUMN "attachedContextId" TEXT,
ADD COLUMN "attachedContextName" TEXT,
ADD COLUMN "attachedContextDescription" TEXT,
ADD COLUMN "attachedContextTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "attachedContextSummary" TEXT;
