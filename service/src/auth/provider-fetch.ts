/**
 * The one workbench accommodation: the browser reaches the provider through Caddy, the
 * service reaches it in-network, and without help those are two issuers for one realm —
 * see `service/src/config.ts`'s `oidcInternalOrigin` for the measured reason. This file is
 * the whole fix, so it stays in one place and is not spread across `provider.ts`.
 */

/**
 * With no internal origin, returns `fetch` unchanged. With one, returns a wrapper that, for
 * a request whose URL origin equals the issuer's origin, swaps the origin for the internal
 * one and adds `X-Forwarded-Host` / `X-Forwarded-Proto` for the issuer's own host and
 * scheme — measured: Keycloak stamps both the discovery `issuer` and the token's `iss` from
 * those headers, so without them the same realm answers under two issuers and validation
 * fails. A request to any other origin passes through untouched.
 */
export function providerFetch(issuerUrl: string, internalOrigin: string | undefined): typeof fetch {
  if (internalOrigin === undefined) return fetch;

  const issuerOrigin = new URL(issuerUrl).origin;
  const issuer = new URL(issuerUrl);

  return async function fetchThroughShim(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> {
    const url = input instanceof Request ? new URL(input.url) : new URL(input.toString());

    if (url.origin !== issuerOrigin) {
      return fetch(input, init);
    }

    const rewritten = new URL(internalOrigin);
    rewritten.pathname = url.pathname;
    rewritten.search = url.search;

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    headers.set('X-Forwarded-Host', issuer.host);
    headers.set('X-Forwarded-Proto', issuer.protocol.replace(':', ''));

    return fetch(rewritten, { ...init, headers });
  };
}
