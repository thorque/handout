import type { ReactNode } from 'react';
import { Wordmark } from './Wordmark';
import styles from './AppShell.module.css';

export interface AppShellProps {
  children: ReactNode;
}

/**
 * Header and content area. The header carries no navigation, because there is only the
 * list — and no account menu either: that is HAN-26's, together with the appearance
 * switcher it holds.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Wordmark />
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
