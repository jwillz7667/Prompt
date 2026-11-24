import { z } from 'zod';
import { SubscriptionTier, SubscriptionStatus, type Subscription } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { cache, getRedis, isRedisAvailable } from '../utils/redis.js';
import { logger, subscriptionLogger } from '../utils/logger.js';
import { sendSubscriptionExpired } from './emailService.js';

// ============================================================================
// CONFIGURATION (validated once at boot; an invalid value fails the import)
// ============================================================================

const blankAsUnset = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const booleanFlag = (defaultValue: boolean) =>
  z.preprocess(
    blankAsUnset,
    z
      .enum(['true', 'false'])
      .default(defaultValue ? 'true' : 'false')
      .transform((value) => value === 'true'),
  );

const nonNegativeInt = (defaultValue: number) =>
  z.preprocess(blankAsUnset, z.coerce.number().int().min(0).default(defaultValue));

const entitlementEnvSchema = z.object({
  HARD_PAYWALL_ENABLED: booleanFlag(true),
  FREE_DAILY_PROMPT_LIMIT: nonNegativeInt(10),
  PREMIUM_DAILY_GENERATION_SOFT_CAP: nonNegativeInt(300),
  SUPPORT_AI_DAILY_LIMIT: nonNegativeInt(20),
  APPLE_ACCEPT_SANDBOX_TRANSACTIONS: booleanFlag(true),
});

export interface EntitlementConfig {
  isHardPaywallEnabled: boolean;
  freeDailyPromptLimit: number;
  premiumDailyGenerationSoftCap: number;
  supportAiDailyLimit: number;
  shouldAcceptSandboxTransactions: boolean;
}

export function parseEntitlementConfig(env: NodeJS.ProcessEnv): EntitlementConfig {
  const parsed = entitlementEnvSchema.parse(env);
  return {
    isHardPaywallEnabled: parsed.HARD_PAYWALL_ENABLED,
    freeDailyPromptLimit: parsed.FREE_DAILY_PROMPT_LIMIT,
    premiumDailyGenerationSoftCap: parsed.PREMIUM_DAILY_GENERATION_SOFT_CAP,
    supportAiDailyLimit: parsed.SUPPORT_AI_DAILY_LIMIT,
    shouldAcceptSandboxTransactions: parsed.APPLE_ACCEPT_SANDBOX_TRANSACTIONS,
  };
}

export const entitlementConfig: EntitlementConfig = parseEntitlementConfig(process.env);

// ============================================================================
// TYPES
// ============================================================================

export interface TierFeatures {
  promptQuality: 'basic' | 'standard' | 'advanced';
  canExport: boolean;
  maxTokensPerPrompt: number;
}

export interface SubscriptionInfo {
  /** PREMIUM while entitled, FREE otherwise. PRO is never reported. */
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  expiresAt: Date | null;
  isTrialing: boolean;
  trialEndsAt: Date | null;
  productId: string | null;
  environment: string | null;
  isEntitled: boolean;
  dailyPromptsUsed: number;
  dailyPromptsLimit: number; // -1 = unlimited
  canPerformAction: boolean;
  features: TierFeatures;
}

/** The inputs that decide entitlement; expiresAt is the effective expiry (grace end while in grace). */
export interface EntitlementState {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  expiresAt: Date | null;
  environment: string | null;
}

// ============================================================================
// TIER CONFIGURATION
// ============================================================================

const FREE_FEATURES: TierFeatures = {
  promptQuality: 'basic',
  canExport: false,
  maxTokensPerPrompt: 4096,
};

const PREMIUM_FEATURES: TierFeatures = {
  promptQuality: 'advanced',
  canExport: true,
  maxTokensPerPrompt: 16384,
};

export const PREMIUM_MONTHLY_PRODUCT_ID = 'com.promptomizer.premium.monthly';

// Every product ever sold maps to the single PREMIUM entitlement; legacy Pro
// and annual subscribers are grandfathered until their subscription lapses.
const ENTITLED_PRODUCT_IDS: ReadonlySet<string> = new Set([
  PREMIUM_MONTHLY_PRODUCT_ID,
  'com.promptomizer.premium.annual',
  'com.promptomizer.pro.monthly',
  'com.promptomizer.pro.annual',
]);

export function getTierFromProductId(productId: string): SubscriptionTier {
  return ENTITLED_PRODUCT_IDS.has(productId) ? SubscriptionTier.PREMIUM : SubscriptionTier.FREE;
}

export function isEntitled(state: EntitlementState, now: Date = new Date()): boolean {
  if (state.tier === SubscriptionTier.FREE) return false;
  if (
    state.status !== SubscriptionStatus.ACTIVE &&
    state.status !== SubscriptionStatus.GRACE_PERIOD
  ) {
    return false;
  }
  if (!state.expiresAt || state.expiresAt.getTime() <= now.getTime()) return false;
  if (state.environment === 'Sandbox' && !entitlementConfig.shouldAcceptSandboxTransactions) {
    return false;
  }
  return true;
}

function effectiveExpiry(
  subscription: Pick<Subscription, 'status' | 'gracePeriodEndDate' | 'expiresAt'>,
): Date | null {
  return subscription.status === SubscriptionStatus.GRACE_PERIOD && subscription.gracePeriodEndDate
    ? subscription.gracePeriodEndDate
    : subscription.expiresAt;
}

function utcDateKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function utcMidnight(date: Date = new Date()): Date {
  const day = new Date(date);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

// ============================================================================
// SUBSCRIPTION INFO
// ============================================================================

// Cache key `sub:<userId>` is shared with cache.invalidateSubscription, which
// every mutation path reaches through invalidateSubscriptionCaches. TTL 300s.
// The `v` field versions the payload: entries written by an older build fail
// the schema and are treated as a miss instead of being misread.
const SUBSCRIPTION_CACHE_TTL_SECONDS = 300;
const cachedSubscriptionSchema = z.object({
  v: z.literal(2),
  tier: z.nativeEnum(SubscriptionTier),
  status: z.nativeEnum(SubscriptionStatus),
  expiresAt: z.string().nullable(),
  isTrialing: z.boolean(),
  trialEndsAt: z.string().nullable(),
  productId: z.string().nullable(),
  environment: z.string().nullable(),
});
type CachedSubscription = z.infer<typeof cachedSubscriptionSchema>;

interface SubscriptionSnapshot {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  expiresAt: Date | null;
  isTrialing: boolean;
  trialEndsAt: Date | null;
  productId: string | null;
  environment: string | null;
}

const FREE_SNAPSHOT: SubscriptionSnapshot = {
  tier: SubscriptionTier.FREE,
  status: SubscriptionStatus.ACTIVE,
  expiresAt: null,
  isTrialing: false,
  trialEndsAt: null,
  productId: null,
  environment: null,
};

async function readCachedSnapshot(userId: string): Promise<SubscriptionSnapshot | null> {
  const parsed = cachedSubscriptionSchema.safeParse(await cache.get<unknown>(`sub:${userId}`));
  if (!parsed.success) return null;
  return {
    tier: parsed.data.tier,
    status: parsed.data.status,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    isTrialing: parsed.data.isTrialing,
    trialEndsAt: parsed.data.trialEndsAt ? new Date(parsed.data.trialEndsAt) : null,
    productId: parsed.data.productId,
    environment: parsed.data.environment,
  };
}

async function writeCachedSnapshot(userId: string, snapshot: SubscriptionSnapshot): Promise<void> {
  const entry: CachedSubscription = {
    v: 2,
    tier: snapshot.tier,
    status: snapshot.status,
    expiresAt: snapshot.expiresAt?.toISOString() ?? null,
    isTrialing: snapshot.isTrialing,
    trialEndsAt: snapshot.trialEndsAt?.toISOString() ?? null,
    productId: snapshot.productId,
    environment: snapshot.environment,
  };
  await cache.set(`sub:${userId}`, entry, SUBSCRIPTION_CACHE_TTL_SECONDS);
}

function snapshotFromRow(subscription: Subscription, now: Date): SubscriptionSnapshot {
  const expiresAt = effectiveExpiry(subscription);
  const entitled = isEntitled(
    {
      tier: subscription.tier,
      status: subscription.status,
      expiresAt,
      environment: subscription.environment,
    },
    now,
  );
  return {
    tier: entitled ? SubscriptionTier.PREMIUM : SubscriptionTier.FREE,
    status: subscription.status,
    expiresAt,
    isTrialing:
      entitled &&
      subscription.isTrialing &&
      (!subscription.trialEndDate || subscription.trialEndDate > now),
    trialEndsAt: subscription.trialEndDate,
    productId: subscription.productId,
    environment: subscription.environment,
  };
}

function needsExpiryProcessing(
  subscription: Pick<Subscription, 'tier' | 'status' | 'gracePeriodEndDate' | 'expiresAt'>,
  now: Date,
): boolean {
  if (subscription.tier === SubscriptionTier.FREE) return false;
  if (
    subscription.status !== SubscriptionStatus.ACTIVE &&
    subscription.status !== SubscriptionStatus.GRACE_PERIOD
  ) {
    return false;
  }
  const expiry = effectiveExpiry(subscription);
  return expiry !== null && expiry <= now;
}

const MAX_SNAPSHOT_ATTEMPTS = 3;

async function loadSnapshotFromDatabase(userId: string): Promise<SubscriptionSnapshot> {
  for (let attempt = 0; attempt < MAX_SNAPSHOT_ATTEMPTS; attempt++) {
    const now = new Date();
    const subscription = await prisma.subscription.findUnique({ where: { userId } });
    if (!subscription) return FREE_SNAPSHOT;
    if (!needsExpiryProcessing(subscription, now)) return snapshotFromRow(subscription, now);

    // A missed DID_RENEW notification must not lock a paying user out:
    // confirm with Apple before downgrading an Apple-backed subscription.
    const isStillActiveAtApple =
      subscription.originalTransactionId !== null &&
      (await reconcileWithAppStore(
        userId,
        subscription.originalTransactionId,
        subscription.environment,
      ));
    if (!isStillActiveAtApple) await expireSubscription(subscription.id);
    // Re-read: reconciliation renewed it, we expired it, or a concurrent
    // renewal won the advisory lock.
  }
  const subscription = await prisma.subscription.findUnique({ where: { userId } });
  return subscription ? snapshotFromRow(subscription, new Date()) : FREE_SNAPSHOT;
}

async function reconcileWithAppStore(
  userId: string,
  originalTransactionId: string,
  environment: string | null,
): Promise<boolean> {
  // Loaded lazily: appleStoreService imports this module, and a static import
  // back would create a load-order cycle.
  const { reconcileAppStoreSubscription } = await import('./appleStoreService.js');
  return reconcileAppStoreSubscription(userId, originalTransactionId, environment);
}

async function getDailyPromptsUsed(userId: string): Promise<number> {
  const dateKey = utcDateKey();
  const cached = await cache.getDailyUsage(userId, dateKey);
  if (cached) return cached.promptCount;

  const usage = await prisma.dailyUsage.findUnique({
    where: { userId_date: { userId, date: utcMidnight() } },
    select: { promptCount: true },
  });
  const promptCount = usage?.promptCount ?? 0;
  await cache.setDailyUsage(userId, dateKey, { promptCount, date: dateKey });
  return promptCount;
}

export async function getSubscriptionInfo(userId: string): Promise<SubscriptionInfo> {
  const cached = await readCachedSnapshot(userId);
  // A cached entitlement whose expiry has passed must go back to the database
  // so the expiry/reconciliation path runs instead of serving a lapsed tier.
  const usableCache =
    cached !== null &&
    (cached.tier === SubscriptionTier.FREE ||
      (cached.expiresAt !== null && cached.expiresAt.getTime() > Date.now()))
      ? cached
      : null;
  const snapshot = usableCache ?? (await loadSnapshotFromDatabase(userId));
  if (!usableCache) await writeCachedSnapshot(userId, snapshot);

  const dailyPromptsUsed = await getDailyPromptsUsed(userId);
  return buildSubscriptionInfo(snapshot, dailyPromptsUsed);
}

function buildSubscriptionInfo(
  snapshot: SubscriptionSnapshot,
  dailyPromptsUsed: number,
): SubscriptionInfo {
  const entitled = isEntitled(snapshot);
  const dailyPromptsLimit = entitled
    ? -1
    : entitlementConfig.isHardPaywallEnabled
      ? 0
      : entitlementConfig.freeDailyPromptLimit;
  return {
    ...snapshot,
    tier: entitled ? SubscriptionTier.PREMIUM : SubscriptionTier.FREE,
    isTrialing: entitled && snapshot.isTrialing,
    isEntitled: entitled,
    dailyPromptsUsed,
    dailyPromptsLimit,
    canPerformAction: entitled || dailyPromptsUsed < dailyPromptsLimit,
    features: entitled ? PREMIUM_FEATURES : FREE_FEATURES,
  };
}

// ============================================================================
// DAILY COUNTERS (fair use + support replies)
// ============================================================================

export type DailyCounterScope = 'gen' | 'support';

// Keys: usage:<scope>:v1:<userId>:<yyyy-mm-dd UTC>. One key per UTC day, so
// no explicit invalidation is needed; the 48h TTL only garbage-collects.
const DAILY_COUNTER_TTL_SECONDS = 48 * 60 * 60;

interface CounterClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
}

function isCounterClient(value: unknown): value is CounterClient {
  return (
    typeof value === 'object' &&
    value !== null &&
    'incr' in value &&
    typeof value.incr === 'function' &&
    'expire' in value &&
    typeof value.expire === 'function' &&
    'get' in value &&
    typeof value.get === 'function'
  );
}

function counterClient(): CounterClient | null {
  if (!isRedisAvailable()) return null;
  const client = getRedis();
  return isCounterClient(client) ? client : null;
}

export function dailyCounterKey(
  scope: DailyCounterScope,
  userId: string,
  now: Date = new Date(),
): string {
  return `usage:${scope}:v1:${userId}:${utcDateKey(now)}`;
}

/** Today's count, or null when Redis is unavailable (callers choose their fallback). */
export async function getDailyCounter(
  scope: DailyCounterScope,
  userId: string,
): Promise<number | null> {
  const client = counterClient();
  if (!client) return null;
  try {
    const value = await client.get(dailyCounterKey(scope, userId));
    return value ? Number.parseInt(value, 10) || 0 : 0;
  } catch (error) {
    logger.warn({ err: error, scope, userId }, 'Failed to read daily usage counter');
    return null;
  }
}

export async function incrementDailyCounter(
  scope: DailyCounterScope,
  userId: string,
): Promise<void> {
  const client = counterClient();
  if (!client) return;
  const key = dailyCounterKey(scope, userId);
  try {
    await client.incr(key);
    await client.expire(key, DAILY_COUNTER_TTL_SECONDS);
  } catch (error) {
    logger.warn({ err: error, scope, userId }, 'Failed to increment daily usage counter');
  }
}

/**
 * Today's successful generations for fair-use purposes. Redis holds the
 * atomic counter; without Redis the Postgres daily usage row (charged by the
 * same recordUsage call) is the fallback source.
 */
export async function getGenerationCountToday(
  userId: string,
  dailyPromptsUsed: number,
): Promise<number> {
  return (await getDailyCounter('gen', userId)) ?? dailyPromptsUsed;
}

/** Charges one successful generation. Call only after the provider succeeded. */
export async function recordUsage(userId: string): Promise<void> {
  const today = utcMidnight();
  await prisma.dailyUsage.upsert({
    where: { userId_date: { userId, date: today } },
    update: { promptCount: { increment: 1 } },
    create: { userId, date: today, promptCount: 1 },
  });
  await Promise.all([
    cache.invalidateDailyUsage(userId, utcDateKey(today)),
    incrementDailyCounter('gen', userId),
  ]);
}

// ============================================================================
// SUBSCRIPTION UPDATES
// ============================================================================

export async function handleGracePeriod(userId: string, gracePeriodEndDate: Date): Promise<void> {
  await prisma.subscription.updateMany({
    where: { userId },
    data: {
      status: SubscriptionStatus.GRACE_PERIOD,
      gracePeriodEndDate,
    },
  });

  await invalidateSubscriptionCaches(userId);
}

export async function ensureSubscriptionExists(userId: string): Promise<void> {
  await prisma.subscription.upsert({
    where: { userId },
    update: {},
    create: { userId, tier: SubscriptionTier.FREE, status: SubscriptionStatus.ACTIVE },
  });
}

// ============================================================================
// CACHE INVALIDATION
// ============================================================================

// Invalidate every cache entry whose value derives from a user's subscription
// tier. Any path that mutates a subscription or a user's tier (webhooks, App
// Store verification, expiration job, manual updates) MUST call this so the
// next `getSubscriptionInfo` reads fresh data instead of serving a stale tier
// for up to the cache TTL. Best-effort: a Redis failure must never break the
// mutation that just succeeded in Postgres.
export async function invalidateSubscriptionCaches(userId: string): Promise<void> {
  try {
    await Promise.all([cache.invalidateSubscription(userId), cache.invalidateUser(userId)]);
  } catch (error) {
    logger.warn({ error, userId }, 'Failed to invalidate subscription caches');
  }
}

// ============================================================================
// EXPIRATION HANDLING
// ============================================================================

async function expireSubscription(subscriptionId: string): Promise<boolean> {
  const expired = await prisma.$transaction(async (tx) => {
    const owner = await tx.subscription.findUnique({
      where: { id: subscriptionId },
      select: { userId: true },
    });
    if (!owner) return null;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`subscription:${owner.userId}`}, 0))`;
    // Recheck after acquiring the same lock as purchase/renewal processing.
    const current = await tx.subscription.findUnique({
      where: { id: subscriptionId },
      include: { user: true },
    });
    if (!current || !needsExpiryProcessing(current, new Date())) return null;
    await tx.subscription.update({
      where: { id: subscriptionId },
      data: {
        tier: SubscriptionTier.FREE,
        status: SubscriptionStatus.EXPIRED,
        isTrialing: false,
        gracePeriodEndDate: null,
      },
    });
    await tx.user.update({
      where: { id: current.userId },
      data: { subscriptionTier: SubscriptionTier.FREE, isPremium: false },
    });
    return current;
  });
  if (!expired) return false;
  await invalidateSubscriptionCaches(expired.userId);
  sendSubscriptionExpired(expired.user.email, expired.user.name, SubscriptionTier.PREMIUM).catch(
    (error) => {
      logger.warn(
        { error, userId: expired.userId },
        'Failed to send subscription expiration email',
      );
    },
  );
  return true;
}

const EXPIRY_BATCH_SIZE = 100;

/**
 * Downgrades every lapsed subscription, confirming Apple-backed ones with the
 * App Store first. Runs hourly from the queue; walks id-ordered batches of
 * EXPIRY_BATCH_SIZE one subscription at a time, so a large backlog cannot
 * flood Postgres or the App Store Server API.
 */
export async function processExpiredSubscriptions(): Promise<number> {
  const now = new Date();
  let processed = 0;
  let cursor: string | undefined;

  for (;;) {
    // ACTIVE branch is served by the (status, expiresAt) index; the grace
    // branches are narrowed by status first and are a small population.
    const batch = await prisma.subscription.findMany({
      where: {
        tier: { not: SubscriptionTier.FREE },
        OR: [
          { status: SubscriptionStatus.ACTIVE, expiresAt: { lt: now } },
          { status: SubscriptionStatus.GRACE_PERIOD, gracePeriodEndDate: { lt: now } },
          {
            status: SubscriptionStatus.GRACE_PERIOD,
            gracePeriodEndDate: null,
            expiresAt: { lt: now },
          },
        ],
      },
      orderBy: { id: 'asc' },
      take: EXPIRY_BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, userId: true, originalTransactionId: true, environment: true },
    });
    if (batch.length === 0) break;

    for (const subscription of batch) {
      try {
        const isStillActiveAtApple =
          subscription.originalTransactionId !== null &&
          (await reconcileWithAppStore(
            subscription.userId,
            subscription.originalTransactionId,
            subscription.environment,
          ));
        if (!isStillActiveAtApple && (await expireSubscription(subscription.id))) processed++;
      } catch (error) {
        subscriptionLogger.error(
          { err: error, subscriptionId: subscription.id },
          'Failed to process expired subscription',
        );
      }
    }

    cursor = batch[batch.length - 1]?.id;
    if (batch.length < EXPIRY_BATCH_SIZE) break;
  }

  return processed;
}

// ============================================================================
// PRODUCTS
// ============================================================================

/** The only product on sale. Free trials are Apple introductory offers, never server-granted. */
export function getAvailableProducts() {
  return [
    {
      productId: PREMIUM_MONTHLY_PRODUCT_ID,
      tier: SubscriptionTier.PREMIUM,
      name: 'Premium Monthly',
      price: 9.99,
      period: 'month',
      features: PREMIUM_FEATURES,
    },
  ];
}
