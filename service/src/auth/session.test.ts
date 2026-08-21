import fastifyCookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearFlowCookie,
  clearReauthMarker,
  clearSession,
  FLOW_COOKIE,
  readReauthMarker,
  readFlowCookie,
  readSession,
  REAUTH_COOKIE,
  requireSession,
  SESSION_COOKIE,
  writeFlowCookie,
  writeReauthMarker,
  writeSession,
} from './session';

const SECRET = Buffer.alloc(32, 9);

function buildTestApp(): FastifyInstance {
  const app = Fastify();
  app.register(fastifyCookie, { secret: SECRET });
  return app;
}

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('session cookie', () => {
  it('round-trips a session written and then read on the same request cycle', async () => {
    app = buildTestApp();
    app.get('/write', async (_request, reply) => {
      writeSession(reply, { sub: 's1', name: 'Jana Berger', email: 'j.berger@x.de' }, false);
      return { ok: true };
    });
    app.get('/read', async (request) => ({ session: readSession(request) ?? null }));
    await app.ready();

    const written = await app.inject({ method: 'GET', url: '/write' });
    const cookie = written.cookies.find((entry) => entry.name === SESSION_COOKIE);
    expect(cookie).toBeDefined();

    const read = await app.inject({
      method: 'GET',
      url: '/read',
      cookies: { [SESSION_COOKIE]: cookie?.value ?? '' },
    });
    const body = read.json<{ session: { sub: string; name: string; email: string } | null }>();
    expect(body.session).toMatchObject({ sub: 's1', name: 'Jana Berger', email: 'j.berger@x.de' });
  });

  it('sets the documented attributes', async () => {
    app = buildTestApp();
    app.get('/write', async (_request, reply) => {
      writeSession(reply, { sub: 's1', name: 'Jana Berger', email: 'j.berger@x.de' }, false);
      return { ok: true };
    });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/write' });
    const setCookie = response.headers['set-cookie'];
    const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(header).toBeDefined();
    expect(header).toContain('Path=/api');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).not.toContain('Secure');
    expect(header).toMatch(/Max-Age=43200/);
  });

  it('marks the cookie Secure when the request arrived over https', async () => {
    app = buildTestApp();
    app.get('/write', async (_request, reply) => {
      writeSession(reply, { sub: 's1', name: 'Jana Berger', email: 'j.berger@x.de' }, true);
      return { ok: true };
    });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/write' });
    const setCookie = response.headers['set-cookie'];
    const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(header).toContain('Secure');
  });

  it('rejects a tampered cookie', async () => {
    app = buildTestApp();
    app.get('/read', async (request) => ({ session: readSession(request) ?? null }));
    await app.ready();

    const read = await app.inject({
      method: 'GET',
      url: '/read',
      cookies: { [SESSION_COOKIE]: 'tampered.value' },
    });
    expect(read.json<{ session: unknown }>().session).toBeNull();
  });

  it('rejects an expired payload even though the signature is valid', async () => {
    app = buildTestApp();
    app.get('/write-expired', async (_request, reply) => {
      const expired = Buffer.from(
        JSON.stringify({ sub: 's1', name: 'x', email: 'x@x.de', exp: Date.now() - 1000 }),
        'utf8',
      ).toString('base64url');
      reply.setCookie(SESSION_COOKIE, expired, { path: '/api', signed: true });
      return { ok: true };
    });
    app.get('/read', async (request) => ({ session: readSession(request) ?? null }));
    await app.ready();

    const written = await app.inject({ method: 'GET', url: '/write-expired' });
    const cookie = written.cookies.find((entry) => entry.name === SESSION_COOKIE);

    const read = await app.inject({
      method: 'GET',
      url: '/read',
      cookies: { [SESSION_COOKIE]: cookie?.value ?? '' },
    });
    expect(read.json<{ session: unknown }>().session).toBeNull();
  });

  it('requireSession answers 401 in Fastify JSON shape when there is no session', async () => {
    app = buildTestApp();
    app.get('/protected', async (request, reply) => {
      const session = requireSession(request, reply);
      if (session === undefined) return;
      return { ok: true };
    });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/protected' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Not signed in',
    });
  });

  it('clearSession removes the cookie', async () => {
    app = buildTestApp();
    app.get('/clear', async (_request, reply) => {
      clearSession(reply);
      return { ok: true };
    });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/clear' });
    const setCookie = response.headers['set-cookie'];
    const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(header).toContain(`${SESSION_COOKIE}=;`);
  });
});

describe('flow cookie', () => {
  it('round-trips state, nonce and the code verifier', async () => {
    app = buildTestApp();
    app.get('/write', async (_request, reply) => {
      writeFlowCookie(reply, { state: 'st', nonce: 'no', codeVerifier: 'cv' }, false);
      return { ok: true };
    });
    app.get('/read', async (request) => ({ flow: readFlowCookie(request) ?? null }));
    await app.ready();

    const written = await app.inject({ method: 'GET', url: '/write' });
    const cookie = written.cookies.find((entry) => entry.name === FLOW_COOKIE);

    const read = await app.inject({
      method: 'GET',
      url: '/read',
      cookies: { [FLOW_COOKIE]: cookie?.value ?? '' },
    });
    const body = read.json<{
      flow: { state: string; nonce: string; codeVerifier: string } | null;
    }>();
    expect(body.flow).toMatchObject({ state: 'st', nonce: 'no', codeVerifier: 'cv' });
  });

  it('clearFlowCookie removes the cookie', async () => {
    app = buildTestApp();
    app.get('/clear', async (_request, reply) => {
      clearFlowCookie(reply);
      return { ok: true };
    });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/clear' });
    const setCookie = response.headers['set-cookie'];
    const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(header).toContain(`${FLOW_COOKIE}=;`);
  });
});

describe('reauth marker', () => {
  it('is absent when nobody has signed out', async () => {
    app = buildTestApp();
    app.get('/check', async (request) => ({
      forceReauth: readReauthMarker(request),
    }));
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/check' });
    expect(response.json<{ forceReauth: boolean }>().forceReauth).toBe(false);
  });

  it('round-trips: set by sign-out, read as present on the next request', async () => {
    app = buildTestApp();
    app.get('/write', async (_request, reply) => {
      writeReauthMarker(reply, false);
      return { ok: true };
    });
    app.get('/check', async (request) => ({
      forceReauth: readReauthMarker(request),
    }));
    await app.ready();

    const written = await app.inject({ method: 'GET', url: '/write' });
    const cookie = written.cookies.find((entry) => entry.name === REAUTH_COOKIE);
    expect(cookie).toBeDefined();

    const checked = await app.inject({
      method: 'GET',
      url: '/check',
      cookies: { [REAUTH_COOKIE]: cookie?.value ?? '' },
    });
    expect(checked.json<{ forceReauth: boolean }>().forceReauth).toBe(true);
  });

  it('reading does NOT clear it — an abandoned attempt must still force the next one', async () => {
    // This is the case the review caught: readReauthMarker must be side-effect-free, or
    // one un-typed password at the provider (an abandoned attempt) would silently let the
    // marker's reason go unresolved past it.
    app = buildTestApp();
    app.get('/write', async (_request, reply) => {
      writeReauthMarker(reply, false);
      return { ok: true };
    });
    app.get('/check', async (request) => ({
      forceReauth: readReauthMarker(request),
    }));
    await app.ready();

    const written = await app.inject({ method: 'GET', url: '/write' });
    const cookie = written.cookies.find((entry) => entry.name === REAUTH_COOKIE);

    const firstCheck = await app.inject({
      method: 'GET',
      url: '/check',
      cookies: { [REAUTH_COOKIE]: cookie?.value ?? '' },
    });
    expect(firstCheck.json<{ forceReauth: boolean }>().forceReauth).toBe(true);
    // No Set-Cookie for the marker on this response — it was only read, not cleared.
    expect(firstCheck.cookies.some((entry) => entry.name === REAUTH_COOKIE)).toBe(false);

    const secondCheck = await app.inject({
      method: 'GET',
      url: '/check',
      cookies: { [REAUTH_COOKIE]: cookie?.value ?? '' },
    });
    expect(secondCheck.json<{ forceReauth: boolean }>().forceReauth).toBe(true);
  });

  it('sets the same attributes as the session cookie, with a thirty-day lifetime', async () => {
    app = buildTestApp();
    app.get('/write', async (_request, reply) => {
      writeReauthMarker(reply, false);
      return { ok: true };
    });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/write' });
    const setCookie = response.headers['set-cookie'];
    const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(header).toContain('Path=/api');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).not.toContain('Secure');
    expect(header).toMatch(/Max-Age=2592000/); // 30 * 24 * 60 * 60
  });

  it('clearReauthMarker removes the cookie', async () => {
    app = buildTestApp();
    app.get('/clear', async (_request, reply) => {
      clearReauthMarker(reply);
      return { ok: true };
    });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/clear' });
    const setCookie = response.headers['set-cookie'];
    const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(header).toContain(`${REAUTH_COOKIE}=;`);
  });

  it('readReauthMarker sees it as gone on the request after clearReauthMarker ran', async () => {
    app = buildTestApp();
    app.get('/write', async (_request, reply) => {
      writeReauthMarker(reply, false);
      return { ok: true };
    });
    app.get('/clear', async (_request, reply) => {
      clearReauthMarker(reply);
      return { ok: true };
    });
    app.get('/check', async (request) => ({ forceReauth: readReauthMarker(request) }));
    await app.ready();

    const written = await app.inject({ method: 'GET', url: '/write' });
    const cookie = written.cookies.find((entry) => entry.name === REAUTH_COOKIE);

    const cleared = await app.inject({
      method: 'GET',
      url: '/clear',
      cookies: { [REAUTH_COOKIE]: cookie?.value ?? '' },
    });
    const clearedCookie = cleared.cookies.find((entry) => entry.name === REAUTH_COOKIE);

    // The cookie a browser would actually carry into its next request is this response's
    // Set-Cookie (an expired one), not the value it sent in — the same distinction the
    // session cookie's own expiry test relies on.
    const checked = await app.inject({
      method: 'GET',
      url: '/check',
      cookies: { [REAUTH_COOKIE]: clearedCookie?.value ?? '' },
    });
    expect(checked.json<{ forceReauth: boolean }>().forceReauth).toBe(false);
  });
});
