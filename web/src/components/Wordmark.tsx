import { useId } from 'react';
import { cx } from './classNames';
import styles from './Wordmark.module.css';

export type WordmarkSize = 'display' | 'header';

export interface WordmarkProps {
  /** The mark without the word, for contexts too narrow for the full lockup. */
  markOnly?: boolean;
  /**
   * `display` is the 32 px lockup the design draws on a page of its own; `header` is the
   * 18 px one of the application frame, with the word at body size.
   */
  size?: WordmarkSize;
}

/**
 * The brand lockup, inline rather than an <img>, so the frame follows `currentColor` and
 * the accent square follows `--ho-accent` — both live, in whichever theme is on screen.
 * The standalone files under /_handout/design/brand/ are the same geometry for consumers
 * that reference a logo by URL.
 *
 * One accepted rounding in the header size: the frame stroke scales with the drawing to
 * 1.5 px where the design draws 2 px at 18 px. The stroke is not special-cased for it.
 */
export function Wordmark({ markOnly = false, size = 'display' }: WordmarkProps) {
  // The header and the sample page put several lockups into one document, so the title's
  // id cannot be a constant: duplicate ids would point every aria-labelledby at the first.
  const titleId = useId();

  return (
    <span className={cx(styles.lockup, size === 'header' && styles.header)}>
      <svg className={styles.mark} viewBox="0 0 29 29" role="img" aria-labelledby={titleId}>
        <title id={titleId}>handout</title>
        <rect
          x="1"
          y="1"
          width="22"
          height="22"
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <rect x="19" y="19" width="10" height="10" className={styles.accent} />
      </svg>
      {!markOnly && <span className={styles.word}>handout</span>}
    </span>
  );
}
