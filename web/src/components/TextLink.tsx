import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './classNames';
import { CheckIcon } from './icons';
import styles from './TextLink.module.css';

interface CommonProps {
  /** `strong` is the near-black variant the list uses for the publication's own name. */
  strong?: boolean;
  /** Addresses, file names and sizes are set in the mono family. */
  mono?: boolean;
  /**
   * The accessible name for the variant that shows only a glyph. It becomes both
   * `aria-label` and `title`, because a symbol without a name is not an action.
   */
  label?: string;
  /**
   * Replaces the content with a check and this word — the confirmation stands at the
   * place of the action, not at the edge of the screen. How long it stands there belongs
   * to whoever triggers the copy.
   */
  confirmation?: string;
  children?: ReactNode;
}

export type TextLinkProps = CommonProps &
  (
    | ({ href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'>)
    | ({ href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>)
  );

/**
 * The design's Textlink — "die stille Aktion", for actions that stand next to each other
 * in dense lists. No permanent underline, because four rows of them would draw a grid
 * that means nothing; the underline appears on hover and focus, together with the colour
 * change, so the state is never carried by colour alone (`.ho-link` in tokens.css).
 *
 * An `<a>` when it navigates, a `<button>` when it acts. Never a div.
 */
export function TextLink({
  strong = false,
  mono = false,
  label,
  confirmation,
  children,
  ...rest
}: TextLinkProps) {
  const classes = cx('ho-link', 'ho-touch', strong && 'ho-link--strong', mono && 'ho-link--mono');

  const content =
    confirmation === undefined ? (
      children
    ) : (
      <span className={styles.confirmation}>
        <CheckIcon />
        {confirmation}
      </span>
    );

  if (rest.href !== undefined) {
    const anchorProps = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a {...anchorProps} className={classes} aria-label={label} title={label ?? anchorProps.title}>
        {content}
      </a>
    );
  }

  const buttonProps = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button
      type="button"
      {...buttonProps}
      className={classes}
      aria-label={label}
      title={label ?? buttonProps.title}
    >
      {content}
    </button>
  );
}
