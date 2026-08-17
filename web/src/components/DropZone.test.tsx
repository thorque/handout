import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DropZone } from './DropZone';

function surface(): HTMLElement {
  const element = document.querySelector('.ho-drop');
  if (element === null) throw new Error('no drop surface rendered');
  return element as HTMLElement;
}

describe('DropZone', () => {
  it('offers a file input Tab can reach, behind its label', async () => {
    render(<DropZone />);

    const input = screen.getByLabelText('Datei auswählen');
    expect(input.getAttribute('type')).toBe('file');

    // Focusable, hence Enter and Space open the picker without a key handler of our own.
    await userEvent.setup().tab();
    expect(document.activeElement).toBe(input);
  });

  it('changes its words on dragover and takes them back on dragleave and drop', () => {
    render(<DropZone fileName="prototyp-kundenportal.zip" />);
    expect(screen.getByText('Datei oder Zip hier ablegen')).toBeDefined();

    fireEvent.dragOver(surface());
    expect(screen.getByText('Loslassen')).toBeDefined();
    expect(screen.getByText('prototyp-kundenportal.zip')).toBeDefined();

    fireEvent.dragLeave(surface());
    expect(screen.getByText('Datei oder Zip hier ablegen')).toBeDefined();

    fireEvent.dragOver(surface());
    fireEvent.drop(surface(), { dataTransfer: { files: [] } });
    expect(screen.getByText('Datei oder Zip hier ablegen')).toBeDefined();
  });

  it('says the progress in words, not only as a bar width', () => {
    render(<DropZone state="busy" busyLabel="Entpacken · 118 Dateien" progress={64} />);

    expect(screen.getByText('Entpacken · 118 Dateien')).toBeDefined();
    expect(screen.getByText('64 %')).toBeDefined();
  });

  it('shows the failure with a glyph, a message and a way out', () => {
    render(
      <DropZone
        state="error"
        message="Das Zip enthält keine index.html."
        recovery="Andere Datei ablegen oder auswählen."
      />,
    );

    expect(screen.getByText('Das Zip enthält keine index.html.')).toBeDefined();
    expect(screen.getByText('Andere Datei ablegen oder auswählen.')).toBeDefined();
    expect(surface().querySelector('svg')).not.toBeNull();
  });

  it('does not react to a drag while it is busy', () => {
    render(<DropZone state="busy" busyLabel="Entpacken · 118 Dateien" progress={10} />);

    fireEvent.dragOver(surface());
    expect(screen.queryByText('Loslassen')).toBeNull();
  });
});
