import { describe, expect, it } from 'vitest';
import { displayNameFrom, isHtmlFilename, MAX_DISPLAY_NAME_LENGTH } from './upload';

describe('isHtmlFilename', () => {
  it('accepts .html, case-insensitively', () => {
    expect(isHtmlFilename('prototyp.HTML')).toBe(true);
  });

  it('accepts .htm', () => {
    expect(isHtmlFilename('prototyp.htm')).toBe(true);
  });

  it('rejects a double extension that does not end in .html', () => {
    expect(isHtmlFilename('prototyp.html.txt')).toBe(false);
  });

  it('rejects a filename with no extension at all', () => {
    expect(isHtmlFilename('prototyp')).toBe(false);
  });
});

describe('displayNameFrom', () => {
  it('prefers the explicit name over the filename', () => {
    const result = displayNameFrom('Prototyp Berger & Partner', 'prototyp.html');
    expect(result).toEqual({ ok: true, displayName: 'Prototyp Berger & Partner' });
  });

  it('falls back to the filename without its extension when no explicit name is given', () => {
    const result = displayNameFrom(undefined, 'prototyp.html');
    expect(result).toEqual({ ok: true, displayName: 'prototyp' });
  });

  it('treats a blank explicit name as absent', () => {
    const result = displayNameFrom('   ', 'prototyp.html');
    expect(result).toEqual({ ok: true, displayName: 'prototyp' });
  });

  it('refuses a file literally named .html with no explicit name', () => {
    const result = displayNameFrom(undefined, '.html');
    expect(result).toEqual({ ok: false, reason: expect.any(String) });
  });

  it('refuses an explicit name longer than the limit', () => {
    const tooLong = 'a'.repeat(MAX_DISPLAY_NAME_LENGTH + 1);
    const result = displayNameFrom(tooLong, 'prototyp.html');
    expect(result).toEqual({ ok: false, reason: expect.any(String) });
  });

  it('truncates a derived name that is longer than the limit, rather than refusing it', () => {
    const longFilename = `${'a'.repeat(MAX_DISPLAY_NAME_LENGTH + 1)}.html`;
    const result = displayNameFrom(undefined, longFilename);
    expect(result).toEqual({ ok: true, displayName: 'a'.repeat(MAX_DISPLAY_NAME_LENGTH) });
  });
});
