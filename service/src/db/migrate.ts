import path from 'node:path';
import { runner } from 'node-pg-migrate';
import type { Config } from '../config';

/** The runner's own result type; `node-pg-migrate` does not export it under a name. */
export type AppliedMigrations = Awaited<ReturnType<typeof runner>>;

/**
 * The migration files. Resolved from this module and never from `cwd()`, which differs
 * between the service (started from the repository root) and vitest (started in `service/`).
 */
const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../../migrations');

export interface MigrateOptions {
  /** Where the runner's progress goes. Defaults to the runner's own console output. */
  log?: (message: string) => void;
}

/**
 * Applies every pending migration to the configured schema. Runs at start-up, and in the
 * tests against a throwaway schema — the same code path, so what is tested is what runs.
 */
export function runMigrations(
  config: Config,
  options: MigrateOptions = {},
): Promise<AppliedMigrations> {
  return runner({
    databaseUrl: config.databaseUrl,
    dir: MIGRATIONS_DIR,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    schema: config.databaseSchema,
    createSchema: true,
    // 'wait' rather than the default 'fail': two service instances starting at the same
    // moment must queue up behind the lock instead of one of them dying.
    advisoryLockMode: 'wait',
    ...(options.log === undefined ? {} : { log: options.log }),
  });
}
