/**
 * API Usage Service
 *
 * Tracks API usage for billing and analytics.
 * Records individual API requests and provides aggregation for billing.
 */

import { prisma } from '../utils/prisma.js';
import { cache } from '../utils/redis.js';
import { logger } from '../utils/logger.js';
import type { ApiUsage, Prisma } from '@prisma/client';

// ============================================================================
// TYPES
// ============================================================================

export interface RecordUsageParams {
  apiKeyId: string;
  developerId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  modality?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface UsageStats {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  avgLatencyMs: number;
  successRate: number;
  requestsByEndpoint: Record<string, number>;
  requestsByModality: Record<string, number>;
  requestsByDay: Array<{
    date: string;
    requests: number;
    tokens: number;
  }>;
}

export interface MonthlyUsage {
  periodStart: Date;
  periodEnd: Date;
  totalRequests: number;
  includedRequests: number;
  overageRequests: number;
  totalTokens: number;
  estimatedCostCents: number;
}

export interface BillingCalculation {
  periodStart: Date;
  periodEnd: Date;
  includedRequests: number;
  usedRequests: number;
  overageRequests: number;
  overageRateCents: number;
  basePriceCents: number;
  overageCostCents: number;
  totalCostCents: number;
}

// ============================================================================
// USAGE RECORDING
// ============================================================================

/**
 * Record a single API request for usage tracking.
 */
export async function recordUsage(params: RecordUsageParams): Promise<ApiUsage> {
  const totalTokens = (params.inputTokens || 0) + (params.outputTokens || 0);

  const usage = await prisma.apiUsage.create({
    data: {
      apiKeyId: params.apiKeyId,
      developerId: params.developerId,
      endpoint: params.endpoint,
      method: params.method,
      statusCode: params.statusCode,
      inputTokens: params.inputTokens || 0,
      outputTokens: params.outputTokens || 0,
      totalTokens,
      latencyMs: params.latencyMs || 0,
      modality: params.modality,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
  });

  // Update period usage counter asynchronously
  incrementPeriodUsage(params.developerId).catch((err) => {
    logger.warn({ err, developerId: params.developerId }, 'Failed to increment period usage');
  });

  return usage;
}

/**
 * Record usage with fire-and-forget pattern (non-blocking).
 */
export function recordUsageAsync(params: RecordUsageParams): void {
  recordUsage(params).catch((err) => {
    logger.error({ err, params }, 'Failed to record API usage');
  });
}

/**
 * Increment the current period usage for billing.
 */
async function incrementPeriodUsage(developerId: string): Promise<void> {
  await prisma.apiSubscription.updateMany({
    where: { developerId },
    data: {
      currentPeriodUsage: { increment: 1 },
    },
  });

  // Invalidate cache
  await cache.del(`api-subscription:${developerId}`);
}

// ============================================================================
// USAGE RETRIEVAL
// ============================================================================

/**
 * Get usage statistics for a specific API key.
 */
export async function getKeyUsageStats(
  apiKeyId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  } = {}
): Promise<UsageStats> {
  const { startDate, endDate, limit = 1000 } = options;

  const where: Prisma.ApiUsageWhereInput = { apiKeyId };

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = startDate;
    if (endDate) where.createdAt.lte = endDate;
  }

  const usageRecords = await prisma.apiUsage.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return calculateUsageStats(usageRecords);
}

/**
 * Get usage statistics for a user across all their API keys.
 */
export async function getUserUsageStats(
  developerId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  } = {}
): Promise<UsageStats> {
  const { startDate, endDate, limit = 1000 } = options;

  const where: Prisma.ApiUsageWhereInput = { developerId };

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = startDate;
    if (endDate) where.createdAt.lte = endDate;
  }

  const usageRecords = await prisma.apiUsage.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return calculateUsageStats(usageRecords);
}

/**
 * Calculate statistics from usage records.
 */
function calculateUsageStats(records: ApiUsage[]): UsageStats {
  if (records.length === 0) {
    return {
      totalRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      avgLatencyMs: 0,
      successRate: 100,
      requestsByEndpoint: {},
      requestsByModality: {},
      requestsByDay: [],
    };
  }

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalLatency = 0;
  let successCount = 0;
  const endpointCounts: Record<string, number> = {};
  const modalityCounts: Record<string, number> = {};
  const dailyCounts: Record<string, { requests: number; tokens: number }> = {};

  for (const record of records) {
    totalInputTokens += record.inputTokens;
    totalOutputTokens += record.outputTokens;
    totalLatency += record.latencyMs;

    if (record.statusCode >= 200 && record.statusCode < 300) {
      successCount++;
    }

    // Count by endpoint
    endpointCounts[record.endpoint] = (endpointCounts[record.endpoint] || 0) + 1;

    // Count by modality
    if (record.modality) {
      modalityCounts[record.modality] = (modalityCounts[record.modality] || 0) + 1;
    }

    // Count by day
    const day = record.createdAt.toISOString().split('T')[0] as string;
    if (!dailyCounts[day]) {
      dailyCounts[day] = { requests: 0, tokens: 0 };
    }
    dailyCounts[day].requests++;
    dailyCounts[day].tokens += record.totalTokens;
  }

  const requestsByDay = Object.entries(dailyCounts)
    .map(([date, data]) => ({
      date,
      requests: data.requests,
      tokens: data.tokens,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalRequests: records.length,
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    avgLatencyMs: Math.round(totalLatency / records.length),
    successRate: Math.round((successCount / records.length) * 100 * 100) / 100,
    requestsByEndpoint: endpointCounts,
    requestsByModality: modalityCounts,
    requestsByDay,
  };
}

// ============================================================================
// BILLING CALCULATIONS
// ============================================================================

/**
 * Get current month's usage for billing.
 */
export async function getMonthlyUsage(developerId: string): Promise<MonthlyUsage> {
  const subscription = await prisma.apiSubscription.findUnique({
    where: { developerId },
  });

  if (!subscription) {
    // No API subscription - return zeros
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    return {
      periodStart,
      periodEnd,
      totalRequests: 0,
      includedRequests: 100, // Free tier
      overageRequests: 0,
      totalTokens: 0,
      estimatedCostCents: 0,
    };
  }

  // Get actual usage for the period
  const usageRecords = await prisma.apiUsage.findMany({
    where: {
      developerId,
      createdAt: {
        gte: subscription.currentPeriodStart,
        lte: subscription.currentPeriodEnd,
      },
    },
    select: {
      totalTokens: true,
    },
  });

  const totalRequests = subscription.currentPeriodUsage;
  const totalTokens = usageRecords.reduce((sum, r) => sum + r.totalTokens, 0);
  const overageRequests = Math.max(0, totalRequests - subscription.includedRequests);
  const estimatedCostCents = Math.ceil(overageRequests / 100) * subscription.overageRateCents;

  return {
    periodStart: subscription.currentPeriodStart,
    periodEnd: subscription.currentPeriodEnd,
    totalRequests,
    includedRequests: subscription.includedRequests,
    overageRequests,
    totalTokens,
    estimatedCostCents,
  };
}

/**
 * Calculate billing for a period.
 */
export async function calculateBilling(
  developerId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<BillingCalculation> {
  const subscription = await prisma.apiSubscription.findUnique({
    where: { developerId },
  });

  // Count requests in the period
  const requestCount = await prisma.apiUsage.count({
    where: {
      developerId,
      createdAt: {
        gte: periodStart,
        lte: periodEnd,
      },
    },
  });

  const includedRequests = subscription?.includedRequests || 100;
  const overageRateCents = subscription?.overageRateCents || 1;
  const overageRequests = Math.max(0, requestCount - includedRequests);
  const overageCostCents = Math.ceil(overageRequests / 100) * overageRateCents;

  // Base price based on tier
  const basePriceCents = getBasePriceCents(subscription?.tier || 'API_FREE');

  return {
    periodStart,
    periodEnd,
    includedRequests,
    usedRequests: requestCount,
    overageRequests,
    overageRateCents,
    basePriceCents,
    overageCostCents,
    totalCostCents: basePriceCents + overageCostCents,
  };
}

function getBasePriceCents(tier: string): number {
  switch (tier) {
    case 'API_FREE':
      return 0;
    case 'API_STARTER':
      return 2900; // $29
    case 'API_PRO':
      return 9900; // $99
    case 'API_ENTERPRISE':
      return 0; // Custom pricing
    default:
      return 0;
  }
}

// ============================================================================
// USAGE HISTORY
// ============================================================================

/**
 * Get paginated usage history for an API key.
 */
export async function getUsageHistory(
  apiKeyId: string,
  options: {
    page?: number;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  } = {}
): Promise<{
  records: ApiUsage[];
  total: number;
  page: number;
  pages: number;
}> {
  const { page = 1, limit = 50, startDate, endDate } = options;
  const skip = (page - 1) * limit;

  const where: Prisma.ApiUsageWhereInput = { apiKeyId };

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = startDate;
    if (endDate) where.createdAt.lte = endDate;
  }

  const [records, total] = await Promise.all([
    prisma.apiUsage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.apiUsage.count({ where }),
  ]);

  return {
    records,
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

/**
 * Get recent usage for display purposes.
 */
export async function getRecentUsage(
  developerId: string,
  limit: number = 10
): Promise<ApiUsage[]> {
  return prisma.apiUsage.findMany({
    where: { developerId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      apiKey: {
        select: {
          name: true,
          keyPrefix: true,
        },
      },
    },
  });
}

// ============================================================================
// ANALYTICS HELPERS
// ============================================================================

/**
 * Get hourly request distribution for the last 24 hours.
 */
export async function getHourlyDistribution(developerId: string): Promise<number[]> {
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  const usage = await prisma.apiUsage.findMany({
    where: {
      developerId,
      createdAt: { gte: twentyFourHoursAgo },
    },
    select: { createdAt: true },
  });

  const hourly = new Array(24).fill(0);
  const now = new Date();

  for (const record of usage) {
    const hoursAgo = Math.floor(
      (now.getTime() - record.createdAt.getTime()) / (1000 * 60 * 60)
    );
    if (hoursAgo >= 0 && hoursAgo < 24) {
      hourly[23 - hoursAgo]++;
    }
  }

  return hourly;
}

/**
 * Get latency percentiles for the last 24 hours.
 */
export async function getLatencyPercentiles(
  developerId: string
): Promise<{ p50: number; p90: number; p95: number; p99: number }> {
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  const usage = await prisma.apiUsage.findMany({
    where: {
      developerId,
      createdAt: { gte: twentyFourHoursAgo },
      statusCode: { gte: 200, lt: 300 }, // Only successful requests
    },
    select: { latencyMs: true },
    orderBy: { latencyMs: 'asc' },
  });

  if (usage.length === 0) {
    return { p50: 0, p90: 0, p95: 0, p99: 0 };
  }

  const getPercentile = (arr: number[], p: number): number => {
    const index = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, index)] || 0;
  };

  const latencies = usage.map((u) => u.latencyMs);

  return {
    p50: getPercentile(latencies, 50),
    p90: getPercentile(latencies, 90),
    p95: getPercentile(latencies, 95),
    p99: getPercentile(latencies, 99),
  };
}

/**
 * Get error rate for the last 24 hours.
 */
export async function getErrorRate(developerId: string): Promise<{
  total: number;
  errors: number;
  rate: number;
  byStatusCode: Record<number, number>;
}> {
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  const usage = await prisma.apiUsage.findMany({
    where: {
      developerId,
      createdAt: { gte: twentyFourHoursAgo },
    },
    select: { statusCode: true },
  });

  const total = usage.length;
  let errors = 0;
  const byStatusCode: Record<number, number> = {};

  for (const record of usage) {
    byStatusCode[record.statusCode] = (byStatusCode[record.statusCode] || 0) + 1;
    if (record.statusCode >= 400) {
      errors++;
    }
  }

  return {
    total,
    errors,
    rate: total > 0 ? Math.round((errors / total) * 100 * 100) / 100 : 0,
    byStatusCode,
  };
}
