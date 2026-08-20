/**
 * Integration test fixture for a real Keycloak, built exactly on the reasoning of
 * `service/test/support/database.ts` — read that file first.
 *
 * With no test Keycloak configured at all the suites skip themselves (a fresh clone
 * outside the workbench stays runnable). In CI there is no fresh-clone excuse: the
 * pipeline brings up its own Keycloak, so a missing one there is a broken pipeline and
 * must fail instead of skip.
 */
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, type Config } from '../../src/config';

const EXPLICIT_ISSUER = process.env.HANDOUT_TEST_OIDC_ISSUER_URL;
const KEYCLOAK_URL = process.env.KEYCLOAK_URL;

/**
 * In CI, `HANDOUT_TEST_OIDC_ISSUER_URL` names exactly where the pipeline's own Keycloak
 * answers, and there is no Caddy in front of it — issuer and reachable origin are the
 * same address. In the workbench, no explicit issuer is set and the arrangement is the
 * one Thorsten walks through: the browser reaches the provider through Caddy
 * (`handout-caddy.localhost`), the service reaches it in-network (`KEYCLOAK_URL`) — the
 * same two-issuer situation `oidcInternalOrigin` exists to fix, so the shim is under test
 * here too, not only in the walkthrough.
 */
const CONFIGURED_ISSUER =
  EXPLICIT_ISSUER !== undefined && EXPLICIT_ISSUER !== ''
    ? EXPLICIT_ISSUER
    : KEYCLOAK_URL !== undefined && KEYCLOAK_URL !== ''
      ? 'http://handout-caddy.localhost/realms/handout'
      : undefined;

export const hasKeycloak = CONFIGURED_ISSUER !== undefined;

/** Where this container can actually reach Keycloak — used by the sign-in helper below. */
export const KEYCLOAK_ORIGIN =
  KEYCLOAK_URL !== undefined && KEYCLOAK_URL !== ''
    ? KEYCLOAK_URL
    : CONFIGURED_ISSUER !== undefined
      ? new URL(CONFIGURED_ISSUER).origin
      : undefined;

const ci = process.env.CI;
const REQUIRE_KEYCLOAK = ci !== undefined && ci !== '' && ci !== 'false' && ci !== '0';

const NO_KEYCLOAK =
  'No Keycloak configured: set HANDOUT_TEST_OIDC_ISSUER_URL, or run inside the workbench ' +
  'where KEYCLOAK_URL is set.';

if (!hasKeycloak) {
  if (REQUIRE_KEYCLOAK) {
    throw new Error(`${NO_KEYCLOAK} In CI the OIDC suites must run, never skip.`);
  }
  console.warn(`${NO_KEYCLOAK} The OIDC integration suites are being skipped.`);
}

/** A key of the right shape for the tests. Random per run, and never used on real data. */
const TEST_PASSWORD_KEY = randomBytes(32).toString('base64');

/** The dev realm's own fixed value — same category as the `HANDOUT_PASSWORD_KEY` placeholder. */
export const TEST_CLIENT_SECRET = 'development-only-secret-never-use';
export const TEST_ALLOWED_EMAILS = 'berger-partner.de, t.kuhn@extern-gmbh.de';
export const TEST_DEV_PASSWORD = 'handout-dev-password';

/** The application config the OIDC integration suites run the service under. */
export function testAuthConfig(): Config {
  if (CONFIGURED_ISSUER === undefined) throw new Error(NO_KEYCLOAK);

  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'handout-auth-'));
  return loadConfig({
    LOG_LEVEL: 'silent',
    POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
    HANDOUT_DATA_DIR: dataDir,
    HANDOUT_PASSWORD_KEY: TEST_PASSWORD_KEY,
    HANDOUT_OIDC_ISSUER_URL: CONFIGURED_ISSUER,
    HANDOUT_OIDC_CLIENT_ID: 'handout',
    HANDOUT_OIDC_CLIENT_SECRET: TEST_CLIENT_SECRET,
    HANDOUT_ALLOWED_EMAILS: TEST_ALLOWED_EMAILS,
    HANDOUT_OIDC_INTERNAL_ORIGIN: KEYCLOAK_URL,
  });
}

/** The `Host` header every injected request needs — it is what the callback's redirect_uri is built from. */
export const TEST_HOST = 'handout-caddy.localhost';

function cookieHeaderFrom(setCookies: string[]): string {
  return setCookies.map((entry) => entry.split(';')[0]).join('; ');
}

/**
 * Rewrites a URL whose origin is the configured issuer's to the origin this container can
 * actually reach Keycloak at, and adds the `X-Forwarded-Host`/`X-Forwarded-Proto` a real
 * Caddy would add — playing the role of the browser and the proxy together, the same
 * shape `providerFetch` expects on the service side.
 */
function throughKeycloak(
  url: string,
  issuer: URL,
): { url: string; headers: Record<string, string> } {
  if (KEYCLOAK_ORIGIN === undefined) throw new Error(NO_KEYCLOAK);
  const target = new URL(url);
  const rewritten = new URL(KEYCLOAK_ORIGIN);
  rewritten.pathname = target.pathname;
  rewritten.search = target.search;
  return {
    url: rewritten.toString(),
    headers: {
      'X-Forwarded-Host': issuer.host,
      'X-Forwarded-Proto': issuer.protocol.replace(':', ''),
    },
  };
}

/**
 * Plays the browser's part of the authorization-code flow with `fetch`, the way Caddy
 * plays it for a real one: fetches the authorization URL, extracts the login form's
 * `action`, posts the credentials, and returns the `Location` of the redirect back to
 * `/api/auth/callback` — the query string an `app.inject` call can then hand to the
 * service under test. No browser, no admin API, no direct grant.
 */
export async function signInThroughKeycloak(
  authorizationUrl: string,
  username: string,
  password: string,
): Promise<string> {
  const issuer = new URL(
    CONFIGURED_ISSUER ??
      (() => {
        throw new Error(NO_KEYCLOAK);
      })(),
  );
  const loginPageRequest = throughKeycloak(authorizationUrl, issuer);
  const loginPage = await fetch(loginPageRequest.url, { headers: loginPageRequest.headers });
  const loginCookies = loginPage.headers.getSetCookie();
  const html = await loginPage.text();

  const actionMatch = /action="([^"]+)"/.exec(html);
  if (actionMatch?.[1] === undefined) {
    throw new Error('the Keycloak login page carries no form action');
  }
  // The HTML entity-encodes & as &amp; inside the attribute.
  const action = actionMatch[1].replaceAll('&amp;', '&');

  const postRequest = throughKeycloak(action, issuer);
  const body = new URLSearchParams({ username, password });
  const response = await fetch(postRequest.url, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      ...postRequest.headers,
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeaderFrom(loginCookies),
    },
    body,
  });

  const location = response.headers.get('location');
  if (location === null) {
    throw new Error(`Keycloak did not redirect after sign-in (status ${response.status})`);
  }
  return location;
}
