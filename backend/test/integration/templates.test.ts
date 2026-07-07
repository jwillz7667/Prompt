import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { buildTestApp, createTestUser, cleanupUser, prisma, type TestUser } from './helpers.js';

const app = buildTestApp();

describe('template library', () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser();
  });

  afterAll(async () => {
    await prisma.template.deleteMany({ where: { userId: user.id } });
    await cleanupUser(user.id);
  });

  it('lists built-in templates publicly without auth', async () => {
    const res = await request(app).get('/api/v1/templates');

    expect(res.status).toBe(200);
    expect(res.body.templates.length).toBeGreaterThanOrEqual(10);
    expect(res.body.templates.every((t: { isBuiltIn: boolean; isPublic: boolean }) => t.isBuiltIn || t.isPublic)).toBe(true);
  });

  it('filters the library by modality', async () => {
    const res = await request(app).get('/api/v1/templates?modality=code');

    expect(res.status).toBe(200);
    expect(res.body.templates.length).toBeGreaterThanOrEqual(1);
    expect(res.body.templates.every((t: { modality: string }) => t.modality === 'code')).toBe(true);
  });

  it('returns 401 when creating a template without auth', async () => {
    const res = await request(app)
      .post('/api/v1/templates')
      .send({ name: 'Nope', content: 'nope' });

    expect(res.status).toBe(401);
  });

  it('keeps a new user template private until moderated', async () => {
    const created = await request(app)
      .post('/api/v1/templates')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'My private template', content: 'Do [X] with [Y]', modality: 'text' });

    expect(created.status).toBe(201);
    expect(created.body.template.isPublic).toBe(false);
    const id = created.body.template.id as string;

    const mine = await request(app)
      .get('/api/v1/templates/mine')
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body.templates.map((t: { id: string }) => t.id)).toContain(id);

    const publicDetail = await request(app).get(`/api/v1/templates/${id}`);
    expect(publicDetail.status).toBe(404);

    const publicUse = await request(app).post(`/api/v1/templates/${id}/use`);
    expect(publicUse.status).toBe(404);
  });

  it('increments usage count via /use on a built-in template', async () => {
    const before = await prisma.template.findUniqueOrThrow({
      where: { id: 'tpl_builtin_blog_post' },
      select: { usageCount: true },
    });

    const res = await request(app).post('/api/v1/templates/tpl_builtin_blog_post/use');

    expect(res.status).toBe(200);
    expect(res.body.template.usageCount).toBe(before.usageCount + 1);
  });

  it('pulls an edited template back to private and enforces ownership', async () => {
    const created = await request(app)
      .post('/api/v1/templates')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Editable', content: 'v1' });
    const id = created.body.template.id as string;

    // Simulate moderation approval, then edit — must revert to private.
    await prisma.template.update({ where: { id }, data: { isPublic: true } });
    const patched = await request(app)
      .patch(`/api/v1/templates/${id}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ content: 'v2' });
    expect(patched.status).toBe(200);
    expect(patched.body.template.isPublic).toBe(false);
    expect(patched.body.template.content).toBe('v2');

    const stranger = await createTestUser();
    try {
      const foreignPatch = await request(app)
        .patch(`/api/v1/templates/${id}`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .send({ content: 'hijacked' });
      expect(foreignPatch.status).toBe(404);

      const foreignDelete = await request(app)
        .delete(`/api/v1/templates/${id}`)
        .set('Authorization', `Bearer ${stranger.accessToken}`);
      expect(foreignDelete.status).toBe(404);
    } finally {
      await cleanupUser(stranger.id);
    }

    const deleted = await request(app)
      .delete(`/api/v1/templates/${id}`)
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(deleted.status).toBe(204);
  });
});
