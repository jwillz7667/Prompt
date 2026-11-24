import type { LlmProviderName } from './config.js';

export interface LlmTextPart {
  type: 'text';
  text: string;
}

export interface LlmImagePart {
  type: 'image_url';
  image_url: { url: string; detail?: 'auto' | 'low' | 'high' };
}

export type LlmContentPart = LlmTextPart | LlmImagePart;

export type LlmMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | LlmContentPart[] }
  | { role: 'assistant'; content: string };

export type LlmReasoning = 'off' | 'on';

export interface LlmChatRequest {
  messages: LlmMessage[];
  maxTokens: number;
  temperature?: number;
  /** Defaults to 'off': reasoning tokens are billed as output on every provider. */
  reasoning?: LlmReasoning;
  /** Caller cancellation (client disconnect). Aborting never counts against a provider. */
  signal?: AbortSignal;
  /** Per-provider model id replacing that provider's configured default for this call. */
  modelOverrides?: Partial<Record<LlmProviderName, string>>;
  /** Free-form label for logs, e.g. 'optimize', 'chat', 'support'. */
  purpose?: string;
}

/**
 * 'length' means the output hit maxTokens. Chat may accept that as a
 * truncated success; the optimizer treats it as a failure.
 */
export type LlmFinishReason = 'stop' | 'length' | 'content_filter' | 'other';

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}

export interface LlmChatResult {
  content: string;
  finishReason: LlmFinishReason;
  usage: LlmUsage;
  provider: LlmProviderName;
  model: string;
  latencyMs: number;
}

export interface LlmStreamCallbacks {
  /** Awaited before the next token is read; a throw aborts the stream and propagates unchanged. */
  onToken: (token: string) => void | Promise<void>;
}

export function messagesContainImages(messages: readonly LlmMessage[]): boolean {
  return messages.some(
    (message) =>
      message.role === 'user' &&
      Array.isArray(message.content) &&
      message.content.some((part) => part.type === 'image_url'),
  );
}
