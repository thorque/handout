import { createRequire } from 'node:module';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

describe('GET /_handout/api/health', () => {
  let app: FastifyInstance;

  beforeAll(() => {
    app = buildApp(loadConfig({ LOG_LEVEL: 'silent' }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers with the service status', async () => {
    const response = await app.inject({ method: 'GET', url: '/_handout/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.json()).toEqual({ status: 'ok', service: 'handout', version });
  });

  it('leaves the root free for publication space', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
  });

  it('matches the reserved prefix as a whole path segment', async () => {
    const response = await app.inject({ method: 'GET', url: '/_handoutx/api/health' });

    expect(response.statusCode).toBe(404);
  });
});
