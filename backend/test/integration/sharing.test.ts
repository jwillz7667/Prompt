import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  buildTestApp,
  createTestPrompt,
  createTestUser,
  cleanupUser,
  type TestUser,
} from './helpers.js';

const app = buildTestApp();

describe('shareable prompt links', () => {
  let user: TestUser;
  let promptId: string;

  beforeAll(async () => {
    user = await createTestUser();
    promptId = (await createTestPrompt(user.id)).id;
  });

  afterAll(async () => {
    await cleanupUser(user.id);
  });

  it('creates a share link and serves it publicly', async () => {
    const created = await request(app)
      .post(`/api/v1/prompts/${promptId}/share`)
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(created.status).toBe(201);
    const slug = created.body.share.slug as string;
    expect(slug).toMatch(/^[A-Za-z0-9_-]{16}$/);

    const publicView = await request(app).get(`/api/v1/shared/${slug}`);
    expect(publicView.status).toBe(200);
    expect(publicView.body.enhancedPrompt).toContain('free-verse poem');
    expect(publicView.body.title).toBe('Sea poem');
    // The owner's identity must not leak through the public payload.
    expect(JSON.stringify(publicView.body)).not.toContain(user.email);
  });

  it('returns the same slug on repeated share requests', async () => {
    const first = await request(app)
      .post(`/api/v1/prompts/${promptId}/share`)
      .set('Authorization', `Bearer ${user.accessToken}`);
    const second = await request(app)
      .post(`/api/v1/prompts/${promptId}/share`)
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(second.status).toBe(200);
    expect(second.body.share.slug).toBe(first.body.share.slug);
  });

  it('revokes a share and the public link 404s', async () => {
    const created = await request(app)
      .post(`/api/v1/prompts/${promptId}/share`)
      .set('Authorization', `Bearer ${user.accessToken}`);
    const slug = created.body.share.slug as string;

    const revoked = await request(app)
      .delete(`/api/v1/prompts/${promptId}/share`)
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(revoked.status).toBe(200);

    const publicView = await request(app).get(`/api/v1/shared/${slug}`);
    expect(publicView.status).toBe(404);
  });

  it("cannot share another user's prompt", async () => {
    const stranger = await createTestUser();
    try {
      const res = await request(app)
        .post(`/api/v1/prompts/${promptId}/share`)
        .set('Authorization', `Bearer ${stranger.accessToken}`);
      expect(res.status).toBe(404);
    } finally {
      await cleanupUser(stranger.id);
    }
  });

  it('404s for malformed and unknown slugs', async () => {
    expect((await request(app).get('/api/v1/shared/short')).status).toBe(404);
    expect((await request(app).get('/api/v1/shared/AAAAAAAAAAAAAAAA')).status).toBe(404);
  });
});
