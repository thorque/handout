/**
 * The story's own "Integrationstests gegen Keycloak": a real authorization-code flow
 * against the workbench realm. Skipped when no test Keycloak is configured (see
 * `test/support/keycloak.ts`), required in CI.
 */
import { rmSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import type { Config } from '../src/config';
import { SESSION_COOKIE, FLOW_COOKIE } from '../src/auth/session';
import {
  hasKeycloak,
  signInThroughKeycloak,
  testAuthConfig,
  TEST_DEV_PASSWORD,
  TEST_HOST,
} from './support/keycloak';

const describeIfKeycloak = hasKeycloak ? describe : describe.skip;

describeIfKeycloak('sign-in against the workbench Keycloak', () => {
  let app: FastifyInstance;
  let config: Config;

  beforeAll(() => {
    config = testAuthConfig();
    app = buildApp(config, { checkDatabase: () => Promise.resolve(true) });
  });

  afterAll(async () => {
    await app.close();
    rmSync(config.dataDir, { recursive: true, force: true });
  });

  function cookieValue(setCookie: string[], name: string): string | undefined {
    for (const entry of setCookie) {
      const [pair] = entry.split(';');
      const [cookieName, value] = (pair ?? '').split('=');
      if (cookieName === name) return value;
    }
    return undefined;
  }

  async function startSignIn(): Promise<{ authorizationUrl: string; flowCookie: string }> {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/sign-in',
      headers: { host: TEST_HOST },
    });
    expect(response.statusCode).toBe(302);
    const authorizationUrl = response.headers.location as string;
    const flowCookie = cookieValue(
      response.cookies.map((c) => `${c.name}=${c.value}`),
      FLOW_COOKIE,
    );
    expect(flowCookie).toBeDefined();
    return { authorizationUrl, flowCookie: flowCookie ?? '' };
  }

  async function completeSignIn(username: string, flowCookie: string, authorizationUrl: string) {
    const redirectLocation = await signInThroughKeycloak(
      authorizationUrl,
      username,
      TEST_DEV_PASSWORD,
    );
    const callback = new URL(redirectLocation);
    return app.inject({
      method: 'GET',
      url: `${callback.pathname}${callback.search}`,
      headers: { host: TEST_HOST, cookie: `${FLOW_COOKIE}=${flowCookie}` },
    });
  }

  it('lets jana in by domain, makes her recognisable, and ends the session on sign-out', async () => {
    const { authorizationUrl, flowCookie } = await startSignIn();
    const response = await completeSignIn('jana', flowCookie, authorizationUrl);

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/app/');
    const sessionCookie = cookieValue(
      response.cookies.map((c) => `${c.name}=${c.value}`),
      SESSION_COOKIE,
    );
    expect(sessionCookie).toBeDefined();

    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { host: TEST_HOST, cookie: `${SESSION_COOKIE}=${sessionCookie}` },
    });
    expect(session.json()).toEqual({
      signedIn: true,
      user: { name: 'Jana Berger', email: 'j.berger@berger-partner.de' },
    });

    const protected1 = await app.inject({
      method: 'GET',
      url: '/api/handouts',
      headers: { host: TEST_HOST, cookie: `${SESSION_COOKIE}=${sessionCookie}` },
    });
    expect(protected1.statusCode).not.toBe(401);

    const signOut = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { host: TEST_HOST, cookie: `${SESSION_COOKIE}=${sessionCookie}` },
    });
    expect(signOut.statusCode).toBe(204);
    const cleared = cookieValue(
      signOut.cookies.map((c) => `${c.name}=${c.value}`),
      SESSION_COOKIE,
    );
    expect(cleared).toBe('');

    const protected2 = await app.inject({ method: 'GET', url: '/api/handouts' });
    expect(protected2.statusCode).toBe(401);
  });

  it('lets tim in by the single-address allow-list entry', async () => {
    const { authorizationUrl, flowCookie } = await startSignIn();
    const response = await completeSignIn('tim', flowCookie, authorizationUrl);

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/app/');
  });

  it.each([
    ['kim', 'not permitted'],
    ['mira', 'a subdomain'],
    ['nils', 'unverified'],
    ['ohne', 'no address'],
  ])('refuses %s (%s) — redirect only, no session cookie at all', async (username) => {
    const { authorizationUrl, flowCookie } = await startSignIn();
    const response = await completeSignIn(username, flowCookie, authorizationUrl);

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/app/?error=not_allowed');
    const setCookie = response.cookies.map((c) => c.name);
    expect(setCookie).not.toContain(SESSION_COOKIE);
  });

  it('refuses a callback with a valid code but no flow cookie', async () => {
    const { authorizationUrl } = await startSignIn();
    const redirectLocation = await signInThroughKeycloak(
      authorizationUrl,
      'jana',
      TEST_DEV_PASSWORD,
    );
    const callback = new URL(redirectLocation);

    const response = await app.inject({
      method: 'GET',
      url: `${callback.pathname}${callback.search}`,
      headers: { host: TEST_HOST },
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/app/?error=sign_in_failed');
    expect(response.cookies.map((c) => c.name)).not.toContain(SESSION_COOKIE);
  });

  it('refuses a callback whose state does not match the flow cookie', async () => {
    const { authorizationUrl, flowCookie: _flowCookie } = await startSignIn();
    const redirectLocation = await signInThroughKeycloak(
      authorizationUrl,
      'jana',
      TEST_DEV_PASSWORD,
    );
    const callback = new URL(redirectLocation);

    // A second, unrelated flow cookie — its state can never match the code above.
    const other = await startSignIn();

    const response = await app.inject({
      method: 'GET',
      url: `${callback.pathname}${callback.search}`,
      headers: { host: TEST_HOST, cookie: `${FLOW_COOKIE}=${other.flowCookie}` },
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/app/?error=sign_in_failed');
    expect(response.cookies.map((c) => c.name)).not.toContain(SESSION_COOKIE);
  });

  it('discovers the issuer through the shim as the configured issuer, not the internal one', async () => {
    // Measured: without the forwarded headers this would read http://keycloak:8080/realms/handout.
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/sign-in',
      headers: { host: TEST_HOST },
    });
    expect(response.statusCode).toBe(302);
    const location = response.headers.location as string;
    expect(location.startsWith(config.oidcIssuerUrl)).toBe(true);
  });
});
