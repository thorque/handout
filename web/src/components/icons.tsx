import type { ReactNode } from 'react';
import styles from './icons.module.css';

/**
 * The four glyphs the design draws next to a state — closed and open padlock, the
 * exclamation box and the check. They are the non-colour half of every state in this
 * design system, so they are not decoration, but they carry no name of their own: the
 * word next to them does. Hence `aria-hidden`.
 *
 * The export draws them out of CSS borders on nested spans because it has to stand alone
 * as a single HTML file; here they are SVG in `currentColor`, sized in `em` so they
 * follow the text they sit in.
 */
interface GlyphProps {
  children: ReactNode;
  viewBox?: string;
}

function Glyph({ children, viewBox = '0 0 16 16' }: GlyphProps) {
  return (
    <svg
      className={styles.icon}
      viewBox={viewBox}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** Geschützt — the shackle sits closed on the body. */
export function LockClosedIcon() {
  return (
    <Glyph>
      <rect x="3" y="7" width="10" height="7.5" rx="1" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </Glyph>
  );
}

/** Offen — the same body, the shackle hinged away to the right. */
export function LockOpenIcon() {
  return (
    <Glyph>
      <rect x="1.5" y="7" width="10" height="7.5" rx="1" />
      <path d="M9 7V4.5a2.5 2.5 0 0 1 5 0V6" />
    </Glyph>
  );
}

/** Absolute Pfade, field errors, the failed drop — the design's `!` in a rounded box. */
export function ExclamationIcon() {
  return (
    <Glyph>
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" />
      <path d="M8 4.5v4.5" />
      <path d="M8 11.5h0.01" />
    </Glyph>
  );
}

/** The confirmation after copying, and the active entry of the appearance group. */
export function CheckIcon() {
  return (
    <Glyph>
      <path d="M3 8.5 6.5 12 13 4" />
    </Glyph>
  );
}

/**
 * Anzeigen — the export's 16 × 11 outline with a 4 px pupil at its centre. Both radii are
 * inset by half the stroke, so the drawn edge sits where the export's border box sits.
 */
export function EyeIcon() {
  return (
    <Glyph>
      <ellipse cx="8" cy="8" rx="7.25" ry="4.75" />
      <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

/** Verbergen — the same eye with the export's 18 px slash across it, at -30°. */
export function EyeOffIcon() {
  return (
    <Glyph>
      <ellipse cx="8" cy="8" rx="7.25" ry="4.75" />
      <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />
      <path d="M0.5 12.5 15.5 3.5" />
    </Glyph>
  );
}

/**
 * Kopieren — two 10 × 10 squares offset by 4, as the export draws them in both places it
 * uses this glyph. The rear square is an L rather than a full square: the export hides its
 * covered half by filling the front one with the surface colour, which only works when the
 * surface is known. This icon sits on the sunken field and on a list row alike, so it
 * simply does not draw the part that is covered.
 */
export function CopyIcon() {
  return (
    <Glyph>
      <path d="M11 5V1H1v10h4" />
      <rect x="5" y="5" width="10" height="10" rx="1" />
    </Glyph>
  );
}
