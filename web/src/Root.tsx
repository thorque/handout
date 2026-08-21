import { App, NewHandoutAction } from './App';
import { AppShell } from './components/AppShell';
import { DesignSystemPage } from './pages/DesignSystemPage';
import { SignInPage, type SignInError } from './pages/SignInPage';
import type { Session } from './session';
import { signOut } from './session';
import type { Route } from './routes';

export interface RootProps {
  route: Route;
  session: Session;
  error?: SignInError | undefined;
}

/**
 * Route to page, inside the one frame — but only once someone is signed in. Without a
 * session every route shows `SignInPage` instead, the sample page included: one rule, no
 * exception to explain, and Thorsten is signed in when he reviews.
 *
 * The action slot is the part that differs: the start page fills it, the sample page leaves
 * it empty on purpose, so both cases can be seen side by side.
 */
export function Root({ route, session, error }: RootProps) {
  if (!session.signedIn) {
    return <SignInPage signInLabel={session.signInLabel} error={error} />;
  }

  return (
    <AppShell
      user={session.user}
      onSignOut={() => {
        void signOut();
      }}
      action={route === 'app' ? <NewHandoutAction /> : undefined}
    >
      {route === 'design-system' ? <DesignSystemPage /> : <App />}
    </AppShell>
  );
}
