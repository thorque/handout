import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  /** One sentence. The design's Leerzustand is "ein Satz, eine Aktion". */
  children: string;
  /** The one action, a real Button — optional, because not every empty list has one. */
  action?: ReactNode;
}

export function EmptyState({ children, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <p className={styles.sentence}>{children}</p>
      {action !== undefined && <div className={styles.action}>{action}</div>}
    </div>
  );
}
