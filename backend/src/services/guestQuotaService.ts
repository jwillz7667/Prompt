import { cache } from '../utils/redis.js';

export interface GuestQuotaSnapshot {
  standardUsed: number;
  standardLimit: number;
  standardRemaining: number;
  maxUsed: number;
  maxLimit: number;
  maxRemaining: number;
}

type GuestPromptMode = 'standard' | 'max';

interface GuestQuotaStoreRecord {
  standardUsed: number;
  maxUsed: number;
}

const GUEST_STANDARD_LIMIT = 5;
const GUEST_MAX_LIMIT = 1;
const GUEST_QUOTA_TTL_SECONDS = 60 * 60 * 24 * 365;
const guestQuotaFallbackStore = new Map<string, GuestQuotaStoreRecord>();

function normalizeDeviceId(deviceId: string): string {
  return deviceId.trim().toLowerCase();
}

function quotaKey(deviceId: string): string {
  return `guest-quota:${normalizeDeviceId(deviceId)}`;
}

function buildSnapshot(record: GuestQuotaStoreRecord): GuestQuotaSnapshot {
  return {
    standardUsed: record.standardUsed,
    standardLimit: GUEST_STANDARD_LIMIT,
    standardRemaining: Math.max(0, GUEST_STANDARD_LIMIT - record.standardUsed),
    maxUsed: record.maxUsed,
    maxLimit: GUEST_MAX_LIMIT,
    maxRemaining: Math.max(0, GUEST_MAX_LIMIT - record.maxUsed),
  };
}

async function loadRecord(deviceId: string): Promise<GuestQuotaStoreRecord> {
  const key = quotaKey(deviceId);
  const cached = await cache.get<GuestQuotaStoreRecord>(key);

  if (cached) {
    return {
      standardUsed: Math.max(0, cached.standardUsed ?? 0),
      maxUsed: Math.max(0, cached.maxUsed ?? 0),
    };
  }

  const fallback = guestQuotaFallbackStore.get(key);
  if (fallback) {
    return fallback;
  }

  return {
    standardUsed: 0,
    maxUsed: 0,
  };
}

async function saveRecord(deviceId: string, record: GuestQuotaStoreRecord): Promise<void> {
  const key = quotaKey(deviceId);
  guestQuotaFallbackStore.set(key, record);
  await cache.set(key, record, GUEST_QUOTA_TTL_SECONDS);
}

export async function getGuestQuota(deviceId: string): Promise<GuestQuotaSnapshot> {
  return buildSnapshot(await loadRecord(deviceId));
}

export async function ensureGuestQuotaAvailable(deviceId: string, mode: GuestPromptMode): Promise<GuestQuotaSnapshot> {
  const quota = await getGuestQuota(deviceId);

  if (mode === 'standard' && quota.standardRemaining <= 0) {
    throw new Error('GUEST_STANDARD_LIMIT_REACHED');
  }

  if (mode === 'max' && quota.maxRemaining <= 0) {
    throw new Error('GUEST_MAX_LIMIT_REACHED');
  }

  return quota;
}

export async function recordGuestPromptUsage(deviceId: string, mode: GuestPromptMode): Promise<GuestQuotaSnapshot> {
  const record = await loadRecord(deviceId);

  if (mode === 'standard') {
    record.standardUsed += 1;
  } else {
    record.maxUsed += 1;
  }

  await saveRecord(deviceId, record);
  return buildSnapshot(record);
}
