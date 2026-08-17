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

The file is the **frozen 1.0.2 export** of the design project
(`tokens.json` → `$meta.version`), adopted verbatim and then reformatted by Prettier —
whitespace and hex case only, no value changed. The only deliberate additions are named
below.

**Once this story landed, the repository copy — not the export — is the source of truth.**
A design change is a new export, never a silent edit on either side.

1.0.1 and 1.0.2 are such changes, and the first ones: `--ho-border-strong` was darkened in
the design system so the border that identifies a control reaches the 3:1 the design sets
itself — `#B4AE9E → #868276 → #858175` in light, `#524E45 → #75716A` in dark. They landed
inside this story because the deviation was raised here and decided here; the next one gets
its own story.

`tokens.json` was deliberately **not** brought in. With `tokens.css` consumed directly by
both consumers, a JSON copy would have no consumer and no generator: a second set of values
that can drift, which is the exact failure this story exists to prevent. Revisit it when
something actually needs the tokens as data — a Figma sync, a JavaScript theme object.

Seven values were added to `tokens.css` because the design draws them but does not name
them: `--ho-brand-tracking` (-0.02em), `--ho-brand-mark` (32px), `--ho-popover-width`
(292px) and `--ho-secret-tracking` (0.14em, the spacing of a masked password), and with the
application frame `--ho-brand-mark-header` (18px, the header lockup), `--ho-menu-width`
(232px, the account menu) and `--ho-account-mark` (32px, the profile mark — `--ho-control`
is 36px and means a control). They are in the token file rather than in the components that
need them.

Two lengths the account menu draws were **not** added but rounded onto the scale instead:
its 14 px of horizontal padding becomes `--ho-space-6` (16px) and the 5 px between a check
glyph and its word becomes `--ho-space-3` (6px). The scale has no 14 and no 5, and a
`calc()` reproducing the number would hide the decision. Two pixels are invisible; a value
off the scale is not.

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

| Pair                                          | Light | Dark  | Threshold |
| --------------------------------------------- | ----- | ----- | --------- |
| `--ho-fg` on `--ho-bg`                        | 14.59 | 15.04 | 4.5       |
| `--ho-fg` on `--ho-surface`                   | 16.35 | 13.71 | 4.5       |
| `--ho-fg` on `--ho-surface-sunken`            | 13.44 | 12.23 | 4.5       |
| `--ho-fg-muted` on `--ho-bg`                  | 5.73  | 7.39  | 4.5       |
| `--ho-fg-muted` on `--ho-surface`             | 6.42  | 6.74  | 4.5       |
| `--ho-fg-muted` on `--ho-surface-sunken`      | 5.28  | 6.01  | 4.5       |
| `--ho-fg-subtle` on `--ho-bg`                 | 4.57  | 5.42  | 4.5       |
| `--ho-fg-subtle` on `--ho-surface`            | 5.12  | 4.94  | 4.5       |
| `--ho-accent-fg` on `--ho-accent`             | 5.98  | 7.07  | 4.5       |
| `--ho-accent-fg` on `--ho-accent-hover`       | 7.86  | 8.55  | 4.5       |
| `--ho-critical-fg` on `--ho-critical`         | 16.35 | 15.04 | 4.5       |
| `--ho-link` on `--ho-bg`                      | 5.73  | 7.39  | 4.5       |
| `--ho-link` on `--ho-surface`                 | 6.42  | 6.74  | 4.5       |
| `--ho-link-hover` on `--ho-bg`                | 5.07  | 7.01  | 4.5       |
| `--ho-link-hover` on `--ho-surface`           | 5.68  | 6.39  | 4.5       |
| `--ho-accent` on `--ho-bg`                    | 5.07  | 7.01  | 4.5       |
| `--ho-accent` on `--ho-surface`               | 5.68  | 6.39  | 4.5       |
| `--ho-accent` on `--ho-surface-sunken`        | 4.67  | 5.70  | 4.5       |
| `--ho-error` on `--ho-surface`                | 7.88  | 6.58  | 4.5       |
| `--ho-error` on `--ho-error-quiet`            | 6.74  | 6.10  | 4.5       |
| `--ho-success` on `--ho-success-quiet`        | 5.06  | 6.68  | 4.5       |
| `--ho-warning` on `--ho-warning-quiet`        | 5.84  | 7.46  | 4.5       |
| `--ho-focus` on `--ho-bg`                     | 5.07  | 7.01  | 3.0       |
| `--ho-focus` on `--ho-surface`                | 5.68  | 6.39  | 3.0       |
| `--ho-focus` on `--ho-surface-sunken`         | 4.67  | 5.70  | 3.0       |
| `--ho-border-strong` on `--ho-bg`             | 3.30  | 3.73  | 3.0       |
| `--ho-border-strong` on `--ho-surface`        | 3.70  | 3.40  | 3.0       |
| `--ho-border-strong` on `--ho-surface-sunken` | 3.04  | 3.03  | 3.0       |

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

### `--ho-border-strong`, and how a deviation was handled

Criterion 7 is met without exception: every pair in the table above clears its threshold,
including the border that identifies a control.

That was not so in 1.0.0. `--ho-border-strong` — the line around `.ho-input`,
`.ho-btn--secondary` and `.ho-drop` — reached only 1.73 to 2.18 against the three surfaces,
against the 3:1 `tokens.json` sets for user interface components. Darkening it changes the
look of every input and every secondary button, so it was not the implementer's call: the
six measured numbers were asserted in `contrast.test.ts` **without a threshold**, in a group
named `known deviations`, and the gap was raised with two computed candidates. The
machine-checked record was the point — a value nobody could change without the test saying
so — and the story stayed green while the decision was open.

The decision was to correct it, and 1.0.1 carried it. The `known deviations` group is gone
with the deviation it recorded: an empty fixture kept "for the next case" is a thing to
misread, and the next case can reintroduce three lines and this paragraph.

1.0.1 left one number leaning on how it was read: light `--ho-border-strong` on
`--ho-surface-sunken` measured **2.9968** — 3.00 as reported and as the export wrote it, a
hair under a bare `>= 3`. For a while the test compared thresholds at the two decimals these
numbers are stated in, with a second test pinning that the rounding rescued that pair and no
other. **1.0.2 removed the need**: one hex step darker in light, `#868276 → #858175`,
invisible to the eye and 3.0379 on the worst surface. The rounding is gone with it, and
every threshold in this file is compared against the unrounded ratio. A tolerance that has
to be explained is worth one step of a colour channel.

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

| Use                | Box     | Border | Radius | Accent square | Offset past bottom-right |
| ------------------ | ------- | ------ | ------ | ------------- | ------------------------ |
| Display            | 32 × 32 | 2.5 px | 2 px   | 14 × 14       | 7 px right, 7 px bottom  |
| Application header | 18 × 18 | 2 px   | —      | 8 × 8         | 4 px right, 4 px bottom  |
| Favicon 24         | 24 × 24 | 2 px   | 2 px   | 10 × 10       | 5 px right, 5 px bottom  |
| Favicon 16         | 16 × 16 | 1.5 px | 1 px   | 7 × 7         | 3 px right, 3 px bottom  |

`Wordmark` draws the first two: `size="display"` is the 32 px lockup with the word at
`--ho-text-xl`, `size="header"` the 18 px one of the application frame with the word at body
size and weight 700. Both are the one authored SVG, scaled — which costs one accepted
rounding in the header size: everything scales by 0.75 from the 24 px cell, so the frame
stroke lands at **1.5 px** where the design draws 2 px there. The stroke is not special-cased
for it; that would mean a second geometry to keep in step with the first.

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
state, with the state's name next to it. It is what a review by hand is held against, and
the reference later UI stories build from.

It carried its own light/dark/system control until the application frame arrived. **That
control is gone**: there is exactly one appearance switcher and it lives in the account
menu — a second one would change the same theme from two places and show the same state
twice.

The page has **no "Kontomenü" section either**, and that is a decision, not an omission: the
page itself stands in `AppShell`, so the header, the profile mark and the live menu are at
the top of it. A section below would be the same live control a second time, and it would
undercut the other thing the page shows — its action slot stays **empty**, so the filled and
the empty case can be held against each other. One sentence in the page's intro points
upward instead.

`/_handout/design/no-react.html` is the same tokens without React — the shape the password
page will have.

## The components

These exist. Use them; do not build a second one beside them.

| Component           | For                                                                          |
| ------------------- | ---------------------------------------------------------------------------- |
| `Button`            | Schaltfläche — accent / secondary / quiet / critical, md and lg              |
| `TextLink`          | the quiet inline action, and the mono address link                           |
| `TextField`         | a field to type into, with hint, error and mono variants                     |
| `PasswordReadout`   | the composed password row: reveal and copy                                   |
| `Switch`            | on/off, with its word                                                        |
| `List` / `ListRow`  | the bordered list and its rows, plain or interactive                         |
| `DropZone`          | Ablegefläche — idle, over, busy, error                                       |
| `StatusBadge`       | Zustand — neutral / warning / error, with a glyph                            |
| `Popover`           | the panel that hangs off a trigger                                           |
| `AccountMenu`       | the profile mark and the menu behind it: person, appearance, sign-out        |
| `Hint`              | the line under a control, neutral or error                                   |
| `EmptyState`        | one sentence, one action                                                     |
| `Card`              | the plain surface                                                            |
| `AppShell`          | header with the wordmark, the action slot and the account menu, and `<main>` |
| `Wordmark`, `icons` | the brand lockup and the glyphs                                              |

**Look here before writing UI, and extend what is here rather than adding a neighbour.** A
new base component needs a reason, not an occasion — two buttons in a project is how a
design system stops being one, and nothing about it looks wrong in any single diff.

`web/src/design/component-reuse.test.ts` enforces the most common way of breaking that: a
raw `<button>`, `<a href>`, `<input>`, `<select>`, `<textarea>` or `<dialog>` outside
`web/src/components/` fails, and the failure names the component to use instead.

`<a href>` is on that list because a raw link is not neutral — it comes out actively wrong.
The base rule `a { color: var(--ho-accent) }` spends the accent that `tokens.json` reserves
for where something happens, so a plain link in a list claims the attention the acting
actions are owed; `.ho-link` takes `--ho-link` and reaches the accent only on hover. It
underlines permanently, where `.ho-link` brings the underline back on hover and focus so
that dense rows of actions do not draw a meaningless grid. It is as tall as its text, where
`.ho-touch` gives 30 px at a pointer and 44 px on touch. And a glyph-only link has no name,
where `TextLink` turns `label` into both `aria-label` and `title`. Underneath all four sits
the structural point: **`TextLink` is an `<a>` when it navigates and a `<button>` when it
acts**, and what the check rejects is making that call by hand, one file at a time.

An `<a>` without `href` is not a link but an anchor — not focusable, no link role — and is
deliberately not counted. An `<a {...props}>` is counted: that is how a link is written when
its props come from above, and it is how `TextLink` writes its own.

### When a component is missing

**Ask. Do not decide it alone.** A missing component is a design decision, and the three
ways out are these, best first:

1. **Thorsten updates the design system.** The normal case. The new component arrives as a
   new export, and the repository follows it.
2. **Claude Code updates the design system**, with DesignSync, on design project
   `973f31d0-9780-4437-9d14-6bea66e7c39f`. Technically possible — and **never unasked**.
   Tokens 1.0.1 and 1.0.2 were written that way, but only because Thorsten had decided it
   explicitly. Without that decision, nothing there is changed.
3. **An exception in the code**, named and not waived: an entry in
   `RAW_ELEMENT_EXCEPTIONS` in `web/src/design/component-reuse.test.ts` with the file, the
   element, the number of occurrences and the reason. **The last resort**, for when the raw
   element really is the right answer — not a way around a missing component. The register is
   empty today: the one entry it held, the sample page's local appearance control, left with
   that control when the account menu took the switcher over. A test beside it fails when an
   entry no longer matches what is in the file, so the register cannot outlive its reasons.

The failure message of the check names all three, in this order, because a message that
offers only the third paves the shortcut the check exists to prevent.

#### The procedure for option 2

1. Read the remote design system first and check that nobody else has changed it. The page
   is `Handout Designsystem.dc.html`; the token files are `tokens.css` and `tokens.json`.
2. Write with DesignSync: `finalize_plan`, then `write_files`.
3. Raise the version **in three places** — `tokens.css`, `tokens.json`, and the visible
   header of the design system page. The header is the one that gets forgotten.
4. Update the frozen export under
   `/home/node/.claude/plans/handout-app/han-23-design-source/`, or the invariant "the
   repository's tokens are the export" stops holding.
5. Then follow it in the repository. **The source is the design system, never the other way
   round** — the repository is never the place a design change starts.

What neither check sees: a rebuild by other means — a `<div role="button">` with the look
copied into a CSS module, or a second button component added inside `components/`. The rule
in `CLAUDE.md` is the guard there; these tests are the tripwire under the easy path.

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

`PasswordReadout` is the composed password row from the protection popover: the value on
the sunken surface, a reveal toggle carrying `aria-pressed` with a label that changes with
the state, and a copy action. It is a _readout_, not a field — nothing is typed into it,
and naming it a field would invite the next story to add an input where the design has
none. Three things about it are rules rather than choices:

- The mask is always eight dots, whatever the password is. A mask that matches the length
  gives the length away.
- **The password never reaches a log**, not even inside a caught error — a rejected
  `writeText` carries the very string it was called with. The failure is reported to the
  person instead, because the clipboard API is missing outside a secure context and
  silence there looks like a broken button.
- The line under the field is **reserved height**, empty or not, so the panel does not jump
  when the confirmation appears. It stands for 1.8 s, the duration the export states for
  this confirmation. This is the one part of the copy confirmation that belongs to this
  story; the list's own copy behaviour still belongs to the list view story.

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

## The application frame and the account menu

`AppShell` is the frame every view of the application stands in: a full-bleed bar in
`--ho-surface` with a hairline below it, the wordmark on the left, and on the right the
view's primary action and the profile mark. The bar spans the viewport while its content
stops at `--ho-content-max`, so a wide screen does not show the page background above the
content. Two deviations from the design, both deliberate:

- **Horizontal padding is 24 px (`--ho-space-8`), not the design's 20 px.** In the design the
  header padding equals the content padding; here `<main>` already uses 24 px, and matching
  it is what puts the wordmark exactly over the content edge — the rule the design states.
- **The wordmark is an `<a href="/">`, where the design draws a button.** "Back to the list"
  is navigation: it works without a router, survives one, and costs no placeholder callback.
  A prototype draws a button because it has no URLs. Reversible in one line.

`AccountMenu` is the profile mark and the menu behind it. Four things about it are rules:

- **The closing behaviour is `Popover`'s**, shared through
  `web/src/components/useDismissablePanel.ts`: `Escape`, a click beside it, the focus back on
  the trigger unless the click landed on another control, and the tab cycle. The hook was
  extracted from `Popover` without changing it — `Popover.test.tsx` is untouched and green,
  which is the proof. What did **not** move is the measured above/below placement: the menu
  hangs off a header at the top of the viewport, where a measurement could only ever answer
  "below", and a measurement whose result is known is a claim, not a check.
- **`role="menu"` holding a `role="radiogroup"` is a known deviation from strict ARIA**,
  which would want `menuitemradio`. The design draws the radiogroup, and the design is the
  source of truth, so it is followed and recorded here rather than silently corrected. All
  three radios stay tab stops; the design is silent on arrow keys.
- **The chosen appearance carries a check glyph**, not only a colour and a contour — the same
  rule as every other state in this system.
- **The mark shows initials from the name, never the address.** `initialsOf` takes the first
  letters of the first two words; an address on the header is readable over a shoulder, so it
  stays inside the menu.

**One breakpoint, `30em` (480 px), and it is deliberately duplicated** in two modules:
`Wordmark.module.css` drops the word from the header lockup, `AppShell.module.css` tightens
the header's horizontal padding. It cannot be a token — a custom property is not usable in a
media condition — and it cannot live in one file, because a module cannot reach into another
module's class. Both rules name the other in a comment.

The frame is **not** on the recipient password page: nobody is signed in there. Today that is
proven against the React-free stand-in `no-react.html`, in the `design-no-react-page` smoke
check — the page carries no `aria-haspopup="menu"`, no `role="menu"`, no `radiogroup`, no
`Erscheinungsbild` and no `Abmelden`. **HAN-20 inherits the obligation** to re-prove it on the
real password page.
