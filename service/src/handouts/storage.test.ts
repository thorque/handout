import { existsSync, mkdtempSync, rmSync, chmodSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { ensureHandoutsDir, handoutsDir, HANDOUTS_SUBDIR } from './storage';

function configFor(dataDir: string) {
  return loadConfig({
    LOG_LEVEL: 'silent',
    POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
    HANDOUT_PASSWORD_KEY: Buffer.alloc(32, 7).toString('base64'),
    HANDOUT_OIDC_ISSUER_URL: 'http://handout-caddy.localhost/realms/handout',
    HANDOUT_OIDC_CLIENT_ID: 'handout',
    HANDOUT_OIDC_CLIENT_SECRET: 'test-secret',
    HANDOUT_ALLOWED_EMAILS: 'berger-partner.de',
    HANDOUT_DATA_DIR: dataDir,
  });
}

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe('ensureHandoutsDir', () => {
  it('creates <dataDir>/handouts even when dataDir itself does not exist yet', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'handout-storage-'));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const dataDir = path.join(root, 'not-there-yet');
    const config = configFor(dataDir);

    const result = ensureHandoutsDir(config);

    expect(result).toBe(handoutsDir(config));
    expect(result.endsWith(HANDOUTS_SUBDIR)).toBe(true);
    expect(existsSync(result)).toBe(true);
  });

  it('is idempotent: called twice, succeeds twice and returns the same path', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'handout-storage-'));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const config = configFor(root);

    const first = ensureHandoutsDir(config);
    const second = ensureHandoutsDir(config);

    expect(first).toBe(second);
    expect(existsSync(first)).toBe(true);
  });

  it('propagates a permission failure rather than swallowing it', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'handout-storage-'));
    const unwritable = path.join(root, 'unwritable');
    mkdirSync(unwritable);
    chmodSync(unwritable, 0o500);
    cleanups.push(() => {
      chmodSync(unwritable, 0o700);
      rmSync(root, { recursive: true, force: true });
    });
    const config = configFor(path.join(unwritable, 'data'));

    expect(() => ensureHandoutsDir(config)).toThrowError(
      expect.objectContaining({ code: 'EACCES' }),
    );
  });
});
