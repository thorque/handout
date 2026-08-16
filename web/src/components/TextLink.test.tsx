import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TextLink } from './TextLink';

describe('TextLink', () => {
  it('is a button when it acts and an anchor when it navigates, never a div', () => {
    const { rerender } = render(<TextLink onClick={() => undefined}>Ersetzen</TextLink>);
    expect(screen.getByRole('button', { name: 'Ersetzen' }).tagName).toBe('BUTTON');

    rerender(
      <TextLink href="https://handout.example.de/f8k2p9">handout.example.de/f8k2p9</TextLink>,
    );
    expect(screen.getByRole('link').tagName).toBe('A');
  });

  it('activates on Enter, because it is a real control', async () => {
    const onClick = vi.fn<() => void>();
    render(<TextLink onClick={onClick}>Umbenennen</TextLink>);

    const user = userEvent.setup();
    await user.tab();
    await user.keyboard('{Enter}');

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('gives the icon-only variant a name in aria-label and in title', () => {
    render(<TextLink label="Adresse kopieren" onClick={() => undefined} />);

    const button = screen.getByRole('button', { name: 'Adresse kopieren' });
    expect(button.getAttribute('title')).toBe('Adresse kopieren');
  });

  it('confirms with a word and not only with a colour', () => {
    render(<TextLink label="Adresse kopieren" confirmation="Kopiert" onClick={() => undefined} />);

    // The word replaces the glyph at the place of the action.
    expect(screen.getByText('Kopiert')).toBeDefined();
  });

  it('sets the mono variant through the class layer rather than its own font rule', () => {
    render(<TextLink mono href="#a" />);
    expect(screen.getByRole('link').className).toContain('ho-link--mono');
  });
});
