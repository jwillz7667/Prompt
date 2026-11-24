import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { captureError } from '../utils/sentry.js';
import {
  ProviderError,
  clientErrorHttpStatus,
  toClientStreamError,
} from '../features/llm/errors.js';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

interface ErrorBody {
  error: string;
  code: string | undefined;
  retryable?: boolean;
}

/**
 * 4xx messages come from createError and are written for clients. 5xx
 * messages are whatever an internal layer threw (Prisma, provider gateway,
 * third-party SDKs) and may name infrastructure or vendors, so clients only
 * get generic copy plus a stable code; the original is logged and captured.
 */
function clientFacing(err: AppError, statusCode: number): { status: number; body: ErrorBody } {
  if (err instanceof ProviderError) {
    const clientError = toClientStreamError(err);
    return {
      status: clientErrorHttpStatus(clientError.code),
      body: {
        error: clientError.message,
        code: clientError.code,
        retryable: clientError.retryable,
      },
    };
  }
  if (statusCode >= 500) {
    return { status: statusCode, body: { error: 'Internal server error', code: 'INTERNAL_ERROR' } };
  }
  return { status: statusCode, body: { error: err.message || 'Request failed', code: err.code } };
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  logger.error({ err, statusCode: err.statusCode, code: err.code }, 'Unhandled error');

  const { status, body } = clientFacing(err, err.statusCode || 500);

  // Only unexpected failures belong in Sentry; 4xx responses are client
  // behavior (bad input, expired tokens, quota) and would drown real errors.
  if (status >= 500) {
    captureError(err, { method: req.method, path: req.path, statusCode: status });
  }

  if (res.headersSent) {
    res.end();
    return;
  }
  res.status(status).json({
    ...body,
    ...(process.env['NODE_ENV'] === 'development' && { stack: err.stack }),
  });
};

export const createError = (message: string, statusCode: number, code?: string): AppError => {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};
