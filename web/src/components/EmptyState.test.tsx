import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('is one sentence when there is nothing to do about it', () => {
    render(<EmptyState>Noch nichts veröffentlicht.</EmptyState>);

    expect(screen.getByText('Noch nichts veröffentlicht.')).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers one real action, reachable by Tab', async () => {
    const onClick = vi.fn<() => void>();
    render(
      <EmptyState action={<Button onClick={onClick}>Datei ablegen</Button>}>
        Noch nichts veröffentlicht.
      </EmptyState>,
    );

    const action = screen.getByRole('button', { name: 'Datei ablegen' });
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(action);

    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
