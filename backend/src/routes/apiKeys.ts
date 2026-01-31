/**
 * API Keys Management Routes
 *
 * CRUD operations for API keys. All routes require developer JWT authentication.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticateDeveloper, type DeveloperAuthenticatedRequest } from '../middleware/developerAuth.js';
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
import { logger } from '../utils/logger.js';

export const apiKeysRouter = Router();

// All routes require developer authentication
apiKeysRouter.use(authenticateDeveloper);

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

apiKeysRouter.post('/', async (req: DeveloperAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.developer) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const data = createKeySchema.parse(req.body);

    const result = await generateApiKey(req.developer.id, data.name, {
      permissions: data.permissions as ApiKeyPermission[],
      description: data.description,
      environment: data.environment,
      expiresAt: data.expiresAt,
      rateLimit: data.rateLimit,
    });

    logger.info({ developerId: req.developer.id, keyId: result.apiKey.id }, 'API key created');

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

apiKeysRouter.get('/', async (req: DeveloperAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.developer) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const keys = await listApiKeys(req.developer.id);

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

apiKeysRouter.get('/:id', async (req: DeveloperAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.developer) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const keyId = req.params['id'] as string;
    const key = await getApiKey(keyId, req.developer.id);

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

apiKeysRouter.patch('/:id', async (req: DeveloperAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.developer) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const keyId = req.params['id'] as string;
    const data = updateKeySchema.parse(req.body);

    const key = await updateApiKey(keyId, req.developer.id, {
      name: data.name,
      description: data.description,
      permissions: data.permissions as ApiKeyPermission[] | undefined,
      rateLimit: data.rateLimit,
      expiresAt: data.expiresAt === null ? null : data.expiresAt,
    });

    logger.info({ developerId: req.developer.id, keyId }, 'API key updated');

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

apiKeysRouter.delete('/:id', async (req: DeveloperAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.developer) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const keyId = req.params['id'] as string;
    const data = revokeKeySchema.parse(req.body || {});

    await revokeApiKey(keyId, req.developer.id, data.reason);

    logger.info({ developerId: req.developer.id, keyId, reason: data.reason }, 'API key revoked');

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

apiKeysRouter.post('/:id/rotate', async (req: DeveloperAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.developer) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const keyId = req.params['id'] as string;

    const result = await rotateApiKey(keyId, req.developer.id);

    logger.info({ developerId: req.developer.id, keyId, newKeyId: result.apiKey.id }, 'API key rotated');

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

apiKeysRouter.get('/:id/usage', async (req: DeveloperAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.developer) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const keyId = req.params['id'] as string;
    const query = usageQuerySchema.parse(req.query);

    // Verify the key belongs to the developer
    const key = await getApiKey(keyId, req.developer.id);
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

apiKeysRouter.get('/:id/history', async (req: DeveloperAuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.developer) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const keyId = req.params['id'] as string;
    const query = usageQuerySchema.parse(req.query);

    // Verify the key belongs to the developer
    const key = await getApiKey(keyId, req.developer.id);
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

apiKeysRouter.get('/meta/permissions', async (_req: DeveloperAuthenticatedRequest, res: Response): Promise<void> => {
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
