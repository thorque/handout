import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('puts the wordmark on screen and the content into a main landmark', () => {
    render(
      <AppShell>
        <p>Service: ok</p>
      </AppShell>,
    );

    // Criterion 8: the wordmark from the design system is in the application.
    expect(screen.getByRole('banner')).toBeDefined();
    expect(screen.getByRole('img', { name: 'handout' })).toBeDefined();
    expect(screen.getByRole('main').textContent).toContain('Service: ok');
  });
});
