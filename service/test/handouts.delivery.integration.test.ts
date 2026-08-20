import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

let dataDir: string;
let app: FastifyInstance;
const artifactHtml =
  '<!doctype html><html><head><link rel="stylesheet" href="style.css">' +
  '<script src="assets/app.js"></script></head><body>kaffee</body></html>';

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), 'handout-delivery-integration-'));
  const handoutDir = path.join(dataDir, 'handouts', 'kaffee23');
  mkdirSync(path.join(handoutDir, 'sub'), { recursive: true });
  mkdirSync(path.join(handoutDir, 'assets'));

  writeFileSync(path.join(handoutDir, 'index.html'), artifactHtml);
  writeFileSync(path.join(handoutDir, 'style.css'), 'body { color: teal; }');
  writeFileSync(path.join(handoutDir, 'assets', 'app.js'), 'console.log("kaffee")');
  writeFileSync(path.join(handoutDir, 'sub', 'index.html'), 'sub page');
  writeFileSync(path.join(handoutDir, 'blob.bin'), Buffer.from([0, 1, 2, 3]));
  writeFileSync(path.join(handoutDir, '.hidden'), 'secret');
  symlinkSync('/etc', path.join(handoutDir, 'etc'));

  const config = loadConfig({
    LOG_LEVEL: 'silent',
    POSTGRES_URL: 'postgresql://user:pass@host:5432/db',
    HANDOUT_PASSWORD_KEY: Buffer.alloc(32, 7).toString('base64'),
    HANDOUT_OIDC_ISSUER_URL: 'http://handout-caddy.localhost/realms/handout',
    HANDOUT_OIDC_CLIENT_ID: 'handout',
    HANDOUT_OIDC_CLIENT_SECRET: 'test-secret',
    HANDOUT_ALLOWED_EMAILS: 'berger-partner.de',
    HANDOUT_DATA_DIR: dataDir,
  });
  app = buildApp(config, { checkDatabase: () => Promise.resolve(true) });
});

afterAll(async () => {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
});

/** Every `src=`/`href=` in a document, resolved against `base`. */
function localReferences(html: string): string[] {
  const references: string[] = [];
  const pattern = /(?:src|href)\s*=\s*["']([^"']+)["']/g;
  for (const match of html.matchAll(pattern)) {
    const value = match[1];
    if (value !== undefined) references.push(value);
  }
  return references;
}

describe('handout delivery', () => {
  it('serves the handout root with a trailing slash', async () => {
    const response = await app.inject({ method: 'GET', url: '/kaffee23/' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
    expect(response.body).toBe(artifactHtml);
  });

  it('serves the same page without a trailing slash', async () => {
    const response = await app.inject({ method: 'GET', url: '/kaffee23' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(artifactHtml);
  });

  it('serves every reference the page makes', async () => {
    const page = await app.inject({ method: 'GET', url: '/kaffee23/' });

    for (const reference of localReferences(page.body)) {
      const response = await app.inject({ method: 'GET', url: `/kaffee23/${reference}` });
      expect(response.statusCode, `expected 200 for "${reference}"`).toBe(200);
    }
  });

  it('serves the stylesheet and the script with the right content type', async () => {
    const style = await app.inject({ method: 'GET', url: '/kaffee23/style.css' });
    const script = await app.inject({ method: 'GET', url: '/kaffee23/assets/app.js' });

    expect(style.headers['content-type']).toMatch(/text\/css/);
    expect(script.headers['content-type']).toMatch(/javascript/);
  });

  it('serves a nested index.html', async () => {
    const response = await app.inject({ method: 'GET', url: '/kaffee23/sub/' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('sub page');
  });

  it('serves a binary file as application/octet-stream', async () => {
    const response = await app.inject({ method: 'GET', url: '/kaffee23/blob.bin' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/octet-stream');
  });

  it('answers HEAD with the same headers and no body', async () => {
    const get = await app.inject({ method: 'GET', url: '/kaffee23/' });
    const head = await app.inject({ method: 'HEAD', url: '/kaffee23/' });

    expect(head.statusCode).toBe(200);
    expect(head.headers['content-type']).toBe(get.headers['content-type']);
    expect(head.headers['content-length']).toBe(get.headers['content-length']);
    expect(head.body).toBe('');
  });

  it('answers 404 for a dotfile that really exists', async () => {
    const response = await app.inject({ method: 'GET', url: '/kaffee23/.hidden' });

    expect(response.statusCode).toBe(404);
  });

  it('answers 404 for a symlink escape, without leaking /etc/passwd', async () => {
    const response = await app.inject({ method: 'GET', url: '/kaffee23/etc/passwd' });

    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('root:');
  });

  it('answers 404 for an encoded traversal, without leaking /etc/passwd', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/kaffee23/..%2f..%2f..%2fetc%2fpasswd',
    });

    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('root:');
  });

  it('answers a missing file inside a real handout with the not-found page', async () => {
    const response = await app.inject({ method: 'GET', url: '/kaffee23/missing.css' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
    expect(response.body).toContain('Diese Adresse gibt es nicht');
  });

  it('answers 404 for an address-shaped path with no directory — criterion 3', async () => {
    const response = await app.inject({ method: 'GET', url: '/zwerg234/' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
  });

  it('answers 404 for a path that is not address-shaped', async () => {
    const nope = await app.inject({ method: 'GET', url: '/nope' });
    const root = await app.inject({ method: 'GET', url: '/' });

    for (const response of [nope, root]) {
      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).toMatch(/^text\/html/);
    }
  });

  it('keeps the API contract: a missing API route stays JSON', async () => {
    // Every /api/** path needs a session now, including one with no route behind
    // it at all — see service/test/auth.session.integration.test.ts for the full gate.
    // What this test still protects: the JSON shape, not a bare 404.
    const response = await app.inject({ method: 'GET', url: '/api/nope' });

    expect(response.statusCode).toBe(401);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
  });

  it('treats a reserved-segment look-alike as handout space', async () => {
    const response = await app.inject({ method: 'GET', url: '/apiiiii/health' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
  });

  it('never echoes the requested address back', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/%3Cscript%3Ealert(1)%3C%2fscript%3E',
    });

    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('<script');
    expect(response.body).not.toContain('alert');
  });
});
