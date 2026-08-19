/**
 * Handout passwords are encrypted, never hashed: the owner has to be able to look one
 * up weeks after publishing, so the plaintext must stay recoverable. AES-256-GCM is
 * authenticated, so a tampered ciphertext fails to decrypt instead of returning garbage.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
/** 12 bytes is the IV length GCM is defined for; a fresh one per encryption. */
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
/** The only envelope version there is. It exists so a key rotation can add a second one. */
const VERSION = 'v1';

/** Matches a well-formed envelope; the same expression guards the database column. */
export const ENVELOPE_PATTERN = /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Encrypts a password into one self-describing string:
 * `v1.<base64url(iv)>.<base64url(authTag)>.<base64url(ciphertext)>`.
 *
 * The slug goes in as additional authenticated data, which binds the result to exactly one
 * handout: copying the column value to another row makes it undecryptable rather than
 * silently working. base64url keeps `+`, `/` and `=` out of a value that may pass through
 * URLs and logs.
 */
export function encryptPassword(plaintext: string, key: Buffer, slug: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_BYTES });
  cipher.setAAD(Buffer.from(slug, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/**
 * Decrypts an envelope produced by {@link encryptPassword}. Throws on a wrong key, a wrong
 * slug, a tampered ciphertext or a malformed envelope — never returns a partial result.
 * The error names the slug and never the input, so no password can reach a log this way.
 */
export function decryptPassword(envelope: string, key: Buffer, slug: string): string {
  const parts = envelope.split('.');
  const [version, iv, authTag, ciphertext] = parts;
  if (
    parts.length !== 4 ||
    version !== VERSION ||
    iv === undefined ||
    authTag === undefined ||
    ciphertext === undefined
  ) {
    throw new Error(`malformed password envelope for handout "${slug}"`);
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'), {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAAD(Buffer.from(slug, 'utf8'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error(`password for handout "${slug}" could not be decrypted`);
  }
}
