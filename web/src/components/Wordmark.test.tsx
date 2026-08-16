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
});
