import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Wordmark } from './Wordmark';

/** The word next to the mark, as opposed to the <title> inside the SVG. */
function words(): HTMLElement[] {
  return screen.queryAllByText('handout').filter((element) => element.tagName === 'SPAN');
}

describe('Wordmark', () => {
  it('names itself and shows the word', () => {
    render(<Wordmark />);

    expect(screen.getByRole('img', { name: 'handout' })).toBeDefined();
    expect(words()).toHaveLength(1);
  });

  it('drops the word but keeps the mark when asked for the mark alone', () => {
    render(<Wordmark markOnly />);

    expect(screen.getByRole('img', { name: 'handout' })).toBeDefined();
    expect(words()).toHaveLength(0);
  });

  it('gives every lockup in a document its own title id', () => {
    // Three of them share the sample page. A constant id would make two of the three
    // point their aria-labelledby at the first one's title.
    render(
      <div>
        <Wordmark />
        <Wordmark />
        <Wordmark markOnly />
      </div>,
    );

    const marks = screen.getAllByRole('img', { name: 'handout' });
    expect(marks).toHaveLength(3);

    const ids = marks.map((mark) => mark.getAttribute('aria-labelledby'));
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) {
      expect(document.querySelectorAll(`[id="${id ?? ''}"]`)).toHaveLength(1);
    }
  });
});
