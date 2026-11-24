import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env['LLM_PROVIDER_CHAIN'] = 'deepseek';
  process.env['DEEPSEEK_API_KEY'] = 'test-key-never-sent';
  process.env['LLM_LAST_PROVIDER_RETRIES'] = '0';
  process.env['LLM_TTFT_TIMEOUT_MS'] = '50';
  process.env['LLM_IDLE_TIMEOUT_MS'] = '50';
  process.env['LLM_TOTAL_TIMEOUT_MS'] = '200';
  delete process.env['DEEPSEEK_MODEL'];
  delete process.env['LLM_DEEPSEEK_MODEL'];
  delete process.env['PROMPT_VISION_PROVIDER'];
});
vi.mock('../../src/utils/logger.js', () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return { promptLogger: log, logger: log };
});
vi.mock('../../src/services/imageAnalysisService.js', () => ({
  imageAnalysisService: { enrichAttachmentForPrompt: vi.fn() },
}));

import {
  enhancePrompt, enhancePromptInThreadStream, enhancePromptStream, requestCompletion, streamCompletion,
  type DeepSeekRequest,
} from '../../src/services/deepseekService.js';
import { imageAnalysisService } from '../../src/services/imageAnalysisService.js';
import { getDeepseekModel, resolveDeepseekModel } from '../../src/services/deepseekModels.js';
import { enhancePromptV2 } from '../../src/services/promptEnhancementEngine.js';
import { completeWithProvider } from '../../src/services/providerAdapters.js';
import { ProviderError, resetDefaultLlmGateway } from '../../src/features/llm/index.js';

const request: DeepSeekRequest = {
  model: 'deepseek-flash', messages: [{ role: 'user', content: 'Improve this prompt' }],
  temperature: 0.3, max_tokens: 512, stream: false, thinking: { type: 'disabled' },
};
const callbacks = () => ({ onToken: vi.fn(), onComplete: vi.fn(), onError: vi.fn() });
const token = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
const finish = (reason = 'stop') => `data: ${JSON.stringify({
  choices: [{ delta: {}, finish_reason: reason }],
  usage: { prompt_tokens: 20, completion_tokens: 10 },
})}\n\ndata: [DONE]`;
const respond = (...chunks: string[]) => new Response(new ReadableStream({
  start(controller) {
    for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
    controller.close();
  },
}));
const completion = (content = 'A complete prompt', finish_reason = 'stop') => Response.json({
  choices: [{ message: { content }, finish_reason }], usage: { prompt_tokens: 20, completion_tokens: 10 },
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.useRealTimers();
  // Breaker state is process-local in unit tests; isolate each case.
  resetDefaultLlmGateway();
});

describe('prompt transport through the LLM gateway', () => {
  it('handles arbitrary SSE chunk boundaries, CRLF, usage and a final event without a newline', async () => {
    const wire = (token('A prompt') + finish()).replaceAll('\n', '\r\n');
    const fetch = vi.fn().mockResolvedValue(respond(wire.slice(0, 8), wire.slice(8, 80), wire.slice(80)));
    vi.stubGlobal('fetch', fetch);
    const cb = callbacks();
    await streamCompletion({ ...request, stream: true }, 'chat', cb);
    expect(cb.onError).not.toHaveBeenCalled();
    expect(cb.onToken).toHaveBeenCalledWith('A prompt');
    expect(cb.onComplete).toHaveBeenCalledWith(expect.objectContaining({
      enhancedPrompt: 'A prompt', inputTokens: 20, outputTokens: 10, totalTokens: 30,
    }));
    expect(fetch.mock.calls[0]![0]).toBe('https://api.deepseek.com/chat/completions');
    expect(JSON.parse(fetch.mock.calls[0]![1].body).stream_options.include_usage).toBe(true);
  });

  it('still accepts the deprecated api-key argument order', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(token('Answer') + finish())));
    const cb = callbacks();
    await streamCompletion({ ...request, stream: true }, 'ignored-key', 'optimize', cb);
    expect(cb.onComplete).toHaveBeenCalledOnce();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion()));
    expect((await requestCompletion(request, 'ignored-key', 'chat')).enhancedPrompt).toBe('A complete prompt');
  });

  it.each([
    ['empty', finish(), 'interrupted'],
    ['truncated', token('Partial answer'), 'interrupted'],
    ['length-limited', token('Partial answer') + finish('length'), 'interrupted'],
    ['filtered', token('Partial answer') + finish('content_filter'), 'content_filter'],
  ])('does not persist %s streams as successful completions', async (_name, wire, kind) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(wire)));
    const cb = callbacks();
    await streamCompletion({ ...request, stream: true }, 'chat', cb);
    expect(cb.onComplete).not.toHaveBeenCalled();
    expect(cb.onError).toHaveBeenCalledOnce();
    expect(cb.onError.mock.calls[0]![0]).toBeInstanceOf(ProviderError);
    expect(cb.onError.mock.calls[0]![0].kind).toBe(kind);
  });

  it('skips a malformed data line and completes with the remaining tokens', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      respond(token('Partial ') + 'data: {broken}\n\n' + token('answer') + finish()),
    ));
    const cb = callbacks();
    await streamCompletion({ ...request, stream: true }, 'chat', cb);
    expect(cb.onError).not.toHaveBeenCalled();
    expect(cb.onComplete).toHaveBeenCalledWith(expect.objectContaining({ enhancedPrompt: 'Partial answer' }));
  });

  it('propagates a failing token consumer instead of swallowing it as invalid JSON', async () => {
    const fetch = vi.fn().mockResolvedValue(respond(token('Answer') + finish()));
    vi.stubGlobal('fetch', fetch);
    const cb = callbacks();
    cb.onToken.mockRejectedValue(new Error('Client disconnected'));
    await streamCompletion({ ...request, stream: true }, 'chat', cb);
    expect(cb.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Client disconnected' }));
    expect(cb.onComplete).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('awaits async completion persistence before resolving the public stream API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(token('Answer') + finish())));
    let release!: () => void;
    const persisted = new Promise<void>((resolve) => { release = resolve; });
    const cb = callbacks();
    cb.onComplete.mockReturnValue(persisted);
    let settled = false;
    const pending = enhancePromptStream({ prompt: 'Write a headline', tier: 'standard' }, cb)
      .then(() => { settled = true; });
    await vi.waitFor(() => expect(cb.onComplete).toHaveBeenCalledOnce());
    expect(settled).toBe(false);
    release();
    await pending;
    expect(settled).toBe(true);
  });

  it('applies the total deadline to a one-shot body that stalls after successful headers', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(async (_url, init: RequestInit) => new Response(new ReadableStream({
      start(controller) {
        init.signal!.addEventListener('abort', () => controller.error(new DOMException('Timed out', 'AbortError')));
      },
    })));
    vi.stubGlobal('fetch', fetch);
    const pending = expect(requestCompletion(request, 'chat')).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(250);
    await pending;
    expect(fetch).toHaveBeenCalledOnce(); // LLM_LAST_PROVIDER_RETRIES=0 must be honored.
  });

  it('reports an idle stream as failure even after content has arrived', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url, init: RequestInit) => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(token('Partial answer')));
        init.signal!.addEventListener('abort', () => controller.error(new DOMException('Timed out', 'AbortError')));
      },
    }))));
    const cb = callbacks();
    const pending = streamCompletion({ ...request, stream: true }, 'chat', cb);
    await vi.advanceTimersByTimeAsync(60);
    await pending;
    expect(cb.onComplete).not.toHaveBeenCalled();
    expect(cb.onError).toHaveBeenCalledOnce();
    expect(cb.onError.mock.calls[0]![0]).toMatchObject({ kind: 'timeout', hasStreamedOutput: true });
  });

  it('does not echo error bodies or retry invalid provider credentials', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('secret prompt and credentials', { status: 401 }));
    vi.stubGlobal('fetch', fetch);
    const failure: unknown = await requestCompletion(request, 'chat').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ProviderError);
    expect(failure).toMatchObject({ kind: 'auth', status: 401 });
    expect(failure instanceof Error ? failure.message : '').not.toContain('secret');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('rejects truncated one-shot output and computes missing total usage', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(completion('Partial', 'length')).mockResolvedValueOnce(completion());
    vi.stubGlobal('fetch', fetch);
    await expect(requestCompletion(request, 'chat')).rejects.toThrow('interrupted');
    expect((await requestCompletion(request, 'chat')).totalTokens).toBe(30);
  });

  it('uses the same validated transport for V2 enhancement and provider comparison', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(completion('Partial', 'length')).mockResolvedValueOnce(completion('Partial', 'length')));
    await expect(enhancePromptV2({ prompt: 'Write a headline', tier: 'standard' })).rejects.toThrow('interrupted');
    await expect(completeWithProvider('deepseek', {
      systemPrompt: 'Improve prompts', userMessage: 'Write a headline', temperature: 0.3, maxTokens: 512,
    })).rejects.toThrow('interrupted');
  });
});

describe('efficient model routing', () => {
  it('maps retired client model aliases to Flash while preserving explicit reasoning mode', () => {
    expect(getDeepseekModel()).toBe('deepseek-flash');
    expect(resolveDeepseekModel('deepseek-reasoner', false)).toEqual({ model: 'deepseek-flash', thinking: { type: 'enabled' } });
    expect(resolveDeepseekModel('deepseek-chat', true)).toEqual({ model: 'deepseek-flash', thinking: { type: 'disabled' } });
    expect(resolveDeepseekModel('deepseek-v4-flash', false).model).toBe('deepseek-flash');
  });

  it('never rewrites an explicit unknown model id', () => {
    expect(resolveDeepseekModel('deepseek-flash-2027', false).model).toBe('deepseek-flash-2027');
  });

  it('sends actual pixels using one gateway call without an OpenAI key or pre-analysis', async () => {
    const fetch = vi.fn().mockResolvedValue(respond(token('Image-aware answer') + finish()));
    vi.stubGlobal('fetch', fetch);
    const attachment = { dataUrl: 'data:image/png;base64,AA==', mimeType: 'image/png', width: 1, height: 1 };
    const cb = callbacks();
    await enhancePromptInThreadStream({
      prompt: 'Use this composition', tier: 'standard', imageAttachment: attachment, previousTurns: [],
    }, cb);
    expect(cb.onError).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.model).toBe('deepseek-flash');
    expect(body.thinking.type).toBe('disabled');
    expect(body.messages.at(-1).content).toContainEqual({ type: 'image_url', image_url: { url: attachment.dataUrl, detail: 'auto' } });
    expect(imageAnalysisService.enrichAttachmentForPrompt).not.toHaveBeenCalled();
    expect(cb.onComplete).toHaveBeenCalledWith(expect.objectContaining({ imageAttachment: attachment }));
  });

  it('also uses native vision for non-thread one-shot image requests', async () => {
    const fetch = vi.fn().mockResolvedValue(respond(token('Image answer') + finish()));
    vi.stubGlobal('fetch', fetch);
    const result = await enhancePrompt({ prompt: 'Describe', tier: 'standard',
      imageAttachment: { dataUrl: 'data:image/png;base64,AA==', mimeType: 'image/png', width: 1, height: 1 },
    });
    expect(result.enhancedPrompt).toBe('Image answer');
    expect(fetch).toHaveBeenCalledOnce();
    expect(imageAnalysisService.enrichAttachmentForPrompt).not.toHaveBeenCalled();
  });

  it('cannot enable billed reasoning by supplying a legacy model in standard mode', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(completion()).mockResolvedValueOnce(completion()).mockResolvedValueOnce(completion());
    vi.stubGlobal('fetch', fetch);
    await enhancePrompt({ prompt: 'Write a headline', tier: 'standard', mode: 'standard', model: 'deepseek-reasoner' });
    await enhancePrompt({ prompt: 'Write a headline', tier: 'basic', model: 'deepseek-v4-pro' });
    expect(JSON.parse(fetch.mock.calls[1]![1].body).model).toBe('deepseek-flash');
    vi.stubEnv('DEEPSEEK_COMPARE_MODEL', 'deepseek-reasoner');
    await completeWithProvider('deepseek', { systemPrompt: 'Improve prompts', userMessage: 'Write', temperature: 0.3, maxTokens: 100 });
    for (const call of fetch.mock.calls) expect(JSON.parse(call[1].body).thinking.type).toBe('disabled');
  });

  it('keeps previous image pixels on followups and avoids repeating the latest assistant output', async () => {
    const fetch = vi.fn().mockResolvedValue(respond(token('Refined prompt') + finish()));
    vi.stubGlobal('fetch', fetch);
    const cb = callbacks();
    await enhancePromptInThreadStream({ prompt: 'Make it shorter', tier: 'standard', previousTurns: [{
      originalPrompt: 'Make a cinematic prompt', enhancedPrompt: 'UNIQUE_PRIOR_PROMPT_CONTENT',
      imageAttachment: { dataUrl: 'data:image/png;base64,AA==', mimeType: 'image/png', width: 1, height: 1 },
    }] }, cb);
    expect(cb.onError).not.toHaveBeenCalled();
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(JSON.stringify(body.messages).match(/UNIQUE_PRIOR_PROMPT_CONTENT/g)).toHaveLength(1);
    expect(body.messages[1].content[1].type).toBe('image_url');
  });
});
