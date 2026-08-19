import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

/** A key of the right shape, obviously fake, never used against real data. */
const TEST_KEY = Buffer.alloc(32, 7).toString('base64');

/** The values without which the service refuses to start. */
const REQUIRED = {
  POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
  HANDOUT_PASSWORD_KEY: TEST_KEY,
};

describe('loadConfig', () => {
  it('falls back to the documented defaults', () => {
    const config = loadConfig(REQUIRED);

    expect(config.port).toBe(3000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.logLevel).toBe('info');
    expect(path.isAbsolute(config.dataDir)).toBe(true);
    expect(config.dataDir.endsWith(path.join('var', 'data'))).toBe(true);
    expect(config.databaseSchema).toBe('public');
  });

  it('rejects a port outside the valid range', () => {
    expect(() => loadConfig({ ...REQUIRED, PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects a port that is not a number', () => {
    expect(() => loadConfig({ ...REQUIRED, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('rejects an unknown log level', () => {
    expect(() => loadConfig({ ...REQUIRED, LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });

  it('refuses to start without a database', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('refuses to start without a password key', () => {
    expect(() => loadConfig({ POSTGRES_URL: 'postgresql://x/y' })).toThrow(/HANDOUT_PASSWORD_KEY/);
  });

  it('rejects a password key that is not 32 bytes', () => {
    expect(() =>
      loadConfig({ ...REQUIRED, HANDOUT_PASSWORD_KEY: Buffer.alloc(16).toString('base64') }),
    ).toThrow(/HANDOUT_PASSWORD_KEY.*32/s);
  });

  it('rejects a password key that is not base64', () => {
    // Buffer.from() drops what it cannot decode instead of failing, so junk must be caught here.
    expect(() => loadConfig({ ...REQUIRED, HANDOUT_PASSWORD_KEY: 'not base64!!' })).toThrow(
      /HANDOUT_PASSWORD_KEY/,
    );
  });

  it('prefers DATABASE_URL over POSTGRES_URL', () => {
    const config = loadConfig({
      ...REQUIRED,
      DATABASE_URL: 'postgresql://own:secret@db:5432/handout',
    });

    expect(config.databaseUrl).toBe('postgresql://own:secret@db:5432/handout');
  });

  it('falls back to the workbench POSTGRES_URL', () => {
    const config = loadConfig(REQUIRED);

    expect(config.databaseUrl).toBe(REQUIRED.POSTGRES_URL);
  });

  it('takes every value from the environment', () => {
    const config = loadConfig({
      PORT: '3001',
      HOST: '127.0.0.1',
      LOG_LEVEL: 'debug',
      HANDOUT_DATA_DIR: '/tmp/handout-test',
      DATABASE_URL: 'postgresql://own:secret@db:5432/handout',
      HANDOUT_DATABASE_SCHEMA: 'handout_test_1',
      HANDOUT_PASSWORD_KEY: TEST_KEY,
    });

    expect(config).toEqual({
      port: 3001,
      host: '127.0.0.1',
      logLevel: 'debug',
      dataDir: '/tmp/handout-test',
      databaseUrl: 'postgresql://own:secret@db:5432/handout',
      databaseSchema: 'handout_test_1',
      passwordKey: Buffer.from(TEST_KEY, 'base64'),
    });
  });

  it('carries exactly this key set — a guard, not a discovery', () => {
    // ADR 0001: one instance, one hostname, one way to resolve a handout's address. This
    // surface already carries nothing that would let a second one exist, and this pins
    // that fact so that adding one later is a visible decision here, not a silent drift.
    expect(Object.keys(loadConfig(REQUIRED)).sort()).toEqual(
      [
        'port',
        'host',
        'logLevel',
        'dataDir',
        'databaseUrl',
        'databaseSchema',
        'passwordKey',
      ].sort(),
    );
  });
});
