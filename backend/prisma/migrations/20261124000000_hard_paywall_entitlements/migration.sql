-- Hard paywall + single PREMIUM entitlement.
-- Safe on a populated database: every statement is additive or a targeted
-- data rewrite; nothing drops user data other than AppStoreTransaction rows
-- whose owning User no longer exists (they can never be attributed again).

-- 1. AppStoreTransaction.userId gets a real FK. Orphans from previously
--    deleted accounts would make the constraint fail, so remove them first.
DELETE FROM "AppStoreTransaction" t
WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = t."userId");

ALTER TABLE "AppStoreTransaction"
  ADD CONSTRAINT "AppStoreTransaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Offer metadata decoded from the verified JWS (introductory free trial).
ALTER TABLE "AppStoreTransaction"
  ADD COLUMN "offerType" INTEGER,
  ADD COLUMN "offerDiscountType" TEXT;

-- 3. Persist the App Store environment that backs a subscription so sandbox
--    entitlements can be switched off with APPLE_ACCEPT_SANDBOX_TRANSACTIONS.
ALTER TABLE "Subscription" ADD COLUMN "environment" TEXT;

-- 4. Backfill environment for existing Apple-backed subscriptions from the
--    newest transaction of the same original transaction.
UPDATE "Subscription" s
SET "environment" = latest."environment"
FROM (
  SELECT DISTINCT ON ("originalTransactionId") "originalTransactionId", "environment"
  FROM "AppStoreTransaction"
  ORDER BY "originalTransactionId", "purchaseDate" DESC
) latest
WHERE s."originalTransactionId" = latest."originalTransactionId";

-- 5. End server-granted trials (POST /subscriptions/trial granted PREMIUM
--    with no payment). Only rows with no Apple or Stripe backing qualify;
--    paid introductory trials always carry an originalTransactionId or a
--    stripeSubscriptionId.
WITH ended AS (
  UPDATE "Subscription"
  SET "tier" = 'FREE',
      "status" = 'EXPIRED',
      "isTrialing" = false,
      "updatedAt" = NOW()
  WHERE "isTrialing" = true
    AND "originalTransactionId" IS NULL
    AND "stripeSubscriptionId" IS NULL
  RETURNING "userId"
)
UPDATE "User" u
SET "subscriptionTier" = 'FREE',
    "isPremium" = false,
    "updatedAt" = NOW()
FROM ended
WHERE u."id" = ended."userId";

-- 6. Collapse tiers: every paid tier is PREMIUM. The PRO enum value stays for
--    one release so the previous image can still deserialize rows.
UPDATE "Subscription" SET "tier" = 'PREMIUM', "updatedAt" = NOW() WHERE "tier" = 'PRO';
UPDATE "User" SET "subscriptionTier" = 'PREMIUM', "updatedAt" = NOW() WHERE "subscriptionTier" = 'PRO';

-- 7. StoreKit appAccountToken per user. The volatile default backfills a
--    distinct UUID for every existing row; it is then dropped because Prisma
--    generates the value client-side (@default(uuid())).
ALTER TABLE "User" ADD COLUMN "appAccountToken" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "User" ALTER COLUMN "appAccountToken" DROP DEFAULT;
CREATE UNIQUE INDEX "User_appAccountToken_key" ON "User"("appAccountToken");
