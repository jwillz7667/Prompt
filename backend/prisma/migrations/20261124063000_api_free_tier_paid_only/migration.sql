-- The developer API free tier no longer includes enhancement requests; only
-- an active paid plan may reach a model.
--
-- Free rows used to store a 100-request monthly allowance in
-- "includedRequests", with any purchased credit-pack balance stacked on top
-- (prepaid credits = includedRequests - GREATEST(currentPeriodUsage, 100)).
-- With the allowance now 0, keep only the unspent purchased credits so they
-- carry over when the developer subscribes, and zero the period counter that
-- consumed the old allowance.
--
-- Data-only: touches API_FREE rows (a small table keyed by developer), no DDL,
-- no table rewrite. Unlimited (-1) rows are left alone.

UPDATE "ApiSubscription"
SET "includedRequests" = GREATEST(0, "includedRequests" - GREATEST("currentPeriodUsage", 100)),
    "currentPeriodUsage" = 0
WHERE "tier" = 'API_FREE'
  AND "includedRequests" >= 0;
