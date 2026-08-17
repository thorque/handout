import type { ReactNode } from 'react';
import { AccountMenu } from './AccountMenu';
import { Wordmark } from './Wordmark';
import styles from './AppShell.module.css';

export interface AppShellProps {
  /** Who is signed in. Without one there is no profile mark — a page without a session. */
  user?: { name: string; email: string };
  /** The mechanics are HAN-8's; the menu entry only calls this. */
  onSignOut?: () => void;
  /** The primary action of the view standing in the frame, right of the wordmark. */
  action?: ReactNode;
  children: ReactNode;
}

function doNothing(): void {
  /* no session, no sign-out */
}

/**
 * The frame every view of the application stands in: the wordmark, the slot for the view's
 * primary action, the account menu, and `<main>` below them. The header carries no
 * navigation, because there is only the list.
 *
 * The wordmark is a link to `/`, not a button: "back to the list" is navigation, it works
 * without a router today and survives one later. It is a raw `<a>` deliberately — the
 * lockup is not a `.ho-link` (no accent, no underline, no text styling at all), so
 * `TextLink` is not its replacement, and inside `components/` the raw element is allowed.
 *
 * The recipient password page does **not** get this frame: nobody is signed in there. That
 * is HAN-20's obligation, and it holds by construction — this is a React component mounted
 * only at the application root, and that page loads no module at all.
 */
export function AppShell({ user, onSignOut = doNothing, action, children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.bar}>
          <a href="/" className={styles.home}>
            <Wordmark size="header" />
          </a>
          <div className={styles.actions}>
            {action}
            {user !== undefined && (
              <AccountMenu name={user.name} email={user.email} onSignOut={onSignOut} />
            )}
          </div>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
