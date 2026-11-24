import { vi } from 'vitest';

import type { LlmLogger } from '../../src/features/llm/openai-compatible-provider.js';

export const silentLogger = (): LlmLogger & {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

export const sseToken = (content: string): string =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

export const sseFinish = (reason = 'stop'): string =>
  `data: ${JSON.stringify({
    choices: [{ delta: {}, finish_reason: reason }],
    usage: { prompt_tokens: 12, completion_tokens: 4, prompt_cache_hit_tokens: 8 },
  })}\n\ndata: [DONE]\n\n`;

export const streamResponse = (...chunks: string[]): Response =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );

/** A body that never produces data and errors when the request is aborted. */
export const hangingResponse = (init: RequestInit): Response =>
  new Response(
    new ReadableStream({
      start(controller) {
        init.signal?.addEventListener('abort', () =>
          controller.error(new DOMException('aborted', 'AbortError')),
        );
      },
    }),
  );
