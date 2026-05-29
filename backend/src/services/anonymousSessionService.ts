import crypto from 'crypto';
import { Request } from 'express';

const GUEST_SESSION_TTL_SECONDS = 60 * 60 * 24 * 365;
const GUEST_SESSION_SECRET = process.env['GUEST_SESSION_SECRET'] || process.env['JWT_ACCESS_SECRET'] || 'dev-guest-session-secret-change-in-production';

if (process.env['NODE_ENV'] === 'production' && !process.env['GUEST_SESSION_SECRET'] && !process.env['JWT_ACCESS_SECRET']) {
  throw new Error('GUEST_SESSION_SECRET or JWT_ACCESS_SECRET must be set in production');
}

interface GuestSessionPayload {
  sid: string;
  fp: string;
  exp: number;
}

export interface GuestIdentity {
  quotaKey: string;
  sessionToken: string;
  issuedNewSession: boolean;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(data: string): string {
  return crypto.createHmac('sha256', GUEST_SESSION_SECRET).update(data).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function requestFingerprint(req: Request): string {
  const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
  const userAgent = req.header('user-agent') || 'unknown-agent';
  const acceptLanguage = req.header('accept-language') || '';
  return crypto
    .createHash('sha256')
    .update(`${ip}|${userAgent}|${acceptLanguage}`)
    .digest('base64url');
}

function createGuestSession(fingerprint: string): string {
  const payload: GuestSessionPayload = {
    sid: crypto.randomUUID(),
    fp: fingerprint,
    exp: Math.floor(Date.now() / 1000) + GUEST_SESSION_TTL_SECONDS,
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function verifyGuestSession(token: string, fingerprint: string): GuestSessionPayload | null {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature || !safeEqual(sign(encodedPayload), signature)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as GuestSessionPayload;
    if (!payload.sid || payload.fp !== fingerprint || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function resolveGuestIdentity(req: Request): GuestIdentity {
  const fingerprint = requestFingerprint(req);
  const suppliedSession = req.header('X-Guest-Session')?.trim();
  const verified = suppliedSession ? verifyGuestSession(suppliedSession, fingerprint) : null;

  if (verified && suppliedSession) {
    return {
      quotaKey: `session:${verified.sid}`,
      sessionToken: suppliedSession,
      issuedNewSession: false,
    };
  }

  const sessionToken = createGuestSession(fingerprint);
  const newSession = verifyGuestSession(sessionToken, fingerprint);
  if (!newSession) {
    throw new Error('Failed to create guest session');
  }

  return {
    quotaKey: `session:${newSession.sid}`,
    sessionToken,
    issuedNewSession: true,
  };
}
