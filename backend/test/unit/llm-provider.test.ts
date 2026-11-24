import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadLlmConfig, type LlmProviderConfig } from '../../src/features/llm/config.js';
import { ProviderError, classifyProviderStatus } from '../../src/features/llm/errors.js';
import {
  TokenConsumerError,
  createOpenAiCompatibleProvider,
  parseRetryAfterMs,
} from '../../src/features/llm/openai-compatible-provider.js';
import { createSseDataDecoder } from '../../src/features/llm/sse-decoder.js';
import { hangingResponse, silentLogger, sseFinish, sseToken, streamResponse } from './llm-test-helpers.js';

const config = loadLlmConfig({
  LLM_PROVIDER_CHAIN: 'deepseek,openrouter,local',
  LLM_DEEPSEEK_API_KEY: 'ds-key',
  LLM_OPENROUTER_API_KEY: 'or-key',
  LLM_OPENROUTER_PROVIDER_PREFS: '{"order":["deepseek"],"allow_fallbacks":false}',
  LLM_LOCAL_BASE_URL: 'https://llm.example.com/v1/',
  LLM_LOCAL_API_KEY: 'local-key',
  LLM_LOCAL_MODEL: 'qwen3-27b-awq',
  LLM_LOCAL_CF_ACCESS_CLIENT_ID: 'cf-id',
  LLM_LOCAL_CF_ACCESS_CLIENT_SECRET: 'cf-secret',
});
const providerConfig = (name: LlmProviderConfig['name']): LlmProviderConfig => {
  const found = config.chain.find((provider) => provider.name === name);
  if (!found) throw new Error(`missing ${name} in test config`);
  return found;
};
const timeouts = { ttftMs: 1_000, idleMs: 1_000, totalMs: 5_000 };
const baseRequest = { messages: [{ role: 'user' as const, content: 'hi' }], maxTokens: 64 };

afterEach(() => {
  vi.useRealTimers();
});

describe('SSE data decoder', () => {
  it('reassembles payloads split across arbitrary chunk boundaries and ignores comments', () => {
    const wire = `: keep-alive\n\n${sseToken('Hel')}\r\n: OPENROUTER PROCESSING\n${sseToken('lo')}data: [DONE]`;
    const decoder = createSseDataDecoder();
    const payloads: string[] = [];

    for (let index = 0; index < wire.length; index += 7) {
      payloads.push(...decoder.push(wire.slice(index, index + 7)));
    }
    payloads.push(...decoder.flush());

    expect(payloads.map((payload) => (payload === '[DONE]' ? payload : JSON.parse(payload).choices[0].delta.content)))
      .toEqual(['Hel', 'lo', '[DONE]']);
  });
});

describe('status classification', () => {
  it.each([
    [402, 'insufficient_balance'],
    [401, 'auth'],
    [403, 'auth'],
    [408, 'timeout'],
    [413, 'context_length'],
    [429, 'rate_limited'],
    [503, 'overloaded'],
    [524, 'timeout'],
    [404, 'model_unavailable'],
    [400, 'bad_request'],
  ] as const)('maps HTTP %i to %s', (status, kind) => {
    expect(classifyProviderStatus(status)).toBe(kind);
  });

  it('parses Retry-After seconds and HTTP dates', () => {
    expect(parseRetryAfterMs('3')).toBe(3_000);
    expect(parseRetryAfterMs(new Date(10_000).toUTCString(), 4_000)).toBe(6_000);
    expect(parseRetryAfterMs('soon')).toBeUndefined();
  });
});

describe('OpenAI-compatible provider', () => {
  it('streams tokens split across chunks and reports usage including cache hits', async () => {
    const wire = sseToken('Hello ') + ': ping\n\n' + sseToken('world') + sseFinish();
    const fetch = vi.fn().mockResolvedValue(streamResponse(wire.slice(0, 13), wire.slice(13, 41), wire.slice(41)));
    const provider = createOpenAiCompatibleProvider(providerConfig('deepseek'), { logger: silentLogger(), fetch });
    const tokens: string[] = [];

    const result = await provider.stream(baseRequest, {
      model: 'deepseek-flash', timeouts, onToken: (token) => { tokens.push(token); },
    });

    expect(tokens).toEqual(['Hello ', 'world']);
    expect(result).toMatchObject({
      content: 'Hello world', finishReason: 'stop', provider: 'deepseek', model: 'deepseek-flash',
      usage: { inputTokens: 12, outputTokens: 4, cachedInputTokens: 8 },
    });
  });

  it('sends each provider its own reasoning switch, headers and extra body', async () => {
    const fetch = vi.fn().mockImplementation(async () => streamResponse(sseToken('ok') + sseFinish()));
    const logger = silentLogger();
    for (const name of ['deepseek', 'openrouter', 'local'] as const) {
      const provider = createOpenAiCompatibleProvider(providerConfig(name), { logger, fetch });
      await provider.stream({ ...baseRequest, reasoning: 'on' }, { model: 'm', timeouts, onToken: () => undefined });
    }

    const [deepseek, openrouter, local] = fetch.mock.calls.map(([url, init]) => ({
      url, headers: init.headers, body: JSON.parse(init.body),
    }));
    expect(deepseek!.body.thinking).toEqual({ type: 'enabled' });
    expect(openrouter!.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(openrouter!.body.reasoning).toEqual({ enabled: true });
    expect(openrouter!.body.provider).toEqual({ order: ['deepseek'], allow_fallbacks: false });
    expect(openrouter!.headers['X-Title']).toBe('Promptomize');
    expect(local!.url).toBe('https://llm.example.com/v1/chat/completions');
    expect(local!.body.chat_template_kwargs).toEqual({ enable_thinking: true });
    expect(local!.headers['CF-Access-Client-Id']).toBe('cf-id');
    expect(local!.headers['CF-Access-Client-Secret']).toBe('cf-secret');
  });

  it('surfaces a length finish reason as a result instead of an error', async () => {
    const fetch = vi.fn().mockResolvedValue(streamResponse(sseToken('Partial') + sseFinish('length')));
    const provider = createOpenAiCompatibleProvider(providerConfig('deepseek'), { logger: silentLogger(), fetch });

    const result = await provider.stream(baseRequest, { model: 'm', timeouts, onToken: () => undefined });

    expect(result.finishReason).toBe('length');
    expect(result.content).toBe('Partial');
  });

  it('maps HTTP failures to typed errors with Retry-After and never echoes the body', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response('prompt echo sk-secret', { status: 429, headers: { 'Retry-After': '2' } }),
    );
    const provider = createOpenAiCompatibleProvider(providerConfig('openrouter'), { logger: silentLogger(), fetch });

    const failure: unknown = await provider
      .stream(baseRequest, { model: 'm', timeouts, onToken: () => undefined })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ProviderError);
    expect(failure).toMatchObject({ kind: 'rate_limited', status: 429, retryAfterMs: 2_000, provider: 'openrouter' });
    expect(failure instanceof Error ? failure.message : '').not.toContain('secret');
  });

  it('classifies a 400 that mentions the context window as context_length', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response('{"error":{"message":"This model\'s maximum context length is 131072 tokens"}}', { status: 400 }),
    );
    const provider = createOpenAiCompatibleProvider(providerConfig('deepseek'), { logger: silentLogger(), fetch });

    await expect(provider.complete(baseRequest, { model: 'm', timeoutMs: 1_000 }))
      .rejects.toMatchObject({ kind: 'context_length' });
  });

  it.each([
    [400, '{"error":{"message":"Model Not Exist","type":"invalid_request_error"}}'],
    [422, '{"error":{"message":"Unknown parameter: thinking"}}'],
    [400, '{"error":{"message":"deepseek/deepseek-v9 is not a valid model ID","code":400}}'],
  ])('classifies a %i rejecting the model or a request field as model_unavailable', async (status, body) => {
    const fetch = vi.fn().mockResolvedValue(new Response(body, { status }));
    const provider = createOpenAiCompatibleProvider(providerConfig('deepseek'), { logger: silentLogger(), fetch });

    const failure: unknown = await provider
      .complete(baseRequest, { model: 'm', timeoutMs: 1_000 })
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ kind: 'model_unavailable', isFailoverEligible: true, isProviderWide: true });
  });

  it('keeps a 400 about the request content as a non-failover bad_request', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response('{"error":{"message":"messages[0].content must be a string"}}', { status: 400 }),
    );
    const provider = createOpenAiCompatibleProvider(providerConfig('deepseek'), { logger: silentLogger(), fetch });

    await expect(provider.complete(baseRequest, { model: 'm', timeoutMs: 1_000 }))
      .rejects.toMatchObject({ kind: 'bad_request' });
  });

  it('turns an in-band error object into a ProviderError that records streamed output', async () => {
    const fetch = vi.fn().mockResolvedValue(streamResponse(
      sseToken('Half'), `data: ${JSON.stringify({ error: { code: 502, message: 'upstream died' } })}\n\n`,
    ));
    const provider = createOpenAiCompatibleProvider(providerConfig('openrouter'), { logger: silentLogger(), fetch });

    await expect(provider.stream(baseRequest, { model: 'm', timeouts, onToken: () => undefined }))
      .rejects.toMatchObject({ kind: 'overloaded', hasStreamedOutput: true });
  });

  it('fails with timeout when no token arrives before the first-token deadline', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => hangingResponse(init));
    const provider = createOpenAiCompatibleProvider(providerConfig('deepseek'), { logger: silentLogger(), fetch });

    const pending = expect(provider.stream(baseRequest, {
      model: 'm', timeouts: { ttftMs: 100, idleMs: 1_000, totalMs: 5_000 }, onToken: () => undefined,
    })).rejects.toMatchObject({ kind: 'timeout', hasStreamedOutput: false });
    await vi.advanceTimersByTimeAsync(150);
    await pending;
  });

  it('reports a caller abort as interrupted', async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      queueMicrotask(() => controller.abort());
      return hangingResponse(init);
    });
    const provider = createOpenAiCompatibleProvider(providerConfig('deepseek'), { logger: silentLogger(), fetch });

    await expect(provider.stream({ ...baseRequest, signal: controller.signal }, {
      model: 'm', timeouts, onToken: () => undefined,
    })).rejects.toMatchObject({ kind: 'interrupted' });
  });

  it('wraps token-consumer failures so they are not blamed on the provider', async () => {
    const fetch = vi.fn().mockResolvedValue(streamResponse(sseToken('x') + sseFinish()));
    const provider = createOpenAiCompatibleProvider(providerConfig('deepseek'), { logger: silentLogger(), fetch });
    const original = new Error('socket closed');

    const failure: unknown = await provider
      .stream(baseRequest, { model: 'm', timeouts, onToken: () => { throw original; } })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(TokenConsumerError);
    expect(failure instanceof TokenConsumerError ? failure.original : undefined).toBe(original);
  });

  it('parses a non-stream completion', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({
      choices: [{ message: { content: 'Done' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 2 } },
    }));
    const provider = createOpenAiCompatibleProvider(providerConfig('openrouter'), { logger: silentLogger(), fetch });

    const result = await provider.complete(baseRequest, { model: 'm', timeoutMs: 1_000 });

    expect(result).toMatchObject({ content: 'Done', finishReason: 'stop', usage: { inputTokens: 3, outputTokens: 1, cachedInputTokens: 2 } });
    expect(JSON.parse(fetch.mock.calls[0]![1].body).stream).toBe(false);
  });
});
