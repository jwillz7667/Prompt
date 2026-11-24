export type ChatErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'INVALID_CURSOR'
  | 'DUPLICATE_MESSAGE'
  | 'NOT_LATEST_MESSAGE'
  | 'FAIR_USE_LIMIT';

const HTTP_STATUS: Record<ChatErrorCode, number> = {
  VALIDATION_ERROR: 400,
  INVALID_CURSOR: 400,
  NOT_FOUND: 404,
  DUPLICATE_MESSAGE: 409,
  NOT_LATEST_MESSAGE: 409,
  FAIR_USE_LIMIT: 429,
};

const CLIENT_MESSAGE: Record<ChatErrorCode, string> = {
  VALIDATION_ERROR: 'Invalid request',
  INVALID_CURSOR: 'Invalid pagination cursor',
  NOT_FOUND: 'Not found',
  DUPLICATE_MESSAGE: 'This message was already sent',
  NOT_LATEST_MESSAGE: 'Only the latest reply can be regenerated',
  FAIR_USE_LIMIT: 'Daily fair-use limit reached',
};

/** Expected, client-caused failures raised before any SSE byte is written. */
export class ChatError extends Error {
  readonly code: ChatErrorCode;
  readonly resetAt: Date | undefined;

  constructor(code: ChatErrorCode, options: { resetAt?: Date } = {}) {
    super(CLIENT_MESSAGE[code]);
    this.name = 'ChatError';
    this.code = code;
    this.resetAt = options.resetAt;
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }

  toBody(): { error: string; code: ChatErrorCode; resetAt?: string } {
    return {
      error: this.message,
      code: this.code,
      ...(this.resetAt ? { resetAt: this.resetAt.toISOString() } : {}),
    };
  }
}
