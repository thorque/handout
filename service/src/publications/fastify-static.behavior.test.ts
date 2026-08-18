import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Behaviour of the library `resolvePublicationFile`/`publicationRoutes` build on. Measured
 * once here, ahead of that code, so it is not an assumption: `serve: false` registers no
 * route of its own (`GET /` still reaches our handler), `reply.sendFile` sends the file
 * under the given root with a content type and length, a missing file gets the plugin's
 * own 404 (never our not-found page, because resolution already guarantees the file
 * exists), and it sets ETag/Last-Modified/Cache-Control by default (recorded in
 * docs/data-directory.md, policy left to HAN-21). `root` is not required with
 * `serve: false` — not asserted here, checked once by hand while writing this file.
 */
describe('@fastify/static with serve: false', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'handout-fstatic-'));
  writeFileSync(path.join(root, 'index.html'), '<p>hi</p>');
  writeFileSync(path.join(root, '.hidden'), 'secret');

  function buildApp() {
    const app = Fastify();
    app.register(fastifyStatic, { root, serve: false });
    app.get('/', async (_request, reply) => {
      return reply.send('own handler');
    });
    app.get('/file', async (_request, reply) => {
      return reply.sendFile('index.html', root);
    });
    app.get('/missing', async (_request, reply) => {
      return reply.sendFile('nope.html', root);
    });
    app.get('/dotfile', async (_request, reply) => {
      return reply.sendFile('.hidden', root);
    });
    return app;
  }

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('serve: false registers no route of its own', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('own handler');
    await app.close();
  });

  it('sendFile sends the file with content type, length and a 200', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/file' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/html/);
    expect(response.headers['content-length']).toBe('9');
    expect(response.body).toBe('<p>hi</p>');
    await app.close();
  });

  it('answers a missing file with its own 404, not our not-found page', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/missing' });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('serves a dotfile when asked directly (belt: ours rejects it before this is called)', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/dotfile' });
    // Recorded, not asserted as desirable: our own dotfile rule runs first in
    // resolvePublicationFile, so this path is never reached with a dotfile in practice.
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('sets cache headers by default', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/file' });
    // Recorded for docs/data-directory.md — the policy is HAN-21's.
    expect(response.headers['etag']).toBeDefined();
    expect(response.headers['last-modified']).toBeDefined();
    expect(response.headers['cache-control']).toBeDefined();
    await app.close();
  });
});
