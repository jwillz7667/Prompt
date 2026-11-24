import { z } from 'zod';

import type { LlmProviderConfig, LlmProviderName, LlmTimeouts, ReasoningStyle } from './config.js';
import { ProviderError, classifyProviderStatus, type ProviderErrorKind } from './errors.js';
import { createSseDataDecoder } from './sse-decoder.js';
import type {
  LlmChatRequest,
  LlmChatResult,
  LlmFinishReason,
  LlmReasoning,
  LlmUsage,
} from './types.js';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface LlmLogger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

export interface ProviderStreamOptions {
  model: string;
  timeouts: LlmTimeouts;
  onToken: (token: string) => void | Promise<void>;
}

export interface ProviderCompleteOptions {
  model: string;
  timeoutMs: number;
}

export interface LlmProvider {
  readonly name: LlmProviderName;
  readonly defaultModel: string;
  readonly supportsImages: boolean;
  stream(request: LlmChatRequest, options: ProviderStreamOptions): Promise<LlmChatResult>;
  complete(request: LlmChatRequest, options: ProviderCompleteOptions): Promise<LlmChatResult>;
}

/**
 * Wraps an exception thrown by the caller's onToken. It is the caller's own
 * failure (e.g. the client socket closed), so it must propagate unchanged and
 * never be blamed on — or fail over away from — the provider.
 */
export class TokenConsumerError extends Error {
  constructor(readonly original: unknown) {
    super('Token consumer failed', { cause: original });
    this.name = 'TokenConsumerError';
  }
}

const usageSchema = z.object({
  prompt_tokens: z.number().nullish(),
  completion_tokens: z.number().nullish(),
  // DeepSeek reports cache hits at the top level; OpenAI-style providers nest them.
  prompt_cache_hit_tokens: z.number().nullish(),
  prompt_tokens_details: z.object({ cached_tokens: z.number().nullish() }).nullish(),
});

const inBandErrorSchema = z.object({
  message: z.string().nullish(),
  code: z.union([z.number(), z.string()]).nullish(),
});

const streamChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z
          .object({
            content: z.string().nullish(),
            reasoning_content: z.string().nullish(),
            reasoning: z.string().nullish(),
          })
          .nullish(),
        finish_reason: z.string().nullish(),
      }),
    )
    .nullish(),
  usage: usageSchema.nullish(),
  error: inBandErrorSchema.nullish(),
});

const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullish() }).nullish(),
        finish_reason: z.string().nullish(),
      }),
    )
    .nullish(),
  usage: usageSchema.nullish(),
  error: inBandErrorSchema.nullish(),
});

type ParsedUsage = z.infer<typeof usageSchema>;

const CONTEXT_LENGTH_PATTERN =
  /context[_ ]length|maximum context|too many tokens|prompt is too long|context window/i;
const ERROR_BODY_PEEK_BYTES = 4_096;

function reasoningFields(style: ReasoningStyle, reasoning: LlmReasoning): Record<string, unknown> {
  const enabled = reasoning === 'on';
  switch (style) {
    case 'deepseek-thinking':
      // Flash defaults thinking ON and bills the chain-of-thought as output,
      // so the switch is always sent explicitly.
      return { thinking: { type: enabled ? 'enabled' : 'disabled' } };
    case 'openrouter-reasoning':
      return { reasoning: { enabled } };
    case 'chat-template-kwargs':
      return { chat_template_kwargs: { enable_thinking: enabled } };
  }
}

function toUsage(usage: ParsedUsage | null | undefined, previous: LlmUsage): LlmUsage {
  if (!usage) return previous;
  const cached = usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens;
  return {
    inputTokens: usage.prompt_tokens ?? previous.inputTokens,
    outputTokens: usage.completion_tokens ?? previous.outputTokens,
    ...(typeof cached === 'number' ? { cachedInputTokens: cached } : {}),
  };
}

/** Seconds or HTTP-date per RFC 9110; capped so a hostile header cannot park a request. */
export function parseRetryAfterMs(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(header) - now;
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  return Math.min(Math.round(ms), 10 * 60_000);
}

type FinishOutcome = { reason: LlmFinishReason } | { failKind: ProviderErrorKind };

function mapFinishReason(raw: string): FinishOutcome {
  switch (raw) {
    case 'stop':
      return { reason: 'stop' };
    case 'length':
      return { reason: 'length' };
    case 'content_filter':
      return { reason: 'content_filter' };
    // DeepSeek ends generation with this when it sheds load mid-answer.
    case 'insufficient_system_resource':
    case 'error':
      return { failKind: 'overloaded' };
    default:
      return { reason: 'other' };
  }
}

function inBandErrorKind(error: z.infer<typeof inBandErrorSchema>): ProviderErrorKind {
  const numeric = typeof error.code === 'number' ? error.code : Number(error.code);
  if (Number.isInteger(numeric) && numeric >= 400 && numeric < 600) {
    return classifyProviderStatus(numeric);
  }
  if (error.message && CONTEXT_LENGTH_PATTERN.test(error.message)) return 'context_length';
  return 'overloaded';
}

type AbortCause = 'caller' | 'ttft' | 'idle' | 'total';

/**
 * Links the caller's signal and our own deadlines into one controller, and
 * remembers which one fired first so the failure is classified correctly.
 */
class RequestAbort {
  readonly controller = new AbortController();
  cause: AbortCause | undefined;
  private readonly timers = new Map<AbortCause, NodeJS.Timeout>();
  private readonly callerSignal: AbortSignal | undefined;
  private readonly onCallerAbort = (): void => this.fire('caller');

  constructor(callerSignal: AbortSignal | undefined) {
    this.callerSignal = callerSignal;
    if (callerSignal?.aborted) this.fire('caller');
    else callerSignal?.addEventListener('abort', this.onCallerAbort, { once: true });
  }

  arm(cause: Exclude<AbortCause, 'caller'>, ms: number): void {
    this.disarm(cause);
    this.timers.set(
      cause,
      setTimeout(() => this.fire(cause), ms),
    );
  }

  disarm(cause: Exclude<AbortCause, 'caller'>): void {
    const timer = this.timers.get(cause);
    if (timer) clearTimeout(timer);
    this.timers.delete(cause);
  }

  fire(cause: AbortCause): void {
    if (this.cause) return;
    this.cause = cause;
    this.controller.abort();
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.callerSignal?.removeEventListener('abort', this.onCallerAbort);
    // Releases the socket if the body was not fully consumed.
    this.controller.abort();
  }
}

export interface OpenAiCompatibleProviderDeps {
  logger: LlmLogger;
  /** Defaults to the global fetch, resolved per call so test stubs apply. */
  fetch?: FetchLike;
}

export function createOpenAiCompatibleProvider(
  config: LlmProviderConfig,
  deps: OpenAiCompatibleProviderDeps,
): LlmProvider {
  const doFetch: FetchLike = deps.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const endpoint = `${config.baseUrl}/chat/completions`;

  const providerError = (
    kind: ProviderErrorKind,
    message: string,
    extra: {
      status?: number;
      retryAfterMs?: number;
      hasStreamedOutput?: boolean;
      cause?: unknown;
    } = {},
  ): ProviderError => new ProviderError({ kind, provider: config.name, message, ...extra });

  const buildBody = (request: LlmChatRequest, model: string, stream: boolean): string =>
    JSON.stringify({
      ...config.extraBody,
      model,
      messages: request.messages,
      max_tokens: request.maxTokens,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      stream,
      ...(stream ? { stream_options: { include_usage: true } } : {}),
      ...reasoningFields(config.reasoningStyle, request.reasoning ?? 'off'),
    });

  const headers = (stream: boolean): Record<string, string> => ({
    ...config.extraHeaders,
    'Content-Type': 'application/json',
    Accept: stream ? 'text/event-stream' : 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  });

  /** Never log or surface the body: providers echo prompts back in 4xx errors. */
  const errorFromResponse = async (response: Response): Promise<ProviderError> => {
    let kind = classifyProviderStatus(response.status);
    if (kind === 'bad_request') {
      const peek = await response
        .text()
        .then((text) => text.slice(0, ERROR_BODY_PEEK_BYTES))
        .catch(() => '');
      if (CONTEXT_LENGTH_PATTERN.test(peek)) kind = 'context_length';
    } else {
      await response.body?.cancel().catch(() => undefined);
    }
    const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
    return providerError(kind, `upstream returned HTTP ${response.status}`, {
      status: response.status,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    });
  };

  const errorFromThrown = (
    error: unknown,
    abort: RequestAbort,
    hasStreamedOutput: boolean,
  ): unknown => {
    if (error instanceof TokenConsumerError) return error;
    if (error instanceof ProviderError) return error;
    switch (abort.cause) {
      case 'caller':
        return providerError('interrupted', 'request aborted by caller', {
          hasStreamedOutput,
          cause: error,
        });
      case 'ttft':
        return providerError('timeout', 'no output before the first-token deadline', {
          hasStreamedOutput,
          cause: error,
        });
      case 'idle':
        return providerError('timeout', 'stream stalled', { hasStreamedOutput, cause: error });
      case 'total':
        return providerError('timeout', 'request exceeded its total deadline', {
          hasStreamedOutput,
          cause: error,
        });
      case undefined:
        // fetch() rejects with TypeError on DNS/TLS/connection-reset failures.
        return providerError('overloaded', 'network failure reaching provider', {
          hasStreamedOutput,
          cause: error,
        });
    }
  };

  const stream = async (
    request: LlmChatRequest,
    options: ProviderStreamOptions,
  ): Promise<LlmChatResult> => {
    const startedAt = Date.now();
    const abort = new RequestAbort(request.signal);
    abort.arm('total', options.timeouts.totalMs);
    abort.arm('ttft', options.timeouts.ttftMs);

    let content = '';
    let usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
    let finish: LlmFinishReason | undefined;
    let sawDone = false;
    let malformedLines = 0;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    const handlePayload = async (payload: string): Promise<void> => {
      if (payload === '[DONE]') {
        sawDone = true;
        return;
      }
      let json: unknown;
      try {
        json = JSON.parse(payload);
      } catch {
        malformedLines += 1;
        return;
      }
      const parsed = streamChunkSchema.safeParse(json);
      if (!parsed.success) {
        malformedLines += 1;
        return;
      }
      const chunk = parsed.data;
      if (chunk.error) {
        throw providerError(inBandErrorKind(chunk.error), 'provider reported an in-stream error', {
          hasStreamedOutput: content.length > 0,
        });
      }
      usage = toUsage(chunk.usage, usage);
      const choice = chunk.choices?.[0];
      if (!choice) return;

      const delta = choice.delta;
      const hasProgress = Boolean(
        delta?.content || delta?.reasoning_content || delta?.reasoning || choice.finish_reason,
      );
      if (hasProgress) {
        // Reasoning deltas prove the model is alive even though they are not
        // forwarded, so they satisfy the first-token deadline.
        abort.disarm('ttft');
        abort.arm('idle', options.timeouts.idleMs);
      }
      if (choice.finish_reason) {
        const outcome = mapFinishReason(choice.finish_reason);
        if ('failKind' in outcome) {
          throw providerError(outcome.failKind, `generation ended with ${choice.finish_reason}`, {
            hasStreamedOutput: content.length > 0,
          });
        }
        finish = outcome.reason;
      }
      if (delta?.content) {
        content += delta.content;
        try {
          await options.onToken(delta.content);
        } catch (error) {
          throw new TokenConsumerError(error);
        }
      }
    };

    try {
      const response = await doFetch(endpoint, {
        method: 'POST',
        headers: headers(true),
        body: buildBody(request, options.model, true),
        signal: abort.controller.signal,
      });
      if (!response.ok) throw await errorFromResponse(response);
      if (!response.body) throw providerError('overloaded', 'provider returned no stream body');

      reader = response.body.getReader();
      const textDecoder = new TextDecoder();
      const sse = createSseDataDecoder();
      while (!sawDone) {
        const { done, value } = await reader.read();
        const payloads = done ? sse.flush() : sse.push(textDecoder.decode(value, { stream: true }));
        for (const payload of payloads) {
          await handlePayload(payload);
          if (sawDone) break;
        }
        if (done) break;
      }

      if (malformedLines > 0) {
        deps.logger.warn(
          { provider: config.name, model: options.model, malformedLines },
          'LLM stream contained malformed data lines',
        );
      }
      if (!finish) {
        throw providerError('interrupted', 'stream ended without a finish reason', {
          hasStreamedOutput: content.length > 0,
        });
      }
      if (finish === 'stop' && content.trim().length === 0) {
        throw providerError('interrupted', 'provider returned an empty completion');
      }
      return {
        content,
        finishReason: finish,
        usage,
        provider: config.name,
        model: options.model,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      throw errorFromThrown(error, abort, content.length > 0);
    } finally {
      await reader?.cancel().catch(() => undefined);
      abort.dispose();
    }
  };

  const complete = async (
    request: LlmChatRequest,
    options: ProviderCompleteOptions,
  ): Promise<LlmChatResult> => {
    const startedAt = Date.now();
    const abort = new RequestAbort(request.signal);
    // The deadline stays armed through body decoding, not just headers.
    abort.arm('total', options.timeoutMs);
    try {
      const response = await doFetch(endpoint, {
        method: 'POST',
        headers: headers(false),
        body: buildBody(request, options.model, false),
        signal: abort.controller.signal,
      });
      if (!response.ok) throw await errorFromResponse(response);
      const json: unknown = await response.json().catch((error: unknown) => {
        if (abort.cause) throw error;
        throw providerError('overloaded', 'provider returned an unreadable body', { cause: error });
      });
      const parsed = completionSchema.safeParse(json);
      if (!parsed.success) {
        throw providerError('overloaded', 'provider returned an unexpected body shape');
      }
      if (parsed.data.error) {
        throw providerError(inBandErrorKind(parsed.data.error), 'provider reported an error');
      }
      const choice = parsed.data.choices?.[0];
      const content = choice?.message?.content ?? '';
      const outcome = mapFinishReason(choice?.finish_reason ?? 'other');
      if ('failKind' in outcome) {
        throw providerError(outcome.failKind, `generation ended with ${choice?.finish_reason}`);
      }
      if (outcome.reason === 'stop' && content.trim().length === 0) {
        throw providerError('interrupted', 'provider returned an empty completion');
      }
      return {
        content,
        finishReason: outcome.reason,
        usage: toUsage(parsed.data.usage, { inputTokens: 0, outputTokens: 0 }),
        provider: config.name,
        model: options.model,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      throw errorFromThrown(error, abort, false);
    } finally {
      abort.dispose();
    }
  };

  return {
    name: config.name,
    defaultModel: config.model,
    supportsImages: config.supportsImages,
    stream,
    complete,
  };
}
