import { z } from 'zod';
import { SubscriptionTier, SubscriptionStatus, type Subscription } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { cache } from '../utils/redis.js';
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

const idList = z.preprocess(
  blankAsUnset,
  z
    .string()
    .default('')
    .transform(
      (value) =>
        new Set(
          value
            .split(',')
            .map((id) => id.trim())
            .filter((id) => id.length > 0),
        ),
    ),
);

const entitlementEnvSchema = z.object({
  HARD_PAYWALL_ENABLED: booleanFlag(true),
  FREE_DAILY_PROMPT_LIMIT: nonNegativeInt(10),
  PREMIUM_DAILY_GENERATION_SOFT_CAP: nonNegativeInt(300),
  SUPPORT_AI_DAILY_LIMIT: nonNegativeInt(20),
  APPLE_ACCEPT_SANDBOX_TRANSACTIONS: booleanFlag(true),
  APPLE_SANDBOX_ACCOUNT_MAX_AGE_DAYS: nonNegativeInt(14),
  APPLE_SANDBOX_ALLOWED_USER_IDS: idList,
});

export interface EntitlementConfig {
  isHardPaywallEnabled: boolean;
  freeDailyPromptLimit: number;
  premiumDailyGenerationSoftCap: number;
  supportAiDailyLimit: number;
  shouldAcceptSandboxTransactions: boolean;
  /** Sandbox purchases unlock only accounts younger than this (0: allow-list only). */
  sandboxAccountMaxAgeDays: number;
  /** Internal testers whose sandbox purchases always unlock. */
  sandboxAllowedUserIds: ReadonlySet<string>;
}

export function parseEntitlementConfig(env: NodeJS.ProcessEnv): EntitlementConfig {
  const parsed = entitlementEnvSchema.parse(env);
  return {
    isHardPaywallEnabled: parsed.HARD_PAYWALL_ENABLED,
    freeDailyPromptLimit: parsed.FREE_DAILY_PROMPT_LIMIT,
    premiumDailyGenerationSoftCap: parsed.PREMIUM_DAILY_GENERATION_SOFT_CAP,
    supportAiDailyLimit: parsed.SUPPORT_AI_DAILY_LIMIT,
    shouldAcceptSandboxTransactions: parsed.APPLE_ACCEPT_SANDBOX_TRANSACTIONS,
    sandboxAccountMaxAgeDays: parsed.APPLE_SANDBOX_ACCOUNT_MAX_AGE_DAYS,
    sandboxAllowedUserIds: parsed.APPLE_SANDBOX_ALLOWED_USER_IDS,
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
  /** Whether a Sandbox-environment subscription may unlock this account (see isSandboxTrustedAccount). */
  isSandboxTrusted: boolean;
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
  if (
    state.environment === 'Sandbox' &&
    !(entitlementConfig.shouldAcceptSandboxTransactions && state.isSandboxTrusted)
  ) {
    return false;
  }
  return true;
}

/**
 * Sandbox (TestFlight / App Review) purchases are free, yet the production
 * backend must accept them so App Review can complete a purchase. They only
 * unlock accounts created recently (reviewers sign in with a fresh Apple ID)
 * or listed internal testers, so a long-standing TestFlight tester cannot
 * keep real Premium for free by re-buying in the sandbox.
 */
export function isSandboxTrustedAccount(
  userId: string,
  accountCreatedAt: Date,
  now: Date = new Date(),
  config: Pick<
    EntitlementConfig,
    'sandboxAccountMaxAgeDays' | 'sandboxAllowedUserIds'
  > = entitlementConfig,
): boolean {
  if (config.sandboxAllowedUserIds.has(userId)) return true;
  const maxAgeMs = config.sandboxAccountMaxAgeDays * 86_400_000;
  return now.getTime() - accountCreatedAt.getTime() < maxAgeMs;
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
  v: z.literal(3),
  tier: z.nativeEnum(SubscriptionTier),
  status: z.nativeEnum(SubscriptionStatus),
  expiresAt: z.string().nullable(),
  isTrialing: z.boolean(),
  trialEndsAt: z.string().nullable(),
  productId: z.string().nullable(),
  environment: z.string().nullable(),
  isSandboxTrusted: z.boolean(),
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
  isSandboxTrusted: boolean;
}

const FREE_SNAPSHOT: SubscriptionSnapshot = {
  tier: SubscriptionTier.FREE,
  status: SubscriptionStatus.ACTIVE,
  expiresAt: null,
  isTrialing: false,
  trialEndsAt: null,
  productId: null,
  environment: null,
  isSandboxTrusted: false,
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
    isSandboxTrusted: parsed.data.isSandboxTrusted,
  };
}

async function writeCachedSnapshot(userId: string, snapshot: SubscriptionSnapshot): Promise<void> {
  const entry: CachedSubscription = {
    v: 3,
    tier: snapshot.tier,
    status: snapshot.status,
    expiresAt: snapshot.expiresAt?.toISOString() ?? null,
    isTrialing: snapshot.isTrialing,
    trialEndsAt: snapshot.trialEndsAt?.toISOString() ?? null,
    productId: snapshot.productId,
    environment: snapshot.environment,
    isSandboxTrusted: snapshot.isSandboxTrusted,
  };
  await cache.set(`sub:${userId}`, entry, SUBSCRIPTION_CACHE_TTL_SECONDS);
}

type SubscriptionWithAccount = Subscription & { user: { createdAt: Date } };

function snapshotFromRow(subscription: SubscriptionWithAccount, now: Date): SubscriptionSnapshot {
  const expiresAt = effectiveExpiry(subscription);
  const isSandboxTrusted = isSandboxTrustedAccount(
    subscription.userId,
    subscription.user.createdAt,
    now,
  );
  const entitled = isEntitled(
    {
      tier: subscription.tier,
      status: subscription.status,
      expiresAt,
      environment: subscription.environment,
      isSandboxTrusted,
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
    isSandboxTrusted,
  };
}

const withAccount = { user: { select: { createdAt: true } } } as const;

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
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: withAccount,
    });
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
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    include: withAccount,
  });
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
  const { isSandboxTrusted: _isSandboxTrusted, ...publicSnapshot } = snapshot;
  const entitled = isEntitled(snapshot);
  const dailyPromptsLimit = entitled
    ? -1
    : entitlementConfig.isHardPaywallEnabled
      ? 0
      : entitlementConfig.freeDailyPromptLimit;
  return {
    ...publicSnapshot,
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
// DAILY USAGE LEDGER (fair use, legacy allowance, support replies)
// ============================================================================

/**
 * Per-user UTC-day counters on the DailyUsage row. A unit is reserved
 * atomically before a provider call (one upsert-increment, compared with the
 * limit afterwards) and returned only when the call produced nothing, so
 * concurrent requests cannot all pass a stale read, a client that drops the
 * connection after receiving output is still charged, and an outage never
 * consumes allowance. Postgres is the single source of truth: there is no
 * fail-open path when Redis is unavailable.
 */
export type DailyUsageCounter = 'generation' | 'supportReply';

export interface UsageReservation {
  /** Units this reservation still holds. */
  readonly heldUnits: number;
  /** Returns `units` (default: everything still held). Safe to call repeatedly. */
  release(units?: number): Promise<void>;
}

export type UsageReservationResult =
  | { isAllowed: true; reservation: UsageReservation }
  | { isAllowed: false; resetAt: Date };

function nextUtcMidnight(now: Date = new Date()): Date {
  return new Date(utcMidnight(now).getTime() + 86_400_000);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === 'P2002';
}

async function incrementDailyUsage(
  counter: DailyUsageCounter,
  userId: string,
  date: Date,
  units: number,
): Promise<number> {
  const upsert = () =>
    prisma.dailyUsage.upsert({
      where: { userId_date: { userId, date } },
      update:
        counter === 'generation'
          ? { promptCount: { increment: units } }
          : { supportReplyCount: { increment: units } },
      create:
        counter === 'generation'
          ? { userId, date, promptCount: units }
          : { userId, date, supportReplyCount: units },
      select: { promptCount: true, supportReplyCount: true },
    });
  let row: { promptCount: number; supportReplyCount: number };
  try {
    row = await upsert();
  } catch (error) {
    // Two first-of-the-day requests can both try the INSERT; the loser's
    // retry takes the UPDATE path, which increments atomically.
    if (!isUniqueViolation(error)) throw error;
    row = await upsert();
  }
  return counter === 'generation' ? row.promptCount : row.supportReplyCount;
}

async function decrementDailyUsage(
  counter: DailyUsageCounter,
  userId: string,
  date: Date,
  units: number,
): Promise<void> {
  // The gte guard keeps a late release from driving the counter negative.
  await (counter === 'generation'
    ? prisma.dailyUsage.updateMany({
        where: { userId, date, promptCount: { gte: units } },
        data: { promptCount: { decrement: units } },
      })
    : prisma.dailyUsage.updateMany({
        where: { userId, date, supportReplyCount: { gte: units } },
        data: { supportReplyCount: { decrement: units } },
      }));
}

async function invalidateUsageCache(userId: string, date: Date): Promise<void> {
  await cache.invalidateDailyUsage(userId, utcDateKey(date));
}

export async function reserveDailyUsage(
  counter: DailyUsageCounter,
  userId: string,
  units: number,
  dailyLimit: number,
  now: Date = new Date(),
): Promise<UsageReservationResult> {
  if (!Number.isInteger(units) || units < 1) {
    throw new RangeError(`usage reservations need a positive whole number of units, got ${units}`);
  }
  const date = utcMidnight(now);
  const used = await incrementDailyUsage(counter, userId, date, units);
  if (used > dailyLimit) {
    await decrementDailyUsage(counter, userId, date, units);
    await invalidateUsageCache(userId, date);
    return { isAllowed: false, resetAt: nextUtcMidnight(now) };
  }
  await invalidateUsageCache(userId, date);

  let heldUnits = units;
  return {
    isAllowed: true,
    reservation: {
      get heldUnits() {
        return heldUnits;
      },
      async release(requested = heldUnits) {
        const returned = Math.min(Math.max(0, Math.floor(requested)), heldUnits);
        if (returned === 0) return;
        heldUnits -= returned;
        try {
          await decrementDailyUsage(counter, userId, date, returned);
          await invalidateUsageCache(userId, date);
        } catch (error) {
          // The user keeps a slightly lower allowance for the rest of the day;
          // never surface a refund failure as a request failure.
          logger.warn({ err: error, userId, counter, returned }, 'Failed to release daily usage');
        }
      },
    },
  };
}

/** Today's generation allowance for a resolved subscription. */
export function generationDailyLimit(info: Pick<SubscriptionInfo, 'isEntitled'>): number {
  if (info.isEntitled) return entitlementConfig.premiumDailyGenerationSoftCap;
  return entitlementConfig.isHardPaywallEnabled ? 0 : entitlementConfig.freeDailyPromptLimit;
}

/** Reserves `units` provider generations for a request whose subscription is already resolved. */
export function reserveGenerations(
  userId: string,
  units: number,
  info: Pick<SubscriptionInfo, 'isEntitled'>,
): Promise<UsageReservationResult> {
  return reserveDailyUsage('generation', userId, units, generationDailyLimit(info));
}

/** For background work (workflows, sandbox, variations) that runs outside a request. */
export async function reserveGenerationsForUser(
  userId: string,
  units: number,
): Promise<UsageReservationResult> {
  return reserveGenerations(userId, units, await getSubscriptionInfo(userId));
}

export interface StreamedGenerationCharge {
  /** Call whenever output is written to the client. */
  markDelivered(): void;
  /** For every non-success exit: returns the unit unless output already reached the client. */
  settleWithoutCompletion(): Promise<void>;
}

/**
 * Streams are charged when output is delivered, not when they complete
 * cleanly: a client that reads the tokens and drops the connection before the
 * final event still received the answer.
 */
export function trackStreamedGeneration(reservation: UsageReservation): StreamedGenerationCharge {
  let hasDeliveredOutput = false;
  return {
    markDelivered() {
      hasDeliveredOutput = true;
    },
    async settleWithoutCompletion() {
      if (!hasDeliveredOutput) await reservation.release();
    },
  };
}

/**
 * Charges one finished generation unconditionally. Only for work whose cost
 * is already incurred when it is counted (reflection jobs); request paths
 * reserve up front with reserveGenerations instead.
 */
export async function recordUsage(userId: string): Promise<void> {
  const date = utcMidnight();
  await incrementDailyUsage('generation', userId, date, 1);
  await invalidateUsageCache(userId, date);
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
