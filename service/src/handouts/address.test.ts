import { describe, expect, it } from 'vitest';
import { addressFromPath, handoutUrl } from './address';

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

  it('decodes without rejecting traversal-shaped segments — resolveHandoutFile does that', () => {
    expect(addressFromPath('/abcdefgh/%2e%2e/x')).toEqual({
      slug: 'abcdefgh',
      rest: ['..', 'x'],
    });
  });

  it('gives undefined for a malformed escape rather than throwing', () => {
    expect(addressFromPath('/abcdefgh/%zz')).toBeUndefined();
  });

  it('gives undefined for anything that is not a valid address', () => {
    for (const pathname of ['/', '/nope', '/under_score', '/ABCDEFGH', '/abcdefghi']) {
      expect(addressFromPath(pathname), `expected undefined for "${pathname}"`).toBeUndefined();
    }
  });
});

describe('handoutUrl', () => {
  it('builds the address from the protocol and host it is given', () => {
    expect(handoutUrl({ protocol: 'https', host: 'id.example.com' }, 'abcdefgh')).toBe(
      'https://id.example.com/abcdefgh/',
    );
  });

  it('carries a port that is part of the host', () => {
    expect(handoutUrl({ protocol: 'http', host: 'localhost:3000' }, 'abcdefgh')).toBe(
      'http://localhost:3000/abcdefgh/',
    );
  });

  it('always ends with a trailing slash', () => {
    expect(
      handoutUrl({ protocol: 'https', host: 'id.example.com' }, 'abcdefgh').endsWith('/'),
    ).toBe(true);
  });
});
