/**
 * The sign-in flow's own logic, isolated from the real provider: a stub `Provider` records
 * what it was asked for and returns an authorization URL carrying `prompt=login` exactly
 * when told to force re-authentication — so these tests catch the *route's* decision (did
 * it ask for a forced re-auth after a sign-out?), not `openid-client`'s URL building, which
 * `test/auth.keycloak.integration.test.ts` already exercises against the real provider.
 */
import fastifyCookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { AllowList } from '../auth/access';
import type { Provider } from '../auth/provider';
import { FLOW_COOKIE, REAUTH_COOKIE, SESSION_COOKIE } from '../auth/session';
import { authRoutes } from './auth';

const SECRET = Buffer.alloc(32, 3);
const ALLOWED: AllowList = { domains: ['berger-partner.de'], addresses: [] };

interface StartSignInCall {
  redirectUri: string;
  forceReauth: boolean;
}

function stubProvider(): { provider: Provider; calls: StartSignInCall[] } {
  const calls: StartSignInCall[] = [];
  const provider: Provider = {
    startSignIn: async (redirectUri, options) => {
      const forceReauth = options?.forceReauth === true;
      calls.push({ redirectUri, forceReauth });
      const url = new URL('https://provider.example/authorize');
      url.searchParams.set('client_id', 'handout');
      if (forceReauth) url.searchParams.set('prompt', 'login');
      return { url, state: 'state', nonce: 'nonce', codeVerifier: 'verifier' };
    },
    completeSignIn: async () => ({
      subject: 'sub',
      name: 'Jana Berger',
      email: 'j.berger@berger-partner.de',
      emailVerified: true,
    }),
  };
  return { provider, calls };
}

function buildTestApp(provider: Provider): FastifyInstance {
  const app = Fastify();
  app.register(fastifyCookie, { secret: SECRET });
  app.register(authRoutes, {
    prefix: '/api',
    provider,
    allowedEmails: ALLOWED,
    signInLabel: 'Mit Firmenkonto anmelden',
  });
  return app;
}

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('GET /api/auth/sign-in and prompt=login', () => {
  it('an ordinary first sign-in carries no prompt at all', async () => {
    const { provider, calls } = stubProvider();
    app = buildTestApp(provider);
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/auth/sign-in' });

    expect(response.statusCode).toBe(302);
    expect(calls).toEqual([{ redirectUri: expect.any(String), forceReauth: false }]);
    const location = new URL(response.headers.location as string);
    expect(location.searchParams.has('prompt')).toBe(false);
  });

  it('the sign-in right after a sign-out carries prompt=login', async () => {
    const { provider, calls } = stubProvider();
    app = buildTestApp(provider);
    await app.ready();

    const signOut = await app.inject({ method: 'POST', url: '/api/auth/sign-out' });
    const marker = signOut.cookies.find((entry) => entry.name === REAUTH_COOKIE);
    expect(marker).toBeDefined();

    const signIn = await app.inject({
      method: 'GET',
      url: '/api/auth/sign-in',
      cookies: { [REAUTH_COOKIE]: marker?.value ?? '' },
    });

    expect(signIn.statusCode).toBe(302);
    expect(calls).toEqual([{ redirectUri: expect.any(String), forceReauth: true }]);
    const location = new URL(signIn.headers.location as string);
    expect(location.searchParams.get('prompt')).toBe('login');
  });

  it('the marker is gone after a successful sign-in — the next one carries no prompt again', async () => {
    const { provider, calls } = stubProvider();
    app = buildTestApp(provider);
    await app.ready();

    const signOut = await app.inject({ method: 'POST', url: '/api/auth/sign-out' });
    const marker = signOut.cookies.find((entry) => entry.name === REAUTH_COOKIE);

    // The forced sign-in: reading the marker at /sign-in already clears it (the route's
    // own guarantee), so the cookie a real browser would carry afterwards is empty.
    const forcedSignIn = await app.inject({
      method: 'GET',
      url: '/api/auth/sign-in',
      cookies: { [REAUTH_COOKIE]: marker?.value ?? '' },
    });
    const clearedMarker = forcedSignIn.cookies.find((entry) => entry.name === REAUTH_COOKIE);
    expect(clearedMarker?.value).toBe('');
    const flow = forcedSignIn.cookies.find((entry) => entry.name === FLOW_COOKIE);
    expect(flow).toBeDefined();

    // Complete that sign-in, then sign in again without ever signing out in between.
    const callback = await app.inject({
      method: 'GET',
      url: '/api/auth/callback?code=abc&state=state',
      cookies: { [FLOW_COOKIE]: flow?.value ?? '' },
    });
    const session = callback.cookies.find((entry) => entry.name === SESSION_COOKIE);
    expect(session).toBeDefined();

    const secondSignIn = await app.inject({
      method: 'GET',
      url: '/api/auth/sign-in',
      cookies: { [REAUTH_COOKIE]: clearedMarker?.value ?? '' },
    });

    expect(calls.map((call) => call.forceReauth)).toEqual([true, false]);
    const location = new URL(secondSignIn.headers.location as string);
    expect(location.searchParams.has('prompt')).toBe(false);
  });
});
