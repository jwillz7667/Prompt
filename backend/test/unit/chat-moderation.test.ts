import { describe, expect, it, vi } from 'vitest';

import { createModerator, verdictFromCategories } from '../../src/features/chat/moderation.js';

const logger = () => ({ warn: vi.fn() });

const moderationReply = (categories: Record<string, boolean>): Response =>
  new Response(JSON.stringify({ results: [{ flagged: true, categories }] }), {
    headers: { 'Content-Type': 'application/json' },
  });

describe('verdictFromCategories', () => {
  it('refuses sexual content involving minors ahead of any other category', () => {
    expect(verdictFromCategories({ 'sexual/minors': true, 'self-harm/intent': true })).toBe(
      'refuse_minors',
    );
  });

  it('routes self-harm intent and instructions to the supportive response', () => {
    expect(verdictFromCategories({ 'self-harm/intent': true })).toBe('self_harm_support');
    expect(verdictFromCategories({ 'self-harm/instructions': true })).toBe('self_harm_support');
  });

  it('passes every other category through to the model', () => {
    expect(verdictFromCategories({ violence: true, harassment: true, 'self-harm': true })).toBe(
      'allow',
    );
  });
});

describe('createModerator', () => {
  it('allows everything without calling out when disabled', async () => {
    const fetch = vi.fn();
    const moderate = createModerator({
      isEnabled: false,
      apiKey: 'key',
      timeoutMs: 2000,
      logger: logger(),
      fetch,
    });

    await expect(moderate('anything')).resolves.toBe('allow');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('maps a flagged reply to a verdict', async () => {
    const fetch = vi.fn().mockResolvedValue(moderationReply({ 'sexual/minors': true }));
    const moderate = createModerator({
      isEnabled: true,
      apiKey: 'key',
      timeoutMs: 2000,
      logger: logger(),
      fetch,
    });

    await expect(moderate('text')).resolves.toBe('refuse_minors');
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      model: 'omni-moderation-latest',
      input: 'text',
    });
  });

  it('fails open with a warning when the moderation service errors', async () => {
    const log = logger();
    const moderate = createModerator({
      isEnabled: true,
      apiKey: 'key',
      timeoutMs: 2000,
      logger: log,
      fetch: vi.fn().mockResolvedValue(new Response('down', { status: 503 })),
    });

    await expect(moderate('text')).resolves.toBe('allow');
    expect(log.warn).toHaveBeenCalledOnce();
  });

  it('fails open when the moderation call times out', async () => {
    const log = logger();
    const moderate = createModerator({
      isEnabled: true,
      apiKey: 'key',
      timeoutMs: 20,
      logger: log,
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('timed out', 'TimeoutError')),
          );
        }),
    });

    await expect(moderate('text')).resolves.toBe('allow');
    expect(log.warn).toHaveBeenCalledOnce();
  });

  it('rethrows when the caller aborted instead of reporting an outage', async () => {
    const controller = new AbortController();
    const moderate = createModerator({
      isEnabled: true,
      apiKey: 'key',
      timeoutMs: 2000,
      logger: logger(),
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
          controller.abort();
        }),
    });

    await expect(moderate('text', controller.signal)).rejects.toThrow('aborted');
  });
});
