import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { captureError } from '../utils/sentry.js';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.error({ err, statusCode: err.statusCode, code: err.code }, 'Unhandled error');

  const statusCode = err.statusCode || 500;

  // Only unexpected failures belong in Sentry; 4xx responses are client
  // behavior (bad input, expired tokens, quota) and would drown real errors.
  if (statusCode >= 500) {
    captureError(err, { method: req.method, path: req.path, statusCode });
  }
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    error: message,
    code: err.code,
    ...(process.env['NODE_ENV'] === 'development' && { stack: err.stack }),
  });
};

export const createError = (message: string, statusCode: number, code?: string): AppError => {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};
