/**
 * The one narrow way into the publication tables. Everything the application knows about a
 * publication without reading its files comes from here, and nothing outside this module
 * writes SQL against `publications` or `slug_reservations`.
 */
import type { Pool, PoolClient } from 'pg';
import { decryptPassword, encryptPassword } from '../crypto/password';
import { generateSlug } from '../slug';
import { ImmutableFieldError, SlugExhaustedError } from './errors';

/**
 * The read model. It carries neither the plaintext nor the ciphertext of the password —
 * only whether there is one. The plaintext is reachable through exactly one function,
 * {@link PublicationRepository.readPublicationPassword}.
 */
export interface Publication {
  id: string;
  slug: string;
  displayName: string;
  ownerSubject: string;
  ownerEmail: string | null;
  isProtected: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt: Date | null;
}

export interface CreatePublicationInput {
  displayName: string;
  ownerSubject: string;
  ownerEmail?: string | null;
  password?: string | null;
}

/**
 * `password` is three-valued: absent leaves it as it is, `null` removes the protection, a
 * string replaces it. `slug` is absent by design — it is immutable.
 */
export interface UpdatePublicationPatch {
  displayName?: string;
  ownerEmail?: string | null;
  password?: string | null;
}

export interface PublicationRepository {
  createPublication: (input: CreatePublicationInput) => Promise<Publication>;
  getPublicationById: (id: string) => Promise<Publication | null>;
  getPublicationBySlug: (slug: string) => Promise<Publication | null>;
  listPublicationsByOwner: (ownerSubject: string) => Promise<Publication[]>;
  updatePublication: (id: string, patch: UpdatePublicationPatch) => Promise<Publication>;
  deletePublication: (id: string) => Promise<boolean>;
  touchLastAccessed: (slug: string, at?: Date) => Promise<void>;
  readPublicationPassword: (id: string) => Promise<string | null>;
}

export interface PublicationRepositoryDeps {
  pool: Pool;
  passwordKey: Buffer;
}

interface PublicationRow {
  id: string;
  slug: string;
  display_name: string;
  owner_subject: string;
  owner_email: string | null;
  is_protected: boolean;
  created_at: Date;
  updated_at: Date;
  last_accessed_at: Date | null;
}

/**
 * The read projection. The ciphertext never leaves the database through it — the column is
 * reduced to a boolean right in the query.
 */
const COLUMNS = `id, slug, display_name, owner_subject, owner_email,
  encrypted_password IS NOT NULL AS is_protected, created_at, updated_at, last_accessed_at`;

/** How often a fresh slug is drawn before giving up. A collision is already improbable. */
const SLUG_ATTEMPTS = 8;

function toPublication(row: PublicationRow): Publication {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    ownerSubject: row.owner_subject,
    ownerEmail: row.owner_email,
    isProtected: row.is_protected,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastAccessedAt: row.last_accessed_at,
  };
}

/** Draws slugs until one is free and reserves it, inside the caller's transaction. */
async function reserveSlug(client: PoolClient): Promise<string> {
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
    const result = await client.query<{ slug: string }>(
      'INSERT INTO slug_reservations (slug) VALUES ($1) ON CONFLICT DO NOTHING RETURNING slug',
      [generateSlug()],
    );
    const reserved = result.rows[0];
    if (reserved !== undefined) return reserved.slug;
  }
  throw new SlugExhaustedError(SLUG_ATTEMPTS);
}

export function createPublicationRepository(
  deps: PublicationRepositoryDeps,
): PublicationRepository {
  const { pool, passwordKey } = deps;

  async function findOne(where: string, value: string): Promise<Publication | null> {
    const result = await pool.query<PublicationRow>(
      `SELECT ${COLUMNS} FROM publications WHERE ${where} = $1`,
      [value],
    );
    const row = result.rows[0];
    return row === undefined ? null : toPublication(row);
  }

  return {
    /**
     * Reservation and publication are inserted in one transaction: a publication can never
     * exist without its reservation, and a slug that was never handed out may be drawn again.
     */
    async createPublication(input) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const slug = await reserveSlug(client);
        const encrypted =
          input.password === undefined || input.password === null
            ? null
            : encryptPassword(input.password, passwordKey, slug);
        const result = await client.query<PublicationRow>(
          `INSERT INTO publications (slug, display_name, owner_subject, owner_email, encrypted_password)
           VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
          [slug, input.displayName, input.ownerSubject, input.ownerEmail ?? null, encrypted],
        );
        await client.query('COMMIT');
        const row = result.rows[0];
        if (row === undefined) throw new Error('the publication insert returned no row');
        return toPublication(row);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    getPublicationById(id) {
      return findOne('id', id);
    },

    getPublicationBySlug(slug) {
      return findOne('slug', slug);
    },

    async listPublicationsByOwner(ownerSubject) {
      const result = await pool.query<PublicationRow>(
        `SELECT ${COLUMNS} FROM publications WHERE owner_subject = $1 ORDER BY created_at DESC`,
        [ownerSubject],
      );
      return result.rows.map(toPublication);
    },

    /**
     * Rejects a slug in the patch rather than ignoring it: the address part of a publication
     * is fixed, and a caller that thinks it changed one has to find out.
     */
    async updatePublication(id, patch) {
      if ('slug' in patch) throw new ImmutableFieldError('slug');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const current = await client.query<{ slug: string }>(
          'SELECT slug FROM publications WHERE id = $1 FOR UPDATE',
          [id],
        );
        const row = current.rows[0];
        if (row === undefined) throw new Error(`no publication with id ${id}`);

        const assignments: string[] = [];
        const values: unknown[] = [id];
        const set = (column: string, value: unknown): void => {
          values.push(value);
          assignments.push(`${column} = $${values.length}`);
        };

        if (patch.displayName !== undefined) set('display_name', patch.displayName);
        if (patch.ownerEmail !== undefined) set('owner_email', patch.ownerEmail);
        if (patch.password !== undefined) {
          set(
            'encrypted_password',
            patch.password === null ? null : encryptPassword(patch.password, passwordKey, row.slug),
          );
        }
        // A change to the publication moves `updated_at`; a recorded access does not.
        assignments.push('updated_at = now()');

        const updated = await client.query<PublicationRow>(
          `UPDATE publications SET ${assignments.join(', ')} WHERE id = $1 RETURNING ${COLUMNS}`,
          values,
        );
        await client.query('COMMIT');
        const result = updated.rows[0];
        if (result === undefined) throw new Error(`no publication with id ${id}`);
        return toPublication(result);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    /** A hard delete of the publication row. Its reservation stays, forever. */
    async deletePublication(id) {
      const result = await pool.query('DELETE FROM publications WHERE id = $1', [id]);
      return (result.rowCount ?? 0) > 0;
    },

    async touchLastAccessed(slug, at) {
      await pool.query(
        'UPDATE publications SET last_accessed_at = COALESCE($2::timestamptz, now()) WHERE slug = $1',
        [slug, at ?? null],
      );
    },

    /** The only function that returns a plaintext password. */
    async readPublicationPassword(id) {
      const result = await pool.query<{ slug: string; encrypted_password: string | null }>(
        'SELECT slug, encrypted_password FROM publications WHERE id = $1',
        [id],
      );
      const row = result.rows[0];
      if (row === undefined || row.encrypted_password === null) return null;
      return decryptPassword(row.encrypted_password, passwordKey, row.slug);
    },
  };
}
