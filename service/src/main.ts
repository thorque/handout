import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { buildApp } from './app';
import { loadConfig } from './config';
import { runMigrations } from './db/migrate';
import { createPool } from './db/pool';
import { createHandoutRepository } from './handouts/repository';

// The .env path is resolved from this module, not from the cwd: the process is started
// from the repository root while `npm run -w service` moves the cwd into `service/`.
loadDotenv({ path: path.resolve(import.meta.dirname, '../../.env'), quiet: true });

const config = loadConfig();

// Before anything serves: a service without its schema would answer requests it cannot
// fulfil, so a failing migration ends the process instead.
try {
  const applied = await runMigrations(config);
  console.log(
    `migrations: ${applied.length} applied, schema "${config.databaseSchema}" is current`,
  );
} catch (error) {
  console.error('migrations failed, refusing to start:', error);
  process.exit(1);
}

const pool = createPool(config);

/**
 * Asks whether the schema is actually there, not merely whether the socket answers —
 * `select 1` would pass against a database with no migrations applied.
 */
async function checkDatabase(): Promise<boolean> {
  try {
    const result = await pool.query<{ ready: boolean }>(
      `SELECT to_regclass('handouts') IS NOT NULL
              AND to_regclass('slug_reservations') IS NOT NULL AS ready`,
    );
    return result.rows[0]?.ready === true;
  } catch {
    return false;
  }
}

const handouts = createHandoutRepository({ pool, passwordKey: config.passwordKey });

// The service cannot serve without the handouts directory (buildApp creates it): a
// permission failure there ends the process the same way a failing migration does above.
let app: ReturnType<typeof buildApp>;
try {
  app = buildApp(config, { checkDatabase, handouts });
} catch (error) {
  console.error('could not prepare the data directory, refusing to start:', error);
  process.exit(1);
}

try {
  // 0.0.0.0, never 127.0.0.1 — a loopback-bound server is unreachable through the proxy.
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
