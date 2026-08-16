import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DARK_QUERY,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  ThemeContext,
  type ResolvedTheme,
  type ThemePreference,
} from './useTheme';

/**
 * Holds the theme preference and derives what is on screen from it.
 *
 * It does not paint: all painting is CSS, keyed on the `data-theme` attribute and on
 * `prefers-color-scheme`. The provider only sets or removes that attribute, and the first
 * paint is already correct because /_handout/design/theme-init.js ran before React.
 *
 * Storage and matchMedia are both guarded: local storage throws on an opaque origin and
 * in private mode, and a server-rendered or test environment may have no matchMedia at
 * all. Neither is a reason for the application not to render.
 */

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* blocked storage — the system theme is the fallback */
  }
  return 'system';
}

function writeStoredPreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* blocked storage — the choice then lasts for this page only */
  }
}

function darkMediaQuery(): MediaQueryList | undefined {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
  return window.matchMedia(DARK_QUERY);
}

export interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [systemDark, setSystemDark] = useState<boolean>(() => darkMediaQuery()?.matches ?? false);

  // A one-time read would leave the application in the theme the OS had at load time;
  // criterion 5 wants the change to land while it is open.
  useEffect(() => {
    const query = darkMediaQuery();
    if (query === undefined) return;

    const onChange = (event: MediaQueryListEvent) => {
      setSystemDark(event.matches);
    };
    query.addEventListener('change', onChange);
    setSystemDark(query.matches);

    return () => {
      query.removeEventListener('change', onChange);
    };
  }, []);

  // 'system' removes the attribute rather than writing a value, so the @media rule in
  // tokens.css takes over again on the next style recalculation — no reload.
  useEffect(() => {
    const root = document.documentElement;
    if (preference === 'system') root.removeAttribute(THEME_ATTRIBUTE);
    else root.setAttribute(THEME_ATTRIBUTE, preference);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    writeStoredPreference(next);
    setPreferenceState(next);
  }, []);

  const resolved: ResolvedTheme =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
