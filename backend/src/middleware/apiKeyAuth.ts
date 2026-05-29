/**
 * API Key Authentication Middleware
 *
 * Validates X-API-Key header and attaches API key details to request.
 */

import { Request, Response, NextFunction } from 'express';
import { validateApiKey, hasPermission, type ValidatedApiKey, type ApiKeyPermission } from '../services/apiKeyService.js';
import { logger } from '../utils/logger.js';
import { prisma } from '../utils/prisma.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ApiKeyRequest extends Request {
  apiKey?: ValidatedApiKey;
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Authenticate requests using X-API-Key header.
 * Returns 401 if key is missing, invalid, expired, or revoked.
 */
export const apiKeyAuth = async (
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || typeof apiKey !== 'string') {
      res.status(401).json({
        error: 'Missing API key',
        code: 'MISSING_API_KEY',
        message: 'Include your API key in the X-API-Key header',
      });
      return;
    }

    const validated = await validateApiKey(apiKey);

    if (!validated) {
      logger.warn({ keyPrefix: apiKey.substring(0, 16) }, 'Invalid API key attempt');
      res.status(401).json({
        error: 'Invalid API key',
        code: 'INVALID_API_KEY',
        message: 'The provided API key is invalid, expired, or revoked',
      });
      return;
    }

    const developer = await prisma.developer.findUnique({
      where: { id: validated.developerId },
      select: { isActive: true, emailVerified: true },
    });

    if (!developer?.isActive || !developer.emailVerified) {
      logger.warn({ developerId: validated.developerId }, 'Blocked API key for inactive or unverified developer');
      res.status(403).json({
        error: 'Developer account is not verified',
        code: 'DEVELOPER_NOT_VERIFIED',
        message: 'Verify your developer email before using API keys.',
      });
      return;
    }

    // Attach validated key to request
    req.apiKey = validated;

    next();
  } catch (error) {
    logger.error({ error }, 'API key authentication error');
    res.status(500).json({
      error: 'Authentication error',
      code: 'AUTH_ERROR',
    });
  }
};

/**
 * Factory for permission-checking middleware.
 * Use after apiKeyAuth to verify the key has required permissions.
 */
export const requirePermission = (permission: ApiKeyPermission) => {
  return (req: ApiKeyRequest, res: Response, next: NextFunction): void => {
    if (!req.apiKey) {
      res.status(401).json({
        error: 'Not authenticated',
        code: 'NOT_AUTHENTICATED',
      });
      return;
    }

    if (!hasPermission(req.apiKey, permission)) {
      logger.warn(
        { keyId: req.apiKey.id, permission, permissions: req.apiKey.permissions },
        'Permission denied'
      );
      res.status(403).json({
        error: 'Permission denied',
        code: 'PERMISSION_DENIED',
        message: `This API key does not have the '${permission}' permission`,
        required: permission,
        granted: req.apiKey.permissions,
      });
      return;
    }

    next();
  };
};

/**
 * Optional API key authentication.
 * Continues without error if no key is provided, but validates if present.
 */
export const optionalApiKeyAuth = async (
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (apiKey && typeof apiKey === 'string') {
      const validated = await validateApiKey(apiKey);
      if (validated) {
        req.apiKey = validated;
      }
    }

    next();
  } catch (error) {
    // Log but continue - optional auth should not block
    logger.warn({ error }, 'Optional API key auth error');
    next();
  }
};
