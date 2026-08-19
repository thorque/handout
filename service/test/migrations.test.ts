import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/db/migrate';
import { createTestSchema, hasDatabase, type TestDatabase } from './support/database';

const quiet = { log: () => {} };

/** A handout row needs a reservation first; this is the shortest valid pair. */
async function insertHandout(
  database: TestDatabase,
  slug: string,
  columns: Record<string, unknown> = {},
): Promise<void> {
  await database.pool.query('INSERT INTO slug_reservations (slug) VALUES ($1)', [slug]);
  const names = ['slug', 'display_name', 'owner_subject', ...Object.keys(columns)];
  const values = [slug, 'A handout', 'subject-1', ...Object.values(columns)];
  const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
  await database.pool.query(
    `INSERT INTO handouts (${names.join(', ')}) VALUES (${placeholders})`,
    values,
  );
}

describe.skipIf(!hasDatabase)('migrations', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestSchema();
    await runMigrations(database.config, quiet);
  });

  afterAll(async () => {
    await database.drop();
  });

  it('leaves an empty schema with the documented tables and columns', async () => {
    const { rows } = await database.pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = $1 ORDER BY table_name, column_name`,
      [database.schema],
    );
    const columnsOf = (table: string): string[] =>
      rows.filter((row) => row.table_name === table).map((row) => row.column_name);

    expect(columnsOf('slug_reservations')).toEqual(['reserved_at', 'slug']);
    expect(columnsOf('handouts')).toEqual([
      'created_at',
      'display_name',
      'encrypted_password',
      'id',
      'last_accessed_at',
      'owner_email',
      'owner_subject',
      'slug',
      'updated_at',
    ]);
  });

  it('can be run a second time without applying anything again', async () => {
    const before = await database.pool.query('SELECT count(*)::int AS count FROM pgmigrations');

    await runMigrations(database.config, quiet);

    const after = await database.pool.query('SELECT count(*)::int AS count FROM pgmigrations');
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('lets two runs started at the same moment both finish', async () => {
    // Fails if the advisory lock mode is left at its 'fail' default: two service instances
    // starting together would then make one of them die instead of wait.
    const fresh = await createTestSchema();
    try {
      await expect(
        Promise.all([runMigrations(fresh.config, quiet), runMigrations(fresh.config, quiet)]),
      ).resolves.toHaveLength(2);
    } finally {
      await fresh.drop();
    }
  });

  it('rejects a slug outside the alphabet', async () => {
    // `_` in particular: it stays out of the alphabet for legibility, not for the namespace.
    await expect(
      database.pool.query("INSERT INTO slug_reservations (slug) VALUES ('ab_cde')"),
    ).rejects.toThrow(/check constraint/);
  });

  it('rejects a slug shorter than six characters', async () => {
    await expect(
      database.pool.query("INSERT INTO slug_reservations (slug) VALUES ('abcde')"),
    ).rejects.toThrow(/check constraint/);
  });

  it('rejects a password hash in the ciphertext column', async () => {
    await expect(
      insertHandout(database, 'hashtest', {
        encrypted_password: '$2b$12$abcdefghijklmnopqrstuv',
      }),
    ).rejects.toThrow(/check constraint/);
  });

  it('rejects a handout whose slug was never reserved', async () => {
    await expect(
      database.pool.query(
        "INSERT INTO handouts (slug, display_name, owner_subject) VALUES ('zzzzzzzz', 'x', 's')",
      ),
    ).rejects.toThrow(/foreign key constraint/);
  });

  it('refuses to delete a reservation', async () => {
    await database.pool.query("INSERT INTO slug_reservations (slug) VALUES ('keepthem')");

    await expect(database.pool.query('DELETE FROM slug_reservations')).rejects.toThrow(/permanent/);
  });
});
