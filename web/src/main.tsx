import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppShell } from './components/AppShell';
import { DesignSystemPage } from './pages/DesignSystemPage';
import { resolveRoute } from './routes';
import { ThemeProvider } from './theme/ThemeProvider';

const container = document.getElementById('root');
if (container === null) throw new Error('missing #root element');

const route = resolveRoute(window.location.pathname);

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <AppShell>{route === 'design-system' ? <DesignSystemPage /> : <App />}</AppShell>
    </ThemeProvider>
  </StrictMode>,
);
