/**
 * Typed provider failures and the single mapping from those failures to what
 * clients are allowed to see. Upstream error text (status codes, provider
 * names, key-configuration messages) must never reach an end user: it leaks
 * infrastructure details and, for the China storefront, third-party AI names.
 */

export type ProviderErrorKind =
  | 'insufficient_balance'
  | 'auth'
  | 'rate_limited'
  | 'overloaded'
  | 'timeout'
  | 'bad_request'
  | 'context_length'
  | 'content_filter'
  | 'interrupted'
  | 'not_configured';

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly provider: string;
  readonly status: number | undefined;
  /** True once any token reached the client; failover is no longer allowed. */
  readonly hasStreamedOutput: boolean;
  readonly retryAfterMs: number | undefined;

  constructor(params: {
    kind: ProviderErrorKind;
    provider: string;
    message: string;
    status?: number;
    hasStreamedOutput?: boolean;
    retryAfterMs?: number;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = 'ProviderError';
    this.kind = params.kind;
    this.provider = params.provider;
    this.status = params.status;
    this.hasStreamedOutput = params.hasStreamedOutput ?? false;
    this.retryAfterMs = params.retryAfterMs;
  }

  /** Failures that indicate this provider is unusable for everyone, not just this request. */
  get isProviderWide(): boolean {
    return (
      this.kind === 'insufficient_balance' || this.kind === 'auth' || this.kind === 'not_configured'
    );
  }

  /** Whether another provider could plausibly succeed with the same request. */
  get isFailoverEligible(): boolean {
    return (
      !this.hasStreamedOutput &&
      this.kind !== 'bad_request' &&
      this.kind !== 'context_length' &&
      this.kind !== 'content_filter'
    );
  }
}

export function classifyProviderStatus(status: number): ProviderErrorKind {
  if (status === 402) return 'insufficient_balance';
  if (status === 401 || status === 403) return 'auth';
  if (status === 408 || status === 504 || status === 524) return 'timeout';
  if (status === 413) return 'context_length';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'overloaded';
  return 'bad_request';
}

export type ClientErrorCode =
  | 'PROVIDER_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'CONTEXT_TOO_LONG'
  | 'CONTENT_BLOCKED'
  | 'INTERRUPTED'
  | 'INTERNAL_ERROR';

export interface ClientStreamError {
  type: 'error';
  code: ClientErrorCode;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}

const CLIENT_COPY: Record<ClientErrorCode, { message: string; retryable: boolean }> = {
  PROVIDER_UNAVAILABLE: {
    message: 'The AI service is temporarily unavailable. Please try again in a few minutes.',
    retryable: true,
  },
  RATE_LIMITED: {
    message: 'The AI service is busy right now. Please try again shortly.',
    retryable: true,
  },
  TIMEOUT: { message: 'The response took too long. Please try again.', retryable: true },
  CONTEXT_TOO_LONG: {
    message: 'This conversation is too long to continue. Start a new chat to keep going.',
    retryable: false,
  },
  CONTENT_BLOCKED: {
    message: 'That request could not be completed. Try rephrasing it.',
    retryable: false,
  },
  INTERRUPTED: { message: 'The response was interrupted. Please try again.', retryable: true },
  INTERNAL_ERROR: { message: 'Something went wrong. Please try again.', retryable: true },
};

function codeForKind(kind: ProviderErrorKind): ClientErrorCode {
  switch (kind) {
    case 'insufficient_balance':
    case 'auth':
    case 'not_configured':
    case 'overloaded':
      return 'PROVIDER_UNAVAILABLE';
    case 'rate_limited':
      return 'RATE_LIMITED';
    case 'timeout':
      return 'TIMEOUT';
    case 'context_length':
      return 'CONTEXT_TOO_LONG';
    case 'content_filter':
      return 'CONTENT_BLOCKED';
    case 'interrupted':
      return 'INTERRUPTED';
    case 'bad_request':
      return 'INTERNAL_ERROR';
  }
}

/**
 * The only function routes may use to turn a failure into client-visible
 * output. Callers log the original error once before calling this.
 */
export function toClientStreamError(error: unknown): ClientStreamError {
  const code = error instanceof ProviderError ? codeForKind(error.kind) : 'INTERNAL_ERROR';
  const copy = CLIENT_COPY[code];
  return {
    type: 'error',
    code,
    message: copy.message,
    retryable: copy.retryable,
    ...(error instanceof ProviderError && error.retryAfterMs !== undefined
      ? { retryAfterMs: error.retryAfterMs }
      : {}),
  };
}

/** HTTP status for non-streaming responses carrying a ClientStreamError body. */
export function clientErrorHttpStatus(code: ClientErrorCode): number {
  switch (code) {
    case 'PROVIDER_UNAVAILABLE':
      return 503;
    case 'RATE_LIMITED':
      return 429;
    case 'TIMEOUT':
      return 504;
    case 'CONTEXT_TOO_LONG':
      return 413;
    case 'CONTENT_BLOCKED':
      return 422;
    case 'INTERRUPTED':
      return 502;
    case 'INTERNAL_ERROR':
      return 500;
  }
}
