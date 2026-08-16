import { createRequire } from 'node:module';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const config = loadConfig({
  LOG_LEVEL: 'silent',
  POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
  HANDOUT_PASSWORD_KEY: Buffer.alloc(32, 7).toString('base64'),
});

describe('GET /_handout/api/health', () => {
  let app: FastifyInstance;

  function start(databaseOk: boolean): FastifyInstance {
    app = buildApp(config, { checkDatabase: () => Promise.resolve(databaseOk) });
    return app;
  }

  afterEach(async () => {
    await app.close();
  });

  it('answers with the service status', async () => {
    const response = await start(true).inject({ method: 'GET', url: '/_handout/api/health' });

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
    const response = await start(false).inject({ method: 'GET', url: '/_handout/api/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'degraded',
      service: 'handout',
      version,
      database: 'unavailable',
    });
  });

  it('leaves the root free for publication space', async () => {
    const response = await start(true).inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
  });

  it('matches the reserved prefix as a whole path segment', async () => {
    const response = await start(true).inject({ method: 'GET', url: '/_handoutx/api/health' });

    expect(response.statusCode).toBe(404);
  });
});
