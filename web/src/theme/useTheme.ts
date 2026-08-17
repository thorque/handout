import { createContext, useContext } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeContextValue {
  /** What is stored. 'system' means: nothing is stored. */
  preference: ThemePreference;
  /** What is actually on screen right now — for the switcher's own display only. */
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
}

/** The one key in local storage. 'system' is the absence of it, never a stored string. */
export const THEME_STORAGE_KEY = 'handout.theme';

/** The attribute tokens.css keys its two explicit theme blocks on. */
export const THEME_ATTRIBUTE = 'data-theme';

export const DARK_QUERY = '(prefers-color-scheme: dark)';

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === undefined) throw new Error('useTheme must be used inside a ThemeProvider');
  return value;
}
