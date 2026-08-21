import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

/** A key of the right shape, obviously fake, never used against real data. */
const TEST_KEY = Buffer.alloc(32, 7).toString('base64');

/** The values without which the service refuses to start. */
const REQUIRED = {
  POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
  HANDOUT_PASSWORD_KEY: TEST_KEY,
  HANDOUT_OIDC_ISSUER_URL: 'http://handout-caddy.localhost/realms/handout',
  HANDOUT_OIDC_CLIENT_ID: 'handout',
  HANDOUT_OIDC_CLIENT_SECRET: 'test-secret',
  HANDOUT_ALLOWED_EMAILS: 'berger-partner.de, t.kuhn@extern-gmbh.de',
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
    expect(config.signInLabel).toBe('Mit Firmenkonto anmelden');
    expect(config.oidcInternalOrigin).toBeUndefined();
    expect(config.maxUploadBytes).toBe(26_214_400);
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
      HANDOUT_OIDC_ISSUER_URL: 'https://id.example.com/realms/handout',
      HANDOUT_OIDC_CLIENT_ID: 'handout',
      HANDOUT_OIDC_CLIENT_SECRET: 'super-secret',
      HANDOUT_ALLOWED_EMAILS: 'berger-partner.de',
      HANDOUT_SIGN_IN_LABEL: 'Mit Testkonto anmelden',
      HANDOUT_OIDC_INTERNAL_ORIGIN: 'http://keycloak:8080',
      HANDOUT_MAX_UPLOAD_BYTES: '1024',
    });

    expect(config).toEqual({
      port: 3001,
      host: '127.0.0.1',
      logLevel: 'debug',
      dataDir: '/tmp/handout-test',
      databaseUrl: 'postgresql://own:secret@db:5432/handout',
      databaseSchema: 'handout_test_1',
      passwordKey: Buffer.from(TEST_KEY, 'base64'),
      oidcIssuerUrl: 'https://id.example.com/realms/handout',
      oidcClientId: 'handout',
      oidcClientSecret: 'super-secret',
      allowedEmails: { domains: ['berger-partner.de'], addresses: [] },
      signInLabel: 'Mit Testkonto anmelden',
      oidcInternalOrigin: 'http://keycloak:8080',
      sessionKey: config.sessionKey,
      maxUploadBytes: 1024,
    });
  });

  it('refuses an issuer URL that is not an absolute URL', () => {
    expect(() => loadConfig({ ...REQUIRED, HANDOUT_OIDC_ISSUER_URL: 'not a url' })).toThrow(
      /HANDOUT_OIDC_ISSUER_URL/,
    );
  });

  it('refuses an http issuer on a real hostname', () => {
    expect(() =>
      loadConfig({ ...REQUIRED, HANDOUT_OIDC_ISSUER_URL: 'http://id.example.com/realms/x' }),
    ).toThrow(/HANDOUT_OIDC_ISSUER_URL/);
  });

  it('accepts an http issuer on a *.localhost name', () => {
    const config = loadConfig({
      ...REQUIRED,
      HANDOUT_OIDC_ISSUER_URL: 'http://handout-caddy.localhost/realms/handout',
    });
    expect(config.oidcIssuerUrl).toBe('http://handout-caddy.localhost/realms/handout');
  });

  it('strips a trailing slash from the issuer URL', () => {
    const config = loadConfig({
      ...REQUIRED,
      HANDOUT_OIDC_ISSUER_URL: 'http://handout-caddy.localhost/realms/handout/',
    });
    expect(config.oidcIssuerUrl).toBe('http://handout-caddy.localhost/realms/handout');
  });

  it('refuses to start without a client id', () => {
    expect(() => loadConfig({ ...REQUIRED, HANDOUT_OIDC_CLIENT_ID: '' })).toThrow(
      /HANDOUT_OIDC_CLIENT_ID/,
    );
  });

  it('refuses to start without a client secret', () => {
    expect(() => loadConfig({ ...REQUIRED, HANDOUT_OIDC_CLIENT_SECRET: '' })).toThrow(
      /HANDOUT_OIDC_CLIENT_SECRET/,
    );
  });

  it('refuses to start with an empty allow list', () => {
    expect(() => loadConfig({ ...REQUIRED, HANDOUT_ALLOWED_EMAILS: '' })).toThrow(
      /HANDOUT_ALLOWED_EMAILS/,
    );
  });

  it('refuses an internal origin that carries a path', () => {
    expect(() =>
      loadConfig({
        ...REQUIRED,
        HANDOUT_OIDC_INTERNAL_ORIGIN: 'http://keycloak:8080/realms/handout',
      }),
    ).toThrow(/HANDOUT_OIDC_INTERNAL_ORIGIN/);
  });

  it('falls back to KEYCLOAK_URL for the internal origin', () => {
    const config = loadConfig({ ...REQUIRED, KEYCLOAK_URL: 'http://keycloak:8080' });
    expect(config.oidcInternalOrigin).toBe('http://keycloak:8080');
  });

  it('defaults the sign-in label', () => {
    expect(loadConfig(REQUIRED).signInLabel).toBe('Mit Firmenkonto anmelden');
  });

  it('falls back to the default sign-in label when it is set but blank', () => {
    expect(loadConfig({ ...REQUIRED, HANDOUT_SIGN_IN_LABEL: '   ' }).signInLabel).toBe(
      'Mit Firmenkonto anmelden',
    );
  });

  it('defaults the upload limit to 25 MB', () => {
    expect(loadConfig(REQUIRED).maxUploadBytes).toBe(26_214_400);
  });

  it('takes the upload limit from the environment', () => {
    expect(loadConfig({ ...REQUIRED, HANDOUT_MAX_UPLOAD_BYTES: '1024' }).maxUploadBytes).toBe(
      1024,
    );
  });

  it('rejects an upload limit of zero', () => {
    expect(() => loadConfig({ ...REQUIRED, HANDOUT_MAX_UPLOAD_BYTES: '0' })).toThrow(
      /HANDOUT_MAX_UPLOAD_BYTES/,
    );
  });

  it('rejects a negative upload limit', () => {
    expect(() => loadConfig({ ...REQUIRED, HANDOUT_MAX_UPLOAD_BYTES: '-1' })).toThrow(
      /HANDOUT_MAX_UPLOAD_BYTES/,
    );
  });

  it('rejects a non-integer upload limit', () => {
    expect(() => loadConfig({ ...REQUIRED, HANDOUT_MAX_UPLOAD_BYTES: '1.5' })).toThrow(
      /HANDOUT_MAX_UPLOAD_BYTES/,
    );
  });

  it('rejects an upload limit carrying a unit', () => {
    expect(() => loadConfig({ ...REQUIRED, HANDOUT_MAX_UPLOAD_BYTES: '25MB' })).toThrow(
      /HANDOUT_MAX_UPLOAD_BYTES/,
    );
  });

  it('derives a 32-byte session key that differs from the password key', () => {
    const config = loadConfig(REQUIRED);
    expect(config.sessionKey.length).toBe(32);
    expect(config.sessionKey.equals(config.passwordKey)).toBe(false);
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
        'oidcIssuerUrl',
        'oidcClientId',
        'oidcClientSecret',
        'allowedEmails',
        'signInLabel',
        'oidcInternalOrigin',
        'sessionKey',
        'maxUploadBytes',
      ].sort(),
    );
  });
});
