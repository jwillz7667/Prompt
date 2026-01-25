import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger, createRequestLogger } from '../utils/logger.js';

// ============================================================================
// REQUEST LOGGER MIDDLEWARE
// ============================================================================

// Extend Express Request to include requestId and logger
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      log: ReturnType<typeof createRequestLogger>;
    }
  }
}

/**
 * Request logging middleware
 * - Assigns unique request ID (from header or generated)
 * - Creates request-scoped logger
 * - Logs request start and completion with timing
 */
export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Get or generate request ID
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();

    // Attach to request object
    req.requestId = requestId;
    req.log = createRequestLogger(requestId);

    // Set response header for tracing
    res.setHeader('X-Request-ID', requestId);

    // Track timing
    const startTime = process.hrtime.bigint();

    // Log request start (debug level for less noise)
    req.log.debug(
      {
        method: req.method,
        path: req.path,
        query: Object.keys(req.query).length > 0 ? req.query : undefined,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      },
      'Request started'
    );

    // Capture response finish
    res.on('finish', () => {
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1_000_000;

      const logData = {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        contentLength: res.getHeader('content-length'),
      };

      // Log based on status code
      if (res.statusCode >= 500) {
        req.log.error(logData, 'Request failed');
      } else if (res.statusCode >= 400) {
        req.log.warn(logData, 'Request error');
      } else {
        req.log.info(logData, 'Request completed');
      }
    });

    // Handle connection errors
    res.on('error', (err) => {
      req.log.error({ err }, 'Response error');
    });

    next();
  };
}

/**
 * Simplified HTTP logger for production
 * Uses pino-http style output
 */
export function httpLogger() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();
    req.requestId = requestId;
    req.log = createRequestLogger(requestId);
    res.setHeader('X-Request-ID', requestId);

    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;

      // Skip health check logging to reduce noise
      if (req.path === '/health' || req.path === '/health/ready') {
        return;
      }

      logger.info({
        requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duration,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      });
    });

    next();
  };
}

export default requestLogger;
