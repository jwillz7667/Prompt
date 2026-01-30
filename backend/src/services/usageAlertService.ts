/**
 * Usage Alert Service
 *
 * Monitors API usage and sends alerts when thresholds are reached.
 * Supports email notifications and webhook delivery.
 */

import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface AlertConfig {
  thresholds: number[]; // Percentage thresholds (e.g., [50, 80, 100])
  emailEnabled?: boolean;
  webhookUrl?: string;
}

export interface AlertPayload {
  alertType: string;
  severity: 'info' | 'warning' | 'critical';
  threshold: number;
  currentUsage: number;
  limit: number;
  usagePercentage: number;
  message: string;
  timestamp: string;
  periodEnd: string;
}

// ============================================================================
// ALERT CHECKING
// ============================================================================

/**
 * Check usage and create alerts if thresholds are crossed.
 */
export async function checkUsageAlerts(userId: string): Promise<AlertPayload[]> {
  const subscription = await prisma.apiSubscription.findUnique({
    where: { userId },
    select: {
      id: true,
      currentPeriodUsage: true,
      includedRequests: true,
      currentPeriodEnd: true,
      alertThresholds: true,
      alertsSentThisPeriod: true,
      tier: true,
    },
  });

  if (!subscription) {
    return [];
  }

  // Skip for unlimited plans
  if (subscription.tier === 'API_ENTERPRISE') {
    return [];
  }

  const alerts: AlertPayload[] = [];
  const usagePercentage = Math.round(
    (subscription.currentPeriodUsage / subscription.includedRequests) * 100
  );

  // Check each threshold
  for (const threshold of subscription.alertThresholds) {
    // Skip if already alerted for this threshold
    if (subscription.alertsSentThisPeriod.includes(threshold)) {
      continue;
    }

    // Check if threshold is crossed
    if (usagePercentage >= threshold) {
      const alert = await createUsageAlert(
        subscription.id,
        userId,
        threshold,
        subscription.currentPeriodUsage,
        subscription.includedRequests,
        subscription.currentPeriodEnd
      );

      if (alert) {
        alerts.push(alert);
      }
    }
  }

  return alerts;
}

/**
 * Create a usage alert and mark threshold as alerted.
 */
async function createUsageAlert(
  subscriptionId: string,
  userId: string,
  threshold: number,
  currentUsage: number,
  limit: number,
  periodEnd: Date
): Promise<AlertPayload | null> {
  const usagePercentage = Math.round((currentUsage / limit) * 100);
  const severity = getSeverity(threshold);
  const alertType = threshold >= 100 ? 'QUOTA_EXCEEDED' : 'QUOTA_WARNING';

  const message =
    threshold >= 100
      ? `You have exceeded your monthly API quota (${currentUsage}/${limit} requests). Additional requests may incur overage charges.`
      : `You have used ${usagePercentage}% of your monthly API quota (${currentUsage}/${limit} requests).`;

  const payload: AlertPayload = {
    alertType,
    severity,
    threshold,
    currentUsage,
    limit,
    usagePercentage,
    message,
    timestamp: new Date().toISOString(),
    periodEnd: periodEnd.toISOString(),
  };

  try {
    // Create alert record
    await prisma.usageAlert.create({
      data: {
        apiSubscriptionId: subscriptionId,
        userId,
        alertType,
        threshold,
        currentUsage,
        limit,
        message,
        severity,
        metadata: payload as object,
      },
    });

    // Mark threshold as alerted
    await prisma.apiSubscription.update({
      where: { id: subscriptionId },
      data: {
        alertsSentThisPeriod: {
          push: threshold,
        },
      },
    });

    logger.info(
      { userId, threshold, usagePercentage, alertType },
      'Usage alert created'
    );

    return payload;
  } catch (error) {
    logger.error({ error, userId, threshold }, 'Failed to create usage alert');
    return null;
  }
}

function getSeverity(threshold: number): 'info' | 'warning' | 'critical' {
  if (threshold >= 100) return 'critical';
  if (threshold >= 80) return 'warning';
  return 'info';
}

// ============================================================================
// ALERT RETRIEVAL
// ============================================================================

/**
 * Get recent alerts for a user.
 */
export async function getUserAlerts(
  userId: string,
  options: {
    limit?: number;
    offset?: number;
    alertType?: string;
  } = {}
): Promise<{ alerts: unknown[]; total: number }> {
  const { limit = 20, offset = 0, alertType } = options;

  const where: Record<string, unknown> = { userId };
  if (alertType) {
    where['alertType'] = alertType;
  }

  const [alerts, total] = await Promise.all([
    prisma.usageAlert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.usageAlert.count({ where }),
  ]);

  return { alerts, total };
}

// ============================================================================
// THRESHOLD MANAGEMENT
// ============================================================================

/**
 * Update alert thresholds for a subscription.
 */
export async function updateAlertThresholds(
  userId: string,
  thresholds: number[]
): Promise<number[]> {
  // Validate thresholds
  const validThresholds = thresholds
    .filter((t) => t > 0 && t <= 100)
    .sort((a, b) => a - b);

  if (validThresholds.length === 0) {
    throw new Error('At least one valid threshold (1-100) is required');
  }

  const subscription = await prisma.apiSubscription.update({
    where: { userId },
    data: { alertThresholds: validThresholds },
    select: { alertThresholds: true },
  });

  logger.info({ userId, thresholds: validThresholds }, 'Alert thresholds updated');

  return subscription.alertThresholds;
}

/**
 * Reset alerts for a new billing period.
 */
export async function resetPeriodAlerts(subscriptionId: string): Promise<void> {
  await prisma.apiSubscription.update({
    where: { id: subscriptionId },
    data: { alertsSentThisPeriod: [] },
  });

  logger.info({ subscriptionId }, 'Period alerts reset');
}

// ============================================================================
// SECURITY ALERTS
// ============================================================================

/**
 * Create a security alert for suspicious activity.
 */
export async function createSecurityAlert(
  userId: string,
  apiKeyId: string,
  alertType: string,
  message: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  // Find or create a subscription for the user
  let subscription = await prisma.apiSubscription.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!subscription) {
    // Create a free subscription if none exists
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    subscription = await prisma.apiSubscription.create({
      data: {
        userId,
        currentPeriodEnd: periodEnd,
      },
      select: { id: true },
    });
  }

  await prisma.usageAlert.create({
    data: {
      apiSubscriptionId: subscription.id,
      userId,
      alertType,
      message,
      severity: 'critical',
      metadata: {
        ...metadata,
        apiKeyId,
        timestamp: new Date().toISOString(),
      },
    },
  });

  logger.warn({ userId, apiKeyId, alertType }, 'Security alert created');
}

// ============================================================================
// RATE LIMIT ALERTS
// ============================================================================

/**
 * Create an alert when rate limits are repeatedly hit.
 */
export async function checkRateLimitAlerts(
  userId: string,
  apiKeyId: string
): Promise<void> {
  const cacheKey = `ratelimit_alert:${apiKeyId}`;

  // Count recent rate limit events
  const recentEvents = await prisma.apiAuditLog.count({
    where: {
      apiKeyId,
      action: 'RATE_LIMIT',
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // Last hour
    },
  });

  // Alert if hit rate limit more than 10 times in an hour
  if (recentEvents >= 10) {
    await createSecurityAlert(
      userId,
      apiKeyId,
      'RATE_LIMIT_WARNING',
      `API key has hit rate limits ${recentEvents} times in the past hour. Consider upgrading your rate limit or optimizing your integration.`,
      { hitCount: recentEvents, period: '1 hour' }
    );
  }
}
