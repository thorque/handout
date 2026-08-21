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
import type { ProviderClaims, Provider } from '../auth/provider';
import { FLOW_COOKIE, REAUTH_COOKIE, SESSION_COOKIE } from '../auth/session';
import { authRoutes } from './auth';

const SECRET = Buffer.alloc(32, 3);
const ALLOWED: AllowList = { domains: ['berger-partner.de'], addresses: [] };

const JANA: ProviderClaims = {
  subject: 'sub-jana',
  name: 'Jana Berger',
  email: 'j.berger@berger-partner.de',
  emailVerified: true,
};

/** Not on the allow-list — the stand-in for `kim` in the real realm. */
const KIM: ProviderClaims = {
  subject: 'sub-kim',
  name: 'Kim Lang',
  email: 'k.lang@fremde-firma.de',
  emailVerified: true,
};

interface StartSignInCall {
  redirectUri: string;
  forceReauth: boolean;
}

/**
 * `claims` decides what a completed sign-in resolves to; `failStartSignIn` makes the
 * provider itself unreachable, the way a restart or a network blip would.
 */
function stubProvider(
  claims: ProviderClaims,
  { failStartSignIn = false }: { failStartSignIn?: boolean } = {},
): { provider: Provider; calls: StartSignInCall[] } {
  const calls: StartSignInCall[] = [];
  const provider: Provider = {
    startSignIn: async (redirectUri, options) => {
      const forceReauth = options?.forceReauth === true;
      calls.push({ redirectUri, forceReauth });
      if (failStartSignIn) throw new Error('the identity provider did not answer');
      const url = new URL('https://provider.example/authorize');
      url.searchParams.set('client_id', 'handout');
      if (forceReauth) url.searchParams.set('prompt', 'login');
      return { url, state: 'state', nonce: 'nonce', codeVerifier: 'verifier' };
    },
    completeSignIn: async () => claims,
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

function reauthCookieOf(response: { cookies: { name: string; value: string }[] }): string {
  return response.cookies.find((entry) => entry.name === REAUTH_COOKIE)?.value ?? '';
}

async function signIn(app: FastifyInstance, reauthCookie: string) {
  return app.inject({
    method: 'GET',
    url: '/api/auth/sign-in',
    cookies: { [REAUTH_COOKIE]: reauthCookie },
  });
}

async function completeCallback(app: FastifyInstance, flowCookie: string, reauthCookie: string) {
  return app.inject({
    method: 'GET',
    url: '/api/auth/callback?code=abc&state=state',
    cookies: { [FLOW_COOKIE]: flowCookie, [REAUTH_COOKIE]: reauthCookie },
  });
}

describe('GET /api/auth/sign-in and prompt=login', () => {
  it('an ordinary first sign-in carries no prompt at all', async () => {
    const { provider, calls } = stubProvider(JANA);
    app = buildTestApp(provider);
    await app.ready();

    const response = await signIn(app, '');

    expect(response.statusCode).toBe(302);
    expect(calls).toEqual([{ redirectUri: expect.any(String), forceReauth: false }]);
    const location = new URL(response.headers.location as string);
    expect(location.searchParams.has('prompt')).toBe(false);
  });

  it('the sign-in right after a sign-out carries prompt=login', async () => {
    const { provider, calls } = stubProvider(JANA);
    app = buildTestApp(provider);
    await app.ready();

    const signOut = await app.inject({ method: 'POST', url: '/api/auth/sign-out' });
    const marker = reauthCookieOf(signOut);
    expect(marker).not.toBe('');

    const response = await signIn(app, marker);

    expect(response.statusCode).toBe(302);
    expect(calls).toEqual([{ redirectUri: expect.any(String), forceReauth: true }]);
    const location = new URL(response.headers.location as string);
    expect(location.searchParams.get('prompt')).toBe('login');
  });

  it('an abandoned attempt leaves the marker standing — the next attempt forces it again', async () => {
    // This is the review's own finding, turned into a test: reading the marker at
    // /sign-in must not consume it, or one un-typed password at the provider would
    // silently undo what the sign-out was for.
    const { provider, calls } = stubProvider(JANA);
    app = buildTestApp(provider);
    await app.ready();

    const signOut = await app.inject({ method: 'POST', url: '/api/auth/sign-out' });
    const marker = reauthCookieOf(signOut);

    const firstAttempt = await signIn(app, marker);
    // No Set-Cookie for the marker here at all — /sign-in only reads it.
    expect(firstAttempt.cookies.some((entry) => entry.name === REAUTH_COOKIE)).toBe(false);

    // The abandoned attempt: nothing completes the flow, the person just clicks
    // "sign in" again with the same (untouched) marker still in their browser.
    const secondAttempt = await signIn(app, marker);

    expect(calls.map((call) => call.forceReauth)).toEqual([true, true]);
    const location = new URL(secondAttempt.headers.location as string);
    expect(location.searchParams.get('prompt')).toBe('login');
  });

  it('a successful sign-in clears the marker — the next one carries no prompt again', async () => {
    const { provider, calls } = stubProvider(JANA);
    app = buildTestApp(provider);
    await app.ready();

    const signOut = await app.inject({ method: 'POST', url: '/api/auth/sign-out' });
    const marker = reauthCookieOf(signOut);

    const forcedSignIn = await signIn(app, marker);
    const flow = forcedSignIn.cookies.find((entry) => entry.name === FLOW_COOKIE)?.value ?? '';

    const callback = await completeCallback(app, flow, marker);
    const session = callback.cookies.find((entry) => entry.name === SESSION_COOKIE);
    expect(session).toBeDefined();
    const clearedMarker = reauthCookieOf(callback);
    expect(clearedMarker).toBe('');

    const nextSignIn = await signIn(app, clearedMarker);

    expect(calls.map((call) => call.forceReauth)).toEqual([true, false]);
    const location = new URL(nextSignIn.headers.location as string);
    expect(location.searchParams.has('prompt')).toBe(false);
  });

  it('a refusal by the allow-rule leaves the marker standing — the next attempt still forces re-auth', async () => {
    const { provider, calls } = stubProvider(KIM);
    app = buildTestApp(provider);
    await app.ready();

    const signOut = await app.inject({ method: 'POST', url: '/api/auth/sign-out' });
    const marker = reauthCookieOf(signOut);

    const forcedSignIn = await signIn(app, marker);
    const flow = forcedSignIn.cookies.find((entry) => entry.name === FLOW_COOKIE)?.value ?? '';

    const callback = await completeCallback(app, flow, marker);
    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe('/app/?error=not_allowed');
    expect(callback.cookies.some((entry) => entry.name === SESSION_COOKIE)).toBe(false);
    // The marker survives a refusal too: no Set-Cookie clearing it here.
    expect(callback.cookies.some((entry) => entry.name === REAUTH_COOKIE)).toBe(false);

    const nextSignIn = await signIn(app, marker);

    expect(calls.map((call) => call.forceReauth)).toEqual([true, true]);
    const location = new URL(nextSignIn.headers.location as string);
    expect(location.searchParams.get('prompt')).toBe('login');
  });

  it('a failed sign-in start (the provider unreachable) does not consume the marker', async () => {
    const { provider, calls } = stubProvider(JANA, { failStartSignIn: true });
    app = buildTestApp(provider);
    await app.ready();

    const signOut = await app.inject({ method: 'POST', url: '/api/auth/sign-out' });
    const marker = reauthCookieOf(signOut);

    const failedAttempt = await app.inject({
      method: 'GET',
      url: '/api/auth/sign-in',
      cookies: { [REAUTH_COOKIE]: marker },
    });
    expect(failedAttempt.statusCode).toBe(500);
    // Nothing here clears the marker, because /sign-in never wrote to it in the first
    // place — it only reads. The 500 carries no Set-Cookie for it at all.
    expect(failedAttempt.cookies.some((entry) => entry.name === REAUTH_COOKIE)).toBe(false);

    await signIn(app, marker);

    expect(calls.map((call) => call.forceReauth)).toEqual([true, true]);
  });
});
