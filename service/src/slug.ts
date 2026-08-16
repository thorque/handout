/**
 * The address part of a publication. Random only: never derived from the display name, so
 * a name can never be read back out of a link, and never reissued after a deletion.
 */
import { randomInt } from 'node:crypto';

/**
 * Lowercase only — a slug gets read aloud and retyped. `0`, `1` and the letters `i`, `l`
 * and `o` they are confused with are left out, and `_` is excluded because the application
 * owns the `/_handout/` namespace (see docs/url-namespace.md).
 */
export const SLUG_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

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
