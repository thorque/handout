import { describe, expect, it } from 'vitest';
import { isReservedPath } from './namespace';

describe('isReservedPath', () => {
  it('is true for the application namespace, whole segment only', () => {
    for (const pathname of [
      '/_handout',
      '/_handout/',
      '/_handout/api/health',
      '/_handout/design/tokens.css',
    ]) {
      expect(isReservedPath(pathname), `expected true for "${pathname}"`).toBe(true);
    }
  });

  it('is false for publication space, including look-alikes', () => {
    // /_handoutx… is exactly what a bare startsWith(RESERVED_PREFIX) gets wrong.
    for (const pathname of [
      '/',
      '/_handoutx',
      '/_handoutx/api/health',
      '/_handout-old/x',
      '/x/_handout/y',
      '/abcdefgh',
    ]) {
      expect(isReservedPath(pathname), `expected false for "${pathname}"`).toBe(false);
    }
  });
});
