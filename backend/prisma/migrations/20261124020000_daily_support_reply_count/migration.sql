-- Support-assistant replies are reserved atomically on the same per-day row
-- as generations, replacing a Redis counter that failed open without Redis.
-- Additive with a constant default: no table rewrite on Postgres 11+.
ALTER TABLE "DailyUsage" ADD COLUMN IF NOT EXISTS "supportReplyCount" INTEGER NOT NULL DEFAULT 0;
