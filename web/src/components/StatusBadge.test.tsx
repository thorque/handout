import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('always carries a word, in every variant', () => {
    const { rerender } = render(<StatusBadge>Veröffentlicht</StatusBadge>);
    expect(screen.getByText('Veröffentlicht')).toBeDefined();

    rerender(
      <StatusBadge variant="warning" glyph="exclamation">
        Absolute Pfade
      </StatusBadge>,
    );
    expect(screen.getByText('Absolute Pfade')).toBeDefined();

    rerender(<StatusBadge variant="error">Nicht entpackt</StatusBadge>);
    expect(screen.getByText('Nicht entpackt')).toBeDefined();
  });

  it('is not focusable — it states a fact, it is not an action', () => {
    render(<StatusBadge glyph="lock-closed">Geschützt</StatusBadge>);
    expect(screen.getByText('Geschützt').getAttribute('tabindex')).toBeNull();
  });

  it('gives protected and unprotected the same shape, and highlights the unprotected one', () => {
    const { unmount } = render(<StatusBadge glyph="lock-closed">Geschützt</StatusBadge>);
    const protectedClasses = screen.getByText('Geschützt').className.split(' ').sort();
    const protectedGlyph = screen.getByText('Geschützt').querySelector('svg')?.outerHTML;
    unmount();

    render(
      <StatusBadge variant="warning" glyph="lock-open">
        Offen
      </StatusBadge>,
    );
    const openClasses = screen.getByText('Offen').className.split(' ').sort();
    const openGlyph = screen.getByText('Offen').querySelector('svg')?.outerHTML;

    // Same base and same weight class; only the variant is added to the open one, which is
    // the highlighted case. Getting this backwards would invert the whole list.
    expect(openClasses.filter((name) => !protectedClasses.includes(name))).toEqual([
      'ho-badge--warning',
    ]);
    expect(protectedClasses.filter((name) => !openClasses.includes(name))).toEqual([]);
    // And the padlock differs: closed against open.
    expect(protectedGlyph).not.toBe(openGlyph);
  });

  it('renders no glyph when none was asked for', () => {
    render(<StatusBadge>4,2 MB</StatusBadge>);
    expect(screen.getByText('4,2 MB').querySelector('svg')).toBeNull();
  });
});
