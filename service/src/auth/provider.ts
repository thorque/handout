/**
 * The only file that imports `openid-client`. Discovery, the authorization URL and the
 * code exchange, wrapped so nothing above this file has to know the library's shapes.
 *
 * Fixed scope, fixed claim names — the story rules out a provider-specific code path, so
 * there is nothing configurable here beyond the four values `Config` already carries.
 */
import * as client from 'openid-client';
import type { Config } from '../config';
import { providerFetch } from './provider-fetch';

const SCOPE = 'openid profile email';

/**
 * `providerFetch` is typed as `typeof fetch` so it reads naturally on its own and its test
 * stays independent of this library's types; `openid-client`'s `CustomFetch` differs only
 * in its `options` argument's shape (`CustomFetchOptions`, not `RequestInit`), which this
 * adapter bridges without changing behaviour.
 */
function asCustomFetch(shimmed: typeof fetch): client.CustomFetch {
  return (url, options) => {
    const init: RequestInit = {
      method: options.method,
      headers: options.headers,
      redirect: options.redirect,
    };
    if (options.body !== undefined && options.body !== null) init.body = options.body;
    if (options.signal !== undefined) init.signal = options.signal;
    return shimmed(url, init);
  };
}

export interface ProviderClaims {
  subject: string;
  name: string;
  email: string | undefined;
  emailVerified: boolean | undefined;
}

export interface SignInStart {
  url: URL;
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface CompleteSignInParams {
  currentUrl: URL;
  state: string;
  nonce: string;
  codeVerifier: string;
}

/** True for the local names `readOidcIssuerUrl` already accepts over plain http. */
function isLocalHttpIssuer(issuerUrl: string): boolean {
  return new URL(issuerUrl).protocol === 'http:';
}

/**
 * Discovery is lazy and cached: the first call performs it, every later call reuses the
 * result. A failure is reported with the issuer URL in the message and must not crash the
 * process — the service still has to serve handout space even when the provider is down.
 */
export function createProvider(config: Config) {
  let discovered: Promise<client.Configuration> | undefined;

  function discover(): Promise<client.Configuration> {
    if (discovered === undefined) {
      discovered = client
        .discovery(
          new URL(config.oidcIssuerUrl),
          config.oidcClientId,
          config.oidcClientSecret,
          undefined,
          {
            [client.customFetch]: asCustomFetch(
              providerFetch(config.oidcIssuerUrl, config.oidcInternalOrigin),
            ),
            execute: isLocalHttpIssuer(config.oidcIssuerUrl) ? [client.allowInsecureRequests] : [],
          },
        )
        .catch((error: unknown) => {
          discovered = undefined;
          throw new Error(
            `could not reach the identity provider at ${config.oidcIssuerUrl}: ` +
              `${error instanceof Error ? error.message : String(error)}`,
          );
        });
    }
    return discovered;
  }

  return {
    async startSignIn(redirectUri: string): Promise<SignInStart> {
      const providerConfig = await discover();
      const codeVerifier = client.randomPKCECodeVerifier();
      const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
      const state = client.randomState();
      const nonce = client.randomNonce();

      const url = client.buildAuthorizationUrl(providerConfig, {
        redirect_uri: redirectUri,
        scope: SCOPE,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
        nonce,
      });

      return { url, state, nonce, codeVerifier };
    },

    async completeSignIn(params: CompleteSignInParams): Promise<ProviderClaims> {
      const providerConfig = await discover();

      const tokens = await client.authorizationCodeGrant(providerConfig, params.currentUrl, {
        expectedState: params.state,
        expectedNonce: params.nonce,
        pkceCodeVerifier: params.codeVerifier,
      });

      const claims = tokens.claims();
      if (claims === undefined) {
        throw new Error('the provider returned no id_token claims');
      }

      const subject = claims.sub;
      const name =
        (typeof claims.name === 'string' ? claims.name : undefined) ??
        (typeof claims.preferred_username === 'string' ? claims.preferred_username : undefined) ??
        subject;

      let email = typeof claims.email === 'string' ? claims.email : undefined;
      let emailVerified =
        typeof claims.email_verified === 'boolean' ? claims.email_verified : undefined;

      // Some providers only release the address through UserInfo, not the id_token.
      if (email === undefined && tokens.access_token !== undefined) {
        const userInfo = await client.fetchUserInfo(providerConfig, tokens.access_token, subject);
        email = typeof userInfo.email === 'string' ? userInfo.email : undefined;
        emailVerified =
          typeof userInfo.email_verified === 'boolean' ? userInfo.email_verified : emailVerified;
      }

      return { subject, name, email, emailVerified };
    },
  };
}

export type Provider = ReturnType<typeof createProvider>;

/**
 * "provider calls go to X, issuer stays Y" — logged once at start-up so a silent rewrite
 * in a deployment whose environment happens to define KEYCLOAK_URL cannot go unnoticed.
 * `undefined` when there is nothing to say (no internal origin, or it matches the issuer).
 */
export function internalOriginNotice(config: Config): string | undefined {
  if (config.oidcInternalOrigin === undefined) return undefined;
  const issuerOrigin = new URL(config.oidcIssuerUrl).origin;
  if (config.oidcInternalOrigin === issuerOrigin) return undefined;
  return `provider calls go to ${config.oidcInternalOrigin}, issuer stays ${issuerOrigin}`;
}
