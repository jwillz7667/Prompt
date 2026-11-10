import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  buildTestApp,
  cleanupUser,
  createTestPrompt,
  createTestUser,
  prisma,
  type TestUser,
} from './helpers.js';

const app = buildTestApp();
const users: TestUser[] = [];
const savedResult = {
  originalPrompt: 'Write a launch announcement for a small coffee shop.',
  enhancedPrompt: 'Write a warm, concise launch announcement for an independent coffee shop.',
  inputTokens: 90,
  outputTokens: 30,
  totalTokens: 120,
};

afterEach(async () => {
  for (const user of users.splice(0)) {
    await prisma.dailyUsage.deleteMany({ where: { userId: user.id } });
    await prisma.usageRecord.deleteMany({ where: { userId: user.id } });
    await cleanupUser(user.id);
  }
});

describe('saving generated prompts to iOS history', () => {
  it.each([1, 10])(
    'saves at %i used generations without charging quota or analytics again',
    async (used) => {
      const user = await createTestUser();
      users.push(user);
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      await prisma.user.update({
        where: { id: user.id },
        data: { promptCount: used, tokenUsage: BigInt(120 * used) },
      });
      await prisma.dailyUsage.create({ data: { userId: user.id, date, promptCount: used } });
      await prisma.usageRecord.create({
        data: { userId: user.id, date, promptCount: used, tokenCount: BigInt(120 * used) },
      });

      const response = await request(app)
        .post('/api/v1/prompts')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send(savedResult);

      expect(response.status).toBe(201);
      expect(response.body.prompt.enhancedPrompt).toBe(savedResult.enhancedPrompt);
      expect(response.body.subscription).toMatchObject({
        tier: 'FREE',
        dailyPromptsUsed: used,
        dailyPromptsLimit: 10,
      });
      const [account, daily, analytics] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
        prisma.dailyUsage.findUniqueOrThrow({ where: { userId_date: { userId: user.id, date } } }),
        prisma.usageRecord.findUniqueOrThrow({ where: { userId_date: { userId: user.id, date } } }),
      ]);
      expect(account.promptCount).toBe(used);
      expect(account.tokenUsage).toBe(BigInt(120 * used));
      expect(daily.promptCount).toBe(used);
      expect(analytics.promptCount).toBe(used);
      expect(analytics.tokenCount).toBe(BigInt(120 * used));
    },
  );

  it('still requires authentication and rejects another account’s parent prompt', async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    users.push(owner, other);
    const parent = await createTestPrompt(owner.id);
    expect((await request(app).post('/api/v1/prompts').send(savedResult)).status).toBe(401);
    const denied = await request(app)
      .post('/api/v1/prompts')
      .set('Authorization', `Bearer ${other.accessToken}`)
      .send({ ...savedResult, parentPromptId: parent.id });
    expect(denied.status).toBe(404);
    expect(await prisma.prompt.count({ where: { userId: other.id } })).toBe(0);
  });
});
