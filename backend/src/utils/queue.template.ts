/**
 * Job queue system for async processing at scale.
 *
 * SETUP REQUIRED:
 * 1. Install dependencies: npm install bullmq
 * 2. Set REDIS_URL in environment (BullMQ requires Redis)
 * 3. Call initQueues() in index.ts startup
 *
 * This module gracefully degrades if BullMQ is not available.
 */

import { logger } from './logger.js';

// Job types
export interface PromptEnhanceJob {
  userId: string;
  promptId: string;
  prompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  tone?: string;
  length?: string;
  customInstructions?: string;
}

export interface SubscriptionSyncJob {
  userId: string;
  transactionId: string;
  productId: string;
  action: 'purchase' | 'renew' | 'cancel' | 'expire';
}

export interface CleanupJob {
  type: 'sessions' | 'idempotency' | 'dailyUsage';
  olderThanDays: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let promptQueue: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let subscriptionQueue: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cleanupQueue: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let promptQueueEvents: any = null;
let queuesAvailable = false;

export async function initQueues(): Promise<void> {
  const redisUrl = process.env['REDIS_URL'];
  const redisHost = process.env['REDIS_HOST'];

  if (!redisUrl && !redisHost) {
    logger.warn('Redis not configured - queues disabled');
    return;
  }

  try {
    // Dynamic import to make bullmq optional
    const bullmq = await import('bullmq');
    const { Queue, QueueEvents } = bullmq;

    const connection = {
      host: redisHost || new URL(redisUrl!).hostname,
      port: parseInt(process.env['REDIS_PORT'] || new URL(redisUrl!).port || '6379'),
      password: process.env['REDIS_PASSWORD'] || (redisUrl ? new URL(redisUrl).password : undefined),
    };

    // Prompt enhancement queue (high priority)
    promptQueue = new Queue<PromptEnhanceJob>('prompt-enhance', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
          count: 1000,
        },
        removeOnFail: {
          age: 86400, // Keep failed jobs for 24 hours
        },
      },
    });

    // Subscription sync queue
    subscriptionQueue = new Queue<SubscriptionSyncJob>('subscription-sync', {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          age: 86400,
          count: 500,
        },
      },
    });

    // Cleanup queue (low priority, scheduled)
    cleanupQueue = new Queue<CleanupJob>('cleanup', {
      connection,
      defaultJobOptions: {
        attempts: 2,
        removeOnComplete: true,
      },
    });

    // Queue events for monitoring
    promptQueueEvents = new QueueEvents('prompt-enhance', { connection });

    promptQueueEvents.on('completed', ({ jobId }: { jobId: string }) => {
      logger.info({ jobId }, 'Prompt enhancement job completed');
    });

    promptQueueEvents.on('failed', ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
      logger.error({ jobId, failedReason }, 'Prompt enhancement job failed');
    });

    queuesAvailable = true;
    logger.info('Job queues initialized');

    // Schedule recurring cleanup jobs
    await scheduleCleanupJobs();
  } catch (error) {
    logger.warn({ error }, 'BullMQ not available - queues disabled');
  }
}

async function scheduleCleanupJobs(): Promise<void> {
  if (!cleanupQueue) return;

  try {
    // Clean expired sessions daily at 3 AM
    await cleanupQueue.add(
      'cleanup-sessions',
      { type: 'sessions', olderThanDays: 7 },
      {
        repeat: {
          pattern: '0 3 * * *', // Daily at 3 AM
        },
        jobId: 'cleanup-sessions-daily',
      }
    );

    // Clean old idempotency keys hourly
    await cleanupQueue.add(
      'cleanup-idempotency',
      { type: 'idempotency', olderThanDays: 1 },
      {
        repeat: {
          pattern: '0 * * * *', // Every hour
        },
        jobId: 'cleanup-idempotency-hourly',
      }
    );

    // Clean old daily usage records weekly
    await cleanupQueue.add(
      'cleanup-daily-usage',
      { type: 'dailyUsage', olderThanDays: 90 },
      {
        repeat: {
          pattern: '0 4 * * 0', // Sundays at 4 AM
        },
        jobId: 'cleanup-usage-weekly',
      }
    );

    logger.info('Cleanup jobs scheduled');
  } catch (error) {
    logger.error({ error }, 'Failed to schedule cleanup jobs');
  }
}

// Queue operations - gracefully degrade if not available
export const queues = {
  // Add prompt enhancement job
  async addPromptJob(data: PromptEnhanceJob): Promise<unknown> {
    if (!queuesAvailable || !promptQueue) {
      logger.warn('Prompt queue not available');
      return null;
    }

    const jobId = `prompt:${data.userId}:${Date.now()}`;
    return promptQueue.add('enhance', data, {
      jobId,
      priority: 1,
    });
  },

  // Add subscription sync job
  async addSubscriptionJob(data: SubscriptionSyncJob): Promise<unknown> {
    if (!queuesAvailable || !subscriptionQueue) {
      logger.warn('Subscription queue not available');
      return null;
    }

    const jobId = `sub:${data.transactionId}`;
    return subscriptionQueue.add('sync', data, {
      jobId,
    });
  },

  // Get job status
  async getJobStatus(queueName: string, jobId: string): Promise<JobStatus | null> {
    if (!queuesAvailable) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let queue: any = null;

    switch (queueName) {
      case 'prompt-enhance':
        queue = promptQueue;
        break;
      case 'subscription-sync':
        queue = subscriptionQueue;
        break;
      case 'cleanup':
        queue = cleanupQueue;
        break;
    }

    if (!queue) return null;

    const job = await queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    const progress = job.progress;

    return {
      id: job.id || '',
      state,
      progress: typeof progress === 'number' ? progress : 0,
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
    };
  },

  // Get queue metrics
  async getMetrics(): Promise<QueueMetrics> {
    const emptyMetrics = { waiting: 0, active: 0, completed: 0, failed: 0 };
    const metrics: QueueMetrics = {
      promptQueue: { ...emptyMetrics },
      subscriptionQueue: { ...emptyMetrics },
      cleanupQueue: { ...emptyMetrics },
    };

    if (!queuesAvailable) return metrics;

    try {
      if (promptQueue) {
        const counts = await promptQueue.getJobCounts();
        metrics.promptQueue = counts;
      }

      if (subscriptionQueue) {
        const counts = await subscriptionQueue.getJobCounts();
        metrics.subscriptionQueue = counts;
      }

      if (cleanupQueue) {
        const counts = await cleanupQueue.getJobCounts();
        metrics.cleanupQueue = counts;
      }
    } catch (error) {
      logger.error({ error }, 'Failed to get queue metrics');
    }

    return metrics;
  },

  // Check if queues are available
  isAvailable(): boolean {
    return queuesAvailable;
  },
};

// Cleanup on shutdown
export async function closeQueues(): Promise<void> {
  try {
    if (promptQueueEvents) await promptQueueEvents.close();
    if (promptQueue) await promptQueue.close();
    if (subscriptionQueue) await subscriptionQueue.close();
    if (cleanupQueue) await cleanupQueue.close();
    queuesAvailable = false;
    logger.info('Queues closed');
  } catch (error) {
    logger.error({ error }, 'Error closing queues');
  }
}

// Types
interface JobStatus {
  id: string;
  state: string;
  progress: number;
  data: unknown;
  result: unknown;
  failedReason: string | undefined;
  attemptsMade: number;
  timestamp: number;
}

interface JobCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

interface QueueMetrics {
  promptQueue: JobCounts;
  subscriptionQueue: JobCounts;
  cleanupQueue: JobCounts;
}
