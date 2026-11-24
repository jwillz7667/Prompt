import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Credentials needed later to revoke; client_id must match the one the token was issued to. */
export interface AppleTokenGrant {
  clientId: string;
  refreshToken: string;
}

const VERSION = 'v1';
const IV_BYTES = 12;

export class AppleTokenCipherError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AppleTokenCipherError';
  }
}

/** AES-256-GCM; output `v1.<iv>.<tag>.<ciphertext>` (base64url parts). */
export function sealAppleTokenGrant(grant: AppleTokenGrant, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(grant), 'utf8'), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

export function openAppleTokenGrant(sealed: string, key: Buffer): AppleTokenGrant {
  const [version, iv, tag, ciphertext] = sealed.split('.');
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new AppleTokenCipherError('unrecognized sealed Apple token format');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    const parsed: unknown = JSON.parse(plaintext);
    const clientId =
      typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'clientId') : undefined;
    const refreshToken =
      typeof parsed === 'object' && parsed !== null
        ? Reflect.get(parsed, 'refreshToken')
        : undefined;
    if (typeof clientId !== 'string' || typeof refreshToken !== 'string') {
      throw new AppleTokenCipherError('sealed Apple token has an unexpected shape');
    }
    return { clientId, refreshToken };
  } catch (error) {
    if (error instanceof AppleTokenCipherError) throw error;
    throw new AppleTokenCipherError('sealed Apple token could not be decrypted', { cause: error });
  }
}
