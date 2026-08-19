/**
 * The database test support decides, at import time, whether a missing database skips the
 * suites or fails the run. That decision is the one thing about the database suites that
 * running them cannot show, so it is asserted directly here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

/** No database, at all: the workbench provides POSTGRES_URL, so it has to go too. */
function withoutDatabase(ci: string | undefined): void {
  vi.stubEnv('CI', ci);
  vi.stubEnv('HANDOUT_TEST_DATABASE_URL', undefined);
  vi.stubEnv('DATABASE_URL', undefined);
  vi.stubEnv('POSTGRES_URL', undefined);
  vi.resetModules();
}

describe('the database test support', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('fails instead of skipping when CI has no database', async () => {
    withoutDatabase('true');
    await expect(import('./support/database')).rejects.toThrow(/must run/);
  });

  it('still skips outside CI, so a fresh clone stays runnable', async () => {
    withoutDatabase(undefined);
    const support = await import('./support/database');
    expect(support.hasDatabase).toBe(false);
  });

  it('runs the suites when CI has a database', async () => {
    withoutDatabase('true');
    vi.stubEnv('HANDOUT_TEST_DATABASE_URL', 'postgresql://user:pw@127.0.0.1:5432/db');
    vi.resetModules();
    const support = await import('./support/database');
    expect(support.hasDatabase).toBe(true);
  });
});
