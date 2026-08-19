import { SLUG_ALPHABET, SLUG_MIN_LENGTH } from './slug';

/**
 * The path segments the application owns. `app` is the front end (its routes, its built
 * assets and the design layer below it), `api` is the HTTP interface, `unlock` is the
 * recipient password page — reserved even though no route exists behind it yet.
 */
export const RESERVED_SEGMENTS = ['app', 'api', 'unlock'] as const;

export const APP_PREFIX = '/app';
export const API_PREFIX = '/api';
export const UNLOCK_PREFIX = '/unlock';

/**
 * Whether `pathname` belongs to one of the application's own segments rather than to
 * handout space. Compared as a whole path segment, never as a string prefix — `/appleee`
 * (a legal slug) has to fall through to handout space, see docs/url-namespace.md, rule 2.
 */
export function isReservedPath(pathname: string): boolean {
  const segment = pathname.split('/')[1] ?? '';
  return (RESERVED_SEGMENTS as readonly string[]).includes(segment);
}

/**
 * Whether `segment` is safe to reserve, i.e. it could never be generated as a slug. Checked
 * directly against the two conditions that make a slug a slug — length and alphabet — rather
 * than with `!isSlug(segment)`. `isSlug` also pins the *upper* bound of the slug length, and
 * this rule must not: widening the 6–8 range later must not silently make a reserved word
 * collidable just because it happens to fall inside the new range.
 */
export function cannotBeSlug(segment: string): boolean {
  return (
    segment.length < SLUG_MIN_LENGTH || [...segment].some((c) => !SLUG_ALPHABET.includes(c))
  );
}
