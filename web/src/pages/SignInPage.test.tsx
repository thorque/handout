import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SignInPage, signInErrorFrom } from './SignInPage';

const LABEL = 'Mit Testkonto anmelden';

describe('SignInPage', () => {
  it('shows exactly one button, carrying the label passed in', () => {
    render(<SignInPage signInLabel={LABEL} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toContain(LABEL);
  });

  it('offers no registration', () => {
    render(<SignInPage signInLabel={LABEL} />);

    expect(screen.queryByText(/Registr/i)).toBeNull();
  });

  it('carries no application frame', () => {
    render(<SignInPage signInLabel={LABEL} />);

    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('shows no refusal line without an error', () => {
    render(<SignInPage signInLabel={LABEL} />);

    expect(screen.queryByText(/Adresse|Anmeldung ist fehlgeschlagen/)).toBeNull();
  });

  it('shows the not_allowed refusal with text and a glyph, not colour alone', () => {
    const { container } = render(<SignInPage signInLabel={LABEL} error="not_allowed" />);

    expect(
      screen.getByText('Diese Adresse darf auf dieser Instanz nicht veröffentlichen.'),
    ).toBeDefined();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('shows the sign_in_failed refusal', () => {
    render(<SignInPage signInLabel={LABEL} error="sign_in_failed" />);

    expect(
      screen.getByText('Die Anmeldung ist fehlgeschlagen. Bitte erneut anmelden.'),
    ).toBeDefined();
  });
});

describe('signInErrorFrom', () => {
  it('reads a known error token', () => {
    expect(signInErrorFrom('?error=not_allowed')).toBe('not_allowed');
    expect(signInErrorFrom('?error=sign_in_failed')).toBe('sign_in_failed');
  });

  it('ignores an unknown or missing token', () => {
    expect(signInErrorFrom('?error=something_else')).toBeUndefined();
    expect(signInErrorFrom('')).toBeUndefined();
  });
});
