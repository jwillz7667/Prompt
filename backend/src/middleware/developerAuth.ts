/**
 * Developer Authentication Middleware
 * Verifies JWT tokens for developer accounts (separate from regular user auth)
 */

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type DecodedToken } from '../utils/jwt.js';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

export interface DeveloperAuthenticatedRequest extends Request {
  developer?: {
    id: string;
    email: string;
    sessionId: string;
  };
}

export const authenticateDeveloper = async (
  req: DeveloperAuthenticatedRequest,
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

    // Verify this is a developer token
    if (!decoded.isDeveloper) {
      res.status(401).json({ error: 'Invalid developer token' });
      return;
    }

    // Query database for developer
    const developer = await prisma.developer.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, isActive: true, tokenVersion: true },
    });

    if (!developer) {
      res.status(401).json({ error: 'Developer not found' });
      return;
    }

    if (!developer.isActive) {
      res.status(401).json({ error: 'Developer account is deactivated' });
      return;
    }

    if (developer.tokenVersion !== decoded.tokenVersion) {
      res.status(401).json({ error: 'Token has been revoked' });
      return;
    }

    req.developer = {
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
    logger.debug({ error }, 'Developer auth error');
    res.status(401).json({ error: 'Invalid token' });
  }
};

export const optionalDeveloperAuth = async (
  req: DeveloperAuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = verifyAccessToken(token);

      if (decoded.isDeveloper) {
        const developer = await prisma.developer.findUnique({
          where: { id: decoded.userId },
          select: { id: true, email: true, isActive: true, tokenVersion: true },
        });

        if (developer && developer.isActive && developer.tokenVersion === decoded.tokenVersion) {
          req.developer = {
            id: decoded.userId,
            email: decoded.email,
            sessionId: decoded.sessionId,
          };
        }
      }
    }

    next();
  } catch {
    // Token invalid or expired, continue without auth
    next();
  }
};
