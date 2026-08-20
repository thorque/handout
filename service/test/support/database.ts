/**
 * Database tests run against a real Postgres, in a schema of their own: the workbench
 * database is the development database and must survive a test run untouched.
 *
 * With no database configured at all the suites skip themselves (a fresh clone outside the
 * workbench stays runnable). A database that *is* configured but does not answer makes them
 * fail — a broken database must not hide behind a skip.
 *
 * In CI there is no fresh-clone excuse: the pipeline configures the database itself, so a
 * missing one there is a broken pipeline and must fail instead of skip.
 */
import { randomBytes } from 'node:crypto';
import { Client, type Pool } from 'pg';
import { loadConfig, type Config } from '../../src/config';
import { runMigrations } from '../../src/db/migrate';
import { createPool } from '../../src/db/pool';

const rawUrl =
  process.env.HANDOUT_TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

export const DATABASE_URL: string | undefined = rawUrl === '' ? undefined : rawUrl;
export const hasDatabase = DATABASE_URL !== undefined;

/**
 * A pipeline has no fresh-clone excuse: it configures the database itself, so a missing
 * one is a broken pipeline, not a convenience — and a skip there would be a light that
 * is always green. Anything but an empty value or an explicit negation counts as CI,
 * because that is the shape the platforms set.
 */
const ci = process.env.CI;
const REQUIRE_DATABASE = ci !== undefined && ci !== '' && ci !== 'false' && ci !== '0';

const NO_DATABASE =
  'No database configured: set HANDOUT_TEST_DATABASE_URL, DATABASE_URL or POSTGRES_URL.';

if (!hasDatabase) {
  if (REQUIRE_DATABASE) {
    throw new Error(`${NO_DATABASE} In CI the database suites must run, never skip.`);
  }
  console.warn(`${NO_DATABASE} The database suites are being skipped.`);
}

/** A key of the right shape for the tests. Random per run, and never used on real data. */
const TEST_PASSWORD_KEY = randomBytes(32).toString('base64');

export interface TestDatabase {
  schema: string;
  config: Config;
  pool: Pool;
  /** Closes the pool and drops the schema with everything in it. */
  drop: () => Promise<void>;
}

function testConfig(schema: string): Config {
  return loadConfig({
    LOG_LEVEL: 'silent',
    DATABASE_URL: DATABASE_URL,
    HANDOUT_DATABASE_SCHEMA: schema,
    HANDOUT_PASSWORD_KEY: TEST_PASSWORD_KEY,
    HANDOUT_OIDC_ISSUER_URL: 'http://handout-caddy.localhost/realms/handout',
    HANDOUT_OIDC_CLIENT_ID: 'handout',
    HANDOUT_OIDC_CLIENT_SECRET: 'test-secret',
    HANDOUT_ALLOWED_EMAILS: 'berger-partner.de',
  });
}

async function withAdminClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/**
 * A fresh, empty schema. Migrations are not applied — the migration suite wants to watch
 * that happen itself.
 */
export async function createTestSchema(): Promise<TestDatabase> {
  const schema = `handout_test_${randomBytes(6).toString('hex')}`;
  await withAdminClient((client) => client.query(`CREATE SCHEMA "${schema}"`));

  const config = testConfig(schema);
  const pool = createPool(config);

  return {
    schema,
    config,
    pool,
    drop: async () => {
      await pool.end();
      await withAdminClient((client) => client.query(`DROP SCHEMA "${schema}" CASCADE`));
    },
  };
}

/** The same, with the migrations already applied — what every suite but the migration one wants. */
export async function createMigratedTestSchema(): Promise<TestDatabase> {
  const database = await createTestSchema();
  await runMigrations(database.config, { log: () => {} });
  return database;
}
