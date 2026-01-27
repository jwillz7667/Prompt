import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { getRedis, isRedisAvailable } from '../utils/redis.js';
import { queues } from '../utils/queue.js';

export const healthRouter = Router();

// In-memory metrics (for Prometheus-style monitoring)
const metrics = {
  requestCount: 0,
  errorCount: 0,
  requestDuration: [] as number[],
  startTime: Date.now(),
};

// Middleware to track metrics
export function trackMetrics(duration: number, isError: boolean): void {
  metrics.requestCount++;
  if (isError) metrics.errorCount++;
  metrics.requestDuration.push(duration);
  // Keep only last 1000 durations
  if (metrics.requestDuration.length > 1000) {
    metrics.requestDuration.shift();
  }
}

// Comprehensive health check
healthRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  const checks: HealthChecks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    queues: await checkQueues(),
  };

  const isHealthy = Object.values(checks).every(
    (check) => check.status === 'ok' || check.status === 'degraded'
  );

  const memUsage = process.memoryUsage();

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    version: process.env['npm_package_version'] || '1.0.0',
    uptime: Math.floor((Date.now() - metrics.startTime) / 1000),
    checks,
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
    },
  });
});

// Kubernetes readiness probe
healthRouter.get('/ready', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Check critical dependencies
    await prisma.$queryRaw`SELECT 1`;

    // Check Redis if available
    if (isRedisAvailable()) {
      const redis = getRedis() as { ping?: () => Promise<string> } | null;
      if (redis && typeof redis.ping === 'function') {
        await redis.ping();
      }
    }

    res.json({ ready: true });
  } catch (error) {
    logger.warn({ error }, 'Readiness check failed');
    res.status(503).json({ ready: false });
  }
});

// Kubernetes liveness probe
healthRouter.get('/live', (_req: Request, res: Response): void => {
  // Basic check - if this responds, the process is alive
  res.json({
    alive: true,
    pid: process.pid,
    uptime: process.uptime(),
  });
});

// Prometheus-compatible metrics endpoint
healthRouter.get('/metrics', async (_req: Request, res: Response): Promise<void> => {
  const queueMetrics = await queues.getMetrics();

  // Calculate percentiles
  const sortedDurations = [...metrics.requestDuration].sort((a, b) => a - b);
  const p50 = sortedDurations[Math.floor(sortedDurations.length * 0.5)] || 0;
  const p95 = sortedDurations[Math.floor(sortedDurations.length * 0.95)] || 0;
  const p99 = sortedDurations[Math.floor(sortedDurations.length * 0.99)] || 0;

  const memUsage = process.memoryUsage();

  // Prometheus text format
  const prometheusMetrics = `
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total ${metrics.requestCount}

# HELP http_errors_total Total number of HTTP errors
# TYPE http_errors_total counter
http_errors_total ${metrics.errorCount}

# HELP http_request_duration_ms HTTP request duration in milliseconds
# TYPE http_request_duration_ms summary
http_request_duration_ms{quantile="0.5"} ${p50}
http_request_duration_ms{quantile="0.95"} ${p95}
http_request_duration_ms{quantile="0.99"} ${p99}

# HELP process_heap_bytes Process heap size in bytes
# TYPE process_heap_bytes gauge
process_heap_bytes ${memUsage.heapUsed}

# HELP process_rss_bytes Process resident set size in bytes
# TYPE process_rss_bytes gauge
process_rss_bytes ${memUsage.rss}

# HELP queue_jobs_waiting Number of jobs waiting in queue
# TYPE queue_jobs_waiting gauge
queue_jobs_waiting{queue="prompt-enhance"} ${queueMetrics.promptQueue.waiting}
queue_jobs_waiting{queue="subscription-sync"} ${queueMetrics.subscriptionQueue.waiting}

# HELP queue_jobs_active Number of jobs currently processing
# TYPE queue_jobs_active gauge
queue_jobs_active{queue="prompt-enhance"} ${queueMetrics.promptQueue.active}
queue_jobs_active{queue="subscription-sync"} ${queueMetrics.subscriptionQueue.active}

# HELP queue_jobs_failed Number of failed jobs
# TYPE queue_jobs_failed counter
queue_jobs_failed{queue="prompt-enhance"} ${queueMetrics.promptQueue.failed}
queue_jobs_failed{queue="subscription-sync"} ${queueMetrics.subscriptionQueue.failed}
`.trim();

  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(prometheusMetrics);
});

// Detailed status for debugging
healthRouter.get('/status', async (_req: Request, res: Response): Promise<void> => {
  const [dbCheck, redisCheck, queueCheck] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkQueues(),
  ]);

  const queueMetrics = await queues.getMetrics();

  res.json({
    timestamp: new Date().toISOString(),
    environment: process.env['NODE_ENV'] || 'development',
    node: {
      version: process.version,
      pid: process.pid,
      uptime: process.uptime(),
    },
    memory: process.memoryUsage(),
    database: dbCheck,
    redis: redisCheck,
    queues: {
      status: queueCheck,
      metrics: queueMetrics,
    },
    http: {
      totalRequests: metrics.requestCount,
      totalErrors: metrics.errorCount,
      errorRate: metrics.requestCount > 0 ? (metrics.errorCount / metrics.requestCount * 100).toFixed(2) + '%' : '0%',
    },
  });
});

// Individual service checks
async function checkDatabase(): Promise<ServiceCheck> {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;

    return {
      status: latency < 100 ? 'ok' : 'degraded',
      latency,
      message: latency < 100 ? 'Database responding normally' : 'Database responding slowly',
    };
  } catch (error) {
    logger.error({ error }, 'Database health check failed');
    return {
      status: 'error',
      latency: -1,
      message: error instanceof Error ? error.message : 'Database connection failed',
    };
  }
}

async function checkRedis(): Promise<ServiceCheck> {
  if (!isRedisAvailable()) {
    return {
      status: 'ok',
      latency: 0,
      message: 'Redis not configured (optional)',
    };
  }

  const redis = getRedis() as { ping?: () => Promise<string> } | null;

  if (!redis || typeof redis.ping !== 'function') {
    return {
      status: 'ok',
      latency: 0,
      message: 'Redis not configured (optional)',
    };
  }

  try {
    const start = Date.now();
    await redis.ping();
    const latency = Date.now() - start;

    return {
      status: latency < 50 ? 'ok' : 'degraded',
      latency,
      message: latency < 50 ? 'Redis responding normally' : 'Redis responding slowly',
    };
  } catch (error) {
    logger.error({ error }, 'Redis health check failed');
    return {
      status: 'error',
      latency: -1,
      message: error instanceof Error ? error.message : 'Redis connection failed',
    };
  }
}

async function checkQueues(): Promise<ServiceCheck> {
  try {
    const queueMetrics = await queues.getMetrics();
    const totalWaiting =
      queueMetrics.promptQueue.waiting +
      queueMetrics.subscriptionQueue.waiting;

    if (totalWaiting > 1000) {
      return {
        status: 'degraded',
        latency: 0,
        message: `High queue depth: ${totalWaiting} jobs waiting`,
      };
    }

    return {
      status: 'ok',
      latency: 0,
      message: `Queues healthy: ${totalWaiting} jobs waiting`,
    };
  } catch (error) {
    // Queues may not be initialized
    return {
      status: 'ok',
      latency: 0,
      message: 'Queues not configured (optional)',
    };
  }
}

// Types
interface ServiceCheck {
  status: 'ok' | 'degraded' | 'error';
  latency: number;
  message: string;
}

interface HealthChecks {
  database: ServiceCheck;
  redis: ServiceCheck;
  queues: ServiceCheck;
}
