import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './classNames';
import styles from './List.module.css';

export interface ListProps {
  /** Names the list for assistive technology; a list of rows without a name is a heap. */
  'aria-label'?: string;
  children: ReactNode;
}

/** The design's Liste: one contour around the whole thing, hairlines between the rows. */
export function List({ 'aria-label': ariaLabel, children }: ListProps) {
  return (
    <ul className={cx('ho-list', styles.list)} aria-label={ariaLabel}>
      {children}
    </ul>
  );
}

export interface ListRowProps {
  /** Turns the row into a link. Mutually exclusive with `onClick`. */
  href?: string;
  /** Turns the row into a button. */
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick'];
  children: ReactNode;
}

/**
 * A row. An interactive row is a real `<button>` or `<a>` inside the `<li>` rather than a
 * clickable div, so Tab reaches it and Enter activates it without a single key handler.
 */
export function ListRow({ href, onClick, children }: ListRowProps) {
  if (href !== undefined) {
    const anchorProps: AnchorHTMLAttributes<HTMLAnchorElement> = { href };
    return (
      <li className={cx('ho-list-row', styles.row)}>
        <a {...anchorProps} className={styles.action}>
          {children}
        </a>
      </li>
    );
  }

  if (onClick !== undefined) {
    return (
      <li className={cx('ho-list-row', styles.row)}>
        <button type="button" onClick={onClick} className={styles.action}>
          {children}
        </button>
      </li>
    );
  }

  return <li className={cx('ho-list-row', styles.row)}>{children}</li>;
}
