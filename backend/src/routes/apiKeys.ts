/**
 * API Keys Management Routes
 *
 * CRUD operations for API keys. All routes require JWT authentication.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  generateApiKey,
  listApiKeys,
  getApiKey,
  updateApiKey,
  revokeApiKey,
  rotateApiKey,
  AVAILABLE_PERMISSIONS,
  type ApiKeyPermission,
} from '../services/apiKeyService.js';
import { getKeyUsageStats, getUsageHistory } from '../services/apiUsageService.js';
import {
  addAllowedIps,
  removeAllowedIps,
  getAuditLogs,
  generateSigningSecret,
} from '../services/enterpriseSecurityService.js';
import { getUserAlerts, updateAlertThresholds } from '../services/usageAlertService.js';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

export const apiKeysRouter = Router();

// All routes require authentication
apiKeysRouter.use(authenticate);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  permissions: z
    .array(z.enum(AVAILABLE_PERMISSIONS as unknown as [string, ...string[]]))
    .min(1)
    .default(['enhance']),
  environment: z.enum(['production', 'test']).default('production'),
  expiresAt: z.coerce.date().optional(),
  rateLimit: z.number().int().min(1).max(1000).optional(),
});

const updateKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  permissions: z
    .array(z.enum(AVAILABLE_PERMISSIONS as unknown as [string, ...string[]]))
    .min(1)
    .optional(),
  rateLimit: z.number().int().min(1).max(1000).optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

const revokeKeySchema = z.object({
  reason: z.string().max(500).optional(),
});

const usageQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ============================================================================
// CREATE API KEY
// ============================================================================

apiKeysRouter.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const data = createKeySchema.parse(req.body);

    const result = await generateApiKey(req.user.id, data.name, {
      permissions: data.permissions as ApiKeyPermission[],
      description: data.description,
      environment: data.environment,
      expiresAt: data.expiresAt,
      rateLimit: data.rateLimit,
    });

    logger.info({ userId: req.user.id, keyId: result.apiKey.id }, 'API key created');

    // Return the raw key only on creation (it won't be shown again)
    res.status(201).json({
      key: result.key,
      apiKey: {
        id: result.apiKey.id,
        name: result.apiKey.name,
        keyPrefix: result.apiKey.keyPrefix,
        permissions: result.apiKey.permissions,
        rateLimit: result.apiKey.rateLimit,
        description: result.apiKey.description,
        environment: result.apiKey.environment,
        expiresAt: result.apiKey.expiresAt,
        createdAt: result.apiKey.createdAt,
      },
      warning: 'Save this key now. You won\'t be able to see it again.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
      return;
    }
    logger.error({ error }, 'Create API key error');
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// ============================================================================
// LIST API KEYS
// ============================================================================

apiKeysRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const keys = await listApiKeys(req.user.id);

    // Return keys without the hash
    const safeKeys = keys.map((key) => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      permissions: key.permissions,
      rateLimit: key.rateLimit,
      description: key.description,
      environment: key.environment,
      lastUsedAt: key.lastUsedAt,
      totalRequests: key.totalRequests.toString(),
      expiresAt: key.expiresAt,
      isActive: key.isActive,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
    }));

    res.json({ apiKeys: safeKeys });
  } catch (error) {
    logger.error({ error }, 'List API keys error');
    res.status(500).json({ error: 'Failed to list API keys' });
  }
});

// ============================================================================
// GET SINGLE API KEY
// ============================================================================

apiKeysRouter.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const keyId = req.params['id'] as string;
    const key = await getApiKey(keyId, req.user.id);

    if (!key) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    res.json({
      apiKey: {
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        permissions: key.permissions,
        rateLimit: key.rateLimit,
        description: key.description,
        environment: key.environment,
        lastUsedAt: key.lastUsedAt,
        totalRequests: key.totalRequests.toString(),
        expiresAt: key.expiresAt,
        isActive: key.isActive,
        revokedAt: key.revokedAt,
        revokedReason: key.revokedReason,
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Get API key error');
    res.status(500).json({ error: 'Failed to get API key' });
  }
});

// ============================================================================
// UPDATE API KEY
// ============================================================================

apiKeysRouter.patch('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const keyId = req.params['id'] as string;
    const data = updateKeySchema.parse(req.body);

    const key = await updateApiKey(keyId, req.user.id, {
      name: data.name,
      description: data.description,
      permissions: data.permissions as ApiKeyPermission[] | undefined,
      rateLimit: data.rateLimit,
      expiresAt: data.expiresAt === null ? null : data.expiresAt,
    });

    logger.info({ userId: req.user.id, keyId }, 'API key updated');

    res.json({
      apiKey: {
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        permissions: key.permissions,
        rateLimit: key.rateLimit,
        description: key.description,
        environment: key.environment,
        expiresAt: key.expiresAt,
        isActive: key.isActive,
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
      return;
    }
    logger.error({ error }, 'Update API key error');
    res.status(500).json({ error: 'Failed to update API key' });
  }
});

// ============================================================================
// DELETE (REVOKE) API KEY
// ============================================================================

apiKeysRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const keyId = req.params['id'] as string;
    const data = revokeKeySchema.parse(req.body || {});

    await revokeApiKey(keyId, req.user.id, data.reason);

    logger.info({ userId: req.user.id, keyId, reason: data.reason }, 'API key revoked');

    res.json({ success: true, message: 'API key revoked' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
      return;
    }
    logger.error({ error }, 'Revoke API key error');
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

// ============================================================================
// ROTATE API KEY
// ============================================================================

apiKeysRouter.post('/:id/rotate', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const keyId = req.params['id'] as string;

    const result = await rotateApiKey(keyId, req.user.id);

    logger.info({ userId: req.user.id, keyId, newKeyId: result.apiKey.id }, 'API key rotated');

    res.json({
      newKey: result.newKey,
      apiKey: {
        id: result.apiKey.id,
        name: result.apiKey.name,
        keyPrefix: result.apiKey.keyPrefix,
        permissions: result.apiKey.permissions,
        rateLimit: result.apiKey.rateLimit,
        description: result.apiKey.description,
        environment: result.apiKey.environment,
        createdAt: result.apiKey.createdAt,
      },
      oldKeyValidUntil: result.oldKeyValidUntil,
      warning: 'Save this key now. You won\'t be able to see it again. The old key will remain valid until the specified time.',
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
      return;
    }
    logger.error({ error }, 'Rotate API key error');
    res.status(500).json({ error: 'Failed to rotate API key' });
  }
});

// ============================================================================
// GET API KEY USAGE
// ============================================================================

apiKeysRouter.get('/:id/usage', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const keyId = req.params['id'] as string;
    const query = usageQuerySchema.parse(req.query);

    // Verify the key belongs to the user
    const key = await getApiKey(keyId, req.user.id);
    if (!key) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    const stats = await getKeyUsageStats(keyId, {
      startDate: query.startDate,
      endDate: query.endDate,
    });

    res.json({ usage: stats });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
      return;
    }
    logger.error({ error }, 'Get API key usage error');
    res.status(500).json({ error: 'Failed to get usage data' });
  }
});

// ============================================================================
// GET API KEY USAGE HISTORY (PAGINATED)
// ============================================================================

apiKeysRouter.get('/:id/history', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const keyId = req.params['id'] as string;
    const query = usageQuerySchema.parse(req.query);

    // Verify the key belongs to the user
    const key = await getApiKey(keyId, req.user.id);
    if (!key) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    const history = await getUsageHistory(keyId, {
      page: query.page,
      limit: query.limit,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    // Format records for response
    const records = history.records.map((r) => ({
      id: r.id,
      endpoint: r.endpoint,
      method: r.method,
      statusCode: r.statusCode,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      totalTokens: r.totalTokens,
      latencyMs: r.latencyMs,
      modality: r.modality,
      createdAt: r.createdAt,
    }));

    res.json({
      records,
      pagination: {
        page: history.page,
        pages: history.pages,
        total: history.total,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
      return;
    }
    logger.error({ error }, 'Get API key history error');
    res.status(500).json({ error: 'Failed to get usage history' });
  }
});

// ============================================================================
// GET AVAILABLE PERMISSIONS
// ============================================================================

apiKeysRouter.get('/meta/permissions', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  res.json({
    permissions: AVAILABLE_PERMISSIONS.map((p) => ({
      id: p,
      name: p.charAt(0).toUpperCase() + p.slice(1).replace(/_/g, ' '),
      description: getPermissionDescription(p),
    })),
  });
});

function getPermissionDescription(permission: string): string {
  switch (permission) {
    case 'enhance':
      return 'Use the /enhance endpoint to optimize prompts';
    case 'read_history':
      return 'Read your prompt enhancement history';
    case 'models':
      return 'List available modalities and configuration options';
    default:
      return '';
  }
}

// ============================================================================
// IP WHITELIST MANAGEMENT (Enterprise Security)
// ============================================================================

const ipWhitelistSchema = z.object({
  ips: z.array(z.string().min(1).max(50)).min(1).max(100),
});

apiKeysRouter.post('/:id/ip-whitelist', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const keyId = req.params['id'] as string;
    const data = ipWhitelistSchema.parse(req.body);

    const allowedIps = await addAllowedIps(keyId, req.user.id, data.ips);

    logger.info({ userId: req.user.id, keyId, addedIps: data.ips }, 'IP whitelist updated');

    res.json({ allowedIps });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
      return;
    }
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
      return;
    }
    logger.error({ error }, 'Add IP whitelist error');
    res.status(500).json({ error: 'Failed to update IP whitelist' });
  }
});

apiKeysRouter.delete('/:id/ip-whitelist', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const keyId = req.params['id'] as string;
    const data = ipWhitelistSchema.parse(req.body);

    const allowedIps = await removeAllowedIps(keyId, req.user.id, data.ips);

    logger.info({ userId: req.user.id, keyId, removedIps: data.ips }, 'IPs removed from whitelist');

    res.json({ allowedIps });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
      return;
    }
    logger.error({ error }, 'Remove IP whitelist error');
    res.status(500).json({ error: 'Failed to update IP whitelist' });
  }
});

apiKeysRouter.get('/:id/ip-whitelist', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const keyId = req.params['id'] as string;
    const key = await prisma.apiKey.findFirst({
      where: { id: keyId, userId: req.user.id },
      select: { allowedIps: true, allowedOrigins: true },
    });

    if (!key) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    res.json({
      allowedIps: key.allowedIps,
      allowedOrigins: key.allowedOrigins,
    });
  } catch (error) {
    logger.error({ error }, 'Get IP whitelist error');
    res.status(500).json({ error: 'Failed to get IP whitelist' });
  }
});

// ============================================================================
// REQUEST SIGNING (Enterprise Security)
// ============================================================================

apiKeysRouter.post('/:id/signing', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const keyId = req.params['id'] as string;

    // Verify ownership
    const key = await getApiKey(keyId, req.user.id);
    if (!key) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    // Generate new signing secret
    const { secret, secretHash } = await generateSigningSecret();

    // Update the key
    await prisma.apiKey.update({
      where: { id: keyId },
      data: {
        requireSigning: true,
        signingSecret: secretHash,
      },
    });

    logger.info({ userId: req.user.id, keyId }, 'Request signing enabled');

    res.json({
      signingSecret: secret,
      requireSigning: true,
      warning: 'Save this signing secret now. You won\'t be able to see it again.',
      documentation: {
        signatureHeader: 'X-Signature',
        timestampHeader: 'X-Timestamp',
        algorithm: 'HMAC-SHA256',
        payload: 'timestamp.requestBody',
        example: 'hmac_sha256(signingSecret, "1706184000000.{\"prompt\":\"hello\"}")',
      },
    });
  } catch (error) {
    logger.error({ error }, 'Enable signing error');
    res.status(500).json({ error: 'Failed to enable request signing' });
  }
});

apiKeysRouter.delete('/:id/signing', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const keyId = req.params['id'] as string;

    // Verify ownership
    const key = await getApiKey(keyId, req.user.id);
    if (!key) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    // Disable signing
    await prisma.apiKey.update({
      where: { id: keyId },
      data: {
        requireSigning: false,
        signingSecret: null,
      },
    });

    logger.info({ userId: req.user.id, keyId }, 'Request signing disabled');

    res.json({ requireSigning: false });
  } catch (error) {
    logger.error({ error }, 'Disable signing error');
    res.status(500).json({ error: 'Failed to disable request signing' });
  }
});

// ============================================================================
// AUDIT LOGS (Enterprise Security)
// ============================================================================

const auditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  action: z.string().optional(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

apiKeysRouter.get('/:id/audit-logs', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const keyId = req.params['id'] as string;
    const query = auditLogQuerySchema.parse(req.query);

    // Verify ownership
    const key = await getApiKey(keyId, req.user.id);
    if (!key) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    const { logs, total } = await getAuditLogs(keyId, {
      limit: query.limit,
      offset: query.offset,
      action: query.action,
      riskLevel: query.riskLevel,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    res.json({
      auditLogs: logs,
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total,
        hasMore: query.offset + logs.length < total,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
      return;
    }
    logger.error({ error }, 'Get audit logs error');
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

// ============================================================================
// USAGE ALERTS
// ============================================================================

apiKeysRouter.get('/alerts/list', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { limit = 20, offset = 0, alertType } = req.query;

    const { alerts, total } = await getUserAlerts(req.user.id, {
      limit: Number(limit),
      offset: Number(offset),
      alertType: alertType as string | undefined,
    });

    res.json({
      alerts,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        total,
        hasMore: Number(offset) + alerts.length < total,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Get alerts error');
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

const alertThresholdsSchema = z.object({
  thresholds: z.array(z.number().int().min(1).max(100)).min(1).max(10),
});

apiKeysRouter.put('/alerts/thresholds', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const data = alertThresholdsSchema.parse(req.body);

    const thresholds = await updateAlertThresholds(req.user.id, data.thresholds);

    logger.info({ userId: req.user.id, thresholds }, 'Alert thresholds updated');

    res.json({ thresholds });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
      return;
    }
    logger.error({ error }, 'Update thresholds error');
    res.status(500).json({ error: 'Failed to update alert thresholds' });
  }
});

// ============================================================================
// SECURITY STATUS
// ============================================================================

apiKeysRouter.get('/:id/security', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const keyId = req.params['id'] as string;

    const key = await prisma.apiKey.findFirst({
      where: { id: keyId, userId: req.user.id },
      select: {
        id: true,
        name: true,
        allowedIps: true,
        allowedOrigins: true,
        requireSigning: true,
        failedAttempts: true,
        lockedUntil: true,
        lastUsedAt: true,
        lastUsedIp: true,
        environment: true,
      },
    });

    if (!key) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    // Get recent security events
    const recentEvents = await prisma.apiAuditLog.count({
      where: {
        apiKeyId: keyId,
        riskLevel: { in: ['high', 'critical'] },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    // Calculate security score
    let securityScore = 100;
    const recommendations: string[] = [];

    if (key.allowedIps.length === 0) {
      securityScore -= 20;
      recommendations.push('Enable IP whitelisting to restrict API key usage to known IP addresses');
    }

    if (!key.requireSigning) {
      securityScore -= 15;
      recommendations.push('Enable request signing for enhanced security on sensitive operations');
    }

    if (key.failedAttempts > 0) {
      securityScore -= Math.min(key.failedAttempts * 5, 25);
      recommendations.push('Review failed authentication attempts for potential unauthorized access');
    }

    if (recentEvents > 0) {
      securityScore -= Math.min(recentEvents * 5, 30);
      recommendations.push('Review recent high-risk security events');
    }

    if (key.environment === 'production' && key.allowedIps.length === 0) {
      recommendations.push('Production keys should have IP restrictions configured');
    }

    res.json({
      security: {
        score: Math.max(0, securityScore),
        grade: getSecurityGrade(securityScore),
        ipWhitelistEnabled: key.allowedIps.length > 0,
        allowedIpsCount: key.allowedIps.length,
        requestSigningEnabled: key.requireSigning,
        failedAttempts: key.failedAttempts,
        isLocked: key.lockedUntil ? key.lockedUntil > new Date() : false,
        lockedUntil: key.lockedUntil,
        lastUsedAt: key.lastUsedAt,
        lastUsedIp: key.lastUsedIp,
        recentHighRiskEvents: recentEvents,
        recommendations,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Get security status error');
    res.status(500).json({ error: 'Failed to get security status' });
  }
});

function getSecurityGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}
