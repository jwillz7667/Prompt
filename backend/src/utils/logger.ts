import pino from 'pino';

// ============================================================================
// PINO LOGGER CONFIGURATION
// ============================================================================

const isProduction = process.env['NODE_ENV'] === 'production';
const isTest = process.env['NODE_ENV'] === 'test';

// Log levels: trace, debug, info, warn, error, fatal
const level = process.env['LOG_LEVEL'] || (isProduction ? 'info' : 'debug');

// Custom serializers for common objects
const serializers: pino.LoggerOptions['serializers'] = {
  err: pino.stdSerializers.err,
  error: pino.stdSerializers.err,
  req: (req) => ({
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    headers: {
      host: req.headers?.host,
      'user-agent': req.headers?.['user-agent'],
      'x-request-id': req.headers?.['x-request-id'],
      'x-device-id': req.headers?.['x-device-id'],
    },
  }),
  res: (res) => ({
    statusCode: res.statusCode,
  }),
  user: (user) => ({
    id: user?.id,
    email: user?.email ? `${user.email.substring(0, 3)}***` : undefined,
  }),
};

// Development-friendly formatting with pino-pretty
const devTransport = {
  target: 'pino-pretty',
  options: {
    colorize: true,
    translateTime: 'HH:MM:ss.l',
    ignore: 'pid,hostname',
    singleLine: false,
  },
};

// Create the base logger
export const logger = pino({
  name: 'promptomize-api',
  level: isTest ? 'silent' : level,
  serializers,
  // Use pretty printing in development, JSON in production
  ...(isProduction ? {} : { transport: devTransport }),
  // Add timestamp in ISO format for production
  timestamp: isProduction ? pino.stdTimeFunctions.isoTime : pino.stdTimeFunctions.epochTime,
  // Redact sensitive fields
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'passwordHash',
      'accessToken',
      'refreshToken',
      'identityToken',
      'authorizationCode',
      'signedTransaction',
      'signedPayload',
      '*.password',
      '*.passwordHash',
      '*.accessToken',
      '*.refreshToken',
    ],
    censor: '[REDACTED]',
  },
  // Base context for all logs
  base: {
    env: process.env['NODE_ENV'] || 'development',
  },
});

// ============================================================================
// CHILD LOGGER FACTORY
// ============================================================================

/**
 * Create a child logger with additional context
 * @param context - Additional context to include in all logs
 */
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

/**
 * Create a request-scoped logger with request ID
 * @param requestId - Unique request identifier
 */
export function createRequestLogger(requestId: string) {
  return logger.child({ requestId });
}

// ============================================================================
// TYPED LOG HELPERS
// ============================================================================

export interface LogContext {
  requestId?: string;
  userId?: string;
  action?: string;
  resource?: string;
  [key: string]: unknown;
}

/**
 * Log an info message with optional context
 */
export function logInfo(message: string, context?: LogContext) {
  if (context) {
    logger.info(context, message);
  } else {
    logger.info(message);
  }
}

/**
 * Log a warning message with optional context
 */
export function logWarn(message: string, context?: LogContext) {
  if (context) {
    logger.warn(context, message);
  } else {
    logger.warn(message);
  }
}

/**
 * Log an error with stack trace and optional context
 */
export function logError(message: string, error?: Error | unknown, context?: LogContext) {
  const errorContext = {
    ...context,
    ...(error instanceof Error
      ? { err: error }
      : error
        ? { errorDetails: String(error) }
        : {}),
  };

  if (Object.keys(errorContext).length > 0) {
    logger.error(errorContext, message);
  } else {
    logger.error(message);
  }
}

/**
 * Log a debug message with optional context
 */
export function logDebug(message: string, context?: LogContext) {
  if (context) {
    logger.debug(context, message);
  } else {
    logger.debug(message);
  }
}

// ============================================================================
// SPECIALIZED LOGGERS
// ============================================================================

export const authLogger = createLogger({ module: 'auth' });
export const subscriptionLogger = createLogger({ module: 'subscription' });
export const webhookLogger = createLogger({ module: 'webhook' });
export const promptLogger = createLogger({ module: 'prompt' });
export const storeLogger = createLogger({ module: 'appstore' });

// Export default logger
export default logger;
