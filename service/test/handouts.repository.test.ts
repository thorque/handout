import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ImmutableFieldError } from '../src/handouts/errors';
import {
  createHandoutRepository,
  type HandoutRepository,
} from '../src/handouts/repository';
import { createMigratedTestSchema, hasDatabase, type TestDatabase } from './support/database';

describe.skipIf(!hasDatabase)('handout repository', () => {
  let database: TestDatabase;
  let repository: HandoutRepository;

  beforeAll(async () => {
    database = await createMigratedTestSchema();
    repository = createHandoutRepository({
      pool: database.pool,
      passwordKey: database.config.passwordKey,
    });
  });

  afterAll(async () => {
    await database.drop();
  });

  beforeEach(async () => {
    // Reservations are permanent by design, so only the handouts are cleared.
    await database.pool.query('DELETE FROM handouts');
  });

  it('reads back everything the application knows about a handout', async () => {
    const created = await repository.createHandout({
      displayName: 'Quarterly report',
      ownerSubject: 'oidc-subject-a',
      ownerEmail: 'thomas@example.com',
    });

    const read = await repository.getHandoutById(created.id);

    expect(read).not.toBeNull();
    expect(read).toMatchObject({
      slug: created.slug,
      displayName: 'Quarterly report',
      ownerSubject: 'oidc-subject-a',
      ownerEmail: 'thomas@example.com',
      isProtected: false,
    });
    expect(read?.createdAt).toBeInstanceOf(Date);
    expect(read?.updatedAt).toBeInstanceOf(Date);
    expect(read?.lastAccessedAt).toBeNull();
    expect(await repository.getHandoutBySlug(created.slug)).toEqual(read);
  });

  it('stores a password as a ciphertext and hands the same plaintext back', async () => {
    const created = await repository.createHandout({
      displayName: 'Protected',
      ownerSubject: 'oidc-subject-a',
      password: 'Sömmerung-42',
    });

    expect(created.isProtected).toBe(true);
    expect(await repository.readHandoutPassword(created.id)).toBe('Sömmerung-42');

    const stored = await database.pool.query<{ encrypted_password: string }>(
      'SELECT encrypted_password FROM handouts WHERE id = $1',
      [created.id],
    );
    expect(stored.rows[0]?.encrypted_password).toMatch(/^v1\./);
    expect(stored.rows[0]?.encrypted_password).not.toContain('Sömmerung-42');
  });

  it('refuses to change the address part, through the layer and in raw SQL', async () => {
    const created = await repository.createHandout({
      displayName: 'Fixed address',
      ownerSubject: 'oidc-subject-a',
    });

    await expect(
      repository.updateHandout(created.id, { slug: 'aaaaaaaa' } as never),
    ).rejects.toBeInstanceOf(ImmutableFieldError);
    expect((await repository.getHandoutById(created.id))?.slug).toBe(created.slug);

    await expect(
      database.pool.query('UPDATE handouts SET slug = $2 WHERE id = $1', [
        created.id,
        'aaaaaaaa',
      ]),
    ).rejects.toThrow(/immutable/);
  });

  it('lists only the handouts of the owner asked for', async () => {
    await repository.createHandout({ displayName: 'A one', ownerSubject: 'owner-a' });
    await repository.createHandout({ displayName: 'A two', ownerSubject: 'owner-a' });
    await repository.createHandout({ displayName: 'B one', ownerSubject: 'owner-b' });

    const listA = await repository.listHandoutsByOwner('owner-a');
    const listB = await repository.listHandoutsByOwner('owner-b');

    expect(listA.map((handout) => handout.displayName).sort()).toEqual(['A one', 'A two']);
    expect(listB.map((handout) => handout.displayName)).toEqual(['B one']);
    // Nothing password-shaped may ride along in a list response.
    for (const handout of [...listA, ...listB]) {
      expect(Object.keys(handout).filter((key) => /password/i.test(key))).toEqual([]);
    }
  });

  it('renames a handout without touching its address', async () => {
    const created = await repository.createHandout({
      displayName: 'Original name',
      ownerSubject: 'owner-a',
    });

    const renamed = await repository.updateHandout(created.id, {
      displayName: 'völlig anders',
    });

    expect(renamed.displayName).toBe('völlig anders');
    expect(renamed.slug).toBe(created.slug);
  });

  it('keeps the reservation when the handout is deleted', async () => {
    const created = await repository.createHandout({
      displayName: 'Gone soon',
      ownerSubject: 'owner-a',
    });

    expect(await repository.deleteHandout(created.id)).toBe(true);
    expect(await repository.getHandoutById(created.id)).toBeNull();

    const reservations = await database.pool.query(
      'SELECT slug FROM slug_reservations WHERE slug = $1',
      [created.slug],
    );
    expect(reservations.rowCount).toBe(1);
    // The address must never be handed out a second time.
    await expect(
      database.pool.query('INSERT INTO slug_reservations (slug) VALUES ($1)', [created.slug]),
    ).rejects.toThrow(/duplicate key/);
  });

  it('clears and sets the password again', async () => {
    const created = await repository.createHandout({
      displayName: 'Toggling',
      ownerSubject: 'owner-a',
      password: 'first-secret',
    });

    const cleared = await repository.updateHandout(created.id, { password: null });
    expect(cleared.isProtected).toBe(false);
    expect(await repository.readHandoutPassword(created.id)).toBeNull();

    const set = await repository.updateHandout(created.id, { password: 'second-secret' });
    expect(set.isProtected).toBe(true);
    expect(await repository.readHandoutPassword(created.id)).toBe('second-secret');
  });

  it('records an access without counting it as a change', async () => {
    const created = await repository.createHandout({
      displayName: 'Visited',
      ownerSubject: 'owner-a',
    });

    await repository.touchLastAccessed(created.slug);

    const read = await repository.getHandoutById(created.id);
    expect(read?.lastAccessedAt).toBeInstanceOf(Date);
    expect(read?.updatedAt.getTime()).toBe(created.updatedAt.getTime());
  });

  it('gives two handouts of the same name two different addresses', async () => {
    const first = await repository.createHandout({
      displayName: 'index.html',
      ownerSubject: 'owner-a',
    });
    const second = await repository.createHandout({
      displayName: 'index.html',
      ownerSubject: 'owner-a',
    });

    expect(first.slug).not.toBe(second.slug);
    expect(first.id).not.toBe(second.id);
  });
});
