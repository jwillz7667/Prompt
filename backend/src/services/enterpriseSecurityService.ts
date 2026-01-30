/**
 * Enterprise Security Service
 *
 * Provides enterprise-grade security features:
 * - IP whitelisting and geolocation
 * - Request signing (HMAC-SHA256)
 * - Comprehensive audit logging
 * - Anomaly detection
 * - Security risk assessment
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { cache } from '../utils/redis.js';
import bcrypt from 'bcrypt';

// ============================================================================
// TYPES
// ============================================================================

export interface SecurityContext {
  apiKeyId: string;
  userId: string;
  ipAddress: string;
  userAgent?: string;
  country?: string;
  city?: string;
  requestId: string;
}

export interface RiskAssessment {
  level: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  factors: string[];
}

export interface AuditLogEntry {
  action: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// IP VALIDATION
// ============================================================================

/**
 * Check if an IP address is in the allowed list.
 * Supports exact match, CIDR notation, and wildcard patterns.
 */
export function isIpAllowed(clientIp: string, allowedIps: string[]): boolean {
  // Empty list means all IPs allowed
  if (!allowedIps || allowedIps.length === 0) {
    return true;
  }

  // Normalize the client IP
  const normalizedClientIp = normalizeIp(clientIp);

  for (const allowed of allowedIps) {
    // Exact match
    if (normalizeIp(allowed) === normalizedClientIp) {
      return true;
    }

    // CIDR notation (e.g., 192.168.1.0/24)
    if (allowed.includes('/')) {
      if (isIpInCidr(normalizedClientIp, allowed)) {
        return true;
      }
    }

    // Wildcard pattern (e.g., 192.168.*.*)
    if (allowed.includes('*')) {
      if (matchWildcardIp(normalizedClientIp, allowed)) {
        return true;
      }
    }
  }

  return false;
}

function normalizeIp(ip: string): string {
  // Remove IPv6 prefix for IPv4-mapped addresses
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }
  return ip;
}

function isIpInCidr(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split('/');
  const mask = parseInt(bits, 10);

  if (isNaN(mask) || mask < 0 || mask > 32) {
    return false;
  }

  const ipParts = ip.split('.').map(Number);
  const rangeParts = range.split('.').map(Number);

  if (ipParts.length !== 4 || rangeParts.length !== 4) {
    return false;
  }

  const ipNum =
    (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3];
  const rangeNum =
    (rangeParts[0] << 24) +
    (rangeParts[1] << 16) +
    (rangeParts[2] << 8) +
    rangeParts[3];
  const maskNum = ~((1 << (32 - mask)) - 1);

  return (ipNum & maskNum) === (rangeNum & maskNum);
}

function matchWildcardIp(ip: string, pattern: string): boolean {
  const ipParts = ip.split('.');
  const patternParts = pattern.split('.');

  if (ipParts.length !== 4 || patternParts.length !== 4) {
    return false;
  }

  for (let i = 0; i < 4; i++) {
    if (patternParts[i] !== '*' && patternParts[i] !== ipParts[i]) {
      return false;
    }
  }

  return true;
}

// ============================================================================
// REQUEST SIGNING (HMAC-SHA256)
// ============================================================================

const SIGNATURE_HEADER = 'X-Signature';
const TIMESTAMP_HEADER = 'X-Timestamp';
const SIGNATURE_TOLERANCE_MS = 300000; // 5 minutes

/**
 * Generate a signing secret for an API key.
 */
export async function generateSigningSecret(): Promise<{
  secret: string;
  secretHash: string;
}> {
  const secret = `sk_${randomBytes(32).toString('hex')}`;
  const secretHash = await bcrypt.hash(secret, 12);
  return { secret, secretHash };
}

/**
 * Verify HMAC signature for a request.
 */
export function verifyRequestSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
  secret: string
): { valid: boolean; error?: string } {
  // Check timestamp freshness
  const requestTime = parseInt(timestamp, 10);
  const now = Date.now();

  if (isNaN(requestTime)) {
    return { valid: false, error: 'Invalid timestamp format' };
  }

  if (Math.abs(now - requestTime) > SIGNATURE_TOLERANCE_MS) {
    return { valid: false, error: 'Request timestamp too old or in future' };
  }

  // Compute expected signature
  const payload = `${timestamp}.${rawBody}`;
  const expectedSignature = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Timing-safe comparison
  try {
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (sigBuffer.length !== expectedBuffer.length) {
      return { valid: false, error: 'Invalid signature' };
    }

    if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { valid: false, error: 'Invalid signature' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid signature format' };
  }
}

/**
 * Create a signature for a request (for client-side use / documentation).
 */
export function createRequestSignature(
  body: string,
  timestamp: number,
  secret: string
): string {
  const payload = `${timestamp}.${body}`;
  return createHmac('sha256', secret).update(payload).digest('hex');
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

/**
 * Log an API action to the audit trail.
 */
export async function logAuditEvent(
  context: SecurityContext,
  entry: AuditLogEntry,
  riskAssessment?: RiskAssessment
): Promise<void> {
  try {
    await prisma.apiAuditLog.create({
      data: {
        apiKeyId: context.apiKeyId,
        userId: context.userId,
        action: entry.action,
        endpoint: entry.endpoint,
        method: entry.method,
        statusCode: entry.statusCode,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        country: context.country,
        city: context.city,
        riskLevel: riskAssessment?.level || 'low',
        riskFactors: riskAssessment?.factors || [],
        requestId: context.requestId,
        latencyMs: entry.latencyMs,
        metadata: entry.metadata as object,
      },
    });
  } catch (error) {
    logger.error({ error, context, entry }, 'Failed to log audit event');
  }
}

/**
 * Get audit logs for an API key.
 */
export async function getAuditLogs(
  apiKeyId: string,
  options: {
    limit?: number;
    offset?: number;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    riskLevel?: string;
  } = {}
): Promise<{ logs: Array<unknown>; total: number }> {
  const { limit = 50, offset = 0, action, startDate, endDate, riskLevel } = options;

  const where: Record<string, unknown> = { apiKeyId };

  if (action) {
    where['action'] = action;
  }

  if (riskLevel) {
    where['riskLevel'] = riskLevel;
  }

  if (startDate || endDate) {
    where['createdAt'] = {};
    if (startDate) {
      (where['createdAt'] as Record<string, Date>)['gte'] = startDate;
    }
    if (endDate) {
      (where['createdAt'] as Record<string, Date>)['lte'] = endDate;
    }
  }

  const [logs, total] = await Promise.all([
    prisma.apiAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.apiAuditLog.count({ where }),
  ]);

  return { logs, total };
}

// ============================================================================
// RISK ASSESSMENT
// ============================================================================

/**
 * Assess the risk level of a request.
 */
export async function assessRisk(
  context: SecurityContext,
  additionalFactors: string[] = []
): Promise<RiskAssessment> {
  const factors: string[] = [...additionalFactors];
  let score = 0;

  // Check for known malicious IPs (would integrate with threat intelligence in production)
  const isSuspiciousIp = await checkSuspiciousIp(context.ipAddress);
  if (isSuspiciousIp) {
    factors.push('suspicious_ip');
    score += 30;
  }

  // Check for unusual access patterns
  const accessPattern = await analyzeAccessPattern(context.apiKeyId, context.ipAddress);
  if (accessPattern.isUnusual) {
    factors.push('unusual_access_pattern');
    score += accessPattern.severity;
  }

  // Check for rapid key rotation
  const recentRotations = await checkRecentKeyRotations(context.userId);
  if (recentRotations > 3) {
    factors.push('frequent_key_rotation');
    score += 15;
  }

  // Check for failed auth attempts
  const failedAttempts = await getFailedAttempts(context.apiKeyId);
  if (failedAttempts > 5) {
    factors.push('multiple_failed_attempts');
    score += 20;
  }

  // Determine risk level
  let level: RiskAssessment['level'] = 'low';
  if (score >= 70) {
    level = 'critical';
  } else if (score >= 50) {
    level = 'high';
  } else if (score >= 25) {
    level = 'medium';
  }

  return { level, score, factors };
}

async function checkSuspiciousIp(ip: string): Promise<boolean> {
  // Check cache for known bad IPs
  const cached = await cache.get<boolean>(`suspicious_ip:${ip}`);
  if (cached !== null) {
    return cached;
  }

  // Check database for recent security events from this IP
  const recentEvents = await prisma.apiAuditLog.count({
    where: {
      ipAddress: ip,
      riskLevel: { in: ['high', 'critical'] },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });

  const isSuspicious = recentEvents > 10;
  await cache.set(`suspicious_ip:${ip}`, isSuspicious, 3600); // Cache for 1 hour

  return isSuspicious;
}

async function analyzeAccessPattern(
  apiKeyId: string,
  currentIp: string
): Promise<{ isUnusual: boolean; severity: number }> {
  // Get recent access IPs
  const recentAccess = await prisma.apiAuditLog.findMany({
    where: {
      apiKeyId,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    select: { ipAddress: true },
    distinct: ['ipAddress'],
    take: 100,
  });

  const uniqueIps = new Set(recentAccess.map((a) => a.ipAddress));

  // New IP accessing in the last 24h
  if (!uniqueIps.has(currentIp) && uniqueIps.size > 0) {
    return { isUnusual: true, severity: 10 };
  }

  // Too many different IPs
  if (uniqueIps.size > 20) {
    return { isUnusual: true, severity: 20 };
  }

  return { isUnusual: false, severity: 0 };
}

async function checkRecentKeyRotations(userId: string): Promise<number> {
  const count = await prisma.apiAuditLog.count({
    where: {
      userId,
      action: 'ROTATE_KEY',
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });
  return count;
}

async function getFailedAttempts(apiKeyId: string): Promise<number> {
  const key = await prisma.apiKey.findUnique({
    where: { id: apiKeyId },
    select: { failedAttempts: true },
  });
  return key?.failedAttempts || 0;
}

// ============================================================================
// KEY LOCKOUT
// ============================================================================

const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Record a failed authentication attempt.
 */
export async function recordFailedAttempt(keyId: string): Promise<boolean> {
  const key = await prisma.apiKey.update({
    where: { id: keyId },
    data: {
      failedAttempts: { increment: 1 },
    },
    select: { failedAttempts: true },
  });

  if (key.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    await prisma.apiKey.update({
      where: { id: keyId },
      data: {
        lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS),
      },
    });
    return true; // Key is now locked
  }

  return false;
}

/**
 * Clear failed attempts after successful auth.
 */
export async function clearFailedAttempts(keyId: string): Promise<void> {
  await prisma.apiKey.update({
    where: { id: keyId },
    data: {
      failedAttempts: 0,
      lockedUntil: null,
    },
  });
}

/**
 * Check if a key is locked out.
 */
export async function isKeyLocked(keyId: string): Promise<boolean> {
  const key = await prisma.apiKey.findUnique({
    where: { id: keyId },
    select: { lockedUntil: true },
  });

  if (!key?.lockedUntil) {
    return false;
  }

  if (key.lockedUntil < new Date()) {
    // Lockout expired, clear it
    await clearFailedAttempts(keyId);
    return false;
  }

  return true;
}

// ============================================================================
// IP MANAGEMENT
// ============================================================================

/**
 * Add IP addresses to the whitelist.
 */
export async function addAllowedIps(
  keyId: string,
  userId: string,
  ips: string[]
): Promise<string[]> {
  const key = await prisma.apiKey.findFirst({
    where: { id: keyId, userId },
    select: { allowedIps: true },
  });

  if (!key) {
    throw new Error('API key not found');
  }

  // Validate IP formats
  const validIps = ips.filter((ip) => isValidIpFormat(ip));
  const newIps = [...new Set([...key.allowedIps, ...validIps])];

  await prisma.apiKey.update({
    where: { id: keyId },
    data: { allowedIps: newIps },
  });

  // Invalidate cache
  await cache.del(`apikey:${keyId}`);

  logger.info({ keyId, addedIps: validIps }, 'IP whitelist updated');

  return newIps;
}

/**
 * Remove IP addresses from the whitelist.
 */
export async function removeAllowedIps(
  keyId: string,
  userId: string,
  ips: string[]
): Promise<string[]> {
  const key = await prisma.apiKey.findFirst({
    where: { id: keyId, userId },
    select: { allowedIps: true },
  });

  if (!key) {
    throw new Error('API key not found');
  }

  const newIps = key.allowedIps.filter((ip) => !ips.includes(ip));

  await prisma.apiKey.update({
    where: { id: keyId },
    data: { allowedIps: newIps },
  });

  // Invalidate cache
  await cache.del(`apikey:${keyId}`);

  return newIps;
}

function isValidIpFormat(ip: string): boolean {
  // IPv4
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv4CidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
  const ipv4WildcardRegex = /^(\d{1,3}|\*)(\.(\d{1,3}|\*)){3}$/;

  // IPv6 (simplified)
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

  return (
    ipv4Regex.test(ip) ||
    ipv4CidrRegex.test(ip) ||
    ipv4WildcardRegex.test(ip) ||
    ipv6Regex.test(ip)
  );
}

// ============================================================================
// SECURITY HEADERS
// ============================================================================

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

// ============================================================================
// EXPORTS
// ============================================================================

export {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MS,
};
