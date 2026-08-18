import { describe, expect, it } from 'vitest';
import { addressFromPath } from './address';

describe('addressFromPath', () => {
  it('resolves a bare slug', () => {
    expect(addressFromPath('/abcdefgh')).toEqual({ slug: 'abcdefgh', rest: [] });
  });

  it('drops the trailing empty part from a trailing slash', () => {
    expect(addressFromPath('/abcdefgh/')).toEqual({ slug: 'abcdefgh', rest: [] });
  });

  it('keeps the remaining segments as rest', () => {
    expect(addressFromPath('/abcdefgh/assets/app.js')).toEqual({
      slug: 'abcdefgh',
      rest: ['assets', 'app.js'],
    });
  });

  it('decodes each part', () => {
    expect(addressFromPath('/abcdefgh/a%20b.html')).toEqual({
      slug: 'abcdefgh',
      rest: ['a b.html'],
    });
  });

  it('decodes without rejecting traversal-shaped segments — resolvePublicationFile does that', () => {
    expect(addressFromPath('/abcdefgh/%2e%2e/x')).toEqual({
      slug: 'abcdefgh',
      rest: ['..', 'x'],
    });
  });

  it('gives undefined for a malformed escape rather than throwing', () => {
    expect(addressFromPath('/abcdefgh/%zz')).toBeUndefined();
  });

  it('gives undefined for anything that is not a valid address', () => {
    for (const pathname of ['/', '/nope', '/_handout', '/ABCDEFGH', '/abcdefghi']) {
      expect(addressFromPath(pathname), `expected undefined for "${pathname}"`).toBeUndefined();
    }
  });
});
