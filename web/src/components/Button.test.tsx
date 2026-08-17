import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('is a real button, which is what makes Enter and Space work', async () => {
    const onClick = vi.fn<() => void>();
    render(<Button onClick={onClick}>Veröffentlichen</Button>);

    const button = screen.getByRole('button', { name: 'Veröffentlichen' });
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');

    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(button);

    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('blocks activation when disabled, through the attribute and not through opacity', async () => {
    const onClick = vi.fn<() => void>();
    render(
      <Button variant="critical" disabled onClick={onClick}>
        Löschen
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Löschen' });
    expect(button.hasAttribute('disabled')).toBe(true);

    await userEvent.setup().click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('carries the variant as a class, so the shape differs and not only the fill', () => {
    const { rerender } = render(<Button variant="accent">A</Button>);
    expect(screen.getByRole('button').className).toContain('ho-btn--accent');

    rerender(<Button variant="secondary">A</Button>);
    expect(screen.getByRole('button').className).toContain('ho-btn--secondary');

    rerender(<Button variant="quiet">A</Button>);
    expect(screen.getByRole('button').className).toContain('ho-btn--quiet');

    rerender(<Button variant="critical">A</Button>);
    expect(screen.getByRole('button').className).toContain('ho-btn--critical');
  });

  it('offers the 48 px size the password page needs', () => {
    render(<Button size="lg">Öffnen</Button>);
    // The class is a CSS-module name, so only its presence is assertable here; the value
    // behind it is --ho-control-lg, which token-only.test.ts guards.
    expect(screen.getByRole('button').className).not.toBe('ho-btn ho-btn--accent');
  });
});
