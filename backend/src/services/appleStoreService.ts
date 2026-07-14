import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  VerificationException,
  VerificationStatus,
  JWSTransactionDecodedPayload,
  JWSRenewalInfoDecodedPayload,
  NotificationTypeV2,
  Subtype,
  DecodedSignedData,
  Order,
} from '@apple/app-store-server-library';
import { prisma } from '../utils/prisma.js';
import {
  updateSubscription,
  cancelSubscription,
  handleGracePeriod,
  getTierFromProductId,
  invalidateSubscriptionCaches,
} from './subscriptionService.js';
import { SubscriptionStatus, SubscriptionTier } from '@prisma/client';
import { storeLogger } from '../utils/logger.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const APPLE_ISSUER_ID = process.env['APPLE_ISSUER_ID'] || '';
const APPLE_KEY_ID = process.env['APPLE_KEY_ID'] || '';
// Convert escaped \n to actual newlines (needed for Vercel/Railway env vars)
const APPLE_PRIVATE_KEY = (process.env['APPLE_PRIVATE_KEY'] || '').replace(/\\n/g, '\n');
const APPLE_BUNDLE_ID = process.env['APPLE_BUNDLE_ID'] || 'com.res.promptomizer';
const APPLE_APP_ID = process.env['APPLE_APP_ID'] || '';

const environment =
  process.env['NODE_ENV'] === 'production'
    ? Environment.PRODUCTION
    : Environment.SANDBOX;

// TestFlight builds always produce Sandbox-signed transactions, so a
// production-pinned verifier rejects every TestFlight purchase. Sandbox JWS
// are still Apple-signed and bundle-id checked; only builds provisioned by
// this team (TestFlight/dev) can mint them. Trade-off accepted knowingly:
// TestFlight testers get entitlements without being charged (IAP is always
// free in TestFlight). The transaction's environment is persisted on
// AppStoreTransaction for auditability. Set to 'false' to opt out.
const ACCEPT_SANDBOX_TRANSACTIONS =
  process.env['APPLE_ACCEPT_SANDBOX_TRANSACTIONS'] !== 'false';

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

let apiClient: AppStoreServerAPIClient | null = null;
const verifiersByEnvironment = new Map<Environment, SignedDataVerifier>();

function getApiClient(): AppStoreServerAPIClient {
  if (!apiClient) {
    if (!APPLE_ISSUER_ID || !APPLE_KEY_ID || !APPLE_PRIVATE_KEY) {
      throw new Error('Apple App Store credentials not configured');
    }

    apiClient = new AppStoreServerAPIClient(
      APPLE_PRIVATE_KEY,
      APPLE_KEY_ID,
      APPLE_ISSUER_ID,
      APPLE_BUNDLE_ID,
      environment
    );
  }
  return apiClient;
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
          : undefined
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
  verify: (verifier: SignedDataVerifier) => Promise<T>
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
        'Payload rejected by production verifier - retrying with sandbox verifier (TestFlight purchase)'
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
}

export async function verifySignedTransaction(
  signedTransaction: string
): Promise<VerifiedTransaction> {
  // Verify and decode the signed transaction (production first, sandbox
  // fallback for TestFlight purchases)
  const { payload: decodedTransaction } = await verifyWithEnvironmentFallback(
    (verifier) => verifier.verifyAndDecodeTransaction(signedTransaction)
  );

  return {
    transactionId: decodedTransaction.transactionId || '',
    originalTransactionId: decodedTransaction.originalTransactionId || '',
    productId: decodedTransaction.productId || '',
    purchaseDate: decodedTransaction.purchaseDate
      ? new Date(decodedTransaction.purchaseDate)
      : new Date(),
    expirationDate: decodedTransaction.expiresDate
      ? new Date(decodedTransaction.expiresDate)
      : null,
    isUpgraded: decodedTransaction.isUpgraded || false,
    revocationDate: decodedTransaction.revocationDate
      ? new Date(decodedTransaction.revocationDate)
      : null,
    type: decodedTransaction.type || 'UNKNOWN',
    environment: decodedTransaction.environment || 'UNKNOWN',
  };
}

// ============================================================================
// RECEIPT PROCESSING
// ============================================================================

export async function processVerifiedTransaction(
  userId: string,
  transaction: VerifiedTransaction
): Promise<void> {
  // Store the transaction record
  await prisma.appStoreTransaction.upsert({
    where: { transactionId: transaction.transactionId },
    update: {
      expirationDate: transaction.expirationDate,
      revocationDate: transaction.revocationDate,
    },
    create: {
      userId,
      transactionId: transaction.transactionId,
      originalTransactionId: transaction.originalTransactionId,
      productId: transaction.productId,
      type: transaction.type,
      purchaseDate: transaction.purchaseDate,
      expirationDate: transaction.expirationDate,
      environment: transaction.environment,
    },
  });

  // Update subscription based on transaction
  const tier = getTierFromProductId(transaction.productId);

  // If transaction was revoked, downgrade to free
  if (transaction.revocationDate) {
    await updateSubscription(userId, {
      tier: SubscriptionTier.FREE,
      status: SubscriptionStatus.CANCELED,
      productId: transaction.productId,
      originalTransactionId: transaction.originalTransactionId,
      expiresAt: null,
      autoRenewEnabled: false,
    });
    return;
  }

  // If transaction is active and not expired
  const now = new Date();
  const isActive = !transaction.expirationDate || transaction.expirationDate > now;

  await updateSubscription(userId, {
    tier: isActive ? tier : SubscriptionTier.FREE,
    status: isActive ? SubscriptionStatus.ACTIVE : SubscriptionStatus.EXPIRED,
    productId: transaction.productId,
    originalTransactionId: transaction.originalTransactionId,
    expiresAt: transaction.expirationDate,
    autoRenewEnabled: isActive,
  });
}

// ============================================================================
// APP STORE SERVER NOTIFICATIONS V2
// ============================================================================

export interface NotificationPayload {
  notificationType: string;
  subtype?: string;
  data: {
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
}

export async function processAppStoreNotification(
  signedPayload: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Verify and decode the notification (production first, sandbox fallback
    // — Apple sends Sandbox-signed notifications for TestFlight purchases).
    // Nested payloads below must be decoded with the same environment.
    const { payload: notification, verifiedEnvironment } =
      await verifyWithEnvironmentFallback((v) => v.verifyAndDecodeNotification(signedPayload));
    const verifier = getSignedDataVerifier(verifiedEnvironment);

    const notificationType = notification.notificationType;
    const subtype = notification.subtype;
    const data = notification.data;

    storeLogger.info({ notificationType, subtype: subtype || 'none' }, 'Processing App Store notification');

    // Extract transaction info
    let transaction: VerifiedTransaction | null = null;
    if (data?.signedTransactionInfo) {
      transaction = await verifySignedTransaction(data.signedTransactionInfo);
    }

    // Find user by original transaction ID
    let userId: string | null = null;
    if (transaction) {
      const existingTransaction = await prisma.appStoreTransaction.findFirst({
        where: { originalTransactionId: transaction.originalTransactionId },
        select: { userId: true },
      });
      userId = existingTransaction?.userId || null;
    }

    if (!userId && transaction) {
      // Try to find user from subscription
      const subscription = await prisma.subscription.findUnique({
        where: { originalTransactionId: transaction.originalTransactionId },
        select: { userId: true },
      });
      userId = subscription?.userId || null;
    }

    if (!userId) {
      storeLogger.warn({
        notificationType,
        originalTransactionId: transaction?.originalTransactionId,
      }, 'Could not find user for notification');
      return { success: true, message: 'User not found, notification acknowledged' };
    }

    // Handle different notification types
    switch (notificationType) {
      case NotificationTypeV2.SUBSCRIBED:
        if (transaction) {
          await processVerifiedTransaction(userId, transaction);
        }
        break;

      case NotificationTypeV2.DID_RENEW:
        if (transaction) {
          await processVerifiedTransaction(userId, transaction);
        }
        break;

      case NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS:
        if (subtype === Subtype.AUTO_RENEW_DISABLED) {
          await prisma.subscription.update({
            where: { userId },
            data: { autoRenewEnabled: false },
          });
          await invalidateSubscriptionCaches(userId);
        } else if (subtype === Subtype.AUTO_RENEW_ENABLED) {
          await prisma.subscription.update({
            where: { userId },
            data: { autoRenewEnabled: true },
          });
          await invalidateSubscriptionCaches(userId);
        }
        break;

      case NotificationTypeV2.EXPIRED:
        await updateSubscription(userId, {
          tier: SubscriptionTier.FREE,
          status: SubscriptionStatus.EXPIRED,
          productId: transaction?.productId || '',
          originalTransactionId: transaction?.originalTransactionId || '',
          expiresAt: transaction?.expirationDate || null,
          autoRenewEnabled: false,
        });
        break;

      case NotificationTypeV2.GRACE_PERIOD_EXPIRED:
        await updateSubscription(userId, {
          tier: SubscriptionTier.FREE,
          status: SubscriptionStatus.EXPIRED,
          productId: transaction?.productId || '',
          originalTransactionId: transaction?.originalTransactionId || '',
          expiresAt: null,
          autoRenewEnabled: false,
        });
        break;

      case NotificationTypeV2.DID_FAIL_TO_RENEW:
        if (subtype === Subtype.GRACE_PERIOD && transaction?.expirationDate) {
          const gracePeriodEndDate = new Date(transaction.expirationDate);
          gracePeriodEndDate.setDate(gracePeriodEndDate.getDate() + 16); // 16-day grace period
          await handleGracePeriod(userId, gracePeriodEndDate);
        }
        break;

      case NotificationTypeV2.REFUND:
      case NotificationTypeV2.REVOKE:
        await updateSubscription(userId, {
          tier: SubscriptionTier.FREE,
          status: SubscriptionStatus.CANCELED,
          productId: transaction?.productId || '',
          originalTransactionId: transaction?.originalTransactionId || '',
          expiresAt: null,
          autoRenewEnabled: false,
        });
        break;

      case NotificationTypeV2.DID_CHANGE_RENEWAL_PREF:
        // User changed their subscription tier (upgrade/downgrade)
        // The change will take effect at the next renewal
        if (data?.signedRenewalInfo) {
          const renewalInfo = await verifier.verifyAndDecodeRenewalInfo(data.signedRenewalInfo);
          if (renewalInfo.autoRenewProductId) {
            await prisma.subscription.update({
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
// TRANSACTION HISTORY
// ============================================================================

export async function getTransactionHistory(
  originalTransactionId: string
): Promise<JWSTransactionDecodedPayload[]> {
  const client = getApiClient();
  const verifier = getSignedDataVerifier();

  const transactions: JWSTransactionDecodedPayload[] = [];
  let revision: string | undefined;

  do {
    const response = await client.getTransactionHistory(
      originalTransactionId,
      revision ?? null,
      { sort: Order.DESCENDING }
    );

    for (const signedTransaction of response.signedTransactions || []) {
      const decoded = await verifier.verifyAndDecodeTransaction(signedTransaction);
      transactions.push(decoded);
    }

    revision = response.revision;
  } while (revision);

  return transactions;
}

// ============================================================================
// SUBSCRIPTION STATUS
// ============================================================================

export async function getSubscriptionStatus(
  originalTransactionId: string
): Promise<{
  status: 'active' | 'expired' | 'billing_retry' | 'billing_grace_period' | 'revoked';
  expiresDate: Date | null;
  autoRenewEnabled: boolean;
}> {
  const client = getApiClient();
  const verifier = getSignedDataVerifier();

  const response = await client.getAllSubscriptionStatuses(originalTransactionId);

  // Find the relevant subscription group
  for (const group of response.data || []) {
    for (const item of group.lastTransactions || []) {
      if (item.originalTransactionId === originalTransactionId) {
        const decoded = await verifier.verifyAndDecodeTransaction(item.signedTransactionInfo || '');

        let status: 'active' | 'expired' | 'billing_retry' | 'billing_grace_period' | 'revoked' = 'expired';

        switch (item.status) {
          case 1:
            status = 'active';
            break;
          case 2:
            status = 'expired';
            break;
          case 3:
            status = 'billing_retry';
            break;
          case 4:
            status = 'billing_grace_period';
            break;
          case 5:
            status = 'revoked';
            break;
        }

        return {
          status,
          expiresDate: decoded.expiresDate ? new Date(decoded.expiresDate) : null,
          autoRenewEnabled: Boolean(decoded.isUpgraded), // Note: This would need renewal info
        };
      }
    }
  }

  return {
    status: 'expired',
    expiresDate: null,
    autoRenewEnabled: false,
  };
}

// ============================================================================
// TEST NOTIFICATIONS
// ============================================================================

export async function requestTestNotification(): Promise<string> {
  const client = getApiClient();
  const response = await client.requestTestNotification();
  return response.testNotificationToken || '';
}
