import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from 'dotenv';

import { authRouter } from './routes/auth.js';
import { promptRouter } from './routes/prompts.js';
import { userRouter } from './routes/users.js';
import { healthRouter } from './routes/health.js';
import { subscriptionRouter } from './routes/subscriptions.js';
import { webhookRouter } from './routes/webhooks.js';
import { collectionRouter } from './routes/collections.js';
import { analyticsRouter } from './routes/analytics.js';
import { supportRouter } from './routes/support.js';
import { threadRouter } from './routes/threads.js';
import { adminRouter } from './routes/admin.js';
import { platformRouter } from './routes/platforms.js';
import contextsRouter from './routes/contexts.js';
import { templatesRouter } from './routes/templates.js';
import { sharedRouter } from './routes/shared.js';
import sandboxRouter from './routes/sandbox.js';
import workflowsRouter from './routes/workflows.js';
import variationsRouter from './routes/variations.js';
import { resumePendingVariationGenerations } from './services/variationsService.js';
import { warmSchemaCompatibilityCache } from './services/schemaCompatibilityService.js';
// Enterprise API routes
import { apiKeysRouter } from './routes/apiKeys.js';
import { publicApiRouter } from './routes/publicApi.js';
import { apiSubscriptionsRouter } from './routes/apiSubscriptions.js';
import { apiStripeWebhookRouter } from './routes/apiStripeWebhook.js';
import { docsRouter } from './routes/docs.js';
import { developerAuthRouter } from './routes/developerAuth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { logger } from './utils/logger.js';
import { prisma } from './utils/prisma.js';
import { startIdempotencyCleanupScheduler } from './middleware/idempotency.js';
import { initRedis, closeRedis } from './utils/redis.js';
import { initQueues, closeQueues } from './utils/queue.js';
import { initializeSocket } from './utils/socket.js';
import { validateEnvAtBoot } from './utils/env.js';
import { initSentry } from './utils/sentry.js';

config();

// Surface missing configuration at boot (loud, not fatal) so a misconfigured
// deploy is diagnosable from the first log line instead of failing per-request.
validateEnvAtBoot();

// No-op without SENTRY_DSN; must run before any request is served so the
// error handler's captureError calls have an initialized client.
initSentry();

// Initialize Redis and Queues
(async () => {
  await initRedis();
  await initQueues();
})();

const app = express();
const PORT = process.env['PORT'] || 3000;

// Trust proxy (Railway, Vercel, etc.) for correct client IP in rate limiting
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS configuration - handle credentials properly
const allowedOrigins = [
  'https://promptomize.app',
  'https://www.promptomize.app',
  'http://localhost:3000',
  'http://localhost:3001',
];

// Add any custom origins from env
const envOrigin = process.env['CORS_ORIGIN'];
if (envOrigin && envOrigin !== '*') {
  envOrigin.split(',').forEach(origin => {
    if (!allowedOrigins.includes(origin.trim())) {
      allowedOrigins.push(origin.trim());
    }
  });
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // In development, allow any origin
    if (process.env['NODE_ENV'] !== 'production') {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-ID', 'X-Admin-API-Key', 'X-API-Key'],
}));

// Health endpoints must never be rate limited: under a traffic spike a 429 on
// /health would make Railway consider the deploy unhealthy and restart it,
// turning a load event into an outage. Mount health before the limiter.
app.use('/health', healthRouter);

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '60000'),
  max: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

// Body parsing & compression
app.use(compression());
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    const request = req as express.Request & { rawBody?: Buffer; originalUrl?: string; url?: string };
    const requestPath = request.originalUrl || request.url || '';

    if (
      requestPath.startsWith('/api/v1/webhooks/api-stripe') ||
      requestPath.startsWith('/api/v1/webhooks/resend/inbound')
    ) {
      request.rawBody = Buffer.from(buf);
    }
  },
}));
app.use(express.urlencoded({ extended: true }));

// Structured request logging
if (process.env['NODE_ENV'] !== 'test') {
  app.use(requestLogger());
}

app.get('/', (_req, res) => {
  res.json({
    name: 'promptomize-api',
    status: 'ok',
  });
});

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow: /');
});

// Routes (/health is mounted earlier, before the rate limiter)
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/prompts', promptRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/subscriptions', subscriptionRouter);
app.use('/api/v1/webhooks', webhookRouter);
app.use('/api/v1/collections', collectionRouter);
app.use('/api/v1/analytics', analyticsRouter);
app.use('/api/v1/support', supportRouter);
app.use('/api/v1/threads', threadRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/platforms', platformRouter);
app.use('/api/v1/contexts', contextsRouter);
app.use('/api/v1/templates', templatesRouter);
app.use('/api/v1/shared', sharedRouter);
app.use('/api/v1/sandbox', sandboxRouter);
app.use('/api/v1/workflows', workflowsRouter);
app.use('/api/v1/variations', variationsRouter);

// Enterprise API routes
app.use('/api/v1/developer/auth', developerAuthRouter);
app.use('/api/v1/api-keys', apiKeysRouter);
app.use('/api/v1/public', publicApiRouter);
app.use('/api/v1/api-subscriptions', apiSubscriptionsRouter);
app.use('/api/v1/webhooks/api-stripe', apiStripeWebhookRouter);
app.use('/api/v1/docs', docsRouter);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const port = typeof PORT === 'string' ? parseInt(PORT, 10) : PORT;

// Start idempotency cleanup scheduler (runs hourly)
let cleanupInterval: NodeJS.Timeout | null = null;
if (process.env['NODE_ENV'] !== 'test') {
  cleanupInterval = startIdempotencyCleanupScheduler(60 * 60 * 1000); // 1 hour
}

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down gracefully...');
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  await closeRedis();
  await closeQueues();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Create HTTP server and initialize Socket.IO
const httpServer = createServer(app);
initializeSocket(httpServer, allowedOrigins);

// Start server immediately without blocking on database
httpServer.listen(port, '0.0.0.0', () => {
  logger.info({
    port,
    env: process.env['NODE_ENV'] || 'development',
    database: process.env['DATABASE_URL'] ? 'configured' : 'NOT SET',
  }, 'Server started with Socket.IO');

  void resumePendingVariationGenerations()
    .catch((error) => {
      logger.error({ error }, 'Failed to resume pending variation generations');
    });

  // Probe optional columns once at boot so the first user request does not pay
  // the latency and so schema drift surfaces in startup logs immediately.
  void warmSchemaCompatibilityCache()
    .catch((error) => {
      logger.error({ error }, 'Failed to warm schema compatibility cache');
    });
});

export default app;
