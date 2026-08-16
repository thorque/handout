import { describe, expect, it } from 'vitest';
import { resolveRoute } from './routes';

describe('resolveRoute', () => {
  it('sends the root to the application', () => {
    expect(resolveRoute('/')).toBe('app');
  });

  it('finds the sample page with and without a trailing slash', () => {
    expect(resolveRoute('/_handout/design-system')).toBe('design-system');
    expect(resolveRoute('/_handout/design-system/')).toBe('design-system');
  });

  it('matches whole segments, so a longer path is not the sample page', () => {
    // The same rule the reserved prefix follows: a string-prefix match would be wrong.
    expect(resolveRoute('/_handout/design-systemx')).toBe('app');
    expect(resolveRoute('/_handout/design-system-extra')).toBe('app');
  });

  it('leaves publication space alone', () => {
    expect(resolveRoute('/f8k2p9')).toBe('app');
    expect(resolveRoute('/_handout/design/tokens.css')).toBe('app');
  });
});
