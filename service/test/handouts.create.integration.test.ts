/**
 * The create endpoint against a real database: the happy paths for a single HTML file and
 * for a zip alike, plus the display-name fallback both share. See
 * `handouts.create.validation.integration.test.ts` for everything that needs no database
 * at all.
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
import { buildZip } from './support/zip';

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

  function publishZip(displayName: string | undefined, filename: string, content: Buffer) {
    const form = multipartFormData(displayName === undefined ? {} : { displayName }, {
      fieldname: 'file',
      filename,
      contentType: 'application/zip',
      content,
    });
    return app.inject({
      method: 'POST',
      url: '/api/handouts',
      headers: form.headers,
      payload: form.payload,
      cookies: { handout_session: cookie },
    });
  }

  /** Every `href`/`src` value a delivered HTML page carries — the same references a browser would fetch. */
  function referencesIn(html: string): string[] {
    const matches = html.matchAll(/(?:href|src)="([^"]+)"/g);
    return [...matches].map((match) => match[1] ?? '');
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

  it(
    'publishes a zip with index.html in the root and several folders beside it, every ' +
      'reference loading correctly',
    async () => {
      const html =
        '<!doctype html><html><head><link rel="stylesheet" href="styles/style.css">' +
        '</head><body><h1>Hallo</h1><script src="assets/app.js"></script></body></html>';
      const css = 'body { color: teal; }';
      const js = 'document.body.append(" script ran")';
      const zip = buildZip([
        { name: 'index.html', content: html },
        { name: 'styles/' },
        { name: 'styles/style.css', content: css },
        { name: 'assets/' },
        { name: 'assets/app.js', content: js },
      ]);

      const created = await publishZip('Prototyp mit Zip', 'prototyp.zip', zip);

      expect(created.statusCode).toBe(201);
      const { slug } = created.json() as { slug: string };

      const index = await app.inject({ method: 'GET', url: `/${slug}/` });
      expect(index.statusCode).toBe(200);
      expect(index.headers['content-type']).toMatch(/^text\/html/);
      expect(index.body).toBe(html);

      // Only fetching what the page actually references — not just "/" answering 200 —
      // can fail against an implementation that writes index.html and drops the rest.
      const references = referencesIn(index.body);
      expect(references.sort()).toEqual(['assets/app.js', 'styles/style.css']);
      for (const reference of references) {
        const asset = await app.inject({ method: 'GET', url: `/${slug}/${reference}` });
        expect(asset.statusCode).toBe(200);
        expect(asset.headers['content-type']).not.toMatch(/^text\/html/);
        expect(asset.body).toBe(reference.endsWith('.css') ? css : js);
      }
    },
  );

  it('strips the one top-level folder so the start page still sits at the root', async () => {
    const zip = buildZip([
      { name: 'prototyp/' },
      { name: 'prototyp/index.html', content: '<h1>Verpackt</h1>' },
      { name: 'prototyp/assets/' },
      { name: 'prototyp/assets/app.js', content: 'x' },
    ]);

    const created = await publishZip('Verpackter Prototyp', 'prototyp.zip', zip);
    expect(created.statusCode).toBe(201);
    const { slug } = created.json() as { slug: string };

    const index = await app.inject({ method: 'GET', url: `/${slug}/` });
    expect(index.statusCode).toBe(200);
    expect(index.body).toBe('<h1>Verpackt</h1>');

    const stripped = await app.inject({ method: 'GET', url: `/${slug}/assets/app.js` });
    expect(stripped.statusCode).toBe(200);
    const notStripped = await app.inject({
      method: 'GET',
      url: `/${slug}/prototyp/assets/app.js`,
    });
    expect(notStripped.statusCode).toBe(404);
  });

  it('publishes a zip and a single HTML file in the same run, each serving its own content', async () => {
    const zip = buildZip([{ name: 'index.html', content: '<h1>Zip</h1>' }]);
    const zipCreated = await publishZip('Aus dem Zip', 'aus-zip.zip', zip);
    const htmlCreated = await publish('Aus der Datei', 'aus-datei.html', '<h1>Datei</h1>');

    expect(zipCreated.statusCode).toBe(201);
    expect(htmlCreated.statusCode).toBe(201);
    const { slug: zipSlug } = zipCreated.json() as { slug: string };
    const { slug: htmlSlug } = htmlCreated.json() as { slug: string };
    expect(zipSlug).not.toBe(htmlSlug);

    const zipDelivered = await app.inject({ method: 'GET', url: `/${zipSlug}/` });
    const htmlDelivered = await app.inject({ method: 'GET', url: `/${htmlSlug}/` });
    expect(zipDelivered.body).toBe('<h1>Zip</h1>');
    expect(htmlDelivered.body).toBe('<h1>Datei</h1>');
  });

  it('falls back to the filename without its extension for a zip, the same way', async () => {
    const zip = buildZip([{ name: 'index.html', content: '<h1>ok</h1>' }]);
    const response = await publishZip(undefined, 'prototyp.zip', zip);

    expect(response.statusCode).toBe(201);
    expect((response.json() as { displayName: string }).displayName).toBe('prototyp');
  });
});
