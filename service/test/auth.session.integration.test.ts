/**
 * The gate itself: everything under `/api/**` needs a session except `/api/health` and
 * `/api/auth/*`, and it must answer for a path with no route at all too — the upload
 * endpoints of the coming stories are covered the moment they exist rather than the
 * moment someone remembers.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import fastifyCookie from '@fastify/cookie';
import Fastify from 'fastify';
import { writeSession } from '../src/auth/session';

const dataDir = mkdtempSync(path.join(os.tmpdir(), 'handout-auth-session-'));

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

const config = loadConfig({
  LOG_LEVEL: 'silent',
  POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
  HANDOUT_DATA_DIR: dataDir,
  HANDOUT_PASSWORD_KEY: Buffer.alloc(32, 7).toString('base64'),
  HANDOUT_OIDC_ISSUER_URL: 'http://handout-caddy.localhost/realms/handout',
  HANDOUT_OIDC_CLIENT_ID: 'handout',
  HANDOUT_OIDC_CLIENT_SECRET: 'test-secret',
  HANDOUT_ALLOWED_EMAILS: 'berger-partner.de',
});

let app: FastifyInstance;

afterEach(async () => {
  await app.close();
});

/** A valid, signed session cookie value for `readSession`/`requireSession` to accept. */
async function validSessionCookie(): Promise<string> {
  const helper = Fastify();
  await helper.register(fastifyCookie, { secret: config.sessionKey });
  helper.get('/write', async (_request, reply) => {
    writeSession(
      reply,
      { sub: 's1', name: 'Jana Berger', email: 'j.berger@berger-partner.de' },
      false,
    );
    return { ok: true };
  });
  await helper.ready();
  const response = await helper.inject({ method: 'GET', url: '/write' });
  const cookie = response.cookies.find((entry) => entry.name === 'handout_session');
  await helper.close();
  if (cookie === undefined) throw new Error('no session cookie was set');
  return cookie.value;
}

describe('the session gate', () => {
  it('leaves /api/health public', async () => {
    app = buildApp(config, { checkDatabase: () => Promise.resolve(true) });
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).not.toBe(401);
  });

  it('leaves /api/auth/session public', async () => {
    app = buildApp(config, { checkDatabase: () => Promise.resolve(true) });
    const response = await app.inject({ method: 'GET', url: '/api/auth/session' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ signedIn: false, signInLabel: config.signInLabel });
  });

  it('answers 401 JSON for an unrouted /api path, without a session', async () => {
    app = buildApp(config, { checkDatabase: () => Promise.resolve(true) });
    const response = await app.inject({ method: 'GET', url: '/api/handouts' });
    expect(response.statusCode).toBe(401);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.json()).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Not signed in',
    });
  });

  it('answers 401 for an unrouted /api path even with a valid session, until a route exists', async () => {
    app = buildApp(config, { checkDatabase: () => Promise.resolve(true) });
    const cookie = await validSessionCookie();
    const response = await app.inject({
      method: 'GET',
      url: '/api/handouts',
      cookies: { handout_session: cookie },
    });
    // /api/handouts has no route today — the gate lets a session through, Fastify's own
    // not-found handler still answers 404, proving the gate does not swallow real routes.
    expect(response.statusCode).toBe(404);
  });

  it('does not leak into handout space', async () => {
    app = buildApp(config, { checkDatabase: () => Promise.resolve(true) });

    const root = await app.inject({ method: 'GET', url: '/' });
    expect(root.statusCode).toBe(404);
    expect(root.headers['content-type']).toMatch(/^text\/html/);

    const unlock = await app.inject({ method: 'GET', url: '/unlock' });
    expect(unlock.statusCode).toBe(404);
    expect(unlock.headers['content-type']).toMatch(/^application\/json/);
  });
});
