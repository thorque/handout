/**
 * The create endpoint against a repository that throws if it is reached — no database at
 * all. The size and authentication refusals for a single HTML file, every zip refusal, and
 * every refusal the endpoint's shape decides on its own. See
 * `handouts.create.integration.test.ts` for the happy paths that need a real database.
 */
import { randomBytes, randomUUID } from 'node:crypto';
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
import { buildZip } from './support/zip';

/** A small limit, so the size cases need kilobytes rather than the real 25 MB default. */
const MAX_UPLOAD_BYTES = 1024;

/**
 * The zip fixtures below build entries deliberately far apart from these three, so the
 * limit that refuses each one is the only one that could — see
 * `service/src/handouts/zip-entries.ts`'s own tests for the same care. A separate, more
 * generous upload limit: unlike `MAX_UPLOAD_BYTES` above, nothing here pins its value.
 */
const ZIP_MAX_UPLOAD_BYTES = 65_536;
const ZIP_MAX_UNPACKED_BYTES = 2_000_000;
const ZIP_MAX_ENTRIES = 5;
const ZIP_MAX_COMPRESSION_RATIO = 50;

let dataDir: string;
let config: Config;
let zipConfig: Config;
let app: FastifyInstance;
let cookie: string;

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), 'handout-create-validation-'));
  const required = {
    LOG_LEVEL: 'silent',
    POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
    HANDOUT_PASSWORD_KEY: Buffer.alloc(32, 7).toString('base64'),
    HANDOUT_OIDC_ISSUER_URL: 'http://handout-caddy.localhost/realms/handout',
    HANDOUT_OIDC_CLIENT_ID: 'handout',
    HANDOUT_OIDC_CLIENT_SECRET: 'test-secret',
    HANDOUT_ALLOWED_EMAILS: 'berger-partner.de',
    HANDOUT_DATA_DIR: dataDir,
  };
  config = loadConfig({ ...required, HANDOUT_MAX_UPLOAD_BYTES: String(MAX_UPLOAD_BYTES) });
  zipConfig = loadConfig({
    ...required,
    HANDOUT_MAX_UPLOAD_BYTES: String(ZIP_MAX_UPLOAD_BYTES),
    HANDOUT_MAX_UNPACKED_BYTES: String(ZIP_MAX_UNPACKED_BYTES),
    HANDOUT_MAX_ZIP_ENTRIES: String(ZIP_MAX_ENTRIES),
    HANDOUT_MAX_COMPRESSION_RATIO: String(ZIP_MAX_COMPRESSION_RATIO),
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

function buildZipAppWith(createHandout = stubHandoutRepository().createHandout): {
  app: FastifyInstance;
  createHandout: typeof createHandout;
} {
  const spy = vi.fn<(input: CreateHandoutInput) => Promise<Handout>>(createHandout);
  const built = buildApp(zipConfig, {
    checkDatabase: () => Promise.resolve(true),
    handouts: stubHandoutRepository({
      createHandout: spy,
      deleteHandout: vi.fn<(id: string) => Promise<boolean>>(),
    }),
  });
  return { app: built, createHandout: spy };
}

function uploadZip(displayName: string | undefined, filename: string, content: Buffer) {
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

/**
 * Criteria 3 and 6 taken literally: not just a clean `staging/`, but nothing at all under
 * `dataDir` outside the two subdirectories the write path is documented to create.
 */
function expectNothingWrittenOutsideTheLayout(): void {
  expect(readdirSync(dataDir).sort()).toEqual(['handouts', 'staging']);
  expect(readdirSync(stagingDir(zipConfig))).toEqual([]);
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

  it('names the limit and leaves no staging directory when an ignored field, not the file itself, is over it', async () => {
    const built = buildAppWith();
    app = built.app;
    const form = multipartRequest([
      { kind: 'field', name: 'displayName', value: 'Anhang zu groß' },
      {
        kind: 'file',
        fieldname: 'file',
        filename: 'ok.html',
        contentType: 'text/html',
        content: '<p>ok</p>',
      },
      {
        kind: 'file',
        fieldname: 'thumbnail',
        filename: 'thumbnail.bin',
        contentType: 'application/octet-stream',
        content: Buffer.alloc(4096, 'a'),
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/handouts',
      headers: form.headers,
      payload: form.payload,
      cookies: { handout_session: cookie },
    });

    expect(response.statusCode).toBe(413);
    const body = response.json() as { message: string };
    expect(body.message).toContain(String(MAX_UPLOAD_BYTES));
    expect(built.createHandout).not.toHaveBeenCalled();
    expectCleanStaging();
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

describe('POST /api/handouts, the zip branch', () => {
  it('refuses an entry that escapes the target directory, naming it, writing nothing outside it — criterion 3', async () => {
    const built = buildZipAppWith();
    app = built.app;
    const zip = buildZip([
      { name: 'index.html', content: '<h1>harmlos</h1>' },
      { name: '../escape.html', content: '<h1>ausgebrochen</h1>' },
    ]);

    const response = await uploadZip('Ausbruch', 'ausbruch.zip', zip);

    // Pins the message a sender actually sees over HTTP, not just the status: with
    // decodeStrings left at yauzl's default, this exact request answered 400 "the zip
    // could not be read" instead — a message a publisher cannot act on. yauzl's own name
    // check ran first and refused before checkEntry ever named the entry.
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      message: 'the zip contains an entry that escapes the target directory: "../escape.html"',
    });
    expect(built.createHandout).not.toHaveBeenCalled();
    expectNothingWrittenOutsideTheLayout();
  });

  it('refuses an absolute entry path, naming it', async () => {
    const built = buildZipAppWith();
    app = built.app;
    const zip = buildZip([
      { name: 'index.html', content: '<h1>harmlos</h1>' },
      { name: '/etc/passwd', content: 'root:x:0:0' },
    ]);

    const response = await uploadZip('Absolut', 'absolut.zip', zip);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      message: 'the zip contains an entry with an absolute path: "/etc/passwd"',
    });
    expect(built.createHandout).not.toHaveBeenCalled();
    expectNothingWrittenOutsideTheLayout();
  });

  it('refuses a symlink entry', async () => {
    const built = buildZipAppWith();
    app = built.app;
    const zip = buildZip([
      { name: 'index.html', content: '<h1>harmlos</h1>' },
      { name: 'geheim.html', content: '../../etc/passwd', unixMode: 0o120777 },
    ]);

    const response = await uploadZip('Verknüpfung', 'verknuepfung.zip', zip);

    expect(response.statusCode).toBe(400);
    expect(built.createHandout).not.toHaveBeenCalled();
    expectNothingWrittenOutsideTheLayout();
  });

  it('refuses an encrypted entry', async () => {
    const built = buildZipAppWith();
    app = built.app;
    const zip = buildZip([
      { name: 'index.html', content: '<h1>harmlos</h1>' },
      { name: 'secret.bin', content: 'top secret', encrypted: true },
    ]);

    const response = await uploadZip('Verschlüsselt', 'verschluesselt.zip', zip);

    expect(response.statusCode).toBe(400);
    expect(built.createHandout).not.toHaveBeenCalled();
    expectNothingWrittenOutsideTheLayout();
  });

  it('refuses over the entry count — criterion 4', async () => {
    const built = buildZipAppWith();
    app = built.app;
    const entries = [{ name: 'index.html', content: '<h1>viele</h1>' }];
    for (let i = 0; i < 10; i += 1) entries.push({ name: `f${i}.txt`, content: 'x' });
    const zip = buildZip(entries);

    const response = await uploadZip('Viele', 'viele.zip', zip);

    expect(response.statusCode).toBe(413);
    const body = response.json() as { message: string };
    expect(body.message).toContain(String(ZIP_MAX_ENTRIES));
    expect(built.createHandout).not.toHaveBeenCalled();
    expectNothingWrittenOutsideTheLayout();
  });

  it('refuses over the unpacked size, before the limit is crossed — criterion 4', async () => {
    const built = buildZipAppWith();
    app = built.app;
    const zip = buildZip([
      { name: 'index.html', content: '<h1>ok</h1>' },
      {
        name: 'gross.bin',
        content: 'a'.repeat(ZIP_MAX_UNPACKED_BYTES + 1000),
        deflate: true,
      },
    ]);

    const response = await uploadZip('Bombe', 'bombe.zip', zip);

    expect(response.statusCode).toBe(413);
    const body = response.json() as { message: string };
    expect(body.message).toContain(String(ZIP_MAX_UNPACKED_BYTES));
    expect(built.createHandout).not.toHaveBeenCalled();
    expectNothingWrittenOutsideTheLayout();
  });

  it('refuses over the compression ratio — under every other limit', async () => {
    const built = buildZipAppWith();
    app = built.app;
    const zip = buildZip([
      { name: 'index.html', content: '<h1>ok</h1>' },
      { name: 'gross.bin', content: Buffer.alloc(1_200_000, 97), deflate: true },
    ]);

    const response = await uploadZip('Verhältnis', 'verhaeltnis.zip', zip);

    expect(response.statusCode).toBe(413);
    const body = response.json() as { message: string };
    expect(body.message).toContain(String(ZIP_MAX_COMPRESSION_RATIO));
    expect(built.createHandout).not.toHaveBeenCalled();
    expectNothingWrittenOutsideTheLayout();
  });

  it('refuses several folders with no index.html anywhere, naming both places searched — criterion 5', async () => {
    const built = buildZipAppWith();
    app = built.app;
    const zip = buildZip([
      { name: 'a/start.html', content: '<h1>start</h1>' },
      { name: 'b/mehr.html', content: '<h1>mehr</h1>' },
    ]);

    const response = await uploadZip('Ohne Index', 'ohne-index.zip', zip);

    expect(response.statusCode).toBe(400);
    const body = response.json() as { message: string };
    expect(body.message).toContain('root');
    expect(body.message).toContain('top-level folder');
    expect(built.createHandout).not.toHaveBeenCalled();
    expectNothingWrittenOutsideTheLayout();
  });

  it('refuses a single top folder whose index.html sits one level deeper', async () => {
    const built = buildZipAppWith();
    app = built.app;
    const zip = buildZip([{ name: 'site/unter/index.html', content: '<h1>zu tief</h1>' }]);

    const response = await uploadZip('Zu tief', 'zu-tief.zip', zip);

    expect(response.statusCode).toBe(400);
    expect(built.createHandout).not.toHaveBeenCalled();
    expectNothingWrittenOutsideTheLayout();
  });

  it('refuses an index.htm with no index.html, naming the reason a publisher needs — criterion 5', async () => {
    const built = buildZipAppWith();
    app = built.app;
    const zip = buildZip([
      { name: 'index.htm', content: '<h1>falsche Endung</h1>' },
      { name: 'assets/app.js', content: 'x' },
    ]);

    const response = await uploadZip('Falsche Endung', 'index-htm.zip', zip);

    expect(response.statusCode).toBe(400);
    const body = response.json() as { message: string };
    expect(body.message).toContain('index.htm');
    expect(body.message).toContain('index.html');
    expect(built.createHandout).not.toHaveBeenCalled();
    expectNothingWrittenOutsideTheLayout();
  });

  it('refuses a .zip that is not actually a zip, answering 400 rather than 500', async () => {
    const built = buildZipAppWith();
    app = built.app;

    const response = await uploadZip('Kaputt', 'kaputt.zip', Buffer.from('not a zip'));

    expect(response.statusCode).toBe(400);
    expect(built.createHandout).not.toHaveBeenCalled();
    expectNothingWrittenOutsideTheLayout();
  });

  it('reaches createHandout for a well-formed zip — the branch is wired up', async () => {
    const built = buildZipAppWith(async (input) => fixedHandout(input.displayName));
    app = built.app;
    const zip = buildZip([{ name: 'index.html', content: '<h1>ok</h1>' }]);

    const response = await uploadZip('Es geht', 'es-geht.zip', zip);

    expect(response.statusCode).toBe(201);
    expect(built.createHandout).toHaveBeenCalledTimes(1);
  });

  it('refuses a zip over the upload limit, before any unpacking — criterion 4 at the outer boundary', async () => {
    const built = buildZipAppWith();
    app = built.app;
    // Random bytes deliberately do not compress — this has to trip the plain multipart
    // fileSize limit, not any unpacking rule.
    const zip = buildZip([
      { name: 'index.html', content: '<h1>ok</h1>' },
      { name: 'big.bin', content: randomBytes(ZIP_MAX_UPLOAD_BYTES + 4096) },
    ]);

    const response = await uploadZip('Zu groß', 'zu-gross.zip', zip);

    expect(response.statusCode).toBe(413);
    expect(built.createHandout).not.toHaveBeenCalled();
    expectNothingWrittenOutsideTheLayout();
  });
});
