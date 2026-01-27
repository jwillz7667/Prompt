import { Request, Response, NextFunction } from 'express';
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

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
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
        res.status(401).json({ error: 'User not found or inactive' });
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
      res.status(401).json({ error: 'User not found or inactive' });
      return;
    }

    if (user.tokenVersion !== decoded.tokenVersion) {
      res.status(401).json({ error: 'Token has been revoked' });
      return;
    }

    req.user = {
      id: decoded.userId,
      email: decoded.email,
      sessionId: decoded.sessionId,
    };

    next();
  } catch (error) {
    if (error instanceof Error && error.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
      return;
    }
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
