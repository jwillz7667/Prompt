import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

const { registerDeveloper } = vi.hoisted(() => {
  process.env['DEVELOPER_SIGNUPS_PER_IP_PER_HOUR'] = '2';
  return { registerDeveloper: vi.fn() };
});
vi.mock('../../src/services/developerAuthService.js', () => ({
  registerDeveloper,
  loginDeveloper: vi.fn(),
  refreshDeveloperTokens: vi.fn(),
  logoutDeveloper: vi.fn(),
  getDeveloperById: vi.fn(),
  updateDeveloperProfile: vi.fn(),
  changeDeveloperPassword: vi.fn(),
}));
vi.mock('../../src/utils/logger.js', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { developerAuthRouter } from '../../src/routes/developerAuth.js';
import { API_TIER_CONFIG } from '../../src/services/apiSubscriptionService.js';

const app = express().use(express.json()).use('/developer/auth', developerAuthRouter);

describe('developer signup and the free tier', () => {
  it('throttles repeated signups from one network', async () => {
    registerDeveloper.mockResolvedValue({ developer: {}, accessToken: 'a', refreshToken: 'r', expiresIn: 900 });
    const signup = (index: number) =>
      request(app).post('/developer/auth/signup').send({ email: `dev${index}@example.test`, password: 'password123' });

    const statuses = [(await signup(1)).status, (await signup(2)).status, (await signup(3)).status];

    expect(statuses).toEqual([201, 201, 429]);
    expect(registerDeveloper).toHaveBeenCalledTimes(2);
  });

  it('includes no enhancement requests on the free tier', () => {
    expect(API_TIER_CONFIG.API_FREE.monthlyRequests).toBe(0);
    expect(API_TIER_CONFIG.API_FREE.features.join(' ')).not.toMatch(/\d+ requests\/month/);
  });
});
