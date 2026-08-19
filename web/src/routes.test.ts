import { describe, expect, it } from 'vitest';
import { resolveRoute } from './routes';

describe('resolveRoute', () => {
  it('sends the root to the application', () => {
    expect(resolveRoute('/')).toBe('app');
  });

  it('finds the sample page with and without a trailing slash', () => {
    expect(resolveRoute('/app/design-system')).toBe('design-system');
    expect(resolveRoute('/app/design-system/')).toBe('design-system');
  });

  it('matches whole segments, so a longer path is not the sample page', () => {
    // The same rule the reserved segments follow: a string-prefix match would be wrong.
    expect(resolveRoute('/app/design-systemx')).toBe('app');
    expect(resolveRoute('/app/design-system-extra')).toBe('app');
  });

  it('leaves handout space alone', () => {
    expect(resolveRoute('/f8k2p9')).toBe('app');
    expect(resolveRoute('/app/design/tokens.css')).toBe('app');
  });
});
