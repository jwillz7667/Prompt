/**
 * API Key Authentication Middleware (Enterprise-Grade)
 *
 * Validates X-API-Key header with comprehensive security checks:
 * - API key validation and permission checking
 * - IP whitelist enforcement
 * - Request signing verification (optional per key)
 * - Lockout detection for brute force protection
 * - Comprehensive audit logging
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { validateApiKey, hasPermission, type ValidatedApiKey, type ApiKeyPermission } from '../services/apiKeyService.js';
import {
  isIpAllowed,
  verifyRequestSignature,
  logAuditEvent,
  assessRisk,
  isKeyLocked,
  recordFailedAttempt,
  clearFailedAttempts,
  SECURITY_HEADERS,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  type SecurityContext,
} from '../services/enterpriseSecurityService.js';
import { createSecurityAlert } from '../services/usageAlertService.js';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ApiKeyRequest extends Request {
  apiKey?: ValidatedApiKey;
  securityContext?: SecurityContext;
  rawBody?: string;
}

interface ExtendedApiKey extends ValidatedApiKey {
  allowedIps: string[];
  allowedOrigins: string[];
  requireSigning: boolean;
  signingSecret?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function getClientIp(req: Request): string {
  // Trust X-Forwarded-For from reverse proxy
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function setSecurityHeaders(res: Response): void {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    res.set(key, value);
  });
}

// ============================================================================
// MAIN MIDDLEWARE
// ============================================================================

/**
 * Authenticate requests using X-API-Key header with enterprise security features.
 * Returns 401 if key is missing, invalid, expired, or revoked.
 * Returns 403 if IP is not whitelisted or signature is invalid.
 */
export const apiKeyAuth = async (
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Set security headers on all responses
  setSecurityHeaders(res);

  // Generate request ID for tracing
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  res.set('X-Request-Id', requestId);

  const clientIp = getClientIp(req);
  const userAgent = req.headers['user-agent'];

  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || typeof apiKey !== 'string') {
      res.status(401).json({
        error: 'Missing API key',
        code: 'MISSING_API_KEY',
        message: 'Include your API key in the X-API-Key header',
        requestId,
      });
      return;
    }

    // Validate the API key
    const validated = await validateApiKey(apiKey);

    if (!validated) {
      logger.warn({ keyPrefix: apiKey.substring(0, 16), clientIp }, 'Invalid API key attempt');
      res.status(401).json({
        error: 'Invalid API key',
        code: 'INVALID_API_KEY',
        message: 'The provided API key is invalid, expired, or revoked',
        requestId,
      });
      return;
    }

    // Fetch extended key details for security checks
    const extendedKey = await prisma.apiKey.findUnique({
      where: { id: validated.id },
      select: {
        allowedIps: true,
        allowedOrigins: true,
        requireSigning: true,
        signingSecret: true,
        lockedUntil: true,
      },
    });

    if (!extendedKey) {
      res.status(401).json({
        error: 'API key not found',
        code: 'KEY_NOT_FOUND',
        requestId,
      });
      return;
    }

    // Create security context
    const securityContext: SecurityContext = {
      apiKeyId: validated.id,
      userId: validated.userId,
      ipAddress: clientIp,
      userAgent,
      requestId,
    };

    // Check if key is locked (brute force protection)
    if (extendedKey.lockedUntil && extendedKey.lockedUntil > new Date()) {
      const unlockTime = Math.ceil((extendedKey.lockedUntil.getTime() - Date.now()) / 1000);

      await logAuditEvent(securityContext, {
        action: 'AUTH_BLOCKED_LOCKED',
        endpoint: req.path,
        method: req.method,
        statusCode: 403,
      });

      res.status(403).json({
        error: 'API key temporarily locked',
        code: 'KEY_LOCKED',
        message: `Too many failed attempts. Try again in ${unlockTime} seconds.`,
        retryAfter: unlockTime,
        requestId,
      });
      return;
    }

    // IP whitelist check
    if (!isIpAllowed(clientIp, extendedKey.allowedIps)) {
      logger.warn(
        { keyId: validated.id, clientIp, allowedIps: extendedKey.allowedIps },
        'IP not in whitelist'
      );

      // Record failed attempt
      const locked = await recordFailedAttempt(validated.id);

      await logAuditEvent(
        securityContext,
        {
          action: 'IP_BLOCKED',
          endpoint: req.path,
          method: req.method,
          statusCode: 403,
          metadata: { allowedIps: extendedKey.allowedIps },
        },
        { level: 'high', score: 50, factors: ['ip_not_whitelisted'] }
      );

      // Create security alert for blocked IP
      await createSecurityAlert(
        validated.userId,
        validated.id,
        'IP_BLOCKED',
        `API request blocked from unauthorized IP address: ${clientIp}`,
        { clientIp, allowedIps: extendedKey.allowedIps }
      );

      res.status(403).json({
        error: 'IP address not allowed',
        code: 'IP_NOT_WHITELISTED',
        message: 'Your IP address is not in the allowed list for this API key',
        requestId,
        ...(locked && { warning: 'Multiple failed attempts detected. Key may be temporarily locked.' }),
      });
      return;
    }

    // Origin check (CORS-like for API keys)
    const origin = req.headers['origin'];
    if (
      extendedKey.allowedOrigins.length > 0 &&
      origin &&
      !extendedKey.allowedOrigins.includes(origin) &&
      !extendedKey.allowedOrigins.includes('*')
    ) {
      await logAuditEvent(securityContext, {
        action: 'ORIGIN_BLOCKED',
        endpoint: req.path,
        method: req.method,
        statusCode: 403,
        metadata: { origin, allowedOrigins: extendedKey.allowedOrigins },
      });

      res.status(403).json({
        error: 'Origin not allowed',
        code: 'ORIGIN_NOT_ALLOWED',
        message: 'Requests from this origin are not permitted',
        requestId,
      });
      return;
    }

    // Request signing verification (if required)
    if (extendedKey.requireSigning && extendedKey.signingSecret) {
      const signature = req.headers[SIGNATURE_HEADER.toLowerCase()];
      const timestamp = req.headers[TIMESTAMP_HEADER.toLowerCase()];

      if (!signature || !timestamp || typeof signature !== 'string' || typeof timestamp !== 'string') {
        res.status(401).json({
          error: 'Missing signature',
          code: 'MISSING_SIGNATURE',
          message: `This API key requires request signing. Include ${SIGNATURE_HEADER} and ${TIMESTAMP_HEADER} headers.`,
          requestId,
        });
        return;
      }

      const rawBody = req.rawBody || JSON.stringify(req.body) || '';
      const verification = verifyRequestSignature(
        rawBody,
        timestamp,
        signature,
        extendedKey.signingSecret
      );

      if (!verification.valid) {
        const locked = await recordFailedAttempt(validated.id);

        await logAuditEvent(
          securityContext,
          {
            action: 'SIGNATURE_INVALID',
            endpoint: req.path,
            method: req.method,
            statusCode: 401,
            metadata: { error: verification.error },
          },
          { level: 'high', score: 40, factors: ['invalid_signature'] }
        );

        res.status(401).json({
          error: 'Invalid signature',
          code: 'INVALID_SIGNATURE',
          message: verification.error,
          requestId,
          ...(locked && { warning: 'Multiple failed attempts detected. Key may be temporarily locked.' }),
        });
        return;
      }
    }

    // Clear failed attempts on successful auth
    await clearFailedAttempts(validated.id);

    // Update last used IP
    prisma.apiKey.update({
      where: { id: validated.id },
      data: { lastUsedIp: clientIp },
    }).catch((err) => {
      logger.warn({ err, keyId: validated.id }, 'Failed to update lastUsedIp');
    });

    // Attach validated key and security context to request
    req.apiKey = validated;
    req.securityContext = securityContext;

    // Assess risk in background (don't block request)
    assessRisk(securityContext).then((risk) => {
      if (risk.level !== 'low') {
        logger.warn({ keyId: validated.id, risk }, 'Elevated risk request');
        logAuditEvent(securityContext, {
          action: 'ELEVATED_RISK',
          endpoint: req.path,
          method: req.method,
          metadata: { risk },
        }, risk);
      }
    }).catch((err) => {
      logger.warn({ err }, 'Risk assessment failed');
    });

    next();
  } catch (error) {
    logger.error({ error, clientIp }, 'API key authentication error');
    res.status(500).json({
      error: 'Authentication error',
      code: 'AUTH_ERROR',
      requestId,
    });
  }
};

// ============================================================================
// PERMISSION MIDDLEWARE
// ============================================================================

/**
 * Factory for permission-checking middleware.
 * Use after apiKeyAuth to verify the key has required permissions.
 */
export const requirePermission = (permission: ApiKeyPermission) => {
  return async (req: ApiKeyRequest, res: Response, next: NextFunction): Promise<void> => {
    const requestId = res.get('X-Request-Id') || randomUUID();

    if (!req.apiKey) {
      res.status(401).json({
        error: 'Not authenticated',
        code: 'NOT_AUTHENTICATED',
        requestId,
      });
      return;
    }

    if (!hasPermission(req.apiKey, permission)) {
      logger.warn(
        { keyId: req.apiKey.id, permission, permissions: req.apiKey.permissions },
        'Permission denied'
      );

      if (req.securityContext) {
        await logAuditEvent(req.securityContext, {
          action: 'PERMISSION_DENIED',
          endpoint: req.path,
          method: req.method,
          statusCode: 403,
          metadata: { requiredPermission: permission, grantedPermissions: req.apiKey.permissions },
        });
      }

      res.status(403).json({
        error: 'Permission denied',
        code: 'PERMISSION_DENIED',
        message: `This API key does not have the '${permission}' permission`,
        required: permission,
        granted: req.apiKey.permissions,
        requestId,
      });
      return;
    }

    next();
  };
};

// ============================================================================
// OPTIONAL AUTH MIDDLEWARE
// ============================================================================

/**
 * Optional API key authentication.
 * Continues without error if no key is provided, but validates if present.
 */
export const optionalApiKeyAuth = async (
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Set security headers
  setSecurityHeaders(res);

  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  res.set('X-Request-Id', requestId);

  try {
    const apiKey = req.headers['x-api-key'];

    if (apiKey && typeof apiKey === 'string') {
      const validated = await validateApiKey(apiKey);
      if (validated) {
        req.apiKey = validated;
        req.securityContext = {
          apiKeyId: validated.id,
          userId: validated.userId,
          ipAddress: getClientIp(req),
          userAgent: req.headers['user-agent'],
          requestId,
        };
      }
    }

    next();
  } catch (error) {
    // Log but continue - optional auth should not block
    logger.warn({ error }, 'Optional API key auth error');
    next();
  }
};

// ============================================================================
// RAW BODY MIDDLEWARE
// ============================================================================

/**
 * Middleware to capture raw body for signature verification.
 * Must be used before body-parser.
 */
export const captureRawBody = (
  req: ApiKeyRequest,
  _res: Response,
  next: NextFunction
): void => {
  let data = '';

  req.on('data', (chunk) => {
    data += chunk;
  });

  req.on('end', () => {
    req.rawBody = data;
    next();
  });
};
