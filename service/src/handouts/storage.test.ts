import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  chmodSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { HandoutDirectoryExistsError } from './errors';
import {
  createContentDir,
  createStagingDir,
  discardStagingDir,
  ensureHandoutsDir,
  ensureStagingDir,
  handoutsDir,
  HANDOUTS_SUBDIR,
  moveIntoPlace,
  stagingDir,
  STAGING_SUBDIR,
} from './storage';

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

describe('staging and the atomic swap', () => {
  it('lands the staging directory under dataDir, not under handouts/', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'handout-storage-'));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const config = configFor(root);
    ensureStagingDir(config);

    expect(stagingDir(config)).toBe(path.join(root, STAGING_SUBDIR));
    expect(existsSync(stagingDir(config))).toBe(true);
    expect(stagingDir(config)).not.toBe(handoutsDir(config));
    expect(stagingDir(config).startsWith(handoutsDir(config))).toBe(false);
  });

  it('gives two different paths for two createStagingDir calls', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'handout-storage-'));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const config = configFor(root);
    ensureStagingDir(config);

    const first = createStagingDir(stagingDir(config));
    const second = createStagingDir(stagingDir(config));

    expect(first).not.toBe(second);
    expect(existsSync(first)).toBe(true);
    expect(existsSync(second)).toBe(true);
  });

  it('moveIntoPlace makes the file readable at <dataDir>/handouts/<slug>/index.html and removes staging', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'handout-storage-'));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const config = configFor(root);
    ensureHandoutsDir(config);
    ensureStagingDir(config);

    const staged = createStagingDir(stagingDir(config));
    writeFileSync(path.join(staged, 'index.html'), '<h1>Hallo</h1>');

    moveIntoPlace(handoutsDir(config), 'kaffee23', staged);

    const written = path.join(handoutsDir(config), 'kaffee23', 'index.html');
    expect(readFileSync(written, 'utf8')).toBe('<h1>Hallo</h1>');
    expect(existsSync(staged)).toBe(false);
  });

  it('refuses to overwrite an existing target and leaves it byte-identical', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'handout-storage-'));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const config = configFor(root);
    ensureHandoutsDir(config);
    ensureStagingDir(config);

    const first = createStagingDir(stagingDir(config));
    writeFileSync(path.join(first, 'index.html'), 'first');
    moveIntoPlace(handoutsDir(config), 'kaffee23', first);

    const second = createStagingDir(stagingDir(config));
    writeFileSync(path.join(second, 'index.html'), 'second');

    expect(() => moveIntoPlace(handoutsDir(config), 'kaffee23', second)).toThrow(
      HandoutDirectoryExistsError,
    );
    const written = path.join(handoutsDir(config), 'kaffee23', 'index.html');
    expect(readFileSync(written, 'utf8')).toBe('first');
  });

  it('discardStagingDir on a path that does not exist is a no-op', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'handout-storage-'));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));

    expect(() => discardStagingDir(path.join(root, 'never-existed'))).not.toThrow();
  });
});

describe('createContentDir', () => {
  it('creates <stagedDir>/content and returns its path', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'handout-storage-'));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const config = configFor(root);
    ensureStagingDir(config);
    const staged = createStagingDir(stagingDir(config));

    const contentDir = createContentDir(staged);

    expect(contentDir).toBe(path.join(staged, 'content'));
    expect(existsSync(contentDir)).toBe(true);
  });

  it('moving the content directory into place leaves the staging directory behind', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'handout-storage-'));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const config = configFor(root);
    ensureHandoutsDir(config);
    ensureStagingDir(config);
    const staged = createStagingDir(stagingDir(config));
    const contentDir = createContentDir(staged);
    mkdirSync(path.join(contentDir, 'assets'));
    writeFileSync(path.join(contentDir, 'index.html'), '<h1>Hallo</h1>');
    writeFileSync(path.join(contentDir, 'assets', 'app.js'), 'x');

    moveIntoPlace(handoutsDir(config), 'kaffee23', contentDir);

    const written = path.join(handoutsDir(config), 'kaffee23');
    expect(readFileSync(path.join(written, 'index.html'), 'utf8')).toBe('<h1>Hallo</h1>');
    expect(readFileSync(path.join(written, 'assets', 'app.js'), 'utf8')).toBe('x');
    // moveIntoPlace only ever renamed the content/ subdirectory — the staging directory
    // that contained it is the caller's own to discard, not moveIntoPlace's.
    expect(existsSync(staged)).toBe(true);
    expect(existsSync(contentDir)).toBe(false);
  });
});
