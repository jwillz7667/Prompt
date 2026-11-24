import { randomUUID } from 'node:crypto';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { connect } from 'node:net';
import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env['REDIS_URL'] = process.env['TEST_REDIS_URL'] || 'redis://localhost:6379';
});

import { buildChatRouter, chatUsageKey, loadChatConfig } from '../../src/features/chat/index.js';
import { loadLlmConfig, resetDefaultLlmGateway } from '../../src/features/llm/index.js';
import { SUBSCRIPTION_REQUIRED_BODY } from '../../src/middleware/requireEntitlement.js';
import { cache, closeRedis, initRedis } from '../../src/utils/redis.js';
import { sseFinish, sseToken, streamResponse } from '../unit/llm-test-helpers.js';
import { cleanupUser, createTestUser, prisma, type TestUser } from './helpers.js';

async function isRedisReachable(url: string): Promise<boolean> {
  const { hostname, port } = new URL(url);
  return new Promise((resolve) => {
    const socket = connect({ host: hostname, port: Number(port || 6379), timeout: 500 });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}
const hasRedis = await isRedisReachable(process.env['REDIS_URL'] ?? '');

const PRIMARY = 'https://primary.llm.test';
const FALLBACK = 'https://fallback.llm.test';
const DAILY_LIMIT = 150;

const chatConfig = {
  ...loadChatConfig({}),
  dailyMessageLimit: DAILY_LIMIT,
  moderation: { isEnabled: true, apiKey: 'test-moderation-key', timeoutMs: 2000 },
};

const app = express();
app.use(express.json());
app.use('/api/v1/chat', buildChatRouter({ config: chatConfig }));

// ---------------------------------------------------------------------------
// Upstream fakes: every provider and moderation call goes through global fetch
// ---------------------------------------------------------------------------

type Upstream = (init: RequestInit) => Response | Promise<Response>;

interface FetchRoutes {
  primary?: Upstream;
  fallback?: Upstream;
  moderation?: Upstream;
}

const unflagged = (): Response =>
  Response.json({ results: [{ flagged: false, categories: { 'sexual/minors': false } }] });

const flagged = (category: string): Response =>
  Response.json({ results: [{ flagged: true, categories: { [category]: true } }] });

const completion = (tokens: string[], finishReason = 'stop'): Upstream => {
  return () => streamResponse(...tokens.map(sseToken), sseFinish(finishReason));
};

const failure = (status: number): Upstream => {
  return () => new Response('{"error":{"message":"upstream detail"}}', { status });
};

let fetchMock: ReturnType<
  typeof vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>
>;

function routeFetch(routes: FetchRoutes): void {
  fetchMock.mockImplementation(async (input, init = {}) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes('/moderations')) return (routes.moderation ?? unflagged)(init);
    if (url.startsWith(PRIMARY) && routes.primary) return routes.primary(init);
    if (url.startsWith(FALLBACK) && routes.fallback) return routes.fallback(init);
    throw new Error(`unexpected fetch ${url}`);
  });
}

function providerCalls(base: string): RequestInit[] {
  return fetchMock.mock.calls
    .filter(([input]) => String(input instanceof Request ? input.url : input).startsWith(base))
    .map(([, init]) => init ?? {});
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

type StreamEvent = Record<string, unknown> & { type: string };

function parseSse(text: string): { events: StreamEvent[]; isDone: boolean } {
  const payloads = text
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.startsWith('data: '))
    .map((block) => block.slice('data: '.length));
  const isDone = payloads.at(-1) === '[DONE]';
  const events = payloads
    .filter((payload) => payload !== '[DONE]')
    .map((payload) => JSON.parse(payload) as StreamEvent);
  return { events, isDone };
}

function sendMessage(
  user: TestUser,
  conversationId: string,
  content: string,
  clientMessageId = randomUUID(),
) {
  return request(app)
    .post(`/api/v1/chat/conversations/${conversationId}/messages/stream`)
    .set('Authorization', `Bearer ${user.accessToken}`)
    .send({ content, clientMessageId });
}

async function createConversation(user: TestUser, body: object = {}): Promise<string> {
  const res = await request(app)
    .post('/api/v1/chat/conversations')
    .set('Authorization', `Bearer ${user.accessToken}`)
    .send(body)
    .expect(201);
  return res.body.conversation.id as string;
}

async function usageCount(userId: string): Promise<number> {
  const raw = await cache.get<number>(chatUsageKey(userId));
  return raw ?? 0;
}

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function subscribe(user: TestUser): Promise<void> {
  await prisma.subscription.create({
    data: {
      userId: user.id,
      tier: 'PREMIUM',
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
}

// ---------------------------------------------------------------------------

let alice: TestUser;
let bob: TestUser;
let freeUser: TestUser;

beforeAll(async () => {
  if (hasRedis) await initRedis();
  [alice, bob, freeUser] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ]);
  await Promise.all([subscribe(alice), subscribe(bob)]);
});

beforeEach(async () => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  await resetBreakers();
  if (hasRedis) await Promise.all([alice, bob].map((user) => cache.del(chatUsageKey(user.id))));
  await prisma.chatConversation.deleteMany({ where: { userId: { in: [alice.id, bob.id] } } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await Promise.all([alice, bob, freeUser].map((user) => cleanupUser(user.id)));
  if (hasRedis) {
    await Promise.all([alice, bob].map((user) => cache.del(chatUsageKey(user.id))));
    await cache.invalidatePattern('llm:cb:v1:*');
    await closeRedis();
  }
});

describe('chat conversations CRUD', () => {
  it('creates, reads, renames, clears instructions and deletes a conversation', async () => {
    const auth = `Bearer ${alice.accessToken}`;
    const id = await createConversation(alice, { title: 'Trip ideas', systemPrompt: 'Be brief.' });

    const fetched = await request(app)
      .get(`/api/v1/chat/conversations/${id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(fetched.body).toMatchObject({
      conversation: { id, title: 'Trip ideas', systemPrompt: 'Be brief.' },
      messages: [],
      hasMore: false,
    });

    const patched = await request(app)
      .patch(`/api/v1/chat/conversations/${id}`)
      .set('Authorization', auth)
      .send({ title: 'Lisbon trip', systemPrompt: null })
      .expect(200);
    expect(patched.body.conversation).toMatchObject({ title: 'Lisbon trip', systemPrompt: null });

    await request(app)
      .delete(`/api/v1/chat/conversations/${id}`)
      .set('Authorization', auth)
      .expect(204);
    await request(app)
      .get(`/api/v1/chat/conversations/${id}`)
      .set('Authorization', auth)
      .expect(404);
  });

  it('defaults the title and rejects invalid bodies', async () => {
    const id = await createConversation(alice);
    const conversation = await prisma.chatConversation.findUniqueOrThrow({ where: { id } });
    expect(conversation.title).toBe('New chat');

    const res = await request(app)
      .post('/api/v1/chat/conversations')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ title: 'x'.repeat(121) })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('pages conversations by updatedAt with a cursor', async () => {
    const ids: string[] = [];
    for (const title of ['one', 'two', 'three']) {
      ids.push(await createConversation(alice, { title }));
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const auth = `Bearer ${alice.accessToken}`;

    const first = await request(app)
      .get('/api/v1/chat/conversations?limit=2')
      .set('Authorization', auth)
      .expect(200);
    const second = await request(app)
      .get(`/api/v1/chat/conversations?limit=2&cursor=${first.body.nextCursor}`)
      .set('Authorization', auth)
      .expect(200);

    expect(first.body.conversations.map((c: { id: string }) => c.id)).toEqual([ids[2], ids[1]]);
    expect(first.body.conversations[0]).toHaveProperty('lastMessagePreview', null);
    expect(second.body.conversations.map((c: { id: string }) => c.id)).toEqual([ids[0]]);
    expect(second.body.nextCursor).toBeNull();
  });

  it('continues after the cursor even when its anchor changes or is deleted', async () => {
    const ids: string[] = [];
    for (const title of ['one', 'two', 'three', 'four']) {
      ids.push(await createConversation(alice, { title }));
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const auth = `Bearer ${alice.accessToken}`;
    const first = await request(app).get('/api/v1/chat/conversations?limit=2').set('Authorization', auth).expect(200);
    const anchorId = first.body.conversations[1].id as string;

    await prisma.chatConversation.update({ where: { id: anchorId }, data: { lastMessagePreview: 'new reply' } });
    const afterBump = await request(app)
      .get(`/api/v1/chat/conversations?limit=2&cursor=${first.body.nextCursor}`)
      .set('Authorization', auth)
      .expect(200);
    await prisma.chatConversation.delete({ where: { id: anchorId } });
    const afterDelete = await request(app)
      .get(`/api/v1/chat/conversations?limit=2&cursor=${first.body.nextCursor}`)
      .set('Authorization', auth)
      .expect(200);

    expect(afterBump.body.conversations.map((c: { id: string }) => c.id)).toEqual([ids[1], ids[0]]);
    expect(afterDelete.body.conversations.map((c: { id: string }) => c.id)).toEqual([ids[1], ids[0]]);
  });

  it('pages messages newest-first while returning each page oldest-first', async () => {
    const id = await createConversation(alice);
    const base = Date.now() - 10_000;
    const messages = await Promise.all(
      ['m1', 'm2', 'm3'].map((content, index) =>
        prisma.chatMessage.create({
          data: {
            conversationId: id,
            role: index % 2 === 0 ? 'USER' : 'ASSISTANT',
            content,
            createdAt: new Date(base + index * 1000),
          },
        }),
      ),
    );
    const auth = `Bearer ${alice.accessToken}`;

    const latest = await request(app)
      .get(`/api/v1/chat/conversations/${id}?limit=2`)
      .set('Authorization', auth)
      .expect(200);
    const older = await request(app)
      .get(`/api/v1/chat/conversations/${id}?limit=2&before=${latest.body.messages[0].id}`)
      .set('Authorization', auth)
      .expect(200);

    expect(latest.body.messages.map((m: { content: string }) => m.content)).toEqual(['m2', 'm3']);
    expect(latest.body.hasMore).toBe(true);
    expect(latest.body.messages[0]).toEqual({
      id: messages[1]?.id,
      role: 'assistant',
      content: 'm2',
      status: 'complete',
      createdAt: messages[1]?.createdAt.toISOString(),
    });
    expect(older.body).toMatchObject({
      messages: [{ content: 'm1', role: 'user' }],
      hasMore: false,
    });
  });
});

describe('chat tenant isolation', () => {
  it("hides another user's conversation and messages behind 404", async () => {
    const id = await createConversation(alice);
    const message = await prisma.chatMessage.create({
      data: { conversationId: id, role: 'ASSISTANT', content: 'private answer' },
    });
    const auth = `Bearer ${bob.accessToken}`;
    routeFetch({ primary: completion(['nope']) });

    await request(app)
      .get(`/api/v1/chat/conversations/${id}`)
      .set('Authorization', auth)
      .expect(404);
    await request(app)
      .patch(`/api/v1/chat/conversations/${id}`)
      .set('Authorization', auth)
      .send({ title: 'mine' })
      .expect(404);
    await request(app)
      .delete(`/api/v1/chat/conversations/${id}`)
      .set('Authorization', auth)
      .expect(404);
    await request(app)
      .post(`/api/v1/chat/messages/${message.id}/report`)
      .set('Authorization', auth)
      .send({ reason: 'harmful' })
      .expect(404);
    await sendMessage(bob, id, 'hello').expect(404);
    await request(app)
      .get(`/api/v1/chat/conversations?cursor=${id}`)
      .set('Authorization', auth)
      .expect(400);

    const list = await request(app)
      .get('/api/v1/chat/conversations')
      .set('Authorization', auth)
      .expect(200);
    expect(list.body.conversations).toEqual([]);
    expect(providerCalls(PRIMARY)).toHaveLength(0);
    await expect(prisma.chatConversation.findUnique({ where: { id } })).resolves.toMatchObject({
      title: 'New chat',
    });
  });
});

describe('chat streaming', () => {
  it('streams a reply, persists both messages and auto-titles the conversation', async () => {
    const id = await createConversation(alice);
    routeFetch({ primary: completion(['Tides are ', 'caused by the moon.']) });
    const question =
      'Why do ocean tides happen twice a day in most coastal places around the world?';

    const res = await sendMessage(alice, id, question).expect(200);

    expect(res.headers['content-type']).toContain('text/event-stream');
    const { events, isDone } = parseSse(res.text);
    expect(isDone).toBe(true);
    expect(events.map((event) => event.type)).toEqual(['start', 'token', 'token', 'complete']);
    const start = events[0];
    const complete = events[3];
    expect(complete).toMatchObject({
      assistantMessageId: start?.['assistantMessageId'],
      status: 'complete',
      usage: { inputTokens: 12, outputTokens: 4 },
      conversation: { id, title: 'Why do ocean tides happen twice a day in most coastal…' },
    });

    const stored = await prisma.chatMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    });
    expect(stored.map((m) => [m.role, m.content, m.status])).toEqual([
      ['USER', question, 'COMPLETE'],
      ['ASSISTANT', 'Tides are caused by the moon.', 'COMPLETE'],
    ]);
    expect(stored[0]?.id).toBe(start?.['userMessageId']);

    const body = JSON.parse(String(providerCalls(PRIMARY)[0]?.body)) as {
      model: string;
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe('deepseek-flash');
    expect(body.max_tokens).toBe(2048);
    expect(body.messages[0]?.role).toBe('system');
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: question });

    const fetched = await request(app)
      .get(`/api/v1/chat/conversations/${id}`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);
    expect(JSON.stringify(fetched.body)).not.toMatch(/deepseek|provider|model/i);
    const list = await request(app)
      .get('/api/v1/chat/conversations')
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(list.body.conversations[0].lastMessagePreview).toBe('Tides are caused by the moon.');
    if (hasRedis) expect(await usageCount(alice.id)).toBe(1);
  });

  it('includes earlier turns as context on the next message', async () => {
    const id = await createConversation(alice, { systemPrompt: 'Reply in French.' });
    routeFetch({ primary: completion(['Bonjour']) });
    await sendMessage(alice, id, 'hello').expect(200);

    await sendMessage(alice, id, 'and again').expect(200);

    const second = JSON.parse(String(providerCalls(PRIMARY)[1]?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(second.messages.slice(1)).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'Bonjour' },
      { role: 'user', content: 'and again' },
    ]);
    expect(second.messages[0]?.content).toContain('Reply in French.');
  });

  it('marks a reply cut off by the output limit as truncated', async () => {
    const id = await createConversation(alice);
    routeFetch({ primary: completion(['A long answer that'], 'length') });

    const res = await sendMessage(alice, id, 'write an essay').expect(200);

    const complete = parseSse(res.text).events.find((event) => event.type === 'complete');
    expect(complete?.['status']).toBe('truncated');
    const assistant = await prisma.chatMessage.findFirstOrThrow({
      where: { conversationId: id, role: 'ASSISTANT' },
    });
    expect(assistant.status).toBe('TRUNCATED');
  });

  it('fails over to the next provider when the primary is out of balance', async () => {
    const id = await createConversation(alice);
    routeFetch({ primary: failure(402), fallback: completion(['From the fallback']) });

    const res = await sendMessage(alice, id, 'hi').expect(200);

    const { events } = parseSse(res.text);
    expect(events.at(-1)).toMatchObject({ type: 'complete', status: 'complete' });
    expect(providerCalls(PRIMARY)).toHaveLength(1);
    expect(providerCalls(FALLBACK)).toHaveLength(1);
    const assistant = await prisma.chatMessage.findFirstOrThrow({
      where: { conversationId: id, role: 'ASSISTANT' },
    });
    expect(assistant).toMatchObject({ content: 'From the fallback', provider: 'openrouter' });
  });

  it('sends a sanitized error event, keeps the turn as a retryable failed reply and does not charge when every provider fails', async () => {
    const id = await createConversation(alice);
    routeFetch({ primary: failure(500), fallback: failure(503) });
    const clientMessageId = randomUUID();

    const res = await sendMessage(alice, id, 'hi', clientMessageId).expect(200);

    const { events, isDone } = parseSse(res.text);
    expect(isDone).toBe(true);
    expect(events.map((event) => event.type)).toEqual(['start', 'error']);
    expect(events[1]).toEqual({
      type: 'error',
      code: 'PROVIDER_UNAVAILABLE',
      message: 'The AI service is temporarily unavailable. Please try again in a few minutes.',
      retryable: true,
    });
    expect(res.text).not.toMatch(/deepseek|openrouter|upstream detail/i);
    if (hasRedis) expect(await usageCount(alice.id)).toBe(0);
    const auth = `Bearer ${alice.accessToken}`;
    const transcript = await request(app).get(`/api/v1/chat/conversations/${id}`).set('Authorization', auth);
    expect(transcript.body.messages.map((m: { role: string; content: string; status: string }) => [m.role, m.content, m.status]))
      .toEqual([['user', 'hi', 'complete'], ['assistant', '', 'failed']]);
    const failedReplyId = String(events[0]?.['assistantMessageId']);
    expect(transcript.body.messages[1].id).toBe(failedReplyId);

    // Retry regenerates the failed reply in place of the original send.
    routeFetch({ primary: completion(['Recovered']) });
    await resetBreakers();
    const retry = await request(app)
      .post(`/api/v1/chat/conversations/${id}/messages/${failedReplyId}/regenerate/stream`)
      .set('Authorization', auth)
      .send({})
      .expect(200);
    expect(parseSse(retry.text).events.at(-1)).toMatchObject({ type: 'complete' });
    const stored = await prisma.chatMessage.findMany({ where: { conversationId: id }, orderBy: { createdAt: 'asc' } });
    expect(stored.map((m) => [m.role, m.content])).toEqual([['USER', 'hi'], ['ASSISTANT', 'Recovered']]);
  });

  it('keeps the previous reply when a regenerate fails before any output', async () => {
    const id = await createConversation(alice);
    routeFetch({ primary: completion(['Original answer']) });
    const sent = parseSse((await sendMessage(alice, id, 'q1').expect(200)).text);
    const replyId = String(sent.events[0]?.['assistantMessageId']);
    routeFetch({ primary: failure(500), fallback: failure(503) });

    await request(app)
      .post(`/api/v1/chat/conversations/${id}/messages/${replyId}/regenerate/stream`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({})
      .expect(200);

    const stored = await prisma.chatMessage.findMany({ where: { conversationId: id }, orderBy: { createdAt: 'asc' } });
    expect(stored.map((m) => [m.id === replyId, m.content])).toEqual([[false, 'q1'], [true, 'Original answer']]);
  });

  it('stops upstream on client disconnect and keeps the partial reply as stopped', async () => {
    const id = await createConversation(alice);
    let upstreamSignal: AbortSignal | undefined;
    routeFetch({
      primary: (init) => {
        upstreamSignal = init.signal ?? undefined;
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(sseToken('Partial answer')));
              init.signal?.addEventListener('abort', () =>
                controller.error(new DOMException('aborted', 'AbortError')),
              );
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
      },
    });
    const server: Server = app.listen(0);
    try {
      await openStreamAndDisconnectAfterToken(
        server,
        `/api/v1/chat/conversations/${id}/messages/stream`,
        {
          content: 'tell me a long story',
          clientMessageId: randomUUID(),
        },
      );

      await waitFor(async () => {
        const assistant = await prisma.chatMessage.findFirst({
          where: { conversationId: id, role: 'ASSISTANT' },
        });
        return assistant?.status === 'STOPPED' && assistant.content === 'Partial answer';
      });
      expect(upstreamSignal?.aborted).toBe(true);
      const user = await prisma.chatMessage.count({ where: { conversationId: id, role: 'USER' } });
      expect(user).toBe(1);
    } finally {
      server.close();
    }
  });

  it('rejects a reused clientMessageId with 409 before streaming', async () => {
    const id = await createConversation(alice);
    routeFetch({ primary: completion(['ok']) });
    const clientMessageId = randomUUID();
    await sendMessage(alice, id, 'first', clientMessageId).expect(200);

    const res = await sendMessage(alice, id, 'first', clientMessageId).expect(409);

    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body).toEqual({ error: 'This message was already sent', code: 'DUPLICATE_MESSAGE' });
    expect(providerCalls(PRIMARY)).toHaveLength(1);
  });

  it('rejects a user without a subscription with the paywall contract', async () => {
    const id = await prisma.chatConversation
      .create({ data: { userId: freeUser.id }, select: { id: true } })
      .then((row) => row.id);
    routeFetch({ primary: completion(['nope']) });

    const res = await sendMessage(freeUser, id, 'hello').expect(403);

    expect(res.body).toEqual(SUBSCRIPTION_REQUIRED_BODY);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 429 FAIR_USE_LIMIT once the daily chat ceiling is used up', async () => {
    const id = await createConversation(alice);
    routeFetch({ primary: completion(['nope']) });
    if (hasRedis) {
      await cache.set(chatUsageKey(alice.id), DAILY_LIMIT, 3600);
    } else {
      await prisma.chatMessage.createMany({
        data: Array.from({ length: DAILY_LIMIT }, (_, index) => ({
          conversationId: id,
          role: 'USER' as const,
          content: `m${index}`,
        })),
      });
    }

    const res = await sendMessage(alice, id, 'one more').expect(429);

    expect(res.body).toMatchObject({
      error: 'Daily fair-use limit reached',
      code: 'FAIR_USE_LIMIT',
    });
    expect(new Date(res.body.resetAt).getUTCHours()).toBe(0);
    expect(providerCalls(PRIMARY)).toHaveLength(0);
    if (hasRedis) expect(await usageCount(alice.id)).toBe(DAILY_LIMIT);
  });
});

describe('chat moderation', () => {
  it('refuses sexual content involving minors without calling the model', async () => {
    const id = await createConversation(alice);
    routeFetch({ moderation: () => flagged('sexual/minors'), primary: completion(['never']) });

    const res = await sendMessage(alice, id, 'flagged text').expect(200);

    const { events } = parseSse(res.text);
    expect(events.map((event) => event.type)).toEqual(['start', 'token', 'complete']);
    expect(String(events[1]?.['content'])).toContain("I can't help with that");
    expect(providerCalls(PRIMARY)).toHaveLength(0);
    const conversation = await prisma.chatConversation.findUniqueOrThrow({ where: { id } });
    expect(conversation.title).toBe('New chat');
    const assistant = await prisma.chatMessage.findFirstOrThrow({
      where: { conversationId: id, role: 'ASSISTANT' },
    });
    expect(assistant.status).toBe('COMPLETE');
  });

  it('answers self-harm intent with crisis resources instead of the model', async () => {
    const id = await createConversation(alice);
    routeFetch({ moderation: () => flagged('self-harm/intent'), primary: completion(['never']) });

    const res = await sendMessage(alice, id, 'flagged text').expect(200);

    const token = parseSse(res.text).events.find((event) => event.type === 'token');
    expect(String(token?.['content'])).toContain('988');
    expect(String(token?.['content'])).toContain('findahelpline.com');
    expect(providerCalls(PRIMARY)).toHaveLength(0);
  });

  it('refuses graphic violence before calling the model', async () => {
    const id = await createConversation(alice);
    routeFetch({ moderation: () => flagged('violence/graphic'), primary: completion(['never']) });

    const res = await sendMessage(alice, id, 'flagged text').expect(200);

    const token = parseSse(res.text).events.find((event) => event.type === 'token');
    expect(String(token?.['content'])).toContain("I can't help with that");
    expect(providerCalls(PRIMARY)).toHaveLength(0);
  });

  it('replaces a flagged reply with the refusal before saving it', async () => {
    const id = await createConversation(alice);
    let moderationCalls = 0;
    routeFetch({
      moderation: () => (moderationCalls++ === 0 ? unflagged() : flagged('hate/threatening')),
      primary: completion(['Offending reply text']),
    });

    const res = await sendMessage(alice, id, 'innocent question').expect(200);

    const complete = parseSse(res.text).events.find((event) => event.type === 'complete');
    expect(String(complete?.['content'])).toContain("I can't help with that");
    const assistant = await prisma.chatMessage.findFirstOrThrow({ where: { conversationId: id, role: 'ASSISTANT' } });
    expect(assistant.content).toBe(complete?.['content']);
    expect(assistant.content).not.toContain('Offending reply text');
  });

  it('lets the message through when moderation is down', async () => {
    const id = await createConversation(alice);
    routeFetch({
      moderation: () => new Response('down', { status: 503 }),
      primary: completion(['fine']),
    });

    const res = await sendMessage(alice, id, 'hello').expect(200);

    expect(parseSse(res.text).events.at(-1)).toMatchObject({ type: 'complete' });
  });
});

describe('chat regenerate', () => {
  it('replaces the latest reply and rejects older ones', async () => {
    const id = await createConversation(alice);
    routeFetch({ primary: completion(['First answer']) });
    const first = parseSse((await sendMessage(alice, id, 'q1').expect(200)).text);
    const firstReplyId = String(first.events[0]?.['assistantMessageId']);
    const second = parseSse((await sendMessage(alice, id, 'q2').expect(200)).text);
    const secondReplyId = String(second.events[0]?.['assistantMessageId']);
    routeFetch({ primary: completion(['Better answer']) });
    const auth = `Bearer ${alice.accessToken}`;

    const stale = await request(app)
      .post(`/api/v1/chat/conversations/${id}/messages/${firstReplyId}/regenerate/stream`)
      .set('Authorization', auth)
      .send({})
      .expect(409);
    expect(stale.body).toEqual({
      error: 'Only the latest reply can be regenerated',
      code: 'NOT_LATEST_MESSAGE',
    });
    const res = await request(app)
      .post(`/api/v1/chat/conversations/${id}/messages/${secondReplyId}/regenerate/stream`)
      .set('Authorization', auth)
      .send({})
      .expect(200);

    const { events } = parseSse(res.text);
    expect(events.at(-1)).toMatchObject({ type: 'complete', status: 'complete' });
    const stored = await prisma.chatMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    });
    expect(stored.map((m) => m.content)).toEqual(['q1', 'First answer', 'q2', 'Better answer']);
    expect(stored.some((m) => m.id === secondReplyId)).toBe(false);
    const regenerateBody = JSON.parse(String(providerCalls(PRIMARY).at(-1)?.body)) as {
      messages: Array<{ content: string }>;
    };
    expect(regenerateBody.messages.slice(1).map((m) => m.content)).toEqual([
      'q1',
      'First answer',
      'q2',
    ]);
  });
});

describe('chat regenerate ordering', () => {
  it('rejects regenerating a reply once a newer user message exists', async () => {
    const id = await createConversation(alice);
    routeFetch({ primary: completion(['A1']) });
    const sent = parseSse((await sendMessage(alice, id, 'U1').expect(200)).text);
    const replyId = String(sent.events[0]?.['assistantMessageId']);
    await prisma.chatMessage.create({ data: { conversationId: id, role: 'USER', content: 'U2' } });

    const res = await request(app)
      .post(`/api/v1/chat/conversations/${id}/messages/${replyId}/regenerate/stream`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({})
      .expect(409);

    expect(res.body.code).toBe('NOT_LATEST_MESSAGE');
    expect(providerCalls(PRIMARY)).toHaveLength(1);
  });
});

describe('chat message reports', () => {
  it('keeps the report and the reported text after the reply is regenerated away', async () => {
    const id = await createConversation(alice);
    routeFetch({ primary: completion(['Harmful answer']) });
    const sent = parseSse((await sendMessage(alice, id, 'q').expect(200)).text);
    const replyId = String(sent.events[0]?.['assistantMessageId']);
    const auth = `Bearer ${alice.accessToken}`;
    await request(app)
      .post(`/api/v1/chat/messages/${replyId}/report`)
      .set('Authorization', auth)
      .send({ reason: 'harmful' })
      .expect(201);
    routeFetch({ primary: completion(['Better answer']) });

    await request(app)
      .post(`/api/v1/chat/conversations/${id}/messages/${replyId}/regenerate/stream`)
      .set('Authorization', auth)
      .send({})
      .expect(200);
    await request(app).delete(`/api/v1/chat/conversations/${id}`).set('Authorization', auth).expect(204);

    const reports = await prisma.chatMessageReport.findMany({ where: { userId: alice.id } });
    expect(reports.map((r) => [r.messageId, r.messageContent, r.reason])).toContainEqual([
      null,
      'Harmful answer',
      'HARMFUL',
    ]);
  });

  it('records a report on an assistant reply', async () => {
    const id = await createConversation(alice);
    const message = await prisma.chatMessage.create({
      data: { conversationId: id, role: 'ASSISTANT', content: 'questionable answer' },
    });

    const res = await request(app)
      .post(`/api/v1/chat/messages/${message.id}/report`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ reason: 'inaccurate', details: 'wrong date' })
      .expect(201);

    expect(res.body).toEqual({ reported: true });
    const report = await prisma.chatMessageReport.findFirstOrThrow({
      where: { messageId: message.id },
    });
    expect(report).toMatchObject({
      userId: alice.id,
      reason: 'INACCURATE',
      details: 'wrong date',
      messageContent: 'questionable answer',
    });
  });

  it('rejects an unknown reason', async () => {
    const id = await createConversation(alice);
    const message = await prisma.chatMessage.create({
      data: { conversationId: id, role: 'ASSISTANT', content: 'answer' },
    });

    await request(app)
      .post(`/api/v1/chat/messages/${message.id}/report`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ reason: 'boring' })
      .expect(400);
  });
});

// Breaker state is shared through Redis and in-process; a tripped breaker must not leak between tests.
async function resetBreakers(): Promise<void> {
  if (hasRedis) await cache.invalidatePattern('llm:cb:v1:*');
  resetDefaultLlmGateway(
    loadLlmConfig({
      LLM_PROVIDER_CHAIN: 'deepseek,openrouter',
      LLM_DEEPSEEK_API_KEY: 'test-primary-key',
      LLM_DEEPSEEK_BASE_URL: PRIMARY,
      LLM_OPENROUTER_API_KEY: 'test-fallback-key',
      LLM_OPENROUTER_BASE_URL: FALLBACK,
      LLM_LAST_PROVIDER_RETRIES: '0',
    }),
  );
}

function openStreamAndDisconnectAfterToken(
  server: Server,
  path: string,
  body: unknown,
): Promise<void> {
  const { port } = server.address() as AddressInfo;
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${alice.accessToken}`,
        },
      },
      (res) => {
        let received = '';
        res.on('data', (chunk: Buffer) => {
          received += chunk.toString();
          if (received.includes('"type":"token"')) {
            req.destroy();
            resolve();
          }
        });
      },
    );
    req.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ECONNRESET') reject(error);
    });
    req.end(JSON.stringify(body));
  });
}
