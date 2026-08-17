import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Switch } from './Switch';

describe('Switch', () => {
  it('states its state as a role, an attribute and a word', () => {
    render(<Switch label="Mit Passwort schützen" checked onChange={() => undefined} />);

    const control = screen.getByRole('switch', { name: /Mit Passwort schützen/ });
    expect(control.getAttribute('aria-checked')).toBe('true');
    // The word is the half that does not depend on colour or on knob position.
    expect(screen.getByText('An')).toBeDefined();
  });

  it('toggles on Space, and the label is part of the control', async () => {
    const onChange = vi.fn<(next: boolean) => void>();
    render(<Switch label="Mit Passwort schützen" checked={false} onChange={onChange} />);

    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('switch'));

    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith(true);

    // Clicking the label is clicking the control, because the label lives inside it.
    await user.click(screen.getByText('Mit Passwort schützen'));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(screen.getByRole('switch'));
  });

  it('shows the off word when it is off', () => {
    render(<Switch label="Passwortschutz" checked={false} onChange={() => undefined} />);
    expect(screen.getByText('Aus')).toBeDefined();
  });

  it('cannot be toggled when disabled', async () => {
    const onChange = vi.fn<(next: boolean) => void>();
    render(<Switch label="Passwortschutz" checked disabled onChange={onChange} />);

    await userEvent.setup().click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
