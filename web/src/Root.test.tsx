import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Root } from './Root';
import { ThemeProvider } from './theme/ThemeProvider';
import type { Route } from './routes';
import type { Session } from './session';

const PERSON = { name: 'Jana Berger', email: 'j.berger@berger-partner.de' };
const SIGNED_IN: Session = { signedIn: true, user: PERSON };
const SIGNED_OUT: Session = { signedIn: false, signInLabel: 'Mit Firmenkonto anmelden' };

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderRoute(route: Route, session: Session = SIGNED_IN) {
  // The start page asks the service for its health; stubbing it keeps the test off the
  // network, the same way App.test.tsx does.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok' }) })),
  );

  render(
    <ThemeProvider>
      <Root route={route} session={session} />
    </ThemeProvider>,
  );
}

/**
 * The frame's header. The sample page carries a `<header>` of its own for its title, so
 * the frame's banner is picked by what only it holds: the link back to the application.
 */
function frameHeader(): HTMLElement {
  const found = screen
    .getAllByRole('banner')
    .find((banner) => banner.querySelector('a[href="/"]') !== null);
  if (found === undefined) throw new Error('no banner carrying the wordmark link');
  return found;
}

describe('Root', () => {
  // Criterion 1: the same header on every view of the application.
  for (const route of ['app', 'design-system'] as const) {
    it(`stands the ${route} view in the same header`, () => {
      renderRoute(route);

      const header = within(frameHeader());
      expect(header.getByRole('img', { name: 'handout' })).toBeDefined();
      expect(header.getByRole('button', { name: `Konto ${PERSON.name}` })).toBeDefined();
    });
  }

  it('fills the action slot on the start page', () => {
    renderRoute('app');

    expect(screen.getByRole('button', { name: 'Neues Handout' })).toBeDefined();
  });

  it('leaves the action slot of the sample page empty', () => {
    // The other half of the slot: an action put into the shell unconditionally would stand
    // on a page that has no primary action, and nothing would notice.
    renderRoute('design-system');

    expect(screen.queryByRole('button', { name: 'Neues Handout' })).toBeNull();
  });

  // Without a session, every route shows the sign-in page instead — the sample page
  // included, so there is no exception to explain.
  for (const route of ['app', 'design-system'] as const) {
    it(`shows the sign-in page instead of the ${route} view without a session`, () => {
      renderRoute(route, SIGNED_OUT);

      expect(screen.queryAllByRole('banner')).toHaveLength(0);
      expect(screen.queryByRole('button', { name: `Konto ${PERSON.name}` })).toBeNull();
      expect(screen.getByRole('button', { name: SIGNED_OUT.signInLabel })).toBeDefined();
    });
  }
});
