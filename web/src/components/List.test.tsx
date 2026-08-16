import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { List, ListRow } from './List';

describe('List', () => {
  it('is a real list of real rows', () => {
    render(
      <List aria-label="Veröffentlichungen">
        <ListRow>Prototyp Kundenportal</ListRow>
        <ListRow>Schulungsunterlagen Modul 2</ListRow>
      </List>,
    );

    expect(screen.getByRole('list', { name: 'Veröffentlichungen' })).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('makes an interactive row a button inside the item, reachable by Tab', async () => {
    const onClick = vi.fn<() => void>();
    render(
      <List>
        <ListRow onClick={onClick}>Prototyp Kundenportal</ListRow>
      </List>,
    );

    const button = screen.getByRole('button', { name: 'Prototyp Kundenportal' });
    expect(button.closest('li')).not.toBeNull();

    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(button);

    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('makes a navigating row an anchor', () => {
    render(
      <List>
        <ListRow href="/f8k2p9">handout.example.de/f8k2p9</ListRow>
      </List>,
    );

    const link = screen.getByRole('link', { name: 'handout.example.de/f8k2p9' });
    expect(link.getAttribute('href')).toBe('/f8k2p9');
    expect(link.closest('li')).not.toBeNull();
  });

  it('renders a confirmation without moving anything, next to the action', () => {
    render(
      <List>
        <ListRow>
          <span>handout.example.de/q31mzt</span>
          <span>Kopiert</span>
        </ListRow>
      </List>,
    );

    expect(screen.getByText('Kopiert')).toBeDefined();
  });
});
