import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { cx } from './classNames';
import { CheckIcon, CopyIcon, ExclamationIcon, EyeIcon, EyeOffIcon } from './icons';
import styles from './PasswordReadout.module.css';

export interface PasswordReadoutProps {
  /** Always visible, like every label in this design system. */
  label: string;
  /** The password in clear. It is shown only on request and never leaves this component. */
  value: string;
  /** The word under the field after a successful copy. */
  copiedLabel?: string;
  showLabel?: string;
  hideLabel?: string;
  copyLabel?: string;
}

/**
 * The password as the design draws it in the protection popover: not an input, but a
 * composed row — the value, a reveal toggle and a copy action, on the sunken surface.
 *
 * Named a *readout* rather than a *field* on purpose. It belongs to the "Eingabefeld"
 * family by its look (visible label, boxed row, a line underneath) but not by its
 * behaviour: nothing is ever typed into it. Calling it PasswordField would promise an
 * input and invite the next story to add one, which is exactly the misuse this replaces —
 * the sample page used a TextField here, and a TextField is a place to type.
 *
 * The password is retrievable by design (it is encrypted, not hashed, so its owner can
 * look it up weeks later), which is why revealing and copying exist at all. It follows
 * that the value must never reach a log: the copy failure is reported to the user and
 * nothing is written anywhere, not even the error object, which carries the argument it
 * was called with.
 */

/** Always eight, whatever the password is: the mask must not leak its length. */
const MASK = '••••••••';

/**
 * How long the confirmation stands. The export says it for the copy action next to the
 * address — "Nach dem Kopieren tritt für 1,8 s die Bestätigung an die Stelle des Symbols"
 * — and this is the same action in the same design.
 */
const CONFIRMATION_MS = 1800;

type Report = { kind: 'copied' | 'failed'; text: string } | undefined;

export function PasswordReadout({
  label,
  value,
  copiedLabel = 'Passwort kopiert',
  showLabel = 'Anzeigen',
  hideLabel = 'Verbergen',
  copyLabel = 'Passwort kopieren',
}: PasswordReadoutProps) {
  const [shown, setShown] = useState(false);
  const [report, setReport] = useState<Report>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const labelId = useId();

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const announce = useCallback((next: Report) => {
    setReport(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setReport(undefined);
    }, CONFIRMATION_MS);
  }, []);

  const copy = useCallback(async () => {
    try {
      const clipboard = navigator.clipboard as Clipboard | undefined;
      if (clipboard === undefined) throw new Error('no clipboard in this context');
      await clipboard.writeText(value);
      announce({ kind: 'copied', text: copiedLabel });
    } catch {
      // Deliberately no logging of any kind, not even the error: it was called with the
      // password and a rejection can carry its argument. A handout password never
      // appears in a log (CLAUDE.md). The user is told instead of being left in silence.
      announce({
        kind: 'failed',
        text: 'Kopieren nicht möglich. Passwort anzeigen und von Hand markieren.',
      });
    }
  }, [value, copiedLabel, announce]);

  return (
    <div className={cx('ho-field', styles.field)}>
      <span className="ho-label" id={labelId}>
        {label}
      </span>

      <div className={styles.row} role="group" aria-labelledby={labelId}>
        <code className={cx('ho-mono', styles.value, !shown && styles.masked)}>
          {shown ? value : MASK}
        </code>

        <button
          type="button"
          className={styles.action}
          aria-pressed={shown}
          aria-label={shown ? hideLabel : showLabel}
          title={shown ? hideLabel : showLabel}
          onClick={() => {
            setShown((previous) => !previous);
          }}
        >
          {shown ? <EyeOffIcon /> : <EyeIcon />}
        </button>

        <button
          type="button"
          className={styles.action}
          aria-label={copyLabel}
          title={copyLabel}
          onClick={() => {
            void copy();
          }}
        >
          <CopyIcon />
        </button>
      </div>

      {/*
        The line is there whether or not it says anything. The export reserves it as an
        empty 18 px block for exactly this reason: the panel must not jump when the
        confirmation appears.
      */}
      <div className={styles.report} role="status">
        {report !== undefined && (
          <span className={cx(styles.message, report.kind === 'failed' && styles.failed)}>
            {report.kind === 'copied' ? <CheckIcon /> : <ExclamationIcon />}
            {report.text}
          </span>
        )}
      </div>
    </div>
  );
}
