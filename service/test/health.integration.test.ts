import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

// A temp directory, not the repository's own var/data: buildApp now creates the handouts
// directory on the spot, and this suite must not write into the repository.
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'handout-health-'));

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

const config = loadConfig({
  LOG_LEVEL: 'silent',
  POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
  HANDOUT_PASSWORD_KEY: Buffer.alloc(32, 7).toString('base64'),
  HANDOUT_OIDC_ISSUER_URL: 'http://handout-caddy.localhost/realms/handout',
  HANDOUT_OIDC_CLIENT_ID: 'handout',
  HANDOUT_OIDC_CLIENT_SECRET: 'test-secret',
  HANDOUT_ALLOWED_EMAILS: 'berger-partner.de',
  HANDOUT_DATA_DIR: dataDir,
});

describe('GET /api/health', () => {
  let app: FastifyInstance;

  function start(databaseOk: boolean): FastifyInstance {
    app = buildApp(config, { checkDatabase: () => Promise.resolve(databaseOk) });
    return app;
  }

  afterEach(async () => {
    await app.close();
  });

  it('answers with the service status', async () => {
    const response = await start(true).inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'handout',
      version,
      database: 'ok',
    });
  });

  it('reports a service without its database as degraded', async () => {
    const response = await start(false).inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'degraded',
      service: 'handout',
      version,
      database: 'unavailable',
    });
  });

  it('leaves the root free for handout space', async () => {
    const response = await start(true).inject({ method: 'GET', url: '/' });

    // Handout space, so it answers the plain not-found page, not the API's JSON —
    // proof that the root is not the API, just as well as a JSON 404 would have been.
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
  });

  it('matches the reserved prefix as a whole path segment', async () => {
    const response = await start(true).inject({ method: 'GET', url: '/apiiiii/health' });

    // /apiiiii/... is handout space, not the look-alike segment it appears to be.
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
  });
});
