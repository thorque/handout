import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './Card';

describe('Card', () => {
  it('is the surface class and whatever is put into it', () => {
    render(
      <Card>
        <p>Fläche für zusammengehörige Angaben.</p>
      </Card>,
    );

    const content = screen.getByText('Fläche für zusammengehörige Angaben.');
    expect(content.parentElement?.className).toContain('ho-card');
  });
});
