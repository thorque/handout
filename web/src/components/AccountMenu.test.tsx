import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../theme/ThemeProvider';
import { AccountMenu, initialsOf } from './AccountMenu';

const PERSON = { name: 'Jana Berger', email: 'j.berger@berger-partner.de' };

function renderMenu(onSignOut: () => void = () => undefined) {
  // The real provider, not a stub: choosing an appearance has to reach the document, and
  // a stub would let a menu that only paints itself pass.
  render(
    <ThemeProvider>
      <AccountMenu {...PERSON} onSignOut={onSignOut} />
      <p>freie Fläche</p>
    </ThemeProvider>,
  );
}

function trigger(): HTMLElement {
  return screen.getByRole('button', { name: `Konto ${PERSON.name}` });
}

function radio(label: string): HTMLElement {
  return screen.getByRole('radio', { name: label });
}

describe('AccountMenu', () => {
  it('is absent from the DOM while it is closed, and shows the initials', () => {
    renderMenu();

    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().textContent).toBe('JB');
  });

  it('never shows the address on the mark itself', () => {
    // The design's rule: the mark carries initials from the identity provider's name, the
    // address stays inside the menu. An address on the header is readable over a shoulder.
    renderMenu();

    expect(trigger().textContent).not.toContain('@');
  });

  it('opens on a click with the person, the appearance group and the sign-out', async () => {
    renderMenu();
    await userEvent.setup().click(trigger());

    const menu = screen.getByRole('menu');
    expect(menu.textContent).toContain(PERSON.name);
    expect(menu.textContent).toContain(PERSON.email);

    expect(screen.getByRole('radiogroup', { name: 'Erscheinungsbild' })).toBeDefined();
    expect(screen.getAllByRole('radio').map((entry) => entry.textContent)).toEqual([
      'Hell',
      'Dunkel',
      'System',
    ]);
    expect(screen.getByRole('menuitem', { name: 'Abmelden' })).toBeDefined();

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    // A menu that opens without focus is unreachable by keyboard.
    expect(menu.contains(document.activeElement)).toBe(true);
  });

  it('opens from the keyboard alone', async () => {
    renderMenu();
    const user = userEvent.setup();

    await user.tab();
    expect(document.activeElement).toBe(trigger());

    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeDefined();
  });

  it('closes on Escape and puts the focus back on the profile mark', async () => {
    renderMenu();
    const user = userEvent.setup();
    await user.click(trigger());

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on a click beside it and takes the focus back there', async () => {
    // Nothing focusable was clicked, so the focus would land on <body> — which is the
    // loss the design guards against.
    renderMenu();
    const user = userEvent.setup();
    await user.click(trigger());

    await user.click(screen.getByText('freie Fläche'));

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('cycles Tab inside the menu instead of leaking behind it', async () => {
    renderMenu();
    const user = userEvent.setup();
    await user.click(trigger());

    const menu = screen.getByRole('menu');
    const focusable = [...menu.querySelectorAll('button')];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();

    last?.focus();
    await user.tab();
    expect(document.activeElement).toBe(first);

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);
  });

  it('turns the whole page dark and stays open while doing it', async () => {
    renderMenu();
    const user = userEvent.setup();
    await user.click(trigger());

    await user.click(radio('Dunkel'));

    expect(radio('Dunkel').getAttribute('aria-checked')).toBe('true');
    expect(radio('Hell').getAttribute('aria-checked')).toBe('false');
    expect(radio('System').getAttribute('aria-checked')).toBe('false');
    // The provider is real, so this is the theme actually arriving on the document.
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    // Changing the appearance is not leaving the menu: the next choice is one click away.
    expect(screen.getByRole('menu')).toBeDefined();
  });

  it('marks the chosen appearance with a glyph, not with colour alone', async () => {
    renderMenu();
    const user = userEvent.setup();
    await user.click(trigger());

    await user.click(radio('Dunkel'));

    expect(radio('Dunkel').querySelector('svg')).not.toBeNull();
    expect(radio('Hell').querySelector('svg')).toBeNull();
    expect(radio('System').querySelector('svg')).toBeNull();
  });

  it('signs out once and closes', async () => {
    const onSignOut = vi.fn<() => void>();
    renderMenu(onSignOut);
    const user = userEvent.setup();
    await user.click(trigger());

    await user.click(screen.getByRole('menuitem', { name: 'Abmelden' }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('initialsOf', () => {
  it('takes the first two words, upper case', () => {
    expect(initialsOf('Jana Berger')).toBe('JB');
    // A provider that hands the name in lower case still gives initials.
    expect(initialsOf('jana berger')).toBe('JB');
    // Two, not first and last: three words is a name, not a mistake.
    expect(initialsOf('Jana Maria Berger')).toBe('JM');
    // Stray whitespace produces no empty word — split(' ') would.
    expect(initialsOf('  Jana   Berger ')).toBe('JB');
    // One word is one initial, not a crash.
    expect(initialsOf('Thomas')).toBe('T');
  });
});
