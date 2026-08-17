import { App, NewHandoutAction } from './App';
import { AppShell } from './components/AppShell';
import { DesignSystemPage } from './pages/DesignSystemPage';
import type { Route } from './routes';

export interface RootProps {
  route: Route;
  user: { name: string; email: string };
  onSignOut: () => void;
}

/**
 * Route to page, inside the one frame. It exists so that "the same header stands on every
 * view" is a statement a test can hold against something — `main.tsx` cannot be rendered.
 *
 * The action slot is the part that differs: the start page fills it, the sample page leaves
 * it empty on purpose, so both cases can be seen side by side.
 */
export function Root({ route, user, onSignOut }: RootProps) {
  return (
    <AppShell
      user={user}
      onSignOut={onSignOut}
      action={route === 'app' ? <NewHandoutAction /> : undefined}
    >
      {route === 'design-system' ? <DesignSystemPage /> : <App />}
    </AppShell>
  );
}
