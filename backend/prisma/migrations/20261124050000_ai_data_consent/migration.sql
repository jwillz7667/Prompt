-- Server-side AI data-sharing consent (App Store guideline 5.1.2(i)).
-- Additive only: two nullable columns on "User" without defaults, so Postgres
-- records them as a catalog change with no table rewrite on a populated table.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiDataConsentAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiDataConsentVersion" INTEGER;
