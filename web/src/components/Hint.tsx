import type { ReactNode } from 'react';
import { cx } from './classNames';
import { ExclamationIcon } from './icons';
import styles from './Hint.module.css';

export type HintVariant = 'neutral' | 'error';

export interface HintProps {
  variant?: HintVariant;
  /** Set it so the control that owns this line can point at it with aria-describedby. */
  id?: string;
  children: ReactNode;
}

/**
 * The short line under a control. The design has no four-severity callout block: it has
 * this neutral explanation (`.ho-hint`) and the form error (`.ho-error`), which always
 * carries the exclamation glyph and always carries text — an error is never colour alone.
 *
 * No `role="alert"`: the line is announced through the `aria-describedby` of the field it
 * belongs to, at the moment the field is reached.
 */
export function Hint({ variant = 'neutral', id, children }: HintProps) {
  if (variant === 'error') {
    return (
      <span id={id} className={cx('ho-error', styles.error)}>
        <ExclamationIcon />
        {children}
      </span>
    );
  }

  return (
    <span id={id} className="ho-hint">
      {children}
    </span>
  );
}
