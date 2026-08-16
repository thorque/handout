import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Hint } from './Hint';

describe('Hint', () => {
  it('is the quiet line under a control by default', () => {
    render(<Hint>Kommt aus dem Dateinamen, überschreibbar.</Hint>);

    const hint = screen.getByText('Kommt aus dem Dateinamen, überschreibbar.');
    expect(hint.className).toContain('ho-hint');
    expect(hint.querySelector('svg')).toBeNull();
  });

  it('carries a glyph next to the text when it is an error', () => {
    render(<Hint variant="error">Passwort stimmt nicht.</Hint>);

    const error = screen.getByText(/Passwort stimmt nicht\./);
    expect(error.className).toContain('ho-error');
    // Never colour alone: the exclamation glyph sits in front of the words.
    expect(error.querySelector('svg')).not.toBeNull();
  });

  it('takes an id so the field it belongs to can describe itself with it', () => {
    render(
      <Hint variant="error" id="pw-error">
        Passwort stimmt nicht.
      </Hint>,
    );

    expect(document.getElementById('pw-error')).not.toBeNull();
  });

  it('is not focusable', () => {
    render(<Hint>Ein Hinweis.</Hint>);
    expect(screen.getByText('Ein Hinweis.').getAttribute('tabindex')).toBeNull();
  });
});
