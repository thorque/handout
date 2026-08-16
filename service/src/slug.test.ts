import { describe, expect, it } from 'vitest';
import { generateSlug, SLUG_ALPHABET, SLUG_LENGTH } from './slug';

describe('SLUG_ALPHABET', () => {
  it('leaves out everything that could collide or be misread', () => {
    // `_` would let a slug reach into the application's own /_handout/ namespace.
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
