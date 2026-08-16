import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * jsdom 30 has no `window.matchMedia`, so anything that asks the OS for its colour scheme
 * throws in a test. This stub answers, remembers its listeners and lets a test fire a
 * change — which is what makes "the application follows a system change while it is open"
 * testable at all.
 */
export interface MatchMediaStub {
  /** What `matches` answers from now on; firing a change reports this value. */
  setMatches(matches: boolean): void;
  /** Deliver a `change` event to every listener, as the browser would. */
  fireChange(matches: boolean): void;
}

function installMatchMedia(): MatchMediaStub {
  let matches = false;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  window.matchMedia = (media: string) =>
    ({
      get matches() {
        return matches;
      },
      media,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      dispatchEvent: () => true,
    }) as unknown as MediaQueryList;

  return {
    setMatches(next) {
      matches = next;
    },
    fireChange(next) {
      matches = next;
      for (const listener of listeners) {
        listener({ matches: next, media: '' } as MediaQueryListEvent);
      }
    },
  };
}

export const matchMedia = installMatchMedia();

afterEach(() => {
  cleanup();
  matchMedia.setMatches(false);
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
});
