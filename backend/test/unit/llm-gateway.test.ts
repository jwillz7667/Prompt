import { describe, expect, it, vi } from 'vitest';

import { createCircuitBreaker, createMemoryBreakerStore } from '../../src/features/llm/circuit-breaker.js';
import { loadLlmConfig } from '../../src/features/llm/config.js';
import { ProviderError, toClientStreamError } from '../../src/features/llm/errors.js';
import { createLlmGateway } from '../../src/features/llm/gateway.js';
import {
  createOpenAiCompatibleProvider,
  type FetchLike,
} from '../../src/features/llm/openai-compatible-provider.js';
import type { LlmChatRequest } from '../../src/features/llm/types.js';
import { hangingResponse, silentLogger, sseFinish, sseToken, streamResponse } from './llm-test-helpers.js';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const config = loadLlmConfig({
  LLM_PROVIDER_CHAIN: 'deepseek,openrouter',
  LLM_DEEPSEEK_API_KEY: 'ds-key',
  LLM_OPENROUTER_API_KEY: 'or-key',
  LLM_LAST_PROVIDER_RETRIES: '0',
});

function buildGateway(fetch: FetchLike, overrides: { ttftMs?: number; now?: () => number } = {}) {
  const logger = silentLogger();
  const store = createMemoryBreakerStore(overrides.now);
  const breaker = createCircuitBreaker({ store, config: config.breaker, logger });
  const gateway = createLlmGateway({
    providers: config.chain.map((provider) => createOpenAiCompatibleProvider(provider, { logger, fetch })),
    breaker,
    timeouts: { ttftMs: overrides.ttftMs ?? 1_000, idleMs: 1_000, totalMs: 5_000 },
    lastProviderRetries: 0,
    logger,
    sleep: async () => undefined,
  });
  return { gateway, logger };
}

const request: LlmChatRequest = { messages: [{ role: 'user', content: 'hi' }], maxTokens: 64 };

describe('LLM gateway', () => {
  it('fails over to the next provider when the first fails before any token', async () => {
    const fetch = vi.fn<FetchLike>(async (url) =>
      url === DEEPSEEK_URL
        ? new Response('busy', { status: 503 })
        : streamResponse(sseToken('from fallback') + sseFinish()),
    );
    const { gateway } = buildGateway(fetch);
    const tokens: string[] = [];

    const result = await gateway.streamChat(request, { onToken: (token) => { tokens.push(token); } });

    expect(result.provider).toBe('openrouter');
    expect(result.model).toBe('deepseek/deepseek-v4.1-flash');
    expect(tokens).toEqual(['from fallback']);
  });

  it('treats a missed first-token deadline as a failover trigger', async () => {
    const fetch = vi.fn<FetchLike>(async (url, init) =>
      url === DEEPSEEK_URL ? hangingResponse(init) : streamResponse(sseToken('fast') + sseFinish()),
    );
    const { gateway } = buildGateway(fetch, { ttftMs: 20 });

    const result = await gateway.streamChat(request, { onToken: () => undefined });

    expect(result.provider).toBe('openrouter');
  });

  it('never fails over once a token has been emitted', async () => {
    const fetch = vi.fn<FetchLike>(async (url) =>
      url === DEEPSEEK_URL
        ? streamResponse(sseToken('partial'))
        : streamResponse(sseToken('should not be used') + sseFinish()),
    );
    const { gateway } = buildGateway(fetch);
    const tokens: string[] = [];

    const failure: unknown = await gateway
      .streamChat(request, { onToken: (token) => { tokens.push(token); } })
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ kind: 'interrupted', hasStreamedOutput: true, provider: 'deepseek' });
    expect(tokens).toEqual(['partial']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('opens the breaker on 402 and skips that provider on later requests', async () => {
    const fetch = vi.fn<FetchLike>(async (url) =>
      url === DEEPSEEK_URL
        ? new Response('pay up', { status: 402 })
        : streamResponse(sseToken('ok') + sseFinish()),
    );
    const { gateway, logger } = buildGateway(fetch);

    await gateway.streamChat(request, { onToken: () => undefined });
    await gateway.streamChat(request, { onToken: () => undefined });

    const deepseekCalls = fetch.mock.calls.filter(([url]) => url === DEEPSEEK_URL);
    expect(deepseekCalls).toHaveLength(1);
    expect(fetch.mock.calls.filter(([url]) => url === OPENROUTER_URL)).toHaveLength(2);
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error.mock.calls[0]![0]).toMatchObject({ provider: 'deepseek', kind: 'insufficient_balance' });
  });

  it('does not fail over a request-specific rejection', async () => {
    const fetch = vi.fn<FetchLike>(async () => new Response('bad', { status: 400 }));
    const { gateway } = buildGateway(fetch);

    await expect(gateway.completeChat(request)).rejects.toMatchObject({ kind: 'bad_request' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('fails over and opens the breaker when the primary rejects its configured model', async () => {
    const fetch = vi.fn<FetchLike>(async (url) =>
      url === DEEPSEEK_URL
        ? new Response('{"error":{"message":"Model Not Exist"}}', { status: 400 })
        : streamResponse(sseToken('ok') + sseFinish()),
    );
    const { gateway } = buildGateway(fetch);

    const first = await gateway.streamChat(request, { onToken: () => undefined });
    const second = await gateway.streamChat(request, { onToken: () => undefined });

    expect([first.provider, second.provider]).toEqual(['openrouter', 'openrouter']);
    expect(fetch.mock.calls.filter(([url]) => url === DEEPSEEK_URL)).toHaveLength(1);
  });

  it('throws the last provider error when every provider fails, mapped to a generic client error', async () => {
    const fetch = vi.fn<FetchLike>(async (url) =>
      new Response('x', { status: url === DEEPSEEK_URL ? 503 : 429 }),
    );
    const { gateway } = buildGateway(fetch);

    const failure: unknown = await gateway.completeChat(request).catch((error: unknown) => error);

    expect(failure).toMatchObject({ kind: 'rate_limited', provider: 'openrouter' });
    const clientError = toClientStreamError(failure);
    expect(clientError.code).toBe('RATE_LIMITED');
    expect(JSON.stringify(clientError)).not.toMatch(/openrouter|deepseek/i);
  });

  it('throws not_configured when the chain is empty', async () => {
    const logger = silentLogger();
    const gateway = createLlmGateway({
      providers: [],
      breaker: createCircuitBreaker({ store: createMemoryBreakerStore(), config: config.breaker, logger }),
      timeouts: { ttftMs: 1, idleMs: 1, totalMs: 1 },
      lastProviderRetries: 0,
      logger,
    });

    await expect(gateway.completeChat(request)).rejects.toMatchObject({ kind: 'not_configured' });
  });

  it('respects a caller abort without trying other providers or tripping the breaker', async () => {
    const controller = new AbortController();
    const fetch = vi.fn<FetchLike>(async (_url, init) => {
      queueMicrotask(() => controller.abort());
      return hangingResponse(init);
    });
    const { gateway, logger } = buildGateway(fetch);

    await expect(gateway.streamChat({ ...request, signal: controller.signal }, { onToken: () => undefined }))
      .rejects.toMatchObject({ kind: 'interrupted' });
    expect(fetch).toHaveBeenCalledOnce();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('only offers image turns to image-capable providers', async () => {
    const fetch = vi.fn<FetchLike>(async () => new Response('down', { status: 503 }));
    const { gateway } = buildGateway(fetch);
    const imageRequest: LlmChatRequest = {
      maxTokens: 64,
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'what is this' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } },
      ] }],
    };

    await expect(gateway.completeChat(imageRequest)).rejects.toBeInstanceOf(ProviderError);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([DEEPSEEK_URL]);
  });

  it('applies per-provider model overrides', async () => {
    const fetch = vi.fn<FetchLike>(async () => streamResponse(sseToken('ok') + sseFinish()));
    const { gateway } = buildGateway(fetch);

    const result = await gateway.streamChat(
      { ...request, modelOverrides: { deepseek: 'deepseek-flash-vision' } },
      { onToken: () => undefined },
    );

    expect(result.model).toBe('deepseek-flash-vision');
    expect(JSON.parse(String(fetch.mock.calls[0]![1].body)).model).toBe('deepseek-flash-vision');
  });
});
