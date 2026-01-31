-- CreateTable: Developer (separate auth for API access)
CREATE TABLE "Developer" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "company" TEXT,
    "website" TEXT,
    "refreshToken" TEXT,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "totalApiCalls" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "Developer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Developer_email_key" ON "Developer"("email");
CREATE INDEX "Developer_email_idx" ON "Developer"("email");
CREATE INDEX "Developer_isActive_idx" ON "Developer"("isActive");

-- Migrate ApiKey from userId to developerId
-- First, drop old constraints if they exist
ALTER TABLE "ApiKey" DROP CONSTRAINT IF EXISTS "ApiKey_userId_fkey";

-- Add developerId column
ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "developerId" TEXT;

-- Drop old userId column (assuming no data to migrate - new feature)
ALTER TABLE "ApiKey" DROP COLUMN IF EXISTS "userId";

-- Make developerId required (only if column exists and is nullable)
ALTER TABLE "ApiKey" ALTER COLUMN "developerId" SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Update ApiKey indexes
DROP INDEX IF EXISTS "ApiKey_userId_idx";
DROP INDEX IF EXISTS "ApiKey_isActive_userId_idx";
CREATE INDEX IF NOT EXISTS "ApiKey_developerId_idx" ON "ApiKey"("developerId");
CREATE INDEX IF NOT EXISTS "ApiKey_isActive_developerId_idx" ON "ApiKey"("isActive", "developerId");

-- Migrate ApiUsage from userId to developerId
ALTER TABLE "ApiUsage" DROP COLUMN IF EXISTS "userId";
ALTER TABLE "ApiUsage" ADD COLUMN IF NOT EXISTS "developerId" TEXT NOT NULL DEFAULT '';

-- Update ApiUsage indexes
DROP INDEX IF EXISTS "ApiUsage_userId_createdAt_idx";
CREATE INDEX IF NOT EXISTS "ApiUsage_developerId_createdAt_idx" ON "ApiUsage"("developerId", "createdAt" DESC);

-- Migrate ApiSubscription from userId to developerId
ALTER TABLE "ApiSubscription" DROP CONSTRAINT IF EXISTS "ApiSubscription_userId_fkey";
DROP INDEX IF EXISTS "ApiSubscription_userId_key";

ALTER TABLE "ApiSubscription" ADD COLUMN IF NOT EXISTS "developerId" TEXT;
ALTER TABLE "ApiSubscription" DROP COLUMN IF EXISTS "userId";
ALTER TABLE "ApiSubscription" ALTER COLUMN "developerId" SET NOT NULL;

-- Add unique constraint and foreign key
CREATE UNIQUE INDEX "ApiSubscription_developerId_key" ON "ApiSubscription"("developerId");
ALTER TABLE "ApiSubscription" ADD CONSTRAINT "ApiSubscription_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Remove User relations to API tables (these belonged to User before)
ALTER TABLE "User" DROP COLUMN IF EXISTS "apiKeys";
ALTER TABLE "User" DROP COLUMN IF EXISTS "apiSubscription";
