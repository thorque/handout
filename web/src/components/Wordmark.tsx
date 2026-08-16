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
  return (
    <span className={styles.lockup}>
      <svg
        className={styles.mark}
        viewBox="0 0 29 29"
        role="img"
        aria-labelledby="handout-wordmark-title"
      >
        <title id="handout-wordmark-title">handout</title>
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
