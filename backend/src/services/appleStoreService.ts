import { z } from 'zod';
import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  VerificationException,
  VerificationStatus,
  type JWSTransactionDecodedPayload,
  NotificationTypeV2,
  OfferDiscountType,
  OfferType,
  Status,
  Subtype,
} from '@apple/app-store-server-library';
import { SubscriptionStatus, SubscriptionTier } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { cache } from '../utils/redis.js';
import { storeLogger } from '../utils/logger.js';
import {
  entitlementConfig,
  getTierFromProductId,
  invalidateSubscriptionCaches,
  isEntitled,
} from './subscriptionService.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const APPLE_BUNDLE_ID = process.env['APPLE_BUNDLE_ID'] || 'com.res.promptomizer';
const APPLE_APP_ID = process.env['APPLE_APP_ID'] || '';

const environment =
  process.env['NODE_ENV'] === 'production' ? Environment.PRODUCTION : Environment.SANDBOX;

// TestFlight builds always produce Sandbox-signed transactions, so a
// production-pinned verifier rejects every TestFlight purchase. Sandbox JWS
// are still Apple-signed and bundle-id checked; only builds provisioned by
// this team (TestFlight/dev) can mint them. Trade-off accepted knowingly:
// TestFlight testers get entitlements without being charged (IAP is always
// free in TestFlight). The environment is persisted on Subscription so
// APPLE_ACCEPT_SANDBOX_TRANSACTIONS=false also revokes existing sandbox
// entitlements (see isEntitled).
const ACCEPT_SANDBOX_TRANSACTIONS = entitlementConfig.shouldAcceptSandboxTransactions;

// App Store Server API credentials (In-App Purchase key from App Store
// Connect). Optional: signed-payload verification does not need them, only
// status reconciliation and test notifications do. The APPLE_IAP_* names are
// preferred; the older APPLE_* names are still honoured.
const appStoreServerApiCredentialsSchema = z.object({
  issuerId: z.string().trim().min(1),
  keyId: z.string().trim().min(1),
  privateKey: z.string().trim().min(1),
});

const appStoreServerApiCredentials = (() => {
  const parsed = appStoreServerApiCredentialsSchema.safeParse({
    issuerId: process.env['APPLE_IAP_ISSUER_ID'] || process.env['APPLE_ISSUER_ID'],
    keyId: process.env['APPLE_IAP_KEY_ID'] || process.env['APPLE_KEY_ID'],
    // Escaped \n is how multi-line keys survive Railway/Vercel env vars.
    privateKey: (process.env['APPLE_IAP_PRIVATE_KEY'] || process.env['APPLE_PRIVATE_KEY'])?.replace(
      /\\n/g,
      '\n',
    ),
  });
  return parsed.success ? parsed.data : null;
})();

storeLogger.info(
  { isReconciliationEnabled: appStoreServerApiCredentials !== null },
  appStoreServerApiCredentials
    ? 'BOOT: App Store subscription reconciliation enabled'
    : 'BOOT: App Store subscription reconciliation disabled (APPLE_IAP_ISSUER_ID/APPLE_IAP_KEY_ID/APPLE_IAP_PRIVATE_KEY not set)',
);

export class AppStoreApiNotConfiguredError extends Error {
  constructor() {
    super('App Store Server API credentials are not configured');
    this.name = 'AppStoreApiNotConfiguredError';
  }
}

// Root CA certificates for App Store (embedded for reliability)
const APPLE_ROOT_CA_G3 = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

// ============================================================================
// API CLIENT INITIALIZATION
// ============================================================================

const apiClientsByEnvironment = new Map<Environment, AppStoreServerAPIClient>();
const verifiersByEnvironment = new Map<Environment, SignedDataVerifier>();

function getApiClient(targetEnvironment: Environment = environment): AppStoreServerAPIClient {
  if (!appStoreServerApiCredentials) throw new AppStoreApiNotConfiguredError();
  let client = apiClientsByEnvironment.get(targetEnvironment);
  if (!client) {
    client = new AppStoreServerAPIClient(
      appStoreServerApiCredentials.privateKey,
      appStoreServerApiCredentials.keyId,
      appStoreServerApiCredentials.issuerId,
      APPLE_BUNDLE_ID,
      targetEnvironment,
    );
    apiClientsByEnvironment.set(targetEnvironment, client);
  }
  return client;
}

function getSignedDataVerifier(targetEnvironment: Environment = environment): SignedDataVerifier {
  let verifier = verifiersByEnvironment.get(targetEnvironment);
  if (!verifier) {
    verifier = new SignedDataVerifier(
      [Buffer.from(APPLE_ROOT_CA_G3)],
      true, // Enable online checks
      targetEnvironment,
      APPLE_BUNDLE_ID,
      // Apple docs: appAppleId is omitted in the sandbox environment
      targetEnvironment === Environment.SANDBOX
        ? undefined
        : APPLE_APP_ID
          ? parseInt(APPLE_APP_ID, 10)
          : undefined,
    );
    verifiersByEnvironment.set(targetEnvironment, verifier);
  }
  return verifier;
}

function isSandboxPayloadRejection(error: unknown): boolean {
  // Transactions fail with INVALID_ENVIRONMENT. Notifications fail earlier
  // with INVALID_APP_IDENTIFIER: the production verifier compares its
  // configured appAppleId against the payload's, and sandbox notification
  // payloads omit appAppleId entirely, so that check throws before the
  // environment check is ever reached.
  return (
    error instanceof VerificationException &&
    (error.status === VerificationStatus.INVALID_ENVIRONMENT ||
      error.status === VerificationStatus.INVALID_APP_IDENTIFIER)
  );
}

/**
 * Runs a verification against the primary environment, retrying against
 * SANDBOX when the payload was signed for the other environment (TestFlight
 * purchases hitting a production server). Returns the environment that
 * actually verified so nested payloads can be decoded consistently.
 */
async function verifyWithEnvironmentFallback<T>(
  verify: (verifier: SignedDataVerifier) => Promise<T>,
): Promise<{ payload: T; verifiedEnvironment: Environment }> {
  try {
    return { payload: await verify(getSignedDataVerifier()), verifiedEnvironment: environment };
  } catch (error) {
    if (
      environment === Environment.PRODUCTION &&
      ACCEPT_SANDBOX_TRANSACTIONS &&
      isSandboxPayloadRejection(error)
    ) {
      storeLogger.info(
        'Payload rejected by production verifier - retrying with sandbox verifier (TestFlight purchase)',
      );
      try {
        return {
          payload: await verify(getSignedDataVerifier(Environment.SANDBOX)),
          verifiedEnvironment: Environment.SANDBOX,
        };
      } catch {
        // The payload is neither valid production nor valid sandbox data:
        // the original production error is the meaningful one.
        throw error;
      }
    }
    throw error;
  }
}

// ============================================================================
// TRANSACTION VERIFICATION
// ============================================================================

export interface VerifiedTransaction {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  purchaseDate: Date;
  expirationDate: Date | null;
  isUpgraded: boolean;
  revocationDate: Date | null;
  type: string;
  environment: string;
  /** 1 introductory, 2 promotional, 3 offer code, 4 win-back. */
  offerType?: number | null;
  offerDiscountType?: string | null;
  /** Lowercased StoreKit appAccountToken, when the purchase carried one. */
  appAccountToken?: string | null;
}

const uuidSchema = z.string().uuid();

function normalizeAppAccountToken(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  return uuidSchema.safeParse(normalized).success ? normalized : null;
}

function toVerifiedTransaction(decoded: JWSTransactionDecodedPayload): VerifiedTransaction {
  return {
    transactionId: decoded.transactionId || '',
    originalTransactionId: decoded.originalTransactionId || '',
    productId: decoded.productId || '',
    purchaseDate: decoded.purchaseDate ? new Date(decoded.purchaseDate) : new Date(),
    expirationDate: decoded.expiresDate ? new Date(decoded.expiresDate) : null,
    isUpgraded: decoded.isUpgraded || false,
    revocationDate: decoded.revocationDate ? new Date(decoded.revocationDate) : null,
    type: decoded.type || 'UNKNOWN',
    environment: decoded.environment || 'UNKNOWN',
    offerType: decoded.offerType ?? null,
    offerDiscountType: decoded.offerDiscountType ?? null,
    appAccountToken: normalizeAppAccountToken(decoded.appAccountToken),
  };
}

export async function verifySignedTransaction(
  signedTransaction: string,
): Promise<VerifiedTransaction> {
  // Production first, sandbox fallback for TestFlight purchases.
  const { payload } = await verifyWithEnvironmentFallback((verifier) =>
    verifier.verifyAndDecodeTransaction(signedTransaction),
  );
  return toVerifiedTransaction(payload);
}

export function isIntroductoryFreeTrial(transaction: VerifiedTransaction): boolean {
  return (
    transaction.offerType === OfferType.INTRODUCTORY_OFFER &&
    transaction.offerDiscountType === OfferDiscountType.FREE_TRIAL
  );
}

// ============================================================================
// RECEIPT PROCESSING
// ============================================================================

export class PurchaseValidationError extends Error {
  constructor(
    message: string,
    readonly code: 'TRANSACTION_INVALID' | 'TRANSACTION_OWNED_BY_ANOTHER_USER',
    readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'PurchaseValidationError';
  }
}

function ownedByAnotherUserError(): PurchaseValidationError {
  return new PurchaseValidationError(
    'This purchase is linked to another account',
    'TRANSACTION_OWNED_BY_ANOTHER_USER',
    409,
  );
}

export function validateSubscriptionTransaction(
  transaction: VerifiedTransaction,
): asserts transaction is VerifiedTransaction & { expirationDate: Date } {
  if (
    !transaction.transactionId ||
    !transaction.originalTransactionId ||
    getTierFromProductId(transaction.productId) === SubscriptionTier.FREE ||
    transaction.type !== 'Auto-Renewable Subscription' ||
    !transaction.expirationDate ||
    !Number.isFinite(transaction.expirationDate.getTime()) ||
    !Number.isFinite(transaction.purchaseDate.getTime())
  ) {
    throw new PurchaseValidationError('Invalid subscription transaction', 'TRANSACTION_INVALID');
  }
}

export interface TransactionProcessingOptions {
  /** REFUND_REVERSED: Apple reinstated a refunded transaction. */
  shouldClearRevocation?: boolean;
  /** The subscription is in Apple's billing grace period until this date. */
  gracePeriodEndDate?: Date;
  /** EXPIRED / GRACE_PERIOD_EXPIRED: Apple says the entitlement has ended. */
  shouldForceExpire?: boolean;
}

export async function processVerifiedTransaction(
  userId: string,
  transaction: VerifiedTransaction,
  options: TransactionProcessingOptions = {},
): Promise<void> {
  validateSubscriptionTransaction(transaction);

  await prisma.$transaction(async (tx) => {
    // Serialize claims across devices/users. Ownership checks and entitlement writes
    // must commit together so a replay cannot grant the same purchase twice.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`appstore:${transaction.originalTransactionId}`}, 0))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`subscription:${userId}`}, 0))`;

    if (transaction.appAccountToken) {
      const tokenOwner = await tx.user.findUnique({
        where: { appAccountToken: transaction.appAccountToken },
        select: { id: true },
      });
      if (tokenOwner && tokenOwner.id !== userId) throw ownedByAnotherUserError();
    }

    const [owner, subscriptionOwner, current, latestTransaction, existingTransaction] =
      await Promise.all([
        tx.appStoreTransaction.findFirst({
          where: {
            OR: [
              { transactionId: transaction.transactionId },
              { originalTransactionId: transaction.originalTransactionId },
            ],
            userId: { not: userId },
          },
          select: { userId: true },
        }),
        tx.subscription.findUnique({
          where: { originalTransactionId: transaction.originalTransactionId },
          select: { userId: true },
        }),
        tx.subscription.findUnique({ where: { userId } }),
        tx.appStoreTransaction.findFirst({ where: { userId }, orderBy: { purchaseDate: 'desc' } }),
        tx.appStoreTransaction.findUnique({ where: { transactionId: transaction.transactionId } }),
      ]);
    const competingOwnerIds = [owner?.userId, subscriptionOwner?.userId].filter(
      (id): id is string => id !== undefined && id !== userId,
    );
    if (competingOwnerIds.length > 0) {
      // A claim by an account that no longer exists is not a claim; the FK
      // cascade normally removes such rows, this covers the delete race.
      const liveOwners = await tx.user.count({ where: { id: { in: competingOwnerIds } } });
      if (liveOwners > 0) throw ownedByAnotherUserError();
    }
    if (existingTransaction && existingTransaction.userId !== userId) {
      // Only reachable when the previous owner was deleted mid-flight.
      await tx.appStoreTransaction.delete({ where: { id: existingTransaction.id } });
    }

    // A replay of a pre-refund JWS must not undo a verified revocation; only
    // REFUND_REVERSED may clear it.
    const revocationDate = options.shouldClearRevocation
      ? null
      : transaction.revocationDate ||
        (existingTransaction?.userId === userId ? existingTransaction.revocationDate : null) ||
        null;
    const offerFields = {
      offerType: transaction.offerType ?? null,
      offerDiscountType: transaction.offerDiscountType ?? null,
    };
    await tx.appStoreTransaction.upsert({
      where: { transactionId: transaction.transactionId },
      update: {
        expirationDate: transaction.expirationDate,
        revocationDate,
        ...offerFields,
      },
      create: {
        userId,
        transactionId: transaction.transactionId,
        originalTransactionId: transaction.originalTransactionId,
        productId: transaction.productId,
        type: transaction.type,
        purchaseDate: transaction.purchaseDate,
        expirationDate: transaction.expirationDate,
        revocationDate,
        environment: transaction.environment,
        ...offerFields,
      },
    });

    // An old restore/notification must not replace a newer renewal or an upgrade.
    if (
      transaction.isUpgraded ||
      (latestTransaction && latestTransaction.purchaseDate > transaction.purchaseDate) ||
      (current?.stripeSubscriptionId &&
        !current.originalTransactionId &&
        current.tier !== SubscriptionTier.FREE &&
        current.expiresAt &&
        current.expiresAt > new Date())
    ) {
      return;
    }

    const now = new Date();
    const isWithinPeriod = transaction.expirationDate > now;
    const isInGracePeriod =
      !isWithinPeriod &&
      options.gracePeriodEndDate !== undefined &&
      options.gracePeriodEndDate > now;
    const active =
      !options.shouldForceExpire && !revocationDate && (isWithinPeriod || isInGracePeriod);
    const isTrial = isIntroductoryFreeTrial(transaction);
    const tier = active ? getTierFromProductId(transaction.productId) : SubscriptionTier.FREE;
    const data = {
      tier,
      status: revocationDate
        ? SubscriptionStatus.CANCELED
        : !active
          ? SubscriptionStatus.EXPIRED
          : isWithinPeriod
            ? SubscriptionStatus.ACTIVE
            : SubscriptionStatus.GRACE_PERIOD,
      productId: transaction.productId,
      originalTransactionId: transaction.originalTransactionId,
      environment: transaction.environment,
      stripeSubscriptionId: null,
      stripePriceId: null,
      cancelAtPeriodEnd: false,
      expiresAt: transaction.expirationDate,
      // A transaction doesn't describe renewal intent. Preserve the last verified
      // renewal state until a renewal-status notification arrives.
      autoRenewEnabled: active && (current?.autoRenewEnabled ?? true),
      isTrialing: active && isTrial,
      trialEndDate: isTrial ? transaction.expirationDate : null,
      hasUsedTrial: isTrial || (current?.hasUsedTrial ?? false),
      gracePeriodEndDate: active && isInGracePeriod ? (options.gracePeriodEndDate ?? null) : null,
    };
    await tx.subscription.upsert({ where: { userId }, update: data, create: { userId, ...data } });
    await tx.user.update({
      where: { id: userId },
      data: { subscriptionTier: tier, isPremium: active },
    });
  });
  await invalidateSubscriptionCaches(userId);
}

// ============================================================================
// RECONCILIATION (App Store Server API)
// ============================================================================

const RECONCILIATION_TIMEOUT_MS = 3_000;
// Negative cache: a user Apple confirmed as lapsed (or an Apple outage) is not
// re-queried for 10 minutes. Invalidated implicitly by TTL; a purchase writes
// the subscription directly and never consults this key.
const RECONCILIATION_NEGATIVE_TTL_SECONDS = 600;

function reconciliationCacheKey(userId: string): string {
  return `sub:recon:v1:${userId}`;
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`App Store request timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Asks Apple whether an apparently-expired subscription actually renewed
 * (missed DID_RENEW) or is in billing grace, and applies the result. Returns
 * true only when the user is entitled afterwards. Disabled (returns false)
 * when the In-App Purchase API key is not configured.
 */
export async function reconcileAppStoreSubscription(
  userId: string,
  originalTransactionId: string,
  subscriptionEnvironment: string | null,
): Promise<boolean> {
  if (!appStoreServerApiCredentials) return false;
  const negativeKey = reconciliationCacheKey(userId);
  if ((await cache.get<unknown>(negativeKey)) !== null) return false;

  const targetEnvironment =
    subscriptionEnvironment === 'Sandbox' ? Environment.SANDBOX : Environment.PRODUCTION;
  try {
    const response = await withTimeout(
      getApiClient(targetEnvironment).getAllSubscriptionStatuses(originalTransactionId, [
        Status.ACTIVE,
        Status.BILLING_GRACE_PERIOD,
      ]),
      RECONCILIATION_TIMEOUT_MS,
    );
    const verifier = getSignedDataVerifier(targetEnvironment);
    for (const group of response.data ?? []) {
      for (const item of group.lastTransactions ?? []) {
        if (item.originalTransactionId !== originalTransactionId || !item.signedTransactionInfo) {
          continue;
        }
        const transaction = toVerifiedTransaction(
          await verifier.verifyAndDecodeTransaction(item.signedTransactionInfo),
        );
        let gracePeriodEndDate: Date | undefined;
        if (item.status === Status.BILLING_GRACE_PERIOD && item.signedRenewalInfo) {
          const renewal = await verifier.verifyAndDecodeRenewalInfo(item.signedRenewalInfo);
          if (renewal.gracePeriodExpiresDate) {
            gracePeriodEndDate = new Date(renewal.gracePeriodExpiresDate);
          }
        } else if (item.status !== Status.ACTIVE) {
          continue;
        }
        await processVerifiedTransaction(userId, transaction, { gracePeriodEndDate });
        const refreshed = await prisma.subscription.findUnique({ where: { userId } });
        if (
          refreshed &&
          isEntitled({
            tier: refreshed.tier,
            status: refreshed.status,
            expiresAt:
              refreshed.status === SubscriptionStatus.GRACE_PERIOD && refreshed.gracePeriodEndDate
                ? refreshed.gracePeriodEndDate
                : refreshed.expiresAt,
            environment: refreshed.environment,
          })
        ) {
          storeLogger.info({ userId }, 'Reconciled lapsed subscription with App Store');
          return true;
        }
      }
    }
  } catch (error) {
    storeLogger.warn({ err: error, userId }, 'App Store reconciliation failed; treating as lapsed');
  }
  await cache.set(negativeKey, true, RECONCILIATION_NEGATIVE_TTL_SECONDS);
  return false;
}

// ============================================================================
// APP STORE SERVER NOTIFICATIONS V2
// ============================================================================

async function resolveNotificationUser(transaction: VerifiedTransaction): Promise<string | null> {
  const existingTransaction = await prisma.appStoreTransaction.findFirst({
    where: { originalTransactionId: transaction.originalTransactionId },
    select: { userId: true },
  });
  if (existingTransaction) return existingTransaction.userId;

  const subscription = await prisma.subscription.findUnique({
    where: { originalTransactionId: transaction.originalTransactionId },
    select: { userId: true },
  });
  if (subscription) return subscription.userId;

  // First notification for a purchase whose /verify call never arrived
  // (app killed mid-purchase): attribute it through the purchase's token.
  if (transaction.appAccountToken) {
    const user = await prisma.user.findUnique({
      where: { appAccountToken: transaction.appAccountToken },
      select: { id: true },
    });
    if (user) return user.id;
  }
  return null;
}

/**
 * True when the user's subscription is backed by something other than this
 * transaction and that other entitlement is still the better one, so this
 * notification must not overwrite it.
 */
async function isSupersededNotification(
  userId: string,
  transaction: VerifiedTransaction,
): Promise<boolean> {
  const current = await prisma.subscription.findUnique({ where: { userId } });
  if (!current) return false;
  const currentExpiry =
    current.status === SubscriptionStatus.GRACE_PERIOD && current.gracePeriodEndDate
      ? current.gracePeriodEndDate
      : current.expiresAt;
  const isCurrentEntitled = isEntitled({
    tier: current.tier,
    status: current.status,
    expiresAt: currentExpiry,
    environment: current.environment,
  });
  if (current.stripeSubscriptionId && !current.originalTransactionId) return isCurrentEntitled;
  if (
    current.originalTransactionId &&
    current.originalTransactionId !== transaction.originalTransactionId
  ) {
    return (
      isCurrentEntitled &&
      currentExpiry !== null &&
      (transaction.expirationDate === null || currentExpiry >= transaction.expirationDate)
    );
  }
  return false;
}

export async function processAppStoreNotification(
  signedPayload: string,
): Promise<{ success: boolean; message: string }> {
  try {
    // Production first, sandbox fallback (Apple sends Sandbox-signed
    // notifications for TestFlight purchases). Nested payloads below must be
    // decoded with the same environment.
    const { payload: notification, verifiedEnvironment } = await verifyWithEnvironmentFallback(
      (verifier) => verifier.verifyAndDecodeNotification(signedPayload),
    );
    const verifier = getSignedDataVerifier(verifiedEnvironment);

    const notificationType = notification.notificationType;
    const subtype = notification.subtype;
    const data = notification.data;

    storeLogger.info(
      { notificationType, subtype: subtype || 'none' },
      'Processing App Store notification',
    );

    if (notificationType === NotificationTypeV2.RENEWAL_EXTENSION) {
      // Mass-extension summary: the per-subscription RENEWAL_EXTENDED
      // notifications carry the transactions that change entitlement.
      storeLogger.info(
        { subtype: subtype || 'none', summary: notification.summary },
        'Renewal extension summary received',
      );
      return { success: true, message: `Processed ${notificationType}` };
    }

    const transaction = data?.signedTransactionInfo
      ? toVerifiedTransaction(await verifier.verifyAndDecodeTransaction(data.signedTransactionInfo))
      : null;
    if (!transaction) {
      storeLogger.warn({ notificationType }, 'Notification carried no transaction');
      return { success: true, message: 'No transaction, notification acknowledged' };
    }

    const userId = await resolveNotificationUser(transaction);
    if (!userId) {
      storeLogger.warn(
        { notificationType, originalTransactionId: transaction.originalTransactionId },
        'Could not find user for notification',
      );
      return { success: true, message: 'User not found, notification acknowledged' };
    }

    if (await isSupersededNotification(userId, transaction)) {
      return { success: true, message: 'Ignored superseded subscription notification' };
    }

    switch (notificationType) {
      case NotificationTypeV2.SUBSCRIBED:
      case NotificationTypeV2.DID_RENEW:
      case NotificationTypeV2.OFFER_REDEEMED:
      case NotificationTypeV2.RENEWAL_EXTENDED:
        await processVerifiedTransaction(userId, transaction);
        break;

      case NotificationTypeV2.REFUND_REVERSED:
        await processVerifiedTransaction(
          userId,
          { ...transaction, revocationDate: null },
          { shouldClearRevocation: true },
        );
        break;

      case NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS:
        if (subtype === Subtype.AUTO_RENEW_DISABLED || subtype === Subtype.AUTO_RENEW_ENABLED) {
          await prisma.subscription.updateMany({
            where: { userId, originalTransactionId: transaction.originalTransactionId },
            data: { autoRenewEnabled: subtype === Subtype.AUTO_RENEW_ENABLED },
          });
          await invalidateSubscriptionCaches(userId);
        }
        break;

      case NotificationTypeV2.EXPIRED:
      case NotificationTypeV2.GRACE_PERIOD_EXPIRED:
        await processVerifiedTransaction(userId, transaction, { shouldForceExpire: true });
        break;

      case NotificationTypeV2.DID_FAIL_TO_RENEW:
        if (subtype === Subtype.GRACE_PERIOD && data?.signedRenewalInfo) {
          const renewalInfo = await verifier.verifyAndDecodeRenewalInfo(data.signedRenewalInfo);
          if (renewalInfo.gracePeriodExpiresDate) {
            await processVerifiedTransaction(userId, transaction, {
              gracePeriodEndDate: new Date(renewalInfo.gracePeriodExpiresDate),
            });
          }
        }
        break;

      case NotificationTypeV2.REFUND:
      case NotificationTypeV2.REVOKE:
        await processVerifiedTransaction(userId, {
          ...transaction,
          revocationDate: transaction.revocationDate || new Date(),
        });
        break;

      case NotificationTypeV2.DID_CHANGE_RENEWAL_PREF:
        // UPGRADE takes effect immediately with a new transaction; DOWNGRADE
        // only changes what renews next period.
        if (subtype === Subtype.UPGRADE) {
          await processVerifiedTransaction(userId, transaction);
        }
        if (data?.signedRenewalInfo) {
          const renewalInfo = await verifier.verifyAndDecodeRenewalInfo(data.signedRenewalInfo);
          if (renewalInfo.autoRenewProductId) {
            await prisma.subscription.updateMany({
              where: { userId },
              data: { autoRenewProductId: renewalInfo.autoRenewProductId },
            });
            await invalidateSubscriptionCaches(userId);
          }
        }
        break;

      default:
        storeLogger.debug({ notificationType }, 'Unhandled notification type');
    }

    return { success: true, message: `Processed ${notificationType}` };
  } catch (error) {
    storeLogger.error({ err: error }, 'Error processing App Store notification');
    throw error;
  }
}

// ============================================================================
// TEST NOTIFICATIONS
// ============================================================================

export async function requestTestNotification(): Promise<string> {
  const client = getApiClient();
  const response = await client.requestTestNotification();
  return response.testNotificationToken || '';
}
