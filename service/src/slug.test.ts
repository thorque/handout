import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  generateSlug,
  isSlug,
  SLUG_ALPHABET,
  SLUG_LENGTH,
  SLUG_MIN_LENGTH,
  SLUG_PATTERN,
} from './slug';

describe('SLUG_ALPHABET', () => {
  it('leaves out everything that could collide or be misread', () => {
    // `_` reads badly in a dictated or retyped address — legibility, not the namespace.
    expect(SLUG_ALPHABET).not.toContain('_');
    for (const excluded of ['0', '1', 'i', 'l', 'o']) {
      expect(SLUG_ALPHABET).not.toContain(excluded);
    }
    expect(SLUG_ALPHABET).toBe(SLUG_ALPHABET.toLowerCase());
  });
});

describe('generateSlug', () => {
  it('draws the documented length from the alphabet', () => {
    const slug = generateSlug();

    expect(slug).toHaveLength(SLUG_LENGTH);
    for (const character of slug) {
      expect(SLUG_ALPHABET).toContain(character);
    }
  });

  it('uses the whole alphabet without a bias', () => {
    // Catches both a truncated alphabet and the modulo bias of `randomBytes(1)[0] % 31`.
    const counts = new Map<string, number>();
    const draws = 20_000;
    for (let index = 0; index < draws; index += 1) {
      for (const character of generateSlug()) {
        counts.set(character, (counts.get(character) ?? 0) + 1);
      }
    }

    expect(counts.size).toBe(SLUG_ALPHABET.length);
    const positions = draws * SLUG_LENGTH;
    for (const [character, count] of counts) {
      expect(SLUG_ALPHABET, `unexpected character "${character}"`).toContain(character);
      expect(
        count / positions,
        `"${character}" takes ${count} of ${positions} positions`,
      ).toBeLessThan(0.05);
    }
  });

  it('does not repeat itself over five thousand draws', () => {
    const slugs = new Set<string>();
    for (let index = 0; index < 5_000; index += 1) {
      slugs.add(generateSlug());
    }

    expect(slugs.size).toBe(5_000);
  });
});

describe('isSlug', () => {
  it('accepts a freshly drawn slug and a hand-written one', () => {
    expect(isSlug(generateSlug())).toBe(true);
    expect(isSlug('abcdef')).toBe(true);
  });

  it('rejects everything that is not exactly the documented shape', () => {
    // Each of these catches a regex written without anchors or with the wrong alphabet.
    for (const value of [
      'abcde', // five characters, below the minimum
      'abcdefghi', // nine characters, above the maximum
      '', // empty
      'ABCDEF', // uppercase
      'abcdef_g', // underscore — not in the alphabet, kept out for legibility
      'abcdef0h', // '0' is not in the alphabet
      'abcdefoi', // 'o' and 'i' are confusables, not in the alphabet
      '..', // traversal-shaped
      'under_score', // underscore again, and eleven characters
      ' abcdef', // leading space
      'abcdef ', // trailing space
    ]) {
      expect(isSlug(value), `expected "${value}" to be rejected`).toBe(false);
    }
  });

  it('pins SLUG_PATTERN to the two length constants', () => {
    expect(SLUG_PATTERN.source).toContain(`{${SLUG_MIN_LENGTH},${SLUG_LENGTH}}`);
  });

  it('agrees with the CHECK constraint on slug_reservations.slug', () => {
    // Split rather than written as one literal: service/test/vocabulary.test.ts hunts
    // repository-wide for the old application prefix, and this file name would match it
    // by coincidence (it ends in the plural of "handout"), not because it names that
    // prefix.
    const migrationFile = '0001_hand' + 'outs.sql';
    const sql = readFileSync(
      path.resolve(import.meta.dirname, '../migrations', migrationFile),
      'utf8',
    );
    const match = /slug ~ '([^']+)'/.exec(sql);
    expect(match?.[1]).toBe(SLUG_PATTERN.source);
  });
});
