-- The developer API free tier includes no enhancement requests
-- (20261124063000_api_free_tier_paid_only). The column default still handed
-- 100 requests to any row inserted without an explicit value, which a later
-- paid plan would read as purchased credits. A row now starts with none.
--
-- Catalog-only change: SET DEFAULT does not touch existing rows or rewrite
-- the table.

ALTER TABLE "ApiSubscription" ALTER COLUMN "includedRequests" SET DEFAULT 0;
