/**
 * The one place where an address becomes a slug — the single seam HAN-12 opens when it
 * adds subdomain mode and a base domain. It takes a pathname and nothing else: no `Host`,
 * no base domain, no mode. Nothing else in the service may decide this.
 */
import { isSlug } from '../slug';

export interface PublicationAddress {
  slug: string;
  /** The path inside the publication, already decoded, split on `/`, empty parts dropped. */
  rest: string[];
}

/**
 * Splits `pathname` on `/`, drops empty parts, decodes each remaining part, takes the
 * first as the slug candidate and checks it with {@link isSlug}. A malformed escape or an
 * invalid slug gives `undefined`, never a throw.
 */
export function addressFromPath(pathname: string): PublicationAddress | undefined {
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
