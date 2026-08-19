import { describe, expect, it } from 'vitest';
import { cannotBeSlug, isReservedPath, RESERVED_SEGMENTS } from './namespace';

describe('isReservedPath', () => {
  it('is true for the application namespace, whole segment only', () => {
    for (const pathname of [
      '/app',
      '/app/',
      '/app/design/tokens.css',
      '/api',
      '/api/health',
      '/unlock',
      '/unlock/abcdefgh',
    ]) {
      expect(isReservedPath(pathname), `expected true for "${pathname}"`).toBe(true);
    }
  });

  it('is false for handout space, including look-alikes', () => {
    // /appleee, /apiiiii… are exactly what a bare startsWith would get wrong.
    for (const pathname of [
      '/',
      '/appleee',
      '/apiiiii',
      '/unlockable',
      '/abcdefgh',
      '/x/app/y',
    ]) {
      expect(isReservedPath(pathname), `expected false for "${pathname}"`).toBe(false);
    }
  });
});

describe('cannotBeSlug', () => {
  it('holds for every reserved segment', () => {
    for (const segment of RESERVED_SEGMENTS) {
      expect(cannotBeSlug(segment), `expected "${segment}" to never be a slug`).toBe(true);
    }
  });

  // Controls: without them the rule could return true for everything and the test above
  // would still pass. `assets` and `kaffee` are six lowercase letters from the slug
  // alphabet each, so they must be able to be a slug.
  it('does not hold for a word that happens to be a legal slug', () => {
    expect(cannotBeSlug('assets')).toBe(false);
    expect(cannotBeSlug('kaffee')).toBe(false);
  });
});
