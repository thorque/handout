import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readTokensCss } from './parse-tokens';

/**
 * Criterion 6, machine-checked: the base components hold no hard colour or spacing values,
 * only tokens.
 *
 * This check can fail. Drop a `#fff` or a `padding: 12px` into any component and it goes
 * red — which was verified by doing exactly that before this landed.
 *
 * tokens.css itself is excluded: it is the definition and legitimately holds raw values.
 */

const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function filesUnder(directory: string, matches: (name: string) => boolean): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(full, matches));
    else if (matches(entry.name)) found.push(full);
  }
  return found;
}

const MODULE_CSS = filesUnder(SOURCE_ROOT, (name) => name.endsWith('.module.css'));
const COMPONENT_TSX = filesUnder(
  SOURCE_ROOT,
  (name) => name.endsWith('.tsx') && !name.endsWith('.test.tsx'),
);

/** Properties whose value must come from the token layer. */
function isColourish(property: string): boolean {
  return (
    property === 'color' ||
    property.startsWith('background') ||
    /^border(-\w+)?-color$/.test(property) ||
    property === 'border-color' ||
    property === 'outline-color' ||
    property === 'fill' ||
    property === 'stroke' ||
    property === 'box-shadow' ||
    // The shorthands carry a colour and a width at once, so they are checked as both.
    property === 'border' ||
    /^border-(top|right|bottom|left)$/.test(property) ||
    property === 'outline'
  );
}

function isSpaceish(property: string): boolean {
  return (
    property.startsWith('margin') ||
    property.startsWith('padding') ||
    property === 'gap' ||
    property.endsWith('-width') ||
    property.endsWith('-radius') ||
    property === 'font-size' ||
    property === 'line-height' ||
    property === 'text-underline-offset' ||
    property === 'text-decoration-thickness' ||
    property === 'letter-spacing' ||
    ['top', 'right', 'bottom', 'left'].includes(property)
  );
}

/**
 * The only values that are not design decisions: the absence of a value, a full box, the
 * browser's own answer, and the inherited text colour. Exactly the list the plan names —
 * anything beyond it belongs in tokens.css.
 */
const FREE_VALUES = new Set([
  '0',
  '100%',
  'auto',
  'inherit',
  'currentcolor',
  'transparent',
  'none',
]);

/**
 * The only keywords a checked shorthand may carry. They are shape, not colour, and no
 * colour name is among them — which is the point: `red` and `white` are not keywords here,
 * they are hard-coded colours.
 */
const LINE_STYLES = new Set(['solid', 'dashed', 'dotted']);

/** A value is allowed when nothing is left of it once tokens and free values are removed. */
export function isTokenOnly(value: string): boolean {
  let cleaned = value;
  // A token, with or without a fallback, is the allowed case. Repeated, so a nested
  // fallback collapses too.
  for (let previous = ''; cleaned !== previous;) {
    previous = cleaned;
    cleaned = cleaned.replace(/var\(\s*--[\w-]+[^()]*\)/g, ' ');
  }
  // calc() may combine tokens with bare ratios — a ratio carries no design decision.
  cleaned = cleaned.replace(/calc\(([^()]*)\)/g, ' $1 ').replace(/\s[*/+-]\s/g, ' ');

  // Anything still holding a bracket is a function this check cannot vouch for: rgb(),
  // hsl(), color-mix(), url(). Those are precisely the values that must not be here.
  if (/[()]/.test(cleaned)) return false;

  return cleaned
    .split(/[\s,]+/)
    .filter((part) => part.length > 0)
    .every((part) => {
      const lower = part.toLowerCase();
      return FREE_VALUES.has(lower) || LINE_STYLES.has(lower) || /^-?\d+(\.\d+)?$/.test(part);
    });
}

interface Declaration {
  property: string;
  value: string;
  rule: string;
}

function declarationsOf(css: string): Declaration[] {
  const found: Declaration[] = [];
  // Class bodies only; @media wrappers are transparent for this purpose.
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (match[1] ?? '').trim();
    for (const line of (match[2] ?? '').split(';')) {
      const [rawProperty, ...rest] = line.split(':');
      if (rawProperty === undefined || rest.length === 0) continue;
      const property = rawProperty.trim().toLowerCase();
      if (property.length === 0 || property.startsWith('--')) continue;
      found.push({ property, value: rest.join(':').trim(), rule: selector });
    }
  }
  return found;
}

describe('the value check itself', () => {
  // The scan is only as good as this predicate, and a predicate that says yes to
  // `rgb(1, 2, 3)` makes the whole suite decorative. So it is tested directly.
  const allowed = [
    'var(--ho-accent)',
    'var(--ho-progress, 0%)',
    '0',
    '0 auto',
    'var(--ho-space-2) 0 0',
    'currentColor',
    'transparent',
    'none',
    'inherit',
    'calc(100% + var(--ho-space-4))',
    'var(--ho-border-hairline) solid var(--ho-border)',
    'var(--ho-border-hairline) dashed var(--ho-border-strong)',
  ];

  const rejected = [
    '#fff',
    '#b23a16',
    'rgb(1, 2, 3)',
    'rgba(0, 0, 0, 0.5)',
    'hsl(20, 80%, 40%)',
    'color-mix(in srgb, var(--ho-accent), white)',
    'red',
    'white',
    'black',
    '12px',
    '1px solid var(--ho-border)',
    '0 8px 24px -10px rgba(28, 27, 24, 0.32)',
  ];

  for (const value of allowed) {
    it(`accepts ${value}`, () => {
      expect(isTokenOnly(value)).toBe(true);
    });
  }

  for (const value of rejected) {
    it(`rejects ${value}`, () => {
      expect(isTokenOnly(value)).toBe(false);
    });
  }
});

describe('token-only components', () => {
  it('finds the sources it is supposed to scan', () => {
    // A check that silently scans nothing is worse than no check at all.
    expect(MODULE_CSS.length).toBeGreaterThan(5);
    expect(COMPONENT_TSX.length).toBeGreaterThan(5);
  });

  for (const file of MODULE_CSS) {
    it(`${path.relative(SOURCE_ROOT, file)} takes colour and spacing from tokens`, () => {
      const offenders = declarationsOf(readFileSync(file, 'utf8'))
        .filter(({ property }) => isColourish(property) || isSpaceish(property))
        .filter(({ value }) => !isTokenOnly(value))
        .map(({ rule, property, value }) => `${rule} { ${property}: ${value} }`);

      expect(offenders).toEqual([]);
    });
  }

  for (const file of COMPONENT_TSX) {
    it(`${path.relative(SOURCE_ROOT, file)} carries no inline styles and no colour literals`, () => {
      const source = readFileSync(file, 'utf8');

      // A style prop is the hole every design system leaks through.
      expect(source).not.toMatch(/style=\{\{/);
      expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(source).not.toMatch(/\brgba?\(/);
      expect(source).not.toMatch(/\bhsla?\(/);
    });
  }

  it('never puts fg-subtle on surface-sunken, the one pair that misses AA', () => {
    // 4.21 light and 4.41 dark. contrast.test.ts documents why the pair is excluded; this
    // is what keeps the exclusion true instead of merely stated.
    const sources = [readTokensCss(), ...MODULE_CSS.map((file) => readFileSync(file, 'utf8'))];

    for (const css of sources) {
      for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const body = match[2] ?? '';
        const setsSubtle = /color\s*:\s*var\(\s*--ho-fg-subtle/.test(body);
        const setsSunken = /background[^:]*:\s*var\(\s*--ho-surface-sunken/.test(body);
        expect(setsSubtle && setsSunken).toBe(false);
      }
    }
  });
});
