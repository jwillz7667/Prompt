import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { verifyAccessToken, type DecodedToken } from '../utils/jwt.js';
import { prisma } from '../utils/prisma.js';
import { cache } from '../utils/redis.js';
import { logger } from '../utils/logger.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    sessionId: string;
  };
}

// Stable machine-readable reasons for a 401, additive to the existing `error`
// message so current clients keep working. iOS keys its session-expired UX off
// these: TOKEN_EXPIRED → silent refresh; TOKEN_INVALID / SESSION_REVOKED →
// sign out; TOKEN_MISSING → not authenticated at all.
export type AuthErrorCode =
  | 'TOKEN_MISSING'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'SESSION_REVOKED';

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Missing or invalid authorization header',
        code: 'TOKEN_MISSING' satisfies AuthErrorCode,
      });
      return;
    }

    const token = authHeader.substring(7);
    const decoded: DecodedToken = verifyAccessToken(token);

    // Check cache first for user data
    let user = await cache.getUser(decoded.userId);

    if (!user) {
      // Cache miss - query database
      logger.debug({ userId: decoded.userId }, 'User cache miss - querying database');
      const dbUser = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, isActive: true, tokenVersion: true, subscriptionTier: true },
      });

      if (!dbUser) {
        // A valid token for a user that no longer exists: the session is dead
        // and a refresh cannot revive it, so clients must treat it as revoked.
        res.status(401).json({
          error: 'User not found or inactive',
          code: 'SESSION_REVOKED' satisfies AuthErrorCode,
        });
        return;
      }

      // Populate cache
      user = {
        id: dbUser.id,
        email: dbUser.email,
        isActive: dbUser.isActive,
        tokenVersion: dbUser.tokenVersion,
        subscriptionTier: dbUser.subscriptionTier,
      };
      await cache.setUser(decoded.userId, user);
    }

    if (!user.isActive) {
      res.status(401).json({
        error: 'User not found or inactive',
        code: 'SESSION_REVOKED' satisfies AuthErrorCode,
      });
      return;
    }

    if (user.tokenVersion !== decoded.tokenVersion) {
      res.status(401).json({
        error: 'Token has been revoked',
        code: 'SESSION_REVOKED' satisfies AuthErrorCode,
      });
      return;
    }

    req.user = {
      id: decoded.userId,
      email: decoded.email,
      sessionId: decoded.sessionId,
    };

    next();
  } catch (error) {
    // TokenExpiredError extends JsonWebTokenError, so it must be checked first.
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED' satisfies AuthErrorCode,
      });
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      // Covers malformed tokens, bad signatures, and NotBeforeError.
      res.status(401).json({
        error: 'Invalid token',
        code: 'TOKEN_INVALID' satisfies AuthErrorCode,
      });
      return;
    }
    // Not a token problem (e.g. DB unreachable mid-lookup). Keep the historical
    // body — deliberately WITHOUT a code — so clients do not force a sign-out
    // over an infrastructure blip, and log it since it was previously silent.
    logger.error({ err: error }, 'Authentication failed for a non-token reason');
    res.status(401).json({ error: 'Invalid token' });
  }
};

export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = verifyAccessToken(token);

      // Check cache first for user data
      let user = await cache.getUser(decoded.userId);

      if (!user) {
        // Cache miss - query database
        const dbUser = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { id: true, email: true, isActive: true, tokenVersion: true, subscriptionTier: true },
        });

        if (dbUser) {
          // Populate cache
          user = {
            id: dbUser.id,
            email: dbUser.email,
            isActive: dbUser.isActive,
            tokenVersion: dbUser.tokenVersion,
            subscriptionTier: dbUser.subscriptionTier,
          };
          await cache.setUser(decoded.userId, user);
        }
      }

      if (user && user.isActive && user.tokenVersion === decoded.tokenVersion) {
        req.user = {
          id: decoded.userId,
          email: decoded.email,
          sessionId: decoded.sessionId,
        };
      }
    }

    next();
  } catch {
    // Token invalid or expired, continue without auth
    next();
  }
};
