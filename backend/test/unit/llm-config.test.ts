import { describe, expect, it, vi } from 'vitest';

import { LlmConfigError, loadLlmConfig } from '../../src/features/llm/config.js';
import { probeConfiguredModel } from '../../src/features/llm/validate.js';
import { silentLogger } from './llm-test-helpers.js';

describe('LLM config', () => {
  it('defaults to deepseek then openrouter and skips providers without credentials', () => {
    const config = loadLlmConfig({ DEEPSEEK_API_KEY: 'legacy-key' });

    expect(config.chain.map((provider) => provider.name)).toEqual(['deepseek']);
    expect(config.chain[0]).toMatchObject({ apiKey: 'legacy-key', model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com' });
    expect(config.skipped).toEqual([{ name: 'openrouter', reason: expect.stringContaining('LLM_OPENROUTER_API_KEY') }]);
    expect(config.timeouts).toEqual({ ttftMs: 15_000, idleMs: 60_000, totalMs: 180_000 });
  });

  it('uses an explicit model exactly and only rewrites documented retired aliases', () => {
    expect(loadLlmConfig({ LLM_DEEPSEEK_MODEL: 'deepseek-flash-0901' }).deepseekModel).toBe('deepseek-flash-0901');
    expect(loadLlmConfig({ DEEPSEEK_MODEL: 'deepseek-reasoner' }).deepseekModel).toBe('deepseek-flash');
    expect(loadLlmConfig({ LLM_DEEPSEEK_MODEL: 'deepseek-v4-flash-vision-exp' }).deepseekModel)
      .toBe('deepseek-v4-flash-vision-exp');
  });

  it('honors a custom chain order with the local provider first', () => {
    const config = loadLlmConfig({
      LLM_PROVIDER_CHAIN: 'local, deepseek ,openrouter',
      LLM_DEEPSEEK_API_KEY: 'a',
      LLM_OPENROUTER_API_KEY: 'b',
      LLM_LOCAL_BASE_URL: 'https://llm.example.com/v1',
      LLM_LOCAL_API_KEY: 'c',
      LLM_LOCAL_MODEL: 'qwen',
    });

    expect(config.chain.map((provider) => provider.name)).toEqual(['local', 'deepseek', 'openrouter']);
  });

  it.each([
    [{ LLM_PROVIDER_CHAIN: 'deepseek,bogus' }],
    [{ LLM_TTFT_TIMEOUT_MS: 'fast' }],
    [{ LLM_OPENROUTER_PROVIDER_PREFS: '{not json' }],
    [{ LLM_LOCAL_CF_ACCESS_CLIENT_ID: 'only-half' }],
    [{ LLM_LOCAL_BASE_URL: 'ftp://nope' }],
  ])('rejects malformed configuration %o', (env) => {
    expect(() => loadLlmConfig(env)).toThrow(LlmConfigError);
  });
});

describe('boot model probe', () => {
  const provider = loadLlmConfig({ LLM_DEEPSEEK_API_KEY: 'k' }).chain[0]!;

  it('logs an error when the configured model is not listed', async () => {
    const logger = silentLogger();
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: [{ id: 'deepseek-other' }] }));

    await probeConfiguredModel(provider, { logger, fetch });

    expect(fetch.mock.calls[0]![0]).toBe('https://api.deepseek.com/models');
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('never throws when the provider is unreachable', async () => {
    const logger = silentLogger();
    const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(probeConfiguredModel(provider, { logger, fetch })).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
