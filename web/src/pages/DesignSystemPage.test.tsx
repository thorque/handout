import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '../theme/ThemeProvider';
import { DesignSystemPage } from './DesignSystemPage';

function renderPage() {
  render(
    <ThemeProvider>
      <DesignSystemPage />
    </ThemeProvider>,
  );
}

describe('DesignSystemPage', () => {
  it('shows one accessible element of every base component', () => {
    renderPage();

    // Wordmark, Button, TextLink, TextField, Switch, List/ListRow, DropZone, StatusBadge,
    // Popover, Hint, EmptyState, Card — the page is the reference later stories hold their
    // work against, so a component missing from it is a real defect.
    expect(screen.getAllByRole('img', { name: 'handout' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Veröffentlichen' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Ersetzen' })).toBeDefined();
    expect(screen.getByLabelText('Passwort')).toBeDefined();
    expect(screen.getAllByRole('switch').length).toBeGreaterThan(0);
    expect(screen.getByRole('list', { name: 'Veröffentlichungen' })).toBeDefined();
    expect(screen.getByLabelText('Datei auswählen')).toBeDefined();
    expect(screen.getByText('Nicht entpackt')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Geschützt — Schutz verwalten' })).toBeDefined();
    expect(screen.getByText('Bitte eine Datei auswählen.')).toBeDefined();
    expect(screen.getByText('Noch nichts veröffentlicht.')).toBeDefined();
    expect(
      screen.getByText('Fläche für zusammengehörige Angaben. Kontur statt Schatten.'),
    ).toBeDefined();
  });

  it('carries an appearance control of its own, not the profile menu one', () => {
    renderPage();

    const group = screen.getByRole('radiogroup', { name: 'Erscheinungsbild' });
    expect(group).toBeDefined();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });
});
