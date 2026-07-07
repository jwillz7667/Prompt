import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  buildTestApp,
  createTestUser,
  cleanupUser,
  prisma,
  type TestUser,
} from './helpers.js';

const app = buildTestApp();

describe('prompt version history', () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser();
  });

  afterAll(async () => {
    await cleanupUser(user.id);
  });

  it('chains versions through parentPromptId and lists them', async () => {
    const v1 = await request(app)
      .post('/api/v1/prompts')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ originalPrompt: 'raw idea', enhancedPrompt: 'Enhanced idea v1' });
    expect(v1.status).toBe(201);
    expect(v1.body.prompt.version).toBe(1);
    expect(v1.body.prompt.rootPromptId).toBeNull();
    const rootId = v1.body.prompt.id as string;

    const v2 = await request(app)
      .post('/api/v1/prompts')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        originalPrompt: 'raw idea',
        enhancedPrompt: 'Enhanced idea v2',
        parentPromptId: rootId,
      });
    expect(v2.status).toBe(201);
    expect(v2.body.prompt.version).toBe(2);
    expect(v2.body.prompt.rootPromptId).toBe(rootId);

    // Chaining off v2 must still attach to the same root, as v3.
    const v3 = await request(app)
      .post('/api/v1/prompts')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        originalPrompt: 'raw idea',
        enhancedPrompt: 'Enhanced idea v3',
        parentPromptId: v2.body.prompt.id,
      });
    expect(v3.body.prompt.version).toBe(3);
    expect(v3.body.prompt.rootPromptId).toBe(rootId);

    const listed = await request(app)
      .get(`/api/v1/prompts/${v2.body.prompt.id}/versions`)
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.rootPromptId).toBe(rootId);
    expect(listed.body.versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
  });

  it('restore copies an old version to a new head without mutating history', async () => {
    const v1 = await request(app)
      .post('/api/v1/prompts')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ originalPrompt: 'base', enhancedPrompt: 'the original enhancement' });
    const rootId = v1.body.prompt.id as string;

    await request(app)
      .post('/api/v1/prompts')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ originalPrompt: 'base', enhancedPrompt: 'a worse rewrite', parentPromptId: rootId });

    const restored = await request(app)
      .post(`/api/v1/prompts/${rootId}/restore`)
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(restored.status).toBe(201);
    expect(restored.body.prompt.version).toBe(3);
    expect(restored.body.prompt.enhancedPrompt).toBe('the original enhancement');

    const original = await prisma.prompt.findUniqueOrThrow({ where: { id: rootId } });
    expect(original.version).toBe(1);
    expect(original.enhancedPrompt).toBe('the original enhancement');
  });

  it("rejects a parentPromptId owned by another user", async () => {
    const stranger = await createTestUser();
    try {
      const strangerPrompt = await request(app)
        .post('/api/v1/prompts')
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .send({ originalPrompt: 'theirs', enhancedPrompt: 'their enhancement' });

      const res = await request(app)
        .post('/api/v1/prompts')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          originalPrompt: 'mine',
          enhancedPrompt: 'my enhancement',
          parentPromptId: strangerPrompt.body.prompt.id,
        });
      expect(res.status).toBe(404);
    } finally {
      await cleanupUser(stranger.id);
    }
  });
});
