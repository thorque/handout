import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The base components are there to be used. This check rejects raw interactive elements
 * outside `web/src/components/`, so a later session that reaches for `<button>` is told
 * which component to take instead of quietly growing a second one.
 *
 * **What it does not see, and must not be mistaken for.** It catches the raw *element*,
 * not a rebuild by other means: `<div role="button">` with the look copied into a CSS
 * module passes, and so does a second button component added inside `components/`. There
 * is no mechanical guard against that, and there is not meant to be one — the rule in
 * CLAUDE.md is the guard, this is the tripwire under the most common way of breaking it.
 * `token-only.test.ts` covers the other half: whatever is built, it may not hold hard
 * colour or spacing values.
 *
 * **`<a href>` is on the list too**, and not out of tidiness: a raw `<a>` is not neutral,
 * it comes out actively wrong.
 *
 * 1. *Colour.* The base rule in tokens.css is `a { color: var(--ho-accent) }`, but
 *    tokens.json reserves the accent for where something happens — "Ablegen, Ersetzen,
 *    Link kopieren". A plain link in a list therefore claims the attention that belongs to
 *    the acting actions. `.ho-link` takes `--ho-link` and reaches the accent only on hover.
 * 2. *Underline.* `.ho-link` drops it and brings it back on hover and focus, because four
 *    rows of permanently underlined actions draw a grid that means nothing.
 * 3. *Touch target.* `.ho-touch` is 30 px at a pointer and 44 px on touch. A raw `<a>` is
 *    as tall as its text.
 * 4. *Name.* `TextLink` turns `label` into both `aria-label` and `title`. A link that shows
 *    only a glyph is nameless to a screen reader without it.
 *
 * And the structural point, which is why this check exists at all: `TextLink` is an `<a>`
 * when it navigates and a `<button>` when it acts. What is rejected is not the element —
 * it is making that decision by hand, one file at a time.
 *
 * **An `<a>` without `href` is not a link** but an anchor: not focusable, no link role, and
 * `TextLink` is not its replacement. It is deliberately not counted. An `<a {...props}>`
 * *is* counted — that is how a link is written when its props come from above, and it is
 * how `TextLink` writes its own. Both forms are tested below.
 *
 * Test files are not scanned: a fixture built to exercise a component is not application
 * UI, and forcing components into fixtures would test the fixtures instead of the code.
 */

const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENTS = path.join(SOURCE_ROOT, 'components');

/**
 * What to reach for instead, per element. It goes into the failure verbatim, because
 * whoever trips this check is a later session that does not know the component yet.
 */
const INSTEAD: Record<string, string> = {
  button: 'Use Button from web/src/components/, or TextLink for a quiet inline action.',
  a:
    'Use TextLink from web/src/components/ — it renders an <a> when it navigates and a ' +
    '<button> when it acts, and making that call by hand is what this rejects. A raw <a> ' +
    'also takes the accent colour the design reserves for acting, underlines permanently, ' +
    'and is only as tall as its text.',
  input: 'Use TextField, Switch for on/off, or DropZone for a file, from web/src/components/.',
  select: 'No component exists yet — build one in web/src/components/ and use that.',
  textarea: 'No component exists yet — build one in web/src/components/ and use that.',
  dialog: 'Use Popover, or build the component this needs in web/src/components/.',
};

/** How the element is named in a failure. Only links are checked, so say so. */
const LABEL: Record<string, string> = { a: '<a href>' };

const ELEMENTS = Object.keys(INSTEAD);

interface Exception {
  /** Path relative to web/src. */
  file: string;
  element: string;
  /** Occurrences in the source. A fourth one is a new decision, not this one. */
  count: number;
  reason: string;
}

/**
 * A register, not a waiver. Every entry names a file, an element and why the component
 * would be wrong there — and the test below fails on an entry that is no longer needed,
 * so the list cannot outlive its reasons.
 */
const RAW_ELEMENT_EXCEPTIONS: Exception[] = [
  {
    file: 'pages/DesignSystemPage.tsx',
    element: 'button',
    count: 1,
    reason:
      "The sample page's local light/dark/system control. It is deliberately NOT a reusable " +
      'switcher: the one in the profile menu belongs to HAN-26, and building it here would ' +
      'hand that story a component it did not design.',
  },
];

function tsxFilesOutsideComponents(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (full !== COMPONENTS) found.push(...tsxFilesOutsideComponents(full));
    } else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) {
      found.push(full);
    }
  }
  return found;
}

/** Comments are stripped first: a doc comment naming `<button>` is prose, not markup. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

function openingTags(source: string, element: string): string[] {
  const tags: string[] = [];
  const pattern = new RegExp(`<${element}(?=[\\s/>])`, 'g');
  for (const match of source.matchAll(pattern)) {
    const end = source.indexOf('>', match.index);
    tags.push(source.slice(match.index, end === -1 ? source.length : end + 1));
  }
  return tags;
}

/** Exported so the two edge cases it has to get right are tested, not assumed. */
export function occurrences(source: string, element: string): number {
  const tags = openingTags(withoutComments(source), element);
  // Only an <a> that carries an href is a link. Without one it is an anchor: not
  // focusable, no link role, and nothing TextLink would replace. A spread counts as an
  // href, because that is how a link is usually written when the props come from above —
  // TextLink itself does exactly that, and a detection blind to it would be blind to the
  // most likely rebuild.
  if (element === 'a') return tags.filter((tag) => /\bhref\b|\{\.\.\./.test(tag)).length;
  return tags.length;
}

const FILES = tsxFilesOutsideComponents(SOURCE_ROOT);

function relative(file: string): string {
  return path.relative(SOURCE_ROOT, file);
}

function exceptionFor(file: string, element: string): Exception | undefined {
  return RAW_ELEMENT_EXCEPTIONS.find(
    (entry) => entry.file === relative(file) && entry.element === element,
  );
}

describe('use the base components', () => {
  it('finds the sources it is supposed to scan', () => {
    // A check that silently scans nothing is worse than no check at all.
    expect(FILES.length).toBeGreaterThan(2);
  });

  for (const file of FILES) {
    it(`${relative(file)} builds no interactive element of its own`, () => {
      const source = readFileSync(file, 'utf8');
      const offences: string[] = [];

      for (const element of ELEMENTS) {
        const found = occurrences(source, element);
        if (found === 0) continue;

        const allowed = exceptionFor(file, element)?.count ?? 0;
        if (found <= allowed) continue;

        offences.push(
          `${relative(file)} uses a raw ${LABEL[element] ?? `<${element}>`}. ` +
            `${INSTEAD[element] ?? 'Use a base component.'} ` +
            `The components are listed in docs/design-system.md. If none of them fits, add an ` +
            `entry to RAW_ELEMENT_EXCEPTIONS in web/src/design/component-reuse.test.ts with ` +
            `the reason.`,
        );
      }

      expect(offences).toEqual([]);
    });
  }

  it('counts a link but not an anchor, and not a tag that merely starts with the letter', () => {
    // The two edge cases the detection has to get right, tested rather than assumed.
    expect(occurrences('<a href="/f8k2p9">Adresse</a>', 'a')).toBe(1);
    expect(occurrences('<a\n  href={address}\n>Adresse</a>', 'a')).toBe(1);
    // An anchor without href is not a link and TextLink is not its replacement.
    expect(occurrences('<a id="oben" />', 'a')).toBe(0);
    // A spread may carry the href, and usually does — TextLink writes its own that way.
    expect(occurrences('<a {...anchorProps} className={classes}>', 'a')).toBe(1);
    // Neither is anything that only begins with the same letters.
    expect(occurrences('<abbr title="Zip">Zip</abbr><article>', 'a')).toBe(0);
    // A doc comment naming the element is prose, not markup.
    expect(occurrences('/* use <a href> nowhere */', 'a')).toBe(0);
    expect(occurrences('<button type="button">', 'button')).toBe(1);
  });

  it('draws its boundary at the components directory, and that boundary carries weight', () => {
    // Not an accident of which files happen to be clean: components/ is excluded by path,
    // and the components inside it are full of exactly what is rejected outside.
    for (const file of FILES) {
      expect(file.startsWith(COMPONENTS + path.sep)).toBe(false);
    }

    // TextLink renders both an <a> and a <button>; TextField renders an <input>. Every one
    // of them would fail this check outside components/, which is the whole point.
    const textLink = readFileSync(path.join(COMPONENTS, 'TextLink.tsx'), 'utf8');
    expect(occurrences(textLink, 'a')).toBeGreaterThan(0);
    expect(occurrences(textLink, 'button')).toBeGreaterThan(0);
    expect(occurrences(readFileSync(path.join(COMPONENTS, 'TextField.tsx'), 'utf8'), 'input')) //
      .toBeGreaterThan(0);
  });

  it('keeps no exception that is no longer needed', () => {
    // An entry whose reason has expired is worse than no register: it reads as permission.
    for (const entry of RAW_ELEMENT_EXCEPTIONS) {
      const file = path.join(SOURCE_ROOT, entry.file);
      const found = occurrences(readFileSync(file, 'utf8'), entry.element);
      expect(
        found,
        `RAW_ELEMENT_EXCEPTIONS says ${entry.file} has ${entry.count} raw <${entry.element}>, found ${found}`,
      ).toBe(entry.count);
    }
  });
});
