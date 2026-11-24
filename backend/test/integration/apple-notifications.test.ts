import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';

// Signed payloads in these tests are plain JSON: the verifier is replaced so
// the notification state machine runs against the real database without
// Apple-signed fixtures. Signature verification itself is the library's job.
vi.mock('@apple/app-store-server-library', async (importOriginal) => {
  const original = await importOriginal<typeof import('@apple/app-store-server-library')>();
  class JsonVerifier {
    async verifyAndDecodeNotification(signed: string): Promise<unknown> {
      return JSON.parse(signed);
    }
    async verifyAndDecodeTransaction(signed: string): Promise<unknown> {
      return JSON.parse(signed);
    }
    async verifyAndDecodeRenewalInfo(signed: string): Promise<unknown> {
      return JSON.parse(signed);
    }
  }
  return { ...original, SignedDataVerifier: JsonVerifier };
});

import { prisma } from '../../src/utils/prisma.js';
import { processAppStoreNotification } from '../../src/services/appleStoreService.js';
import { getSubscriptionInfo } from '../../src/services/subscriptionService.js';
import { subscriptionRouter } from '../../src/routes/subscriptions.js';
import { cleanupUser, createTestUser, type TestUser } from './helpers.js';

const DAY_MS = 86_400_000;
const users: TestUser[] = [];
const app = express();
app.use(express.json());
app.use('/subscriptions', subscriptionRouter);

afterAll(async () => {
  for (const user of users.splice(0)) await cleanupUser(user.id);
});

async function newUser(): Promise<TestUser & { appAccountToken: string }> {
  const user = await createTestUser();
  users.push(user);
  const { appAccountToken } = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  return { ...user, appAccountToken };
}

interface SignedTransactionFields {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  purchaseDate: number;
  expiresDate: number;
  type: string;
  environment: string;
  appAccountToken?: string;
  offerType?: number;
  offerDiscountType?: string;
  revocationDate?: number;
}

function signedTransaction(overrides: Partial<SignedTransactionFields> = {}): string {
  const fields: SignedTransactionFields = {
    transactionId: randomUUID(),
    originalTransactionId: randomUUID(),
    productId: 'com.promptomizer.premium.monthly',
    purchaseDate: Date.now(),
    expiresDate: Date.now() + 30 * DAY_MS,
    type: 'Auto-Renewable Subscription',
    environment: 'Production',
    ...overrides,
  };
  return JSON.stringify(fields);
}

function notify(
  notificationType: string,
  transaction: string,
  extra: { subtype?: string; signedRenewalInfo?: string } = {},
) {
  return processAppStoreNotification(
    JSON.stringify({
      notificationType,
      subtype: extra.subtype,
      data: { signedTransactionInfo: transaction, signedRenewalInfo: extra.signedRenewalInfo },
    }),
  );
}

describe('App Store notification handling', () => {
  it('attributes a first notification to the account that owns its appAccountToken', async () => {
    const user = await newUser();

    const result = await notify(
      'SUBSCRIBED',
      signedTransaction({ appAccountToken: user.appAccountToken.toUpperCase() }),
    );

    expect(result.message).toBe('Processed SUBSCRIBED');
    expect(await getSubscriptionInfo(user.id)).toMatchObject({
      tier: 'PREMIUM',
      isEntitled: true,
    });
  });

  it('acknowledges a notification it cannot attribute to any account', async () => {
    const result = await notify('SUBSCRIBED', signedTransaction({ appAccountToken: randomUUID() }));

    expect(result).toEqual({
      success: true,
      message: 'User not found, notification acknowledged',
    });
  });

  it('marks an introductory free trial as trialing and DID_RENEW clears it', async () => {
    const user = await newUser();
    const originalTransactionId = randomUUID();
    await notify(
      'SUBSCRIBED',
      signedTransaction({
        originalTransactionId,
        appAccountToken: user.appAccountToken,
        offerType: 1,
        offerDiscountType: 'FREE_TRIAL',
        purchaseDate: Date.now() - DAY_MS,
        expiresDate: Date.now() + 2 * DAY_MS,
      }),
    );
    expect((await getSubscriptionInfo(user.id)).isTrialing).toBe(true);

    await notify(
      'DID_RENEW',
      signedTransaction({ originalTransactionId, expiresDate: Date.now() + 32 * DAY_MS }),
    );

    expect(await getSubscriptionInfo(user.id)).toMatchObject({
      tier: 'PREMIUM',
      isTrialing: false,
    });
  });

  it('revokes on REFUND and restores on REFUND_REVERSED', async () => {
    const user = await newUser();
    const purchase = signedTransaction({ appAccountToken: user.appAccountToken });
    await notify('SUBSCRIBED', purchase);

    await notify('REFUND', purchase);
    expect((await getSubscriptionInfo(user.id)).isEntitled).toBe(false);

    await notify('REFUND_REVERSED', purchase);
    expect((await getSubscriptionInfo(user.id)).isEntitled).toBe(true);
  });

  it('keeps access through a billing grace period and ends it on GRACE_PERIOD_EXPIRED', async () => {
    const user = await newUser();
    const lapsed = signedTransaction({
      appAccountToken: user.appAccountToken,
      purchaseDate: Date.now() - 31 * DAY_MS,
      expiresDate: Date.now() - DAY_MS,
    });

    await notify('DID_FAIL_TO_RENEW', lapsed, {
      subtype: 'GRACE_PERIOD',
      signedRenewalInfo: JSON.stringify({ gracePeriodExpiresDate: Date.now() + 5 * DAY_MS }),
    });
    expect(await getSubscriptionInfo(user.id)).toMatchObject({
      status: 'GRACE_PERIOD',
      isEntitled: true,
    });

    await notify('GRACE_PERIOD_EXPIRED', lapsed);
    const row = await prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    expect(row).toMatchObject({ tier: 'FREE', status: 'EXPIRED', gracePeriodEndDate: null });
  });

  it('downgrades on EXPIRED', async () => {
    const user = await newUser();
    const originalTransactionId = randomUUID();
    await notify(
      'SUBSCRIBED',
      signedTransaction({ originalTransactionId, appAccountToken: user.appAccountToken }),
    );

    await notify(
      'EXPIRED',
      signedTransaction({
        originalTransactionId,
        purchaseDate: Date.now() + 1000,
        expiresDate: Date.now() - 1000,
      }),
      { subtype: 'VOLUNTARY' },
    );

    expect(await getSubscriptionInfo(user.id)).toMatchObject({ tier: 'FREE', isEntitled: false });
  });

  it('extends access on RENEWAL_EXTENDED and acknowledges the RENEWAL_EXTENSION summary', async () => {
    const user = await newUser();
    const originalTransactionId = randomUUID();
    await notify(
      'SUBSCRIBED',
      signedTransaction({ originalTransactionId, appAccountToken: user.appAccountToken }),
    );
    const extendedExpiry = Date.now() + 60 * DAY_MS;

    await notify(
      'RENEWAL_EXTENDED',
      signedTransaction({
        originalTransactionId,
        purchaseDate: Date.now() + 1000,
        expiresDate: extendedExpiry,
      }),
    );
    const summary = await processAppStoreNotification(
      JSON.stringify({ notificationType: 'RENEWAL_EXTENSION', subtype: 'SUMMARY', data: {} }),
    );

    expect((await getSubscriptionInfo(user.id)).expiresAt?.getTime()).toBe(extendedExpiry);
    expect(summary.success).toBe(true);
  });

  it('grants access on OFFER_REDEEMED', async () => {
    const user = await newUser();

    await notify('OFFER_REDEEMED', signedTransaction({ appAccountToken: user.appAccountToken }));

    expect((await getSubscriptionInfo(user.id)).isEntitled).toBe(true);
  });
});

describe('purchase ownership conflicts', () => {
  it('returns 409 TRANSACTION_OWNED_BY_ANOTHER_USER from /verify for another account token', async () => {
    const owner = await newUser();
    const claimant = await newUser();

    const response = await request(app)
      .post('/subscriptions/verify')
      .set('Authorization', `Bearer ${claimant.accessToken}`)
      .send({ signedTransaction: signedTransaction({ appAccountToken: owner.appAccountToken }) });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('TRANSACTION_OWNED_BY_ANOTHER_USER');
  });

  it('returns 409 from /restore when every active purchase belongs to another account', async () => {
    const owner = await newUser();
    const claimant = await newUser();
    const purchase = signedTransaction({ appAccountToken: owner.appAccountToken });
    await notify('SUBSCRIBED', purchase);

    const response = await request(app)
      .post('/subscriptions/restore')
      .set('Authorization', `Bearer ${claimant.accessToken}`)
      .send({ signedTransactions: [purchase] });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('TRANSACTION_OWNED_BY_ANOTHER_USER');
  });

  it('restores a purchase for its owner and reports isEntitled', async () => {
    const owner = await newUser();

    const response = await request(app)
      .post('/subscriptions/restore')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        signedTransactions: [signedTransaction({ appAccountToken: owner.appAccountToken })],
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ restored: true, isEntitled: true });
  });
});
