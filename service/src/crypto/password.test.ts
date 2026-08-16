import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptPassword, encryptPassword, ENVELOPE_PATTERN } from './password';

const KEY = randomBytes(32);
const OTHER_KEY = randomBytes(32);
const SLUG = 'a3kfp2xq';

describe('encryptPassword / decryptPassword', () => {
  it('round-trips a plaintext with non-ASCII characters', () => {
    const plaintext = 'Sömmerung-42';

    expect(decryptPassword(encryptPassword(plaintext, KEY, SLUG), KEY, SLUG)).toBe(plaintext);
  });

  it('produces a different envelope every time', () => {
    // A fixed IV would make identical passwords recognisable as identical across rows.
    const first = encryptPassword('same-password', KEY, SLUG);
    const second = encryptPassword('same-password', KEY, SLUG);

    expect(first).not.toBe(second);
  });

  it('refuses a different key', () => {
    const envelope = encryptPassword('secret', KEY, SLUG);

    expect(() => decryptPassword(envelope, OTHER_KEY, SLUG)).toThrow(/could not be decrypted/);
  });

  it('refuses a different slug, so a ciphertext cannot be moved between rows', () => {
    const envelope = encryptPassword('secret', KEY, SLUG);

    expect(() => decryptPassword(envelope, KEY, 'zzzzzzzz')).toThrow(/could not be decrypted/);
  });

  it('refuses a tampered ciphertext', () => {
    const envelope = encryptPassword('secret', KEY, SLUG);
    const [version, iv, authTag, ciphertext] = envelope.split('.') as [
      string,
      string,
      string,
      string,
    ];
    const flipped = ciphertext.startsWith('a')
      ? `b${ciphertext.slice(1)}`
      : `a${ciphertext.slice(1)}`;

    expect(() => decryptPassword([version, iv, authTag, flipped].join('.'), KEY, SLUG)).toThrow(
      /could not be decrypted/,
    );
  });

  it('refuses a malformed envelope', () => {
    expect(() => decryptPassword('not-an-envelope', KEY, SLUG)).toThrow(/malformed/);
    expect(() => decryptPassword('v2.a.b.c', KEY, SLUG)).toThrow(/malformed/);
  });

  it('writes a URL-safe envelope that does not contain the plaintext', () => {
    const envelope = encryptPassword('sommer2026', KEY, SLUG);

    expect(envelope).toMatch(ENVELOPE_PATTERN);
    expect(envelope).not.toContain('sommer2026');
  });

  it('never puts the input into an error message', () => {
    const envelope = encryptPassword('sommer2026', KEY, SLUG);

    expect(() => decryptPassword(envelope, OTHER_KEY, SLUG)).toThrow(/^(?!.*sommer2026).*$/s);
  });
});
