import { describe, expect, it } from 'vitest';
import { contrastRatio, parseTokens, tokenValue } from './parse-tokens';

/**
 * Criterion 7, machine-checked: text and controls reach at least AA in both modes.
 *
 * The target is the design's own, quoted from tokens.json ($meta.contrastTarget):
 * "WCAG 2.2 AA (Text 4.5:1, große Schrift und UI 3:1)". Nothing in this repository claims
 * a large-text exception, so there is no 3:1 text pair here.
 *
 * The pairs are the ones the class layer actually puts on top of each other — a cross
 * product of every colour against every surface would measure combinations no rule
 * produces, and would go red on a token that is perfectly fine.
 *
 * Each pair is asserted twice: against the threshold, and against the value measured at
 * the time this landed. A token that drifts by a hair still clears `>= 4.5` but fails the
 * measured value, so an unannounced design change surfaces here instead of in a screenshot.
 *
 * Two documented non-pairs, deliberately not asserted:
 *
 * - `--ho-fg-subtle` on `--ho-surface-sunken` — 4.21 light, 4.41 dark, both under 4.5. The
 *   design flags the light case itself; the dark one it does not mention. No rule combines
 *   them: `.ho-label`, the only consumer of fg-subtle, sits on the page or on a card, and
 *   `.ho-drop`, the only sunken surface carrying text, uses fg and fg-muted (5.28 / 6.01).
 *   That assumption is not left as a note — token-only.test.ts fails if any rule ever does
 *   combine them.
 * - `--ho-border` against any surface — 1.33 to 1.50. It separates areas of the same
 *   surface (card edge, row divider). 1.4.11 covers boundaries required to identify a
 *   control, not every line.
 */

const TEXT = 4.5;
const UI = 3;

interface Pair {
  foreground: string;
  background: string;
  light: number;
  dark: number;
  threshold: number;
}

const PAIRS: Pair[] = [
  { foreground: '--ho-fg', background: '--ho-bg', light: 14.59, dark: 15.04, threshold: TEXT },
  { foreground: '--ho-fg', background: '--ho-surface', light: 16.35, dark: 13.71, threshold: TEXT },
  {
    foreground: '--ho-fg',
    background: '--ho-surface-sunken',
    light: 13.44,
    dark: 12.23,
    threshold: TEXT,
  },
  { foreground: '--ho-fg-muted', background: '--ho-bg', light: 5.73, dark: 7.39, threshold: TEXT },
  {
    foreground: '--ho-fg-muted',
    background: '--ho-surface',
    light: 6.42,
    dark: 6.74,
    threshold: TEXT,
  },
  {
    foreground: '--ho-fg-muted',
    background: '--ho-surface-sunken',
    light: 5.28,
    dark: 6.01,
    threshold: TEXT,
  },
  { foreground: '--ho-fg-subtle', background: '--ho-bg', light: 4.57, dark: 5.42, threshold: TEXT },
  {
    foreground: '--ho-fg-subtle',
    background: '--ho-surface',
    light: 5.12,
    dark: 4.94,
    threshold: TEXT,
  },
  {
    foreground: '--ho-accent-fg',
    background: '--ho-accent',
    light: 5.98,
    dark: 7.07,
    threshold: TEXT,
  },
  {
    foreground: '--ho-accent-fg',
    background: '--ho-accent-hover',
    light: 7.86,
    dark: 8.55,
    threshold: TEXT,
  },
  {
    foreground: '--ho-critical-fg',
    background: '--ho-critical',
    light: 16.35,
    dark: 15.04,
    threshold: TEXT,
  },
  { foreground: '--ho-link', background: '--ho-bg', light: 5.73, dark: 7.39, threshold: TEXT },
  { foreground: '--ho-link', background: '--ho-surface', light: 6.42, dark: 6.74, threshold: TEXT },
  {
    foreground: '--ho-link-hover',
    background: '--ho-bg',
    light: 5.07,
    dark: 7.01,
    threshold: TEXT,
  },
  {
    foreground: '--ho-link-hover',
    background: '--ho-surface',
    light: 5.68,
    dark: 6.39,
    threshold: TEXT,
  },
  { foreground: '--ho-accent', background: '--ho-bg', light: 5.07, dark: 7.01, threshold: TEXT },
  {
    foreground: '--ho-accent',
    background: '--ho-surface',
    light: 5.68,
    dark: 6.39,
    threshold: TEXT,
  },
  {
    foreground: '--ho-accent',
    background: '--ho-surface-sunken',
    light: 4.67,
    dark: 5.7,
    threshold: TEXT,
  },
  {
    foreground: '--ho-error',
    background: '--ho-surface',
    light: 7.88,
    dark: 6.58,
    threshold: TEXT,
  },
  {
    foreground: '--ho-error',
    background: '--ho-error-quiet',
    light: 6.74,
    dark: 6.1,
    threshold: TEXT,
  },
  {
    foreground: '--ho-success',
    background: '--ho-success-quiet',
    light: 5.06,
    dark: 6.68,
    threshold: TEXT,
  },
  {
    foreground: '--ho-warning',
    background: '--ho-warning-quiet',
    light: 5.84,
    dark: 7.46,
    threshold: TEXT,
  },
  { foreground: '--ho-focus', background: '--ho-bg', light: 5.07, dark: 7.01, threshold: UI },
  { foreground: '--ho-focus', background: '--ho-surface', light: 5.68, dark: 6.39, threshold: UI },
  {
    foreground: '--ho-focus',
    background: '--ho-surface-sunken',
    light: 4.67,
    dark: 5.7,
    threshold: UI,
  },
  // The border that identifies an input, a secondary button and the drop zone. Tokens
  // 1.0.1 darkened it for exactly this: it now clears the 3:1 the design sets itself, on
  // every surface it is drawn on, in both modes.
  {
    foreground: '--ho-border-strong',
    background: '--ho-bg',
    light: 3.3,
    dark: 3.73,
    threshold: UI,
  },
  {
    foreground: '--ho-border-strong',
    background: '--ho-surface',
    light: 3.7,
    dark: 3.4,
    threshold: UI,
  },
  {
    foreground: '--ho-border-strong',
    background: '--ho-surface-sunken',
    light: 3.04,
    dark: 3.03,
    threshold: UI,
  },
];

const tokens = parseTokens();

const MODES = [
  { name: 'light', values: tokens.light, recorded: (pair: Omit<Pair, 'threshold'>) => pair.light },
  {
    name: 'dark, by media query',
    values: tokens.darkMedia,
    recorded: (pair: Omit<Pair, 'threshold'>) => pair.dark,
  },
  {
    name: 'dark, by attribute',
    values: tokens.darkAttribute,
    recorded: (pair: Omit<Pair, 'threshold'>) => pair.dark,
  },
];

describe('contrast', () => {
  for (const mode of MODES) {
    for (const pair of PAIRS) {
      it(`${pair.foreground} on ${pair.background}, ${mode.name}`, () => {
        const ratio = contrastRatio(
          tokenValue(mode.values, pair.foreground),
          tokenValue(mode.values, pair.background),
        );

        expect(ratio).toBeGreaterThanOrEqual(pair.threshold);
        expect(ratio).toBeCloseTo(mode.recorded(pair), 1);
      });
    }
  }

  it('defines the same values whether dark comes from the system or from a choice', () => {
    // Invisible by eye, because you never see both at once.
    const names = new Set([...tokens.darkMedia.keys(), ...tokens.darkAttribute.keys()]);
    for (const name of names) {
      expect(tokens.darkAttribute.get(name)).toBe(tokens.darkMedia.get(name));
    }
    expect(names.size).toBeGreaterThan(0);
  });
});
