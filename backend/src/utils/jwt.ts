import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const ACCESS_SECRET = process.env['JWT_ACCESS_SECRET'] || 'dev-access-secret-change-in-production';
const REFRESH_SECRET = process.env['JWT_REFRESH_SECRET'] || 'dev-refresh-secret-change-in-production';

const ACCESS_EXPIRY = '15m';
const REFRESH_EXPIRY = '7d';

export interface TokenPayload {
  userId: string;
  email: string;
  sessionId: string;
  tokenVersion: number;
}

export interface DecodedToken extends TokenPayload {
  iat: number;
  exp: number;
}

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY });
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
};

export const verifyAccessToken = (token: string): DecodedToken => {
  return jwt.verify(token, ACCESS_SECRET) as DecodedToken;
};

export const verifyRefreshToken = (token: string): DecodedToken => {
  return jwt.verify(token, REFRESH_SECRET) as DecodedToken;
};

export const generateTokenPair = (payload: Omit<TokenPayload, 'sessionId'>) => {
  const sessionId = uuidv4();
  const tokenPayload: TokenPayload = { ...payload, sessionId };

  return {
    accessToken: generateAccessToken(tokenPayload),
    refreshToken: generateRefreshToken(tokenPayload),
    sessionId,
    expiresIn: 900, // 15 minutes in seconds
  };
};

export const decodeToken = (token: string): DecodedToken | null => {
  try {
    return jwt.decode(token) as DecodedToken;
  } catch {
    return null;
  }
};
