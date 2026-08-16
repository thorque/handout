import { useId, type InputHTMLAttributes } from 'react';
import { cx } from './classNames';
import { Hint } from './Hint';
import styles from './TextField.module.css';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  /** Always visible. This design system has no placeholder-only field. */
  label: string;
  /** The neutral line under the field. */
  hint?: string;
  /** When set the field is invalid: the message replaces the hint and carries the glyph. */
  error?: string;
  /** Addresses and passwords are set in the mono family. */
  mono?: boolean;
}

/**
 * The design's Eingabefeld. Invalid carries three signals, only one of them colour:
 * `aria-invalid`, a described-by message with the exclamation glyph and its text, and the
 * border going from 1 px to 2 px (`.ho-input[aria-invalid='true']` in tokens.css).
 */
export function TextField({
  label,
  hint,
  error,
  mono = false,
  className,
  ...rest
}: TextFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const invalid = error !== undefined;

  const classes = cx('ho-input', mono && 'ho-mono', className);

  const message = error ?? hint;

  return (
    <div className={cx('ho-field', styles.field)}>
      <label className="ho-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={classes}
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={message === undefined ? undefined : messageId}
        {...rest}
      />
      {message !== undefined && (
        <Hint id={messageId} variant={invalid ? 'error' : 'neutral'}>
          {message}
        </Hint>
      )}
    </div>
  );
}
