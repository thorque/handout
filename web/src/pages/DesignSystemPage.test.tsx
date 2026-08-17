import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    // "Name" rather than "Passwort": the password is now carried by PasswordReadout too,
    // and a label that two different components answer to proves neither of them.
    expect(screen.getAllByLabelText('Name').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Passwort kopieren' })).toBeDefined();
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

  it('composes the popover the way the export draws it', async () => {
    // Structure, not spacing — spacing is not measurable in jsdom. What is checkable is
    // that the panel gets the three pieces it is supposed to stack, and that the last
    // action sits behind the caesura together with its consequence.
    renderPage();

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Geschützt — Schutz verwalten' }));

    const panel = screen.getByRole('dialog', { name: 'Prototyp Kundenportal' });
    expect(panel.querySelector('[role="switch"]')).not.toBeNull();
    // The password is the composed row the export draws — a reveal toggle and a copy
    // action, not a text input. A plain <input> here would be the wrong component.
    expect(panel.querySelector('input')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Anzeigen' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Passwort kopieren' }).length).toBeGreaterThan(0);

    const action = screen.getByRole('button', { name: 'Neues Passwort erzeugen' });
    const consequence = screen.getByText('Bereits verteilte Passwörter gelten danach nicht mehr.');
    expect(action.parentElement).toBe(consequence.parentElement);
    expect(panel.contains(action)).toBe(true);
  });

  it('leaves the appearance control to the profile menu', () => {
    // There is exactly one switcher, and it is the one in the account menu. A second one
    // here would change the same theme from two places and show the same state twice —
    // and this page already stands in the frame that carries the menu.
    renderPage();

    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });
});
