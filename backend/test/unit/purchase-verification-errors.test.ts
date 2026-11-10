import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VerificationException, VerificationStatus } from '@apple/app-store-server-library';

const { verify, processPurchase } = vi.hoisted(() => ({ verify: vi.fn(), processPurchase: vi.fn() }));
vi.mock('../../src/middleware/auth.js', () => ({
  authenticate: (req: express.Request & { user?: { id: string } }, _res: express.Response, next: express.NextFunction) => {
    req.user = { id: 'local-test-user' };
    next();
  },
}));
vi.mock('../../src/services/appleStoreService.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/services/appleStoreService.js')>(),
  verifySignedTransaction: verify,
  processVerifiedTransaction: processPurchase,
}));
import { subscriptionRouter } from '../../src/routes/subscriptions.js';
const app = express();
app.use(express.json());
app.use(subscriptionRouter);

beforeEach(() => { verify.mockReset(); processPurchase.mockReset(); });
describe('purchase verification failures', () => {
  it('keeps transient Apple verification failures retryable for purchase and restore', async () => {
    verify.mockRejectedValue(new VerificationException(VerificationStatus.RETRYABLE_VERIFICATION_FAILURE));
    expect((await request(app).post('/verify').send({ signedTransaction: 'signed-purchase' })).status).toBe(503);
    expect((await request(app).post('/restore').send({ signedTransactions: ['signed-purchase'] })).status).toBe(503);
    expect(processPurchase).not.toHaveBeenCalled();
  });
  it('rejects a permanently invalid signed transaction', async () => {
    verify.mockRejectedValue(new VerificationException(VerificationStatus.INVALID_CERTIFICATE));
    const result = await request(app).post('/verify').send({ signedTransaction: 'invalid-purchase' });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe('TRANSACTION_INVALID');
    expect(processPurchase).not.toHaveBeenCalled();
  });
  it('bounds restore verification work before calling Apple', async () => {
    const result = await request(app).post('/restore').send({ signedTransactions: Array(101).fill('signed-purchase') });
    expect(result.status).toBe(400);
    expect(verify).not.toHaveBeenCalled();
  });
});
