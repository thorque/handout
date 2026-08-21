/**
 * The one place where an address becomes a slug. It takes a pathname and nothing else: no
 * `Host` header, no second hostname to weigh in, no mode to branch on — a pathname on the
 * instance's one hostname is the whole truth, per ADR 0001. Nothing else in the service
 * may decide this.
 */
import { isSlug } from '../slug';

export interface HandoutAddress {
  slug: string;
  /** The path inside the handout, already decoded, split on `/`, empty parts dropped. */
  rest: string[];
}

/**
 * Splits `pathname` on `/`, drops empty parts, decodes each remaining part, takes the
 * first as the slug candidate and checks it with {@link isSlug}. A malformed escape or an
 * invalid slug gives `undefined`, never a throw.
 */
export function addressFromPath(pathname: string): HandoutAddress | undefined {
  const parts = pathname.split('/').filter((part) => part !== '');
  if (parts.length === 0) return undefined;

  const decoded: string[] = [];
  for (const part of parts) {
    try {
      decoded.push(decodeURIComponent(part));
    } catch {
      return undefined;
    }
  }

  const [slug, ...rest] = decoded;
  if (slug === undefined || !isSlug(slug)) return undefined;

  return { slug, rest };
}

/**
 * The reverse direction: the full address a slug is reachable under. Takes the protocol
 * and host as arguments and reads no configuration — the caller passes `request.protocol`
 * and `request.host`, which follow `X-Forwarded-Proto`/`X-Forwarded-Host` behind Caddy
 * because `buildApp` sets `trustProxy: true`, the same way the session cookie's `secure`
 * flag and the derived `redirect_uri` already do. That is what keeps the address correct
 * on `handout-caddy.localhost` and over `monoceros share` alike.
 */
export function handoutUrl(origin: { protocol: string; host: string }, slug: string): string {
  return `${origin.protocol}://${origin.host}/${slug}/`;
}
