import { afterEach, describe, expect, it, vi } from 'vitest';
import { providerFetch } from './provider-fetch';

const ISSUER = 'http://handout-caddy.localhost/realms/handout';

function urlString(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('providerFetch', () => {
  it('shim off: passes the same URL through, with no forwarded headers added', async () => {
    const calls: { url: string; init?: RequestInit | undefined }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: urlString(url), init });
        return Promise.resolve(new Response('ok'));
      }),
    );

    const shimmed = providerFetch(ISSUER, undefined);
    await shimmed(`${ISSUER}/.well-known/openid-configuration`);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${ISSUER}/.well-known/openid-configuration`);
    expect(new Headers(calls[0]?.init?.headers).has('x-forwarded-host')).toBe(false);
  });

  it('shim on: swaps the origin, keeps path and query, and sets both forwarded headers', async () => {
    const calls: { url: string; init?: RequestInit | undefined }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: urlString(url), init });
        return Promise.resolve(new Response('ok'));
      }),
    );

    const shimmed = providerFetch(ISSUER, 'http://keycloak:8080');
    await shimmed(`${ISSUER}/.well-known/openid-configuration?x=1`);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      'http://keycloak:8080/realms/handout/.well-known/openid-configuration?x=1',
    );
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get('x-forwarded-host')).toBe('handout-caddy.localhost');
    expect(headers.get('x-forwarded-proto')).toBe('http');
  });

  it('shim on: leaves a request to an unrelated origin untouched', async () => {
    const calls: { url: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL | Request) => {
        calls.push({ url: urlString(url) });
        return Promise.resolve(new Response('ok'));
      }),
    );

    const shimmed = providerFetch(ISSUER, 'http://keycloak:8080');
    await shimmed('https://example.com/somewhere');

    expect(calls).toEqual([{ url: 'https://example.com/somewhere' }]);
  });
});
