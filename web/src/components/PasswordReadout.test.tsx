import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PasswordReadout } from './PasswordReadout';

const PASSWORD = 'kiesel-3555';

function renderReadout() {
  return render(<PasswordReadout label="Passwort" value={PASSWORD} />);
}

/**
 * Installs a clipboard that records what it was asked to write.
 *
 * Always AFTER userEvent.setup(): user-event installs a clipboard stub of its own, so a
 * stub placed before it is silently replaced and the test then measures user-event rather
 * than this component.
 */
function stubClipboard(writeText: (text: string) => Promise<void>) {
  const spy = vi.fn<(text: string) => Promise<void>>(writeText);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: spy },
    configurable: true,
  });
  return spy;
}

function removeClipboard() {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
}

afterEach(() => {
  removeClipboard();
  vi.restoreAllMocks();
  // Unconditionally, not only in the test that installs them: a test that times out never
  // reaches its own cleanup, and fake timers left behind hang every test after it.
  vi.useRealTimers();
});

describe('PasswordReadout', () => {
  it('starts masked, and the mask does not give the length away', () => {
    renderReadout();

    expect(screen.queryByText(PASSWORD)).toBeNull();
    const mask = screen.getByText('••••••••');
    expect(mask.textContent).toHaveLength(8);
    expect(mask.textContent).not.toHaveLength(PASSWORD.length);
  });

  it('reveals and hides again from the keyboard, saying which it is', async () => {
    renderReadout();
    const user = userEvent.setup();

    const toggle = screen.getByRole('button', { name: 'Anzeigen' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.getAttribute('title')).toBe('Anzeigen');

    toggle.focus();
    await user.keyboard(' ');

    const pressed = screen.getByRole('button', { name: 'Verbergen' });
    expect(pressed.getAttribute('aria-pressed')).toBe('true');
    expect(pressed.getAttribute('title')).toBe('Verbergen');
    expect(screen.getByText(PASSWORD)).toBeDefined();

    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Anzeigen' })).toBeDefined();
    expect(screen.queryByText(PASSWORD)).toBeNull();
  });

  it('copies the real password even while it is masked', async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard(() => Promise.resolve());
    renderReadout();

    await user.click(screen.getByRole('button', { name: 'Passwort kopieren' }));

    expect(writeText).toHaveBeenCalledWith(PASSWORD);
  });

  it('confirms the copy and takes the confirmation back again', async () => {
    // On real time, deliberately. Fake timers do not survive the trip through user-event
    // and RTL here — user-event's own waits and RTL's waitFor both look for *Jest's* fake
    // clock, which Vitest does not install — and a test that pretends to control a clock
    // it cannot wind is worse than one that waits two seconds.
    const user = userEvent.setup();
    stubClipboard(() => Promise.resolve());
    renderReadout();
    const line = screen.getByRole('status');

    await user.click(screen.getByRole('button', { name: 'Passwort kopieren' }));
    expect(line.textContent).toContain('Passwort kopiert');

    // The export puts the confirmation at 1.8 s: still standing at 1 s, gone well before 3.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(line.textContent).toContain('Passwort kopiert');

    await waitFor(
      () => {
        expect(line.textContent).toBe('');
      },
      { timeout: 3000 },
    );
  });

  it('keeps the reserved line whether or not it says anything', async () => {
    const user = userEvent.setup();
    stubClipboard(() => Promise.resolve());
    renderReadout();

    // The reserved line exists before anything is copied — that is what stops the panel
    // jumping when the confirmation appears.
    const line = screen.getByRole('status');
    expect(line.textContent).toBe('');

    await user.click(screen.getByRole('button', { name: 'Passwort kopieren' }));
    await waitFor(() => {
      expect(line.textContent).toContain('Passwort kopiert');
    });
  });

  it('says so when there is no clipboard, instead of failing silently', async () => {
    // The real case this stands for: a context that is not secure, where the API is absent.
    const user = userEvent.setup();
    removeClipboard();
    renderReadout();

    await user.click(screen.getByRole('button', { name: 'Passwort kopieren' }));

    expect(await screen.findByText(/Kopieren nicht möglich/)).toBeDefined();
  });

  it('says so when the clipboard refuses, and writes the password nowhere', async () => {
    // The rule from CLAUDE.md: a publication password never reaches a log — and a rejected
    // writeText carries the very string it was called with.
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const user = userEvent.setup();
    stubClipboard(() => Promise.reject(new Error(`refused for ${PASSWORD}`)));
    renderReadout();

    await user.click(screen.getByRole('button', { name: 'Passwort kopieren' }));

    expect(await screen.findByText(/Kopieren nicht möglich/)).toBeDefined();
    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
