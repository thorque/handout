import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './Root';
import { resolveRoute } from './routes';
import { ThemeProvider } from './theme/ThemeProvider';

const container = document.getElementById('root');
if (container === null) throw new Error('missing #root element');

const route = resolveRoute(window.location.pathname);

/**
 * The signed-in person, until the real session arrives. A constant rather than an
 * endpoint and a stand-in in the service that would have to be cleaned up later. It is
 * the design's own sample person, so the running application and the design system show
 * the same one.
 */
const SIGNED_IN = { name: 'Jana Berger', email: 'j.berger@berger-partner.de' };

/** The menu entry is there and reaches this; signing out itself is not built yet. */
function signOut(): void {}

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <Root route={route} user={SIGNED_IN} onSignOut={signOut} />
    </ThemeProvider>
  </StrictMode>,
);
