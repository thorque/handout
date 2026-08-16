import type { ButtonHTMLAttributes } from 'react';
import { cx } from './classNames';
import styles from './Button.module.css';

export type ButtonVariant = 'accent' | 'secondary' | 'quiet' | 'critical';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** `lg` is the 48 px control the password page uses. */
  size?: ButtonSize;
}

/**
 * The design's Schaltfläche. The look comes from `.ho-btn` in tokens.css, so a page
 * without React gets the same button by writing the same classes.
 *
 * The variants differ in shape, not only in fill: accent is filled, secondary outlined,
 * quiet has no border and tighter padding, critical is the neutral near-black — the
 * design has no red destructive button, deliberately.
 */
export function Button({
  variant = 'accent',
  size = 'md',
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  const classes = cx('ho-btn', `ho-btn--${variant}`, size === 'lg' && styles.lg, className);

  return <button type={type} className={classes} {...rest} />;
}
