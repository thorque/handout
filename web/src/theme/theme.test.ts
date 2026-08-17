import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { matchMedia } from '../test-setup';
import { ThemeProvider } from './ThemeProvider';
import { THEME_STORAGE_KEY, useTheme } from './useTheme';

function renderTheme() {
  return renderHook(() => useTheme(), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(ThemeProvider, null, children),
  });
}

function themeAttribute(): string | null {
  return document.documentElement.getAttribute('data-theme');
}

describe('theme resolution', () => {
  it('follows a dark system without storing anything and without setting the attribute', () => {
    // Criterion 3. A provider that eagerly wrote data-theme="dark" here would look right
    // and then be unable to follow the OS, because the attribute outranks the media query.
    matchMedia.setMatches(true);

    const { result } = renderTheme();

    expect(result.current.preference).toBe('system');
    expect(result.current.resolved).toBe('dark');
    expect(themeAttribute()).toBeNull();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('stores an explicit choice and puts it on the document', () => {
    // Criterion 4. A provider holding the choice in React state only would pass every
    // visual check and lose the choice on the next load.
    const { result } = renderTheme();

    act(() => {
      result.current.setPreference('dark');
    });

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(themeAttribute()).toBe('dark');
    expect(result.current.resolved).toBe('dark');
  });

  it('lets a stored light choice win over a dark system', () => {
    // Criterion 4, the other direction: the OS must not override what was chosen.
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    matchMedia.setMatches(true);

    const { result } = renderTheme();

    expect(result.current.preference).toBe('light');
    expect(result.current.resolved).toBe('light');
    expect(themeAttribute()).toBe('light');
  });

  it('removes both the key and the attribute when going back to system', () => {
    // Criterion 5. Leaving data-theme behind would freeze the application in the theme
    // that was just abandoned — the classic half-implementation of "System".
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    const { result } = renderTheme();
    expect(themeAttribute()).toBe('dark');

    act(() => {
      result.current.setPreference('system');
    });

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(themeAttribute()).toBeNull();
  });

  it('follows a system change while the application is open', () => {
    // Criterion 5. A one-time read of matchMedia passes every other test in this file.
    const { result } = renderTheme();
    expect(result.current.resolved).toBe('light');

    act(() => {
      matchMedia.fireChange(true);
    });

    expect(result.current.resolved).toBe('dark');
  });

  it('ignores a system change while a choice is in force', () => {
    // Criterion 4: an explicit choice is not a starting value.
    const { result } = renderTheme();

    act(() => {
      result.current.setPreference('dark');
    });
    act(() => {
      matchMedia.fireChange(false);
    });

    expect(result.current.resolved).toBe('dark');
    expect(themeAttribute()).toBe('dark');
  });
});
