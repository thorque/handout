/**
 * The address part of a publication. Random only: never derived from the display name, so
 * a name can never be read back out of a link, and never reissued after a deletion.
 */
import { randomInt } from 'node:crypto';

/**
 * Lowercase only — a slug gets read aloud and retyped. `0`, `1` and the letters `i`, `l`
 * and `o` they are confused with are left out, and `_` stays out too: it reads badly in a
 * dictated or retyped address, so it is not taken back in even though the namespace no
 * longer needs it excluded (see docs/url-namespace.md).
 */
export const SLUG_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

/**
 * Six characters, the bottom of the six-to-eight range the brief permits. The lower bound
 * the collision rule in `namespace.ts` is built on: a reserved word shorter than this can
 * never be generated as a slug regardless of alphabet.
 */
export const SLUG_MIN_LENGTH = 6;

/**
 * Eight characters, the top of the six-to-eight range the brief permits: 31⁸ ≈ 8.5·10¹¹
 * puts both collisions and enumeration out of reach.
 */
export const SLUG_LENGTH = 8;

/**
 * Draws a slug from a cryptographically secure source. `randomInt` rejection-samples, so
 * there is no modulo bias — `randomBytes(1)[0] % 31` would favour the first characters.
 */
export function generateSlug(): string {
  let slug = '';
  for (let index = 0; index < SLUG_LENGTH; index += 1) {
    slug += SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)];
  }
  return slug;
}

/**
 * The shape a valid address part has: six to eight characters from {@link SLUG_ALPHABET}.
 * Character-for-character the CHECK constraint on `slug_reservations.slug` in
 * `service/migrations/0001_publications.sql` — a test pins the two together.
 */
export const SLUG_PATTERN = /^[23456789abcdefghjkmnpqrstuvwxyz]{6,8}$/;

/** Whether `value` could be a publication's address part. */
export function isSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}
