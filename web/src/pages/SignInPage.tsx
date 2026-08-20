import { useEffect } from 'react';
import { Button } from '../components/Button';
import { Hint } from '../components/Hint';
import { Wordmark } from '../components/Wordmark';
import styles from './SignInPage.module.css';

export type SignInError = 'not_allowed' | 'sign_in_failed';

export interface SignInPageProps {
  signInLabel: string;
  error?: SignInError | undefined;
}

const MESSAGES: Record<SignInError, string> = {
  not_allowed: 'Diese Adresse darf auf dieser Instanz nicht veröffentlichen.',
  sign_in_failed: 'Die Anmeldung ist fehlgeschlagen. Bitte erneut anmelden.',
};

/**
 * The signed-out state of `/app/**`, for every route — no `AppShell`, no header, no
 * registration offer, no explanatory text. The prototype's own `showHeader: screen !==
 * 'anmeldung'` and the Design Brief's "unauffällig sein und nach einem Klick nicht mehr
 * auftauchen".
 *
 * `error` is read from the URL by the caller and cleared with `history.replaceState` once
 * this page has read it, so a reload does not re-accuse someone who has since signed in.
 */
export function SignInPage({ signInLabel, error }: SignInPageProps) {
  useEffect(() => {
    if (error === undefined) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('error');
    window.history.replaceState(null, '', url.pathname + url.search);
  }, [error]);

  return (
    <div className={styles.page}>
      <div className={styles.column}>
        <Wordmark size="display" />
        {error !== undefined && <Hint variant="error">{MESSAGES[error]}</Hint>}
        <Button
          variant="secondary"
          size="lg"
          onClick={() => {
            window.location.assign('/api/auth/sign-in');
          }}
        >
          {signInLabel}
        </Button>
      </div>
    </div>
  );
}

/** Reads `?error=` from a location search string, narrowed to the two values this page knows. */
export function signInErrorFrom(search: string): SignInError | undefined {
  const value = new URLSearchParams(search).get('error');
  return value === 'not_allowed' || value === 'sign_in_failed' ? value : undefined;
}
