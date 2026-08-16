# The design system in this repository

Tokens, fonts, brand assets and the base components, and the rules that keep them one
system rather than a starting point everyone drifts from.

## One file, two consumers

The whole token layer is **one physical file**:

```
web/public/_handout/design/tokens.css   →   /_handout/design/tokens.css
```

The React application links it from `web/index.html`. A page without React — the recipient
password page, and `no-react.html` next to it today — links the same URL. There is no
second copy, no import into JavaScript and no build step, which is what makes "single
source of truth" a fact rather than a claim.

It lives under `public/_handout/`, never `public/design/`: `/design/…` at the root is
publication space and `design` is six characters, so a generated slug could collide with
it. See [`url-namespace.md`](url-namespace.md).

Vite serves `public/` verbatim at the dev-server root and copies it into `dist/` with the
filenames intact, so the URL is stable and unhashed in development and in a build alike.

## Where it comes from, and what happens to a change

The file is the **frozen 1.0.0 export** of the design project
(`tokens.json` → `$meta.version: "1.0.0"`), adopted verbatim and then reformatted by
Prettier — whitespace and hex case only, no value changed. The only deliberate additions
are named below.

**Once this story landed, the repository copy — not the export — is the source of truth.**
A later design change is a new export plus its own story, never a silent edit on either
side.

`tokens.json` was deliberately **not** brought in. With `tokens.css` consumed directly by
both consumers, a JSON copy would have no consumer and no generator: a second set of values
that can drift, which is the exact failure this story exists to prevent. Revisit it when
something actually needs the tokens as data — a Figma sync, a JavaScript theme object.

Three values were added to `tokens.css` because the design draws them but does not name
them: `--ho-brand-tracking` (-0.02em), `--ho-brand-mark` (32px) and `--ho-popover-width`
(292px). They are in the token file rather than in the components that need them.

## The three theme states

| State                | Stored                | On `<html>`          | What decides           |
| -------------------- | --------------------- | -------------------- | ---------------------- |
| System (the default) | nothing               | no `data-theme`      | `prefers-color-scheme` |
| Hell                 | `handout.theme=light` | `data-theme="light"` | the attribute          |
| Dunkel               | `handout.theme=dark`  | `data-theme="dark"`  | the attribute          |

`'system'` is the **absence** of the key, never a stored string. That is what lets the
four-line init script and the provider make the same statement, and it is why going back
to system _removes_ the attribute instead of writing one — the `@media` rule then takes
over on the next style recalculation, with no reload.

The structure in `tokens.css` is exactly what the criteria need and must not be
restructured into anything cleverer:

```css
:root {
  /* light */
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    /* dark */
  }
}
[data-theme='dark'] {
  /* dark */
}
```

The `:not()` in the middle block is what lets an explicit light choice win over a dark OS.

### Why the resolution is a blocking script, not a React effect

`/_handout/design/theme-init.js` is a **classic** script — no `module`, no `defer`, no
`async` — so the parser blocks on it and nothing is painted before it has run. A React
`useEffect` that sets the theme would paint light first and then flip; that flash is what
this file prevents, and it is why the resolution does not live in the provider.

It is a file rather than an inline snippet because the server-rendered password page needs
the identical behaviour and would otherwise carry a copy of it.

### The `useTheme` contract

`web/src/theme/useTheme.ts` is the surface the appearance switcher in the profile menu
(HAN-26) attaches to:

```ts
type ThemePreference = 'system' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  preference: ThemePreference; // what is stored; 'system' means nothing is
  resolved: ResolvedTheme; // what is on screen, for the switcher's display only
  setPreference: (next: ThemePreference) => void;
}
```

`resolved` never paints anything — all painting is CSS via the attribute. The provider
subscribes to `matchMedia('(prefers-color-scheme: dark)')` rather than reading it once, so
a system change lands while the application is open. Storage and `matchMedia` are both
guarded: local storage throws in private mode and on an opaque origin, and a server-rendered
page has no `matchMedia` at all.

## The token-only rule

Colours, spacings, radii and states come from tokens. No component holds a raw value.

`web/src/design/token-only.test.ts` enforces it: it scans every `*.module.css` and every
non-test `*.tsx` under `web/src/` and fails on a colour-ish or space-ish declaration whose
value is not a `var(--ho-…)`, a free value (`0`, `100%`, `auto`, `inherit`, `currentColor`,
`transparent`, `none`) or a `calc()` built from those; and on any `style={{ … }}` prop or
colour literal in a component. `tokens.css` itself is excluded — it is the definition.

The check was verified by breaking it on purpose: a `padding: 12px`, a `#fff` and a style
prop each turn it red.

One place where a measured value legitimately reaches an element — the drop zone's
progress percentage — and it goes there as a custom property rather than as a style prop,
so every value a component _chooses_ stays in the token layer.

## Contrast

Target, quoted from the design's own `tokens.json` (`$meta.contrastTarget`):
**WCAG 2.2 AA — text 4.5:1, large text and UI 3:1.** Nothing in this repository claims a
large-text exception, so there is no 3:1 text pair.

`web/src/design/contrast.test.ts` computes the ratio for every pair the class layer
actually produces, in all three variable maps, and asserts both the threshold and the value
measured when this landed — a token that drifts by a hair still clears `>= 4.5` but fails
the measured value.

| Pair                                     | Light | Dark  | Threshold |
| ---------------------------------------- | ----- | ----- | --------- |
| `--ho-fg` on `--ho-bg`                   | 14.59 | 15.04 | 4.5       |
| `--ho-fg` on `--ho-surface`              | 16.35 | 13.71 | 4.5       |
| `--ho-fg` on `--ho-surface-sunken`       | 13.44 | 12.23 | 4.5       |
| `--ho-fg-muted` on `--ho-bg`             | 5.73  | 7.39  | 4.5       |
| `--ho-fg-muted` on `--ho-surface`        | 6.42  | 6.74  | 4.5       |
| `--ho-fg-muted` on `--ho-surface-sunken` | 5.28  | 6.01  | 4.5       |
| `--ho-fg-subtle` on `--ho-bg`            | 4.57  | 5.42  | 4.5       |
| `--ho-fg-subtle` on `--ho-surface`       | 5.12  | 4.94  | 4.5       |
| `--ho-accent-fg` on `--ho-accent`        | 5.98  | 7.07  | 4.5       |
| `--ho-accent-fg` on `--ho-accent-hover`  | 7.86  | 8.55  | 4.5       |
| `--ho-critical-fg` on `--ho-critical`    | 16.35 | 15.04 | 4.5       |
| `--ho-link` on `--ho-bg`                 | 5.73  | 7.39  | 4.5       |
| `--ho-link` on `--ho-surface`            | 6.42  | 6.74  | 4.5       |
| `--ho-link-hover` on `--ho-bg`           | 5.07  | 7.01  | 4.5       |
| `--ho-link-hover` on `--ho-surface`      | 5.68  | 6.39  | 4.5       |
| `--ho-accent` on `--ho-bg`               | 5.07  | 7.01  | 4.5       |
| `--ho-accent` on `--ho-surface`          | 5.68  | 6.39  | 4.5       |
| `--ho-accent` on `--ho-surface-sunken`   | 4.67  | 5.70  | 4.5       |
| `--ho-error` on `--ho-surface`           | 7.88  | 6.58  | 4.5       |
| `--ho-error` on `--ho-error-quiet`       | 6.74  | 6.10  | 4.5       |
| `--ho-success` on `--ho-success-quiet`   | 5.06  | 6.68  | 4.5       |
| `--ho-warning` on `--ho-warning-quiet`   | 5.84  | 7.46  | 4.5       |
| `--ho-focus` on `--ho-bg`                | 5.07  | 7.01  | 3.0       |
| `--ho-focus` on `--ho-surface`           | 5.68  | 6.39  | 3.0       |
| `--ho-focus` on `--ho-surface-sunken`    | 4.67  | 5.70  | 3.0       |

### Two documented non-pairs

- **`--ho-fg-subtle` on `--ho-surface-sunken` — 4.21 light, 4.41 dark, both under 4.5.**
  The design flags the light case itself; the dark one it does not mention. No rule
  combines them: `.ho-label`, the only consumer of `fg-subtle`, sits on the page or on a
  card, and `.ho-drop`, the only sunken surface carrying text, uses `fg` and `fg-muted`
  (5.28 / 6.01). That assumption is not left as a note — `token-only.test.ts` fails if any
  rule ever does combine them.
- **`--ho-border` against any surface — 1.33 to 1.50.** It separates areas of the same
  surface (card edge, row divider). WCAG 1.4.11 covers boundaries required to _identify_ a
  control, not every line.

### The open deviation: `--ho-border-strong`

`--ho-border-strong` is the border of `.ho-input` and `.ho-btn--secondary` — the line that
_identifies_ those controls — and it does **not** reach the 3:1 the design sets for itself:

| Pair                                          | Light | Dark |
| --------------------------------------------- | ----- | ---- |
| `--ho-border-strong` on `--ho-bg`             | 1.87  | 2.18 |
| `--ho-border-strong` on `--ho-surface`        | 2.10  | 1.99 |
| `--ho-border-strong` on `--ho-surface-sunken` | 1.73  | 1.77 |

The token is **not** changed here. Darkening it changes every input and every secondary
button, which is a design decision. The six numbers are asserted in the `known deviations`
group of `contrast.test.ts` **without a threshold**, so the day anyone changes the token —
in either direction — the test fails and forces this record to be updated.

Computed candidates that reach 3:1 against the worst surface in each mode while keeping the
hue: **light `#868276`** (3.26 / 3.66 / 3.01), **dark `#75716A`** (3.74 / 3.41 / 3.04).

## Fonts

Public Sans and IBM Plex Mono ship with the application, under
`/_handout/design/fonts/`. Nothing is loaded from Google: Handout promises recipients no
consent banner, and that promise starts with the font.

- **Weights**, exactly the design's: Public Sans 400 / 500 / 700, IBM Plex Mono 400 / 500.
  Five files. The `design-fonts` smoke check asserts exactly five `@font-face` blocks, so a
  dropped weight fails instead of degrading to a fallback nobody notices.
- **Subset `latin` only.** German needs ä/ö/ü/ß, all of them in `latin`. A later story that
  needs more adds the subset and the `unicode-range` that goes with it — which is why the
  `@font-face` blocks are hand-written.
- **`font-display: swap`**, as the design's own Google URL asks for. Never `block`: a
  publisher waiting on a blank header is worse than a reflow.
- The files are **copied, not imported**: the password page has no bundler, and a
  Vite-resolved import would give the built application a hashed URL a hand-written
  `@font-face` cannot name.
- The OFL-1.1 notices travel next to the files as `OFL-PublicSans.txt` and
  `OFL-IBMPlexMono.txt`.

Reproducing the copy, or bumping the version (run from the project root):

```
npm i -D -w web @fontsource/public-sans@5.3.0 @fontsource/ibm-plex-mono@5.3.0
ls node_modules/@fontsource/public-sans/files/ | grep -- '-latin-'
ls node_modules/@fontsource/ibm-plex-mono/files/ | grep -- '-latin-'
mkdir -p web/public/_handout/design/fonts
cp node_modules/@fontsource/public-sans/files/public-sans-latin-{400,500,700}-normal.woff2 \
   web/public/_handout/design/fonts/
cp node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-{400,500}-normal.woff2 \
   web/public/_handout/design/fonts/
cp node_modules/@fontsource/public-sans/LICENSE   web/public/_handout/design/fonts/OFL-PublicSans.txt
cp node_modules/@fontsource/ibm-plex-mono/LICENSE web/public/_handout/design/fonts/OFL-IBMPlexMono.txt
npm uninstall -w web @fontsource/public-sans @fontsource/ibm-plex-mono
```

The packages are uninstalled again: nothing imports them, so leaving them in `package.json`
would claim a dependency the build does not have.

## The brand

There is no logo file in the export — the mark is built from two nested boxes. The geometry,
as the design draws it at all three sizes:

| Use              | Box     | Border | Radius | Accent square | Offset past bottom-right |
| ---------------- | ------- | ------ | ------ | ------------- | ------------------------ |
| Display (header) | 32 × 32 | 2.5 px | 2 px   | 14 × 14       | 7 px right, 7 px bottom  |
| Favicon 24       | 24 × 24 | 2 px   | 2 px   | 10 × 10       | 5 px right, 5 px bottom  |
| Favicon 16       | 16 × 16 | 1.5 px | 1 px   | 7 × 7         | 3 px right, 3 px bottom  |

The rule behind the three: the accent square is ≈ 0.44 × the box and is centred on the box's
bottom-right corner. One SVG is authored from the 24 px cell (`viewBox="0 0 29 29"`, frame
1…23 with a 2-wide stroke, square 19…29) and scales.

| File                                                                      | Colours                                                                |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `brand/mark.svg`, `brand/wordmark.svg`, `brand/favicon.svg`               | literals, in an internal `<style>` with a `prefers-color-scheme` block |
| `web/src/components/Wordmark.tsx`, and the inline copy in `no-react.html` | `currentColor` and `var(--ho-accent)`, live                            |

**The colour literals in the three files under `brand/` are the one sanctioned duplication
of token values in this repository**, and they are why those files carry a
`prefers-color-scheme` block of their own.

### On a page, the mark goes inline. Never `<img>`.

Two facts about a referenced SVG, both **measured in the browser**, not assumed:

1. It is a **document of its own** and inherits nothing from the page — not the custom
   properties, and not `currentColor`, which resolves against the embedded document's own
   near-black initial colour. A mark drawn with `currentColor` therefore stands near-black
   on the dark page, at about 1.1:1.
2. It **does** evaluate `prefers-color-scheme`, against the **operating system**. That is
   what makes the internal block work — and it is also why the block alone is not enough:
   the file follows the system while the page follows `data-theme`, so with a dark system
   and the page set to light the mark appears in its dark colours on sand and is gone. That
   is not a corner case; it is the state the page was first opened in.

So a mark **on a page is written inline**, where it inherits `currentColor` and reads
`var(--ho-accent)` and therefore follows the page in both modes and under an explicit
choice. `Wordmark.tsx` does this for the application, and `no-react.html` does it by hand,
which is the route HAN-20's password page has to take. The `design-no-react-page` smoke
check fails if an `<img>` or a reference to a brand file reappears on that page.

The three files under `brand/` keep their internal blocks: they are the fallback for every
embedding that _cannot_ be inline. A favicon is the clearest of those — it cannot be inline
by nature, and following the operating system is right for it.

No `.ico` ships: ImageMagick is present in this container but has no SVG delegate, so a
generated icon could not be verified. Older Safari therefore shows no icon, which is
accepted for an internal tool.

## The sample page

<http://handout-5173.localhost/_handout/design-system> shows every base component in every
state, with the state's name next to it, and carries its own light/dark/system control. It
is what a review by hand is held against, and the reference later UI stories build from.

Its three appearance buttons are deliberately **not** a reusable switcher: the one in the
profile menu belongs to HAN-26, and building it here would hand that story a component it
did not design.

`/_handout/design/no-react.html` is the same tokens without React — the shape the password
page will have.

## The components

Every component wraps the `.ho-*` class from `tokens.css` and adds only what the class
layer has no shape for. That is not a style preference: it is what keeps the React
application and a server-rendered page looking identical without the page rebuilding
anything. If a component's module CSS starts restating the look of its class, that is the
signal to go back to the class.

Two rules that are easy to get backwards, both from the design:

- **`critical` is neutral near-black, not red.** Deleting and replacing use it. `error` is
  for form errors only, and never stands without text.
- **There is no green "protected" badge.** Protection is the normal case; the _unprotected_
  case is the highlighted one, because it is the one that should catch the eye when scanning
  the list. Both carry a word and a padlock, closed or open, in the same shape and weight.

**No state is carried by colour alone**, and each carrier is asserted in the component's
test: `aria-invalid` plus a described message with a glyph plus a thicker border; a word
plus `aria-checked` plus the knob position; a border _style_ change plus different text;
an underline together with the colour change on a link. Focus is a ring from `--ho-focus`,
defined once in `tokens.css` and never restated per component.

The `Popover` carries the design's obligations in full: `aria-haspopup="dialog"` and
`aria-expanded` on the trigger, `role="dialog"` on a panel that exists only while open,
focus moving into it, measured placement (below, above when there is no room, never over
the trigger), and three close paths — the "Schließen" button, `Escape` and a click beside
it.

**What the focus does when it closes**, because it is the part that is easy to get wrong in
both directions: "Schließen" and `Escape` always put it back on the trigger. A click beside
the popover does the same **when it landed on nothing focusable** — otherwise the focus
would fall onto `<body>`, and that loss is what the design guards against. A click that
landed on another control leaves the focus there: taking it back would mean a field the
user just clicked cannot be typed into.

The tab cycle inside the panel is ours: the design is silent on `Tab`, and it follows from
`role="dialog"`.
