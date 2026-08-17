import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FormEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TextField } from './TextField';

describe('TextField', () => {
  it('ties the visible label to the input, so clicking it focuses the field', async () => {
    render(<TextField label="Name" defaultValue="Prototyp Kundenportal" />);

    const input = screen.getByLabelText('Name');
    expect(input.tagName).toBe('INPUT');

    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(input);

    await user.type(input, '!');
    expect((input as HTMLInputElement).value).toBe('Prototyp Kundenportal!');
  });

  it('describes the field with its hint', () => {
    render(<TextField label="Name" hint="Kommt aus dem Dateinamen, überschreibbar." />);

    const input = screen.getByLabelText('Name');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy ?? '')?.textContent).toContain(
      'Kommt aus dem Dateinamen',
    );
  });

  it('signals invalid three times over, only one of them colour', () => {
    render(<TextField label="Passwort" type="password" error="Passwort stimmt nicht." />);

    const input = screen.getByLabelText('Passwort');
    // 1. the attribute, which is also what switches the border from 1 px to 2 px
    expect(input.getAttribute('aria-invalid')).toBe('true');
    // 2. the message is reachable from the field
    const describedBy = input.getAttribute('aria-describedby');
    const message = document.getElementById(describedBy ?? '');
    expect(message?.textContent).toContain('Passwort stimmt nicht.');
    // 3. the message carries the glyph, not just red text
    expect(message?.querySelector('svg')).not.toBeNull();
  });

  it('submits its form on Enter', async () => {
    const onSubmit = vi.fn<(event: FormEvent) => void>((event) => {
      event.preventDefault();
    });
    render(
      <form onSubmit={onSubmit}>
        <TextField label="Passwort" type="password" />
      </form>,
    );

    await userEvent.setup().type(screen.getByLabelText('Passwort'), 'geheim{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('can be disabled and required through the native attributes', () => {
    const { rerender } = render(<TextField label="Name" disabled />);
    expect((screen.getByLabelText('Name') as HTMLInputElement).disabled).toBe(true);

    rerender(<TextField label="Name" required />);
    expect((screen.getByLabelText('Name') as HTMLInputElement).required).toBe(true);
  });
});
