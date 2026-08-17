import { useId } from 'react';
import styles from './Wordmark.module.css';

export interface WordmarkProps {
  /** The mark without the word, for contexts too narrow for the full lockup. */
  markOnly?: boolean;
}

/**
 * The brand lockup, inline rather than an <img>, so the frame follows `currentColor` and
 * the accent square follows `--ho-accent` — both live, in whichever theme is on screen.
 * The standalone files under /_handout/design/brand/ are the same geometry for consumers
 * that reference a logo by URL.
 */
export function Wordmark({ markOnly = false }: WordmarkProps) {
  // The header and the sample page put several lockups into one document, so the title's
  // id cannot be a constant: duplicate ids would point every aria-labelledby at the first.
  const titleId = useId();

  return (
    <span className={styles.lockup}>
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
