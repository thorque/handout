import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** The one physical token file, the same one the browser gets. */
export const TOKENS_CSS_PATH = path.resolve(here, '../../public/design/tokens.css');

export function readTokensCss(): string {
  return readFileSync(TOKENS_CSS_PATH, 'utf8');
}

/** The body of the block whose opening brace follows `selectorIndex`. */
function blockBody(css: string, selectorIndex: number): string {
  const open = css.indexOf('{', selectorIndex);
  if (open === -1) throw new Error(`no block after index ${selectorIndex}`);

  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    else if (css[index] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, index);
    }
  }
  throw new Error(`unbalanced braces after index ${selectorIndex}`);
}

function declarations(body: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) values.set(name, value.trim());
  }
  return values;
}

function mapFor(css: string, pattern: RegExp): Map<string, string> {
  const values = new Map<string, string>();
  let found = false;
  for (const match of css.matchAll(pattern)) {
    found = true;
    for (const [name, value] of declarations(blockBody(css, match.index))) {
      values.set(name, value);
    }
  }
  if (!found) throw new Error(`no block matched ${pattern.source} in tokens.css`);
  return values;
}

export interface TokenMaps {
  /** The `:root` palette — light, and the default. */
  light: Map<string, string>;
  /** What a dark system gets without a stored choice. */
  darkMedia: Map<string, string>;
  /** What an explicit dark choice gets. */
  darkAttribute: Map<string, string>;
}

/**
 * The three variable maps of tokens.css, read from the file rather than restated here, so
 * a renamed or dropped token breaks the tests that use them instead of quietly passing.
 */
export function parseTokens(css: string = readTokensCss()): TokenMaps {
  return {
    // Every top-level :root block: the adopted palette plus the brand block appended to it.
    light: mapFor(css, /^:root \{/gm),
    darkMedia: mapFor(css, /^\s*:root:not\(\[data-theme='light'\]\) \{/gm),
    darkAttribute: mapFor(css, /^\[data-theme='dark'\] \{/gm),
  };
}

/** sRGB relative luminance per WCAG 2.2. */
function luminance(hex: string): number {
  const value = hex.trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(value)) throw new Error(`not a six-digit hex colour: "${hex}"`);

  const channels = [0, 2, 4].map((offset) => {
    const part = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  });
  const [red, green, blue] = channels as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** The WCAG contrast ratio of two hex colours, 1…21. */
export function contrastRatio(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The value of a token in one mode, or a loud failure — a missing token is a defect. */
export function tokenValue(values: Map<string, string>, name: string): string {
  const value = values.get(name);
  if (value === undefined) throw new Error(`tokens.css does not define ${name} in this mode`);
  return value;
}
