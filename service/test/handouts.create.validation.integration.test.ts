/**
 * The create endpoint against a repository that throws if it is reached — no database at
 * all. Criteria 5 and 6, plus every refusal the endpoint's shape decides on its own. See
 * `handouts.create.integration.test.ts` for the happy paths that need a real database.
 */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig, type Config } from '../src/config';
import type { CreateHandoutInput, Handout } from '../src/handouts/repository';
import { stagingDir } from '../src/handouts/storage';
import { generateSlug } from '../src/slug';
import { stubHandoutRepository } from './support/handouts';
import { multipartFormData, multipartRequest } from './support/multipart';
import { validSessionCookie } from './support/session';

/** A small limit, so the size cases need kilobytes rather than the real 25 MB default. */
const MAX_UPLOAD_BYTES = 1024;

let dataDir: string;
let config: Config;
let app: FastifyInstance;
let cookie: string;

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), 'handout-create-validation-'));
  config = loadConfig({
    LOG_LEVEL: 'silent',
    POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
    HANDOUT_PASSWORD_KEY: Buffer.alloc(32, 7).toString('base64'),
    HANDOUT_OIDC_ISSUER_URL: 'http://handout-caddy.localhost/realms/handout',
    HANDOUT_OIDC_CLIENT_ID: 'handout',
    HANDOUT_OIDC_CLIENT_SECRET: 'test-secret',
    HANDOUT_ALLOWED_EMAILS: 'berger-partner.de',
    HANDOUT_DATA_DIR: dataDir,
    HANDOUT_MAX_UPLOAD_BYTES: String(MAX_UPLOAD_BYTES),
  });
  cookie = await validSessionCookie(config);
});

afterAll(async () => {
  rmSync(dataDir, { recursive: true, force: true });
});

afterEach(async () => {
  await app.close();
});

/** A handout the stub can hand back for the accepted cases, never colliding on its slug. */
function fixedHandout(displayName: string): Handout {
  return {
    id: randomUUID(),
    slug: generateSlug(),
    displayName,
    ownerSubject: 'oidc-subject-a',
    ownerEmail: null,
    isProtected: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastAccessedAt: null,
  };
}

/** Nothing must be left behind in staging, whether the upload was accepted or refused. */
function expectCleanStaging(): void {
  expect(readdirSync(stagingDir(config))).toEqual([]);
}

function buildAppWith(createHandout = stubHandoutRepository().createHandout): {
  app: FastifyInstance;
  createHandout: typeof createHandout;
} {
  const spy = vi.fn<(input: CreateHandoutInput) => Promise<Handout>>(createHandout);
  const built = buildApp(config, {
    checkDatabase: () => Promise.resolve(true),
    handouts: stubHandoutRepository({
      createHandout: spy,
      deleteHandout: vi.fn<(id: string) => Promise<boolean>>(),
    }),
  });
  return { app: built, createHandout: spy };
}

function upload(
  displayName: string | undefined,
  filename: string,
  content: Buffer | string,
  withCookie = true,
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
    headers: form.headers,
    payload: form.payload,
    cookies: withCookie ? { handout_session: cookie } : {},
  });
}

describe('POST /api/handouts, over the size limit — criterion 5', () => {
  it('refuses a file over the limit with a message naming it, reaching neither the database nor staging', async () => {
    const built = buildAppWith();
    app = built.app;

    const response = await upload('Zu groß', 'gross.html', Buffer.alloc(4096, 'a'));

    expect(response.statusCode).toBe(413);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    const body = response.json() as { message: string };
    expect(body.message).toContain(String(MAX_UPLOAD_BYTES));
    expect(built.createHandout).not.toHaveBeenCalled();
    expectCleanStaging();
  });

  it('accepts a file just under the limit', async () => {
    const displayName = 'Knapp drunter';
    const built = buildAppWith(async (input) => fixedHandout(input.displayName));
    app = built.app;

    const response = await upload(displayName, 'knapp.html', Buffer.alloc(1000, 'a'));

    expect(response.statusCode).toBe(201);
    expect(built.createHandout).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/handouts, unauthenticated — criterion 6 (pinning)', () => {
  it('is refused before it ever reaches the repository or writes anything to staging', async () => {
    const built = buildAppWith();
    app = built.app;

    const response = await upload('Ohne Anmeldung', 'ohne.html', '<p>x</p>', false);

    expect(response.statusCode).toBe(401);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.json()).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Not signed in',
    });
    expect(built.createHandout).not.toHaveBeenCalled();
    expectCleanStaging();
  });
});

describe('POST /api/handouts, the refusals the endpoint decides on its own', () => {
  it('refuses a file with no .html/.htm extension', async () => {
    const built = buildAppWith();
    app = built.app;

    const response = await upload(undefined, 'prototyp.txt', '<p>x</p>');

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: expect.any(String) });
    expect(built.createHandout).not.toHaveBeenCalled();
    expectCleanStaging();
  });

  it('refuses a double extension that does not end in .html', async () => {
    const built = buildAppWith();
    app = built.app;

    const response = await upload(undefined, 'prototyp.html.txt', '<p>x</p>');

    expect(response.statusCode).toBe(400);
    expect(built.createHandout).not.toHaveBeenCalled();
    expectCleanStaging();
  });

  it('accepts .HTML case-insensitively', async () => {
    const built = buildAppWith(async (input) => fixedHandout(input.displayName));
    app = built.app;

    const response = await upload('Großschreibung', 'prototyp.HTML', '<p>x</p>');

    expect(response.statusCode).toBe(201);
    expect(built.createHandout).toHaveBeenCalledTimes(1);
  });

  it('refuses a request with no file part at all', async () => {
    const built = buildAppWith();
    app = built.app;
    const form = multipartFormData({ displayName: 'Ohne Datei' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/handouts',
      headers: form.headers,
      payload: form.payload,
      cookies: { handout_session: cookie },
    });

    expect(response.statusCode).toBe(400);
    expect(built.createHandout).not.toHaveBeenCalled();
    expectCleanStaging();
  });

  it('refuses an explicit display name of 201 characters', async () => {
    const built = buildAppWith();
    app = built.app;

    const response = await upload('a'.repeat(201), 'prototyp.html', '<p>x</p>');

    expect(response.statusCode).toBe(400);
    expect(built.createHandout).not.toHaveBeenCalled();
    expectCleanStaging();
  });

  it('truncates a derived name from a 201-character filename to 200, rather than refusing it', async () => {
    const built = buildAppWith(async (input) => fixedHandout(input.displayName));
    app = built.app;
    const filename = `${'a'.repeat(201)}.html`;

    const response = await upload(undefined, filename, '<p>x</p>');

    expect(response.statusCode).toBe(201);
    expect((response.json() as { displayName: string }).displayName).toBe('a'.repeat(200));
  });

  it('treats a blank display name as absent', async () => {
    const built = buildAppWith(async (input) => fixedHandout(input.displayName));
    app = built.app;

    const response = await upload('   ', 'prototyp.html', '<p>x</p>');

    expect(response.statusCode).toBe(201);
    expect((response.json() as { displayName: string }).displayName).toBe('prototyp');
  });

  it('refuses a file literally named .html with no explicit display name', async () => {
    const built = buildAppWith();
    app = built.app;

    const response = await upload(undefined, '.html', '<p>x</p>');

    expect(response.statusCode).toBe(400);
    expect(built.createHandout).not.toHaveBeenCalled();
    expectCleanStaging();
  });
});

describe('POST /api/handouts, part order and shape the endpoint cannot dictate', () => {
  it('still picks up displayName when it is sent after the file part', async () => {
    const built = buildAppWith(async (input) => fixedHandout(input.displayName));
    app = built.app;
    const form = multipartRequest([
      {
        kind: 'file',
        fieldname: 'file',
        filename: 'eins.html',
        contentType: 'text/html',
        content: '<p>eins</p>',
      },
      { kind: 'field', name: 'displayName', value: 'Nach der Datei' },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/handouts',
      headers: form.headers,
      payload: form.payload,
      cookies: { handout_session: cookie },
    });

    expect(response.statusCode).toBe(201);
    expect((response.json() as { displayName: string }).displayName).toBe('Nach der Datei');
  });

  it('ignores a file part under an unrelated field name and still accepts the real one', async () => {
    const built = buildAppWith(async (input) => fixedHandout(input.displayName));
    app = built.app;
    const form = multipartRequest([
      { kind: 'field', name: 'displayName', value: 'Mit Anhang' },
      {
        kind: 'file',
        fieldname: 'thumbnail',
        filename: 'zwei.html',
        contentType: 'text/html',
        content: '<p>zwei</p>',
      },
      {
        kind: 'file',
        fieldname: 'file',
        filename: 'eins.html',
        contentType: 'text/html',
        content: '<p>eins</p>',
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/handouts',
      headers: form.headers,
      payload: form.payload,
      cookies: { handout_session: cookie },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { message?: string };
    expect(body.message).toBeUndefined();
    expect(built.createHandout).toHaveBeenCalledTimes(1);
  });

  it('answers a request with two file parts instead of hanging, and leaves no staging directory behind', async () => {
    const built = buildAppWith();
    app = built.app;
    const form = multipartRequest([
      { kind: 'field', name: 'displayName', value: 'Zwei' },
      {
        kind: 'file',
        fieldname: 'file',
        filename: 'eins.html',
        contentType: 'text/html',
        content: '<p>eins</p>',
      },
      {
        kind: 'file',
        fieldname: 'file',
        filename: 'zwei.html',
        contentType: 'text/html',
        content: '<p>zwei</p>',
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/handouts',
      headers: form.headers,
      payload: form.payload,
      cookies: { handout_session: cookie },
    });

    expect(response.statusCode).toBe(400);
    expect(built.createHandout).not.toHaveBeenCalled();
    expectCleanStaging();
  });
});
