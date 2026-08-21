/**
 * The create endpoint against a real database — criteria 1, 2, 3 and 4 from the story, plus
 * the display-name fallback. See `handouts.create.validation.integration.test.ts` for
 * everything that needs no database at all.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import type { Config } from '../src/config';
import { createHandoutRepository, type HandoutRepository } from '../src/handouts/repository';
import { SLUG_ALPHABET, SLUG_PATTERN } from '../src/slug';
import { createMigratedTestSchema, hasDatabase, type TestDatabase } from './support/database';
import { multipartFormData } from './support/multipart';
import { validSessionCookie } from './support/session';

describe.skipIf(!hasDatabase)('POST /api/handouts, against a real database', () => {
  let database: TestDatabase;
  let repository: HandoutRepository;
  let config: Config;
  let app: FastifyInstance;
  let dataDir: string;
  let cookie: string;

  beforeAll(async () => {
    database = await createMigratedTestSchema();
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'handout-create-integration-'));
    config = { ...database.config, dataDir };
    repository = createHandoutRepository({ pool: database.pool, passwordKey: config.passwordKey });
    app = buildApp(config, { checkDatabase: () => Promise.resolve(true), handouts: repository });
    cookie = await validSessionCookie(config, {
      sub: 'oidc-subject-a',
      name: 'Jana Berger',
      email: 'j.berger@berger-partner.de',
    });
  });

  afterAll(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
    await database.drop();
  });

  beforeEach(async () => {
    // Reservations are permanent by design, so only the handouts are cleared.
    await database.pool.query('DELETE FROM handouts');
  });

  function publish(
    displayName: string | undefined,
    filename: string,
    content: string,
    extraHeaders: Record<string, string> = {},
  ) {
    const form = multipartFormData(displayName === undefined ? {} : { displayName }, {
      fieldname: 'file',
      filename,
      contentType: 'text/html',
      content,
    });
    return app.inject({
      method: 'POST',
      url: '/api/handouts',
      headers: { ...form.headers, ...extraHeaders },
      payload: form.payload,
      cookies: { handout_session: cookie },
    });
  }

  it('publishes a handout and answers with the full address — criterion 1', async () => {
    const response = await publish(
      'Prototyp Berger & Partner',
      'prototyp.html',
      '<!doctype html><h1>Hallo</h1>',
    );

    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      slug: string;
      displayName: string;
      url: string;
      createdAt: string;
    };
    expect(body.slug).toMatch(SLUG_PATTERN);
    expect(body.displayName).toBe('Prototyp Berger & Partner');
    expect(body.url).toBe(`http://localhost:80/${body.slug}/`);
    expect(new Date(body.createdAt).toString()).not.toBe('Invalid Date');
    expect(response.headers.location).toBe(body.url);

    const stored = await repository.getHandoutBySlug(body.slug);
    expect(stored?.ownerSubject).toBe('oidc-subject-a');
  });

  it('builds the address from the forwarded host, not from configuration — criterion 1', async () => {
    const response = await publish(
      'Weiterleitung',
      'weiterleitung.html',
      '<!doctype html><p>weiterleitung</p>',
      { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'handout.example' },
    );

    expect(response.statusCode).toBe(201);
    const body = response.json() as { url: string };
    expect(body.url.startsWith('https://handout.example/')).toBe(true);
  });

  it('serves the uploaded file at the address it just handed out — criterion 2 (pinning)', async () => {
    const html = '<!doctype html><h1>Hallo</h1>';
    const created = await publish('Kaffeepause', 'kaffee.html', html);
    const { slug } = created.json() as { slug: string };

    const delivered = await app.inject({ method: 'GET', url: `/${slug}/` });

    expect(delivered.statusCode).toBe(200);
    expect(delivered.headers['content-type']).toMatch(/^text\/html/);
    expect(delivered.body).toBe(html);
  });

  it('never carries a fragment of the display name in the slug — criterion 3a', async () => {
    const response = await publish(
      'Prototyp Berger & Partner',
      'prototyp.html',
      '<!doctype html><p>a</p>',
    );
    const { slug } = response.json() as { slug: string };

    const normalized = 'Prototyp Berger & Partner'
      .toLowerCase()
      .split('')
      .filter((char) => SLUG_ALPHABET.includes(char))
      .join('');

    for (let start = 0; start + 4 <= normalized.length; start += 1) {
      const window = normalized.slice(start, start + 4);
      expect(slug.includes(window), `slug "${slug}" contains "${window}"`).toBe(false);
    }
  });

  it('gives a different address every time for the same name — criterion 3b', async () => {
    const slugs = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      const response = await publish('Immer derselbe Name', `datei-${i}.html`, `<p>${i}</p>`);
      const { slug } = response.json() as { slug: string };
      slugs.add(slug);
    }
    expect(slugs.size).toBe(12);
  });

  it('keeps two handouts with the same name apart — criterion 4', async () => {
    const first = await publish('Gleicher Name', 'a.html', '<p>erste</p>');
    const second = await publish('Gleicher Name', 'b.html', '<p>zweite</p>');
    const { slug: slugA } = first.json() as { slug: string };
    const { slug: slugB } = second.json() as { slug: string };

    expect(slugA).not.toBe(slugB);
    expect(await repository.getHandoutBySlug(slugA)).not.toBeNull();
    expect(await repository.getHandoutBySlug(slugB)).not.toBeNull();

    const deliveredA = await app.inject({ method: 'GET', url: `/${slugA}/` });
    const deliveredB = await app.inject({ method: 'GET', url: `/${slugB}/` });
    expect(deliveredA.body).toBe('<p>erste</p>');
    expect(deliveredB.body).toBe('<p>zweite</p>');
  });

  it('falls back to the filename without its extension when no display name is given', async () => {
    const response = await publish(undefined, 'quartalsbericht.html', '<p>bericht</p>');

    expect(response.statusCode).toBe(201);
    expect((response.json() as { displayName: string }).displayName).toBe('quartalsbericht');
  });
});
