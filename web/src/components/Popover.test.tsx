import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';
import { Popover } from './Popover';

function renderPopover() {
  return render(
    <div>
      <Popover triggerLabel="Geschützt — Schutz verwalten" heading="Prototyp Kundenportal">
        <Button>Neues Passwort erzeugen</Button>
      </Popover>
      <p>freie Fläche</p>
      <label htmlFor="name">Name</label>
      <input id="name" />
    </div>,
  );
}

function trigger(): HTMLElement {
  return screen.getByRole('button', { name: 'Geschützt — Schutz verwalten' });
}

describe('Popover', () => {
  it('is absent from the DOM while it is closed, not merely hidden', () => {
    renderPopover();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('opens, names itself by its heading and moves focus into the panel', async () => {
    renderPopover();
    await userEvent.setup().click(trigger());

    const panel = screen.getByRole('dialog', { name: 'Prototyp Kundenportal' });
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(trigger().getAttribute('aria-controls')).toBe(panel.getAttribute('id'));
    // A panel that opens without focus is unreachable by keyboard.
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it('closes on Escape and puts the focus back on the trigger', async () => {
    renderPopover();
    const user = userEvent.setup();
    await user.click(trigger());

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes through its own Schließen button, focus returning the same way', async () => {
    renderPopover();
    const user = userEvent.setup();
    await user.click(trigger());

    await user.click(screen.getByRole('button', { name: 'Schließen' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on a click into empty space and takes the focus back there', async () => {
    // Nothing focusable was clicked, so the focus would land on <body> — which is the
    // loss the design guards against.
    renderPopover();
    const user = userEvent.setup();
    await user.click(trigger());

    await user.click(screen.getByText('freie Fläche'));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on a click into another control and leaves the focus there', async () => {
    // The regression this replaces: the popover claimed the focus back a microtask later,
    // so a field clicked beside it lost the caret again and could not be typed into.
    renderPopover();
    const user = userEvent.setup();
    await user.click(trigger());

    const field = screen.getByLabelText('Name');
    await user.click(field);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(field);

    await user.keyboard('Prototyp');
    expect((field as HTMLInputElement).value).toBe('Prototyp');
  });

  it('cycles Tab inside the panel instead of leaking behind it', async () => {
    renderPopover();
    const user = userEvent.setup();
    await user.click(trigger());

    const panel = screen.getByRole('dialog');
    const focusable = [...panel.querySelectorAll('button')];
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
});
