import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './Root';
import { resolveRoute } from './routes';
import { ThemeProvider } from './theme/ThemeProvider';

const container = document.getElementById('root');
if (container === null) throw new Error('missing #root element');

const route = resolveRoute(window.location.pathname);

/**
 * The signed-in person, until HAN-8 brings the real session. HAN-8 replaces exactly this
 * constant — there is deliberately no endpoint and no stand-in in the service that would
 * have to be cleaned up later. It is the design's own sample person, so the running
 * application and the design system show the same one.
 */
const SIGNED_IN = { name: 'Jana Berger', email: 'j.berger@berger-partner.de' };

/** Signing out is HAN-8's; the menu entry is there and reaches this. */
function signOut(): void {
  /* HAN-8 */
}

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <Root route={route} user={SIGNED_IN} onSignOut={signOut} />
    </ThemeProvider>
  </StrictMode>,
);
