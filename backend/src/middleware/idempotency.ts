import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../utils/prisma.js';
import { webhookLogger } from '../utils/logger.js';
import { IdempotencyStatus, Prisma } from '@prisma/client';

// ============================================================================
// TYPES
// ============================================================================

export interface IdempotencyOptions {
  /**
   * Time-to-live for idempotency records in milliseconds
   * Default: 24 hours
   */
  ttlMs?: number;

  /**
   * Function to extract the idempotency key from the request
   * Default: SHA-256 hash of the request body
   */
  keyExtractor?: (req: Request) => string;

  /**
   * Endpoint identifier for filtering
   * Default: req.path
   */
  endpoint?: string;
}

// ============================================================================
// IDEMPOTENCY MIDDLEWARE FACTORY
// ============================================================================

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Middleware to ensure webhook idempotency
 * Prevents duplicate processing of the same webhook notification
 */
export function idempotencyGuard(options: IdempotencyOptions = {}) {
  const { ttlMs = DEFAULT_TTL_MS, keyExtractor, endpoint: endpointOverride } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const endpoint = endpointOverride || req.path;

    // Extract idempotency key
    let idempotencyKey: string;
    try {
      if (keyExtractor) {
        idempotencyKey = keyExtractor(req);
      } else {
        // Default: hash the entire body
        const bodyString = JSON.stringify(req.body);
        idempotencyKey = crypto.createHash('sha256').update(bodyString).digest('hex');
      }
    } catch (error) {
      webhookLogger.error({ err: error, endpoint }, 'Failed to extract idempotency key');
      next();
      return;
    }

    const requestId = req.requestId || 'unknown';

    try {
      // Check for existing record
      const existing = await prisma.webhookIdempotencyKey.findUnique({
        where: { idempotencyKey },
      });

      if (existing) {
        // Handle based on status
        switch (existing.status) {
          case IdempotencyStatus.COMPLETED:
            // Return cached response
            webhookLogger.info(
              { idempotencyKey, endpoint, requestId, cachedAt: existing.completedAt },
              'Returning cached idempotent response'
            );

            const cachedResponse = existing.responseBody as Record<string, unknown> | null;
            res.status(existing.statusCode || 200).json(cachedResponse || { success: true });
            return;

          case IdempotencyStatus.PROCESSING:
            // Another request is currently processing this
            webhookLogger.warn(
              { idempotencyKey, endpoint, requestId, startedAt: existing.createdAt },
              'Duplicate request while processing'
            );

            res.status(409).json({
              error: 'Request is already being processed',
              code: 'DUPLICATE_REQUEST',
            });
            return;

          case IdempotencyStatus.FAILED:
            // Previous attempt failed, allow retry
            webhookLogger.info(
              { idempotencyKey, endpoint, requestId },
              'Retrying failed idempotent request'
            );

            // Delete failed record and proceed
            await prisma.webhookIdempotencyKey.delete({
              where: { id: existing.id },
            });
            break;
        }
      }

      // Create new processing record
      const expiresAt = new Date(Date.now() + ttlMs);

      await prisma.webhookIdempotencyKey.create({
        data: {
          idempotencyKey,
          endpoint,
          payload: req.body as Prisma.InputJsonValue,
          status: IdempotencyStatus.PROCESSING,
          expiresAt,
        },
      });

      // Override res.json to capture the response
      const originalJson = res.json.bind(res);
      res.json = function (body: unknown) {
        // Update the idempotency record with the response
        updateIdempotencyRecord(idempotencyKey, res.statusCode, body).catch((err) => {
          webhookLogger.error({ err, idempotencyKey }, 'Failed to update idempotency record');
        });

        return originalJson(body);
      };

      // Handle errors - mark as failed
      res.on('error', () => {
        markIdempotencyFailed(idempotencyKey).catch((err) => {
          webhookLogger.error({ err, idempotencyKey }, 'Failed to mark idempotency as failed');
        });
      });

      next();
    } catch (error) {
      webhookLogger.error({ err: error, idempotencyKey, endpoint, requestId }, 'Idempotency check failed');
      // On error, proceed without idempotency protection
      next();
    }
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function updateIdempotencyRecord(
  idempotencyKey: string,
  statusCode: number,
  responseBody: unknown
): Promise<void> {
  await prisma.webhookIdempotencyKey.update({
    where: { idempotencyKey },
    data: {
      status: statusCode >= 200 && statusCode < 500 ? IdempotencyStatus.COMPLETED : IdempotencyStatus.FAILED,
      statusCode,
      responseBody: responseBody as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });
}

async function markIdempotencyFailed(idempotencyKey: string): Promise<void> {
  await prisma.webhookIdempotencyKey.update({
    where: { idempotencyKey },
    data: {
      status: IdempotencyStatus.FAILED,
      completedAt: new Date(),
    },
  });
}

// ============================================================================
// CLEANUP FUNCTION
// ============================================================================

/**
 * Clean up expired idempotency records
 * Should be called periodically (e.g., hourly via cron)
 */
export async function cleanupExpiredIdempotencyRecords(): Promise<number> {
  const now = new Date();

  const result = await prisma.webhookIdempotencyKey.deleteMany({
    where: {
      expiresAt: {
        lt: now,
      },
    },
  });

  if (result.count > 0) {
    webhookLogger.info({ count: result.count }, 'Cleaned up expired idempotency records');
  }

  return result.count;
}

/**
 * Start periodic cleanup scheduler
 * @param intervalMs - Cleanup interval in milliseconds (default: 1 hour)
 */
export function startIdempotencyCleanupScheduler(intervalMs = 60 * 60 * 1000): NodeJS.Timeout {
  webhookLogger.info({ intervalMs }, 'Starting idempotency cleanup scheduler');

  // Run initial cleanup
  cleanupExpiredIdempotencyRecords().catch((err) => {
    webhookLogger.error({ err }, 'Initial idempotency cleanup failed');
  });

  // Schedule periodic cleanup
  return setInterval(() => {
    cleanupExpiredIdempotencyRecords().catch((err) => {
      webhookLogger.error({ err }, 'Periodic idempotency cleanup failed');
    });
  }, intervalMs);
}

// ============================================================================
// SPECIALIZED KEY EXTRACTORS
// ============================================================================

/**
 * Extract idempotency key from App Store webhook signed payload
 */
export function appStoreKeyExtractor(req: Request): string {
  const { signedPayload } = req.body as { signedPayload?: string };

  if (!signedPayload || typeof signedPayload !== 'string') {
    // Fallback to full body hash
    return crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
  }

  // Hash the signed payload for consistent keying
  return crypto.createHash('sha256').update(signedPayload).digest('hex');
}

export default idempotencyGuard;
