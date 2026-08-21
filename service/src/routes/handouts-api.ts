/**
 * The create endpoint: `POST /handouts`, registered under `API_PREFIX` so this resolves
 * to `/api/handouts`. `@fastify/multipart` is registered inside this plugin's own scope,
 * not in `app.ts` — Fastify's encapsulation is what keeps the multipart content-type
 * parser off the auth and health routes.
 */
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import fastifyMultipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { requireSession } from '../auth/session';
import type { HandoutRepository } from '../handouts/repository';
import { createStagingDir, discardStagingDir, moveIntoPlace } from '../handouts/storage';
import { displayNameFrom, INDEX_FILE, isHtmlFilename } from '../handouts/upload';
import { handoutUrl } from '../handouts/address';

export interface HandoutApiDeps {
  handouts: HandoutRepository;
  handoutsDir: string;
  stagingDir: string;
  maxUploadBytes: number;
}

export async function handoutApiRoutes(app: FastifyInstance, deps: HandoutApiDeps): Promise<void> {
  await app.register(fastifyMultipart, {
    limits: { fileSize: deps.maxUploadBytes, files: 1 },
  });

  app.post('/handouts', async (request, reply) => {
    const claims = requireSession(request, reply);
    if (claims === undefined) return;

    let explicitDisplayName: string | undefined;
    let stagedDir: string | undefined;
    let filename: string | undefined;

    for await (const part of request.parts()) {
      if (part.type === 'field') {
        if (part.fieldname === 'displayName' && typeof part.value === 'string') {
          explicitDisplayName = part.value;
        }
        continue;
      }

      // The single file part. `files: 1` above already keeps a second one from arriving.
      if (part.fieldname !== 'file') {
        part.file.resume();
        continue;
      }

      filename = part.filename;
      if (!isHtmlFilename(part.filename)) {
        part.file.resume();
        reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'file must be an .html or .htm file',
        });
        return;
      }

      stagedDir = createStagingDir(deps.stagingDir);
      await pipeline(part.file, createWriteStream(path.join(stagedDir, INDEX_FILE)));

      if (part.file.truncated) {
        discardStagingDir(stagedDir);
        reply.code(413).send({
          statusCode: 413,
          error: 'Payload Too Large',
          message: `file exceeds the maximum upload size of ${deps.maxUploadBytes} bytes`,
        });
        return;
      }

      break;
    }

    if (stagedDir === undefined || filename === undefined) {
      reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'no file was uploaded',
      });
      return;
    }

    const nameResult = displayNameFrom(explicitDisplayName, filename);
    if (!nameResult.ok) {
      discardStagingDir(stagedDir);
      reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: nameResult.reason });
      return;
    }

    const handout = await deps.handouts.createHandout({
      displayName: nameResult.displayName,
      ownerSubject: claims.sub,
      ownerEmail: claims.email,
    });

    try {
      moveIntoPlace(deps.handoutsDir, handout.slug, stagedDir);
    } catch (error) {
      discardStagingDir(stagedDir);
      await deps.handouts.deleteHandout(handout.id);
      throw error;
    }

    const url = handoutUrl({ protocol: request.protocol, host: request.host }, handout.slug);
    reply.code(201).header('Location', url).send({
      slug: handout.slug,
      displayName: handout.displayName,
      url,
      createdAt: handout.createdAt,
    });
  });
}
