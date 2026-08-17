import { cx } from './classNames';
import { ExclamationIcon, LockClosedIcon, LockOpenIcon } from './icons';
import styles from './StatusBadge.module.css';

export type StatusBadgeVariant = 'neutral' | 'warning' | 'error';
export type StatusBadgeGlyph = 'lock-closed' | 'lock-open' | 'exclamation';

export interface StatusBadgeProps {
  variant?: StatusBadgeVariant;
  glyph?: StatusBadgeGlyph;
  /** Always a word. A badge without text does not exist in this design system. */
  children: string;
}

const GLYPHS = {
  'lock-closed': LockClosedIcon,
  'lock-open': LockOpenIcon,
  exclamation: ExclamationIcon,
};

/**
 * The design's Zustand marker. Protection and no protection have the same shape and the
 * same weight, each with a word and a padlock — closed or open. The unprotected case is
 * the highlighted one, because it is the one that should catch the eye when scanning the
 * list; there is no success-green "protected" variant, protection is the normal case.
 */
export function StatusBadge({ variant = 'neutral', glyph, children }: StatusBadgeProps) {
  const classes = cx(
    'ho-badge',
    styles.badge,
    variant === 'warning' && 'ho-badge--warning',
    variant === 'error' && styles.error,
  );

  const Glyph = glyph === undefined ? undefined : GLYPHS[glyph];

  return (
    <span className={classes}>
      {Glyph !== undefined && <Glyph />}
      {children}
    </span>
  );
}
