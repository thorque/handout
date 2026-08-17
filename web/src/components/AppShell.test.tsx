import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '../theme/ThemeProvider';
import { AppShell, type AppShellProps } from './AppShell';

const PERSON = { name: 'Jana Berger', email: 'j.berger@berger-partner.de' };

function renderShell(props: Partial<AppShellProps> = {}) {
  render(
    <ThemeProvider>
      <AppShell {...props}>
        <p>Service: ok</p>
      </AppShell>
    </ThemeProvider>,
  );
}

describe('AppShell', () => {
  it('puts the wordmark on screen and the content into a main landmark', () => {
    renderShell();

    // Criterion 8 of HAN-23: the wordmark from the design system is in the application.
    expect(screen.getByRole('banner')).toBeDefined();
    expect(screen.getByRole('img', { name: 'handout' })).toBeDefined();
    expect(screen.getByRole('main').textContent).toContain('Service: ok');
  });

  it('takes the wordmark back to the application', () => {
    renderShell();

    const home = screen.getByRole('img', { name: 'handout' }).closest('a');
    expect(home?.getAttribute('href')).toBe('/');
  });

  it('shows the profile mark of the person who is signed in', () => {
    renderShell({ user: PERSON });

    expect(screen.getByRole('button', { name: `Konto ${PERSON.name}` }).textContent).toBe('JB');
  });

  it('draws no profile mark when nobody is signed in', () => {
    // A frame that always shows one would be a mark of nobody on a page without a session.
    renderShell();

    expect(screen.queryByRole('button', { name: /^Konto/ })).toBeNull();
  });

  it("stands the view's primary action in the header, not in the content", () => {
    renderShell({ action: <p>Neues Handout</p> });

    const banner = screen.getByRole('banner');
    expect(banner.textContent).toContain('Neues Handout');
    expect(screen.getByRole('main').textContent).not.toContain('Neues Handout');
  });

  it('keeps the narrow-width rule that makes the header usable on a phone', () => {
    // Criterion 4 of HAN-26. jsdom measures no layout, so what is checkable here is that
    // the rule still exists: deleting it is the regression a rendering test cannot see.
    // The walkthrough in the plan is what proves it on a real screen.
    const here = path.dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(path.join(here, 'AppShell.module.css'), 'utf8');

    expect(css).toContain('@media (max-width: 30em)');
  });
});
