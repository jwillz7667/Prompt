/**
 * API Key Service
 *
 * Handles generation, validation, rotation, and management of API keys
 * for the Enterprise API system.
 */

import { randomBytes, createHash } from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../utils/prisma.js';
import { cache } from '../utils/redis.js';
import { logger } from '../utils/logger.js';
import type { ApiKey } from '@prisma/client';

// ============================================================================
// CONSTANTS
// ============================================================================

const KEY_PREFIX_LIVE = 'pk_live_';
const KEY_PREFIX_TEST = 'pk_test_';
const KEY_LENGTH = 32; // 32 hex chars = 128 bits
const BCRYPT_ROUNDS = 12;
const KEY_CACHE_TTL = 300; // 5 minutes
const ROTATION_GRACE_PERIOD_HOURS = 24;

// Default permissions for new keys
export const DEFAULT_PERMISSIONS = ['enhance'] as const;

// All available permissions
export const AVAILABLE_PERMISSIONS = [
  'enhance',      // Can use /enhance endpoint
  'read_history', // Can read enhancement history
  'models',       // Can query available models
] as const;

export type ApiKeyPermission = (typeof AVAILABLE_PERMISSIONS)[number];

// ============================================================================
// TYPES
// ============================================================================

export interface ApiKeyCreateResult {
  key: string;        // Full raw key (shown only once)
  apiKey: ApiKey;     // Database record
}

export interface ApiKeyRotateResult {
  newKey: string;             // New raw key
  oldKeyValidUntil: Date;     // When old key expires
  apiKey: ApiKey;             // Updated database record
}

export interface ValidatedApiKey {
  id: string;
  developerId: string;
  name: string;
  permissions: string[];
  rateLimit: number;
  environment: string;
}

interface ApiKeyCache {
  id: string;
  developerId: string;
  name: string;
  permissions: string[];
  rateLimit: number;
  environment: string;
  isActive: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
}

// ============================================================================
// KEY GENERATION
// ============================================================================

/**
 * Generate a new API key for a developer.
 *
 * Key format: pk_live_<32 hex chars> or pk_test_<32 hex chars>
 * Example: pk_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
 */
export async function generateApiKey(
  developerId: string,
  name: string,
  options: {
    permissions?: ApiKeyPermission[];
    description?: string;
    environment?: 'production' | 'test';
    expiresAt?: Date;
    rateLimit?: number;
  } = {}
): Promise<ApiKeyCreateResult> {
  const {
    permissions = [...DEFAULT_PERMISSIONS],
    description,
    environment = 'production',
    expiresAt,
    rateLimit = 60, // Default: 60 requests per minute
  } = options;

  // Validate permissions
  const validPermissions = permissions.filter((p) =>
    AVAILABLE_PERMISSIONS.includes(p as ApiKeyPermission)
  );

  if (validPermissions.length === 0) {
    throw new Error('At least one valid permission is required');
  }

  // Generate random key
  const rawKeyBytes = randomBytes(KEY_LENGTH / 2); // 16 bytes = 32 hex chars
  const rawKeyHex = rawKeyBytes.toString('hex');

  // Add environment prefix
  const prefix = environment === 'test' ? KEY_PREFIX_TEST : KEY_PREFIX_LIVE;
  const fullKey = `${prefix}${rawKeyHex}`;

  // Create keyPrefix for identification (prefix + first 8 chars of hex)
  const keyPrefix = `${prefix}${rawKeyHex.substring(0, 8)}`;

  // Hash the key for storage (we never store the raw key)
  const keyHash = await bcrypt.hash(fullKey, BCRYPT_ROUNDS);

  // Create the API key record
  const apiKey = await prisma.apiKey.create({
    data: {
      developerId,
      name,
      keyHash,
      keyPrefix,
      permissions: validPermissions,
      description,
      environment,
      expiresAt,
      rateLimit,
      isActive: true,
    },
  });

  logger.info(
    { developerId, keyId: apiKey.id, environment, permissions: validPermissions },
    'API key generated'
  );

  return {
    key: fullKey,
    apiKey,
  };
}

// ============================================================================
// KEY VALIDATION
// ============================================================================

/**
 * Validate an API key and return its details.
 * Returns null if key is invalid, expired, or revoked.
 */
export async function validateApiKey(rawKey: string): Promise<ValidatedApiKey | null> {
  // Quick format validation
  if (!rawKey.startsWith(KEY_PREFIX_LIVE) && !rawKey.startsWith(KEY_PREFIX_TEST)) {
    return null;
  }

  // Extract the prefix for lookup
  const prefix = rawKey.substring(0, 16); // "pk_live_" + first 8 chars

  // Try cache first
  const cached = await cache.get<ApiKeyCache>(`apikey:${prefix}`);
  if (cached) {
    // Verify the full key hash
    const apiKey = await prisma.apiKey.findFirst({
      where: { keyPrefix: prefix },
    });

    if (!apiKey) {
      await cache.del(`apikey:${prefix}`);
      return null;
    }

    const isValid = await bcrypt.compare(rawKey, apiKey.keyHash);
    if (!isValid) {
      return null;
    }

    // Check if still valid
    if (!isKeyValid(cached)) {
      return null;
    }

    // Update lastUsedAt asynchronously (fire-and-forget)
    updateLastUsed(apiKey.id).catch((err) => {
      logger.warn({ err, keyId: apiKey.id }, 'Failed to update lastUsedAt');
    });

    return {
      id: cached.id,
      developerId: cached.developerId,
      name: cached.name,
      permissions: cached.permissions,
      rateLimit: cached.rateLimit,
      environment: cached.environment,
    };
  }

  // Cache miss - look up by prefix pattern
  const apiKeys = await prisma.apiKey.findMany({
    where: {
      keyPrefix: prefix,
      isActive: true,
    },
  });

  if (apiKeys.length === 0) {
    return null;
  }

  // Find the key that matches the hash
  for (const apiKey of apiKeys) {
    const isValid = await bcrypt.compare(rawKey, apiKey.keyHash);
    if (isValid) {
      // Check expiry and revocation
      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        return null;
      }
      if (apiKey.revokedAt) {
        return null;
      }
      if (!apiKey.isActive) {
        return null;
      }

      // Cache for future lookups
      // Note: At this point we know revokedAt is null (checked above) and expiresAt may be in the future
      const cacheData: ApiKeyCache = {
        id: apiKey.id,
        developerId: apiKey.developerId,
        name: apiKey.name,
        permissions: apiKey.permissions,
        rateLimit: apiKey.rateLimit,
        environment: apiKey.environment,
        isActive: apiKey.isActive,
        expiresAt: apiKey.expiresAt ? apiKey.expiresAt.toISOString() : null,
        revokedAt: null, // Already verified revokedAt is null above
      };
      await cache.set(`apikey:${prefix}`, cacheData, KEY_CACHE_TTL);

      // Update lastUsedAt asynchronously
      updateLastUsed(apiKey.id).catch((err) => {
        logger.warn({ err, keyId: apiKey.id }, 'Failed to update lastUsedAt');
      });

      return {
        id: apiKey.id,
        developerId: apiKey.developerId,
        name: apiKey.name,
        permissions: apiKey.permissions,
        rateLimit: apiKey.rateLimit,
        environment: apiKey.environment,
      };
    }
  }

  return null;
}

function isKeyValid(cached: ApiKeyCache): boolean {
  if (!cached.isActive) return false;
  if (cached.revokedAt) return false;
  if (cached.expiresAt && new Date(cached.expiresAt) < new Date()) return false;
  return true;
}

async function updateLastUsed(keyId: string): Promise<void> {
  await prisma.apiKey.update({
    where: { id: keyId },
    data: {
      lastUsedAt: new Date(),
      totalRequests: { increment: 1 },
    },
  });
}

// ============================================================================
// KEY MANAGEMENT
// ============================================================================

/**
 * List all API keys for a user.
 * Keys are returned without the hash for security.
 */
export async function listApiKeys(developerId: string): Promise<ApiKey[]> {
  return prisma.apiKey.findMany({
    where: {
      developerId,
      revokedAt: null, // Don't show revoked keys
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get a single API key by ID.
 */
export async function getApiKey(keyId: string, developerId: string): Promise<ApiKey | null> {
  return prisma.apiKey.findFirst({
    where: {
      id: keyId,
      developerId,
    },
  });
}

/**
 * Update API key metadata.
 */
export async function updateApiKey(
  keyId: string,
  developerId: string,
  data: {
    name?: string;
    description?: string;
    permissions?: ApiKeyPermission[];
    rateLimit?: number;
    expiresAt?: Date | null;
  }
): Promise<ApiKey> {
  // Validate permissions if provided
  if (data.permissions) {
    const validPermissions = data.permissions.filter((p) =>
      AVAILABLE_PERMISSIONS.includes(p)
    );
    if (validPermissions.length === 0) {
      throw new Error('At least one valid permission is required');
    }
    data.permissions = validPermissions;
  }

  const apiKey = await prisma.apiKey.update({
    where: {
      id: keyId,
      developerId,
    },
    data: {
      name: data.name,
      description: data.description,
      permissions: data.permissions,
      rateLimit: data.rateLimit,
      expiresAt: data.expiresAt,
    },
  });

  // Invalidate cache
  await cache.del(`apikey:${apiKey.keyPrefix}`);

  logger.info({ developerId, keyId }, 'API key updated');

  return apiKey;
}

/**
 * Revoke an API key. This immediately invalidates the key.
 */
export async function revokeApiKey(
  keyId: string,
  developerId: string,
  reason?: string
): Promise<void> {
  const apiKey = await prisma.apiKey.update({
    where: {
      id: keyId,
      developerId,
    },
    data: {
      isActive: false,
      revokedAt: new Date(),
      revokedReason: reason || 'Revoked by developer',
    },
  });

  // Invalidate cache
  await cache.del(`apikey:${apiKey.keyPrefix}`);

  logger.info({ developerId, keyId, reason }, 'API key revoked');
}

/**
 * Rotate an API key. Creates a new key and invalidates the old one
 * after a grace period.
 */
export async function rotateApiKey(
  keyId: string,
  developerId: string
): Promise<ApiKeyRotateResult> {
  // Get the existing key
  const oldKey = await prisma.apiKey.findFirst({
    where: {
      id: keyId,
      developerId,
      isActive: true,
      revokedAt: null,
    },
  });

  if (!oldKey) {
    throw new Error('API key not found or already revoked');
  }

  // Calculate when old key expires
  const oldKeyValidUntil = new Date();
  oldKeyValidUntil.setHours(oldKeyValidUntil.getHours() + ROTATION_GRACE_PERIOD_HOURS);

  // Generate new key with same settings
  const { key: newKey, apiKey: newApiKey } = await generateApiKey(developerId, oldKey.name, {
    permissions: oldKey.permissions as ApiKeyPermission[],
    description: oldKey.description || undefined,
    environment: oldKey.environment as 'production' | 'test',
    rateLimit: oldKey.rateLimit,
  });

  // Schedule old key for expiration
  await prisma.apiKey.update({
    where: { id: keyId },
    data: {
      expiresAt: oldKeyValidUntil,
      description: `[ROTATED] ${oldKey.description || ''} - Expires at ${oldKeyValidUntil.toISOString()}`,
    },
  });

  // Invalidate old key cache
  await cache.del(`apikey:${oldKey.keyPrefix}`);

  logger.info(
    { developerId, oldKeyId: keyId, newKeyId: newApiKey.id, graceHours: ROTATION_GRACE_PERIOD_HOURS },
    'API key rotated'
  );

  return {
    newKey,
    oldKeyValidUntil,
    apiKey: newApiKey,
  };
}

// ============================================================================
// KEY VERIFICATION HELPERS
// ============================================================================

/**
 * Check if a key has a specific permission.
 */
export function hasPermission(
  apiKey: ValidatedApiKey,
  permission: ApiKeyPermission
): boolean {
  return apiKey.permissions.includes(permission);
}

/**
 * Create a SHA-256 hash of a key for quick lookup.
 * This is different from bcrypt hash used for secure storage.
 */
export function quickHash(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
