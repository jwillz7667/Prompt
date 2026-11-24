-- Sign in with Apple token revocation on account deletion (guideline 5.1.1(v)).
-- Additive only: a nullable column on "User" (no rewrite) and a new table.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "appleRefreshToken" TEXT;

CREATE TABLE IF NOT EXISTS "AppleTokenRevocation" (
    "id" TEXT NOT NULL,
    "sealedGrant" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppleTokenRevocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AppleTokenRevocation_nextAttemptAt_idx" ON "AppleTokenRevocation"("nextAttemptAt");
