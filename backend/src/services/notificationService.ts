import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

// APNs Configuration
const APNS_KEY_ID = process.env['APPLE_KEY_ID'] || '';
const APNS_TEAM_ID = process.env['APPLE_TEAM_ID'] || '';
const APNS_PRIVATE_KEY = process.env['APPLE_PRIVATE_KEY'] || '';
const APNS_BUNDLE_ID = process.env['APPLE_BUNDLE_ID'] || 'com.res.promptomizer';

// APNs endpoints
const APNS_PRODUCTION_URL = 'https://api.push.apple.com';
const APNS_SANDBOX_URL = 'https://api.sandbox.push.apple.com';

interface APNsPayload {
  aps: {
    alert: {
      title: string;
      subtitle?: string;
      body: string;
    };
    sound?: string;
    badge?: number;
    'mutable-content'?: number;
    'content-available'?: number;
    'thread-id'?: string;
    category?: string;
  };
  // Custom data
  type?: string;
  ticketId?: string;
  promptId?: string;
  [key: string]: unknown;
}

// Cache for APNs JWT token (valid for 1 hour)
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Generate APNs JWT token for authentication
 */
function getAPNsToken(): string {
  const now = Math.floor(Date.now() / 1000);

  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && cachedToken.expiresAt > now + 300) {
    return cachedToken.token;
  }

  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) {
    throw new Error('APNs credentials not configured');
  }

  // Format the private key properly
  let privateKey = APNS_PRIVATE_KEY;
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
  }
  // Handle escaped newlines from environment variables
  privateKey = privateKey.replace(/\\n/g, '\n');

  const token = jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    header: {
      alg: 'ES256',
      kid: APNS_KEY_ID,
    },
    issuer: APNS_TEAM_ID,
    expiresIn: '1h',
  });

  // Cache token for 50 minutes (APNs tokens valid for 1 hour)
  cachedToken = {
    token,
    expiresAt: now + 3000,
  };

  return token;
}

/**
 * Send push notification to a specific device
 */
async function sendToDevice(
  deviceToken: string,
  payload: APNsPayload,
  environment: string = 'production'
): Promise<boolean> {
  try {
    const token = getAPNsToken();
    const url =
      environment === 'sandbox' ? APNS_SANDBOX_URL : APNS_PRODUCTION_URL;

    const response = await fetch(`${url}/3/device/${deviceToken}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${token}`,
        'apns-topic': APNS_BUNDLE_ID,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': '0',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      logger.info({ deviceToken: deviceToken.slice(0, 8) + '...' }, 'Push notification sent successfully');
      return true;
    }

    const errorBody = await response.text();
    logger.error(
      { status: response.status, error: errorBody, deviceToken: deviceToken.slice(0, 8) + '...' },
      'Failed to send push notification'
    );

    // Handle invalid tokens
    if (response.status === 410 || response.status === 400) {
      // Token is invalid, mark as inactive
      await prisma.deviceToken.updateMany({
        where: { deviceToken },
        data: { isActive: false },
      });
    }

    return false;
  } catch (error) {
    logger.error({ error, deviceToken: deviceToken.slice(0, 8) + '...' }, 'Error sending push notification');
    return false;
  }
}

/**
 * Send push notification to all devices for a user
 */
export async function sendToUser(
  userId: string,
  payload: APNsPayload
): Promise<number> {
  const devices = await prisma.deviceToken.findMany({
    where: { userId, isActive: true },
  });

  if (devices.length === 0) {
    logger.debug({ userId }, 'No active devices found for user');
    return 0;
  }

  let successCount = 0;
  for (const device of devices) {
    const success = await sendToDevice(
      device.deviceToken,
      payload,
      device.environment
    );
    if (success) {
      successCount++;
      // Update last used timestamp
      await prisma.deviceToken.update({
        where: { id: device.id },
        data: { lastUsedAt: new Date() },
      });
    }
  }

  return successCount;
}

/**
 * Send support message notification
 */
export async function sendSupportMessageNotification(
  userId: string,
  ticketId: string,
  agentName: string,
  messagePreview: string
): Promise<void> {
  const payload: APNsPayload = {
    aps: {
      alert: {
        title: 'New Support Message',
        subtitle: agentName || 'Support Agent',
        body: messagePreview.length > 100
          ? messagePreview.substring(0, 100) + '...'
          : messagePreview,
      },
      sound: 'default',
      'mutable-content': 1,
      'thread-id': `support-${ticketId}`,
      category: 'SUPPORT_MESSAGE',
    },
    type: 'support_message',
    ticketId,
  };

  const sent = await sendToUser(userId, payload);
  logger.info({ userId, ticketId, devicesSent: sent }, 'Support message notification sent');
}

/**
 * Send enhancement completed notification
 */
export async function sendEnhancementCompletedNotification(
  userId: string,
  promptId: string,
  originalPromptPreview: string
): Promise<void> {
  const payload: APNsPayload = {
    aps: {
      alert: {
        title: 'Enhancement Complete',
        body: `Your prompt "${originalPromptPreview.length > 50
          ? originalPromptPreview.substring(0, 50) + '...'
          : originalPromptPreview}" has been enhanced`,
      },
      sound: 'default',
      'mutable-content': 1,
      category: 'ENHANCEMENT_COMPLETE',
    },
    type: 'enhancement_complete',
    promptId,
  };

  const sent = await sendToUser(userId, payload);
  logger.info({ userId, promptId, devicesSent: sent }, 'Enhancement completed notification sent');
}

/**
 * Register a device token for push notifications
 */
export async function registerDeviceToken(
  userId: string,
  deviceToken: string,
  deviceId?: string,
  environment: string = 'production'
): Promise<void> {
  await prisma.deviceToken.upsert({
    where: { deviceToken },
    create: {
      userId,
      deviceToken,
      deviceId,
      environment,
      bundleId: APNS_BUNDLE_ID,
      isActive: true,
    },
    update: {
      userId, // Update in case token transferred to different user
      deviceId,
      environment,
      isActive: true,
      lastUsedAt: new Date(),
    },
  });

  logger.info(
    { userId, deviceToken: deviceToken.slice(0, 8) + '...' },
    'Device token registered'
  );
}

/**
 * Unregister a device token
 */
export async function unregisterDeviceToken(deviceToken: string): Promise<void> {
  await prisma.deviceToken.updateMany({
    where: { deviceToken },
    data: { isActive: false },
  });

  logger.info(
    { deviceToken: deviceToken.slice(0, 8) + '...' },
    'Device token unregistered'
  );
}

/**
 * Clean up old inactive device tokens (run periodically)
 */
export async function cleanupInactiveTokens(olderThanDays: number = 90): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const result = await prisma.deviceToken.deleteMany({
    where: {
      OR: [
        { isActive: false, updatedAt: { lt: cutoffDate } },
        { lastUsedAt: { lt: cutoffDate } },
      ],
    },
  });

  logger.info({ deleted: result.count }, 'Cleaned up inactive device tokens');
  return result.count;
}
