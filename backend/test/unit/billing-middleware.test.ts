import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ canMakeRequest: vi.fn(), findUnique: vi.fn(), downstream: vi.fn() }));
vi.mock('../../src/services/apiSubscriptionService.js', () => ({ canMakeRequest: mocks.canMakeRequest }));
vi.mock('../../src/utils/prisma.js', () => ({ prisma: { webhookIdempotencyKey: { findUnique: mocks.findUnique } } }));
import { enforceApiQuota } from '../../src/middleware/apiQuotaEnforcement.js';
import { idempotencyGuard } from '../../src/middleware/idempotency.js';

describe('billing infrastructure outages', () => {
  it('fails closed when API quota lookup is unavailable', async () => {
    mocks.canMakeRequest.mockRejectedValue(new Error('database unavailable'));
    const app = express();
    app.use((req, _res, next) => { Object.assign(req, { apiKey: { id: 'local-key', developerId: 'local-developer' } }); next(); });
    app.get('/', enforceApiQuota, (_req, res) => { mocks.downstream(); res.json({ success: true }); });
    expect((await request(app).get('/')).status).toBe(503);
    expect(mocks.downstream).not.toHaveBeenCalled();
  });
  it('fails closed when webhook deduplication cannot claim the event', async () => {
    mocks.findUnique.mockRejectedValue(new Error('database unavailable'));
    const app = express();
    app.use(express.json());
    app.post('/', idempotencyGuard(), (_req, res) => { mocks.downstream(); res.json({ success: true }); });
    expect((await request(app).post('/').send({ signedPayload: 'local' })).status).toBe(503);
    expect(mocks.downstream).not.toHaveBeenCalled();
  });
});
