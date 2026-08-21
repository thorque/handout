/**
 * Whether anyone is signed in, and the two actions that change it. The service is the only
 * source of truth — no client-side session state is kept in step with it.
 */

export type Session =
  | { signedIn: true; user: { name: string; email: string } }
  | { signedIn: false; signInLabel: string };

/** The prototype's own default — used only when the service cannot be reached at all. */
const FALLBACK_SIGN_IN_LABEL = 'Mit Firmenkonto anmelden';

/**
 * A failed request yields the signed-out state: without the service there is nothing to
 * show but the sign-in page.
 */
export async function fetchSession(): Promise<Session> {
  try {
    const response = await fetch('/api/auth/session');
    if (!response.ok) return { signedIn: false, signInLabel: FALLBACK_SIGN_IN_LABEL };
    return (await response.json()) as Session;
  } catch {
    return { signedIn: false, signInLabel: FALLBACK_SIGN_IN_LABEL };
  }
}

/**
 * Ends the Handout session and returns to `/app/`, so the next render starts from a fresh
 * `fetchSession()` call — there is no client-side session state to keep in step otherwise.
 */
export async function signOut(): Promise<void> {
  await fetch('/api/auth/sign-out', { method: 'POST' });
  window.location.assign('/app/');
}
