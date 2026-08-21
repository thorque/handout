import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './Root';
import { resolveRoute } from './routes';
import { fetchSession } from './session';
import { signInErrorFrom } from './pages/SignInPage';
import { ThemeProvider } from './theme/ThemeProvider';

const container = document.getElementById('root');
if (container === null) throw new Error('missing #root element');

const route = resolveRoute(window.location.pathname);
const error = signInErrorFrom(window.location.search);
const session = await fetchSession();

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <Root route={route} session={session} error={error} />
    </ThemeProvider>
  </StrictMode>,
);
