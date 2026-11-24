import appleSignin from 'apple-signin-auth';
import { z } from 'zod';

import type { AppleSiwaConfig } from './config.js';

export const APPLE_TOKEN_ENDPOINT = 'https://appleid.apple.com/auth/token';
export const APPLE_REVOKE_ENDPOINT = 'https://appleid.apple.com/auth/revoke';
const REQUEST_TIMEOUT_MS = 8_000;

export class AppleTokenError extends Error {
  constructor(
    readonly operation: 'exchange' | 'revoke',
    readonly status: number | undefined,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AppleTokenError';
  }

  /** invalid_grant on exchange (code reused/expired) will never succeed on retry. */
  get isRetryable(): boolean {
    return this.status === undefined || this.status === 429 || this.status >= 500;
  }
}

export interface AppleTokenClient {
  /** Trades a one-time authorization code for the user's refresh token. */
  exchangeAuthorizationCode(code: string, clientId: string): Promise<string>;
  revokeRefreshToken(refreshToken: string, clientId: string): Promise<void>;
}

const tokenResponseSchema = z.object({ refresh_token: z.string().min(1) });

export function createAppleTokenClient(
  config: AppleSiwaConfig,
  doFetch: typeof fetch = (input, init) => globalThis.fetch(input, init),
): AppleTokenClient {
  // The client secret is a short-lived ES256 JWT signed with the SIWA key.
  const clientSecret = (clientId: string): string =>
    appleSignin.getClientSecret({
      clientID: clientId,
      teamID: config.teamId,
      keyIdentifier: config.keyId,
      privateKey: config.privateKey,
      expAfter: 300,
    });

  const post = async (
    operation: 'exchange' | 'revoke',
    endpoint: string,
    form: Record<string, string>,
  ): Promise<Response> => {
    let response: Response;
    try {
      response = await doFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(form).toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AppleTokenError(operation, undefined, `Apple ${operation} request failed`, {
        cause: error,
      });
    }
    if (!response.ok) {
      // Never log the body: it can echo the token.
      await response.body?.cancel().catch(() => undefined);
      throw new AppleTokenError(
        operation,
        response.status,
        `Apple ${operation} returned HTTP ${response.status}`,
      );
    }
    return response;
  };

  return {
    async exchangeAuthorizationCode(code, clientId) {
      const response = await post('exchange', APPLE_TOKEN_ENDPOINT, {
        client_id: clientId,
        client_secret: clientSecret(clientId),
        code,
        grant_type: 'authorization_code',
      });
      const parsed = tokenResponseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) {
        throw new AppleTokenError(
          'exchange',
          response.status,
          'Apple token response had no refresh_token',
        );
      }
      return parsed.data.refresh_token;
    },

    async revokeRefreshToken(refreshToken, clientId) {
      const response = await post('revoke', APPLE_REVOKE_ENDPOINT, {
        client_id: clientId,
        client_secret: clientSecret(clientId),
        token: refreshToken,
        token_type_hint: 'refresh_token',
      });
      await response.body?.cancel().catch(() => undefined);
    },
  };
}
