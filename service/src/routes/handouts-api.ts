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

interface Refusal {
  statusCode: number;
  error: string;
  message: string;
}

function badRequest(message: string): Refusal {
  return { statusCode: 400, error: 'Bad Request', message };
}

export async function handoutApiRoutes(app: FastifyInstance, deps: HandoutApiDeps): Promise<void> {
  // No `limits.files` cap: busboy counts every file part towards it regardless of field
  // name, so a second part under an unrelated field name (a thumbnail, say) would already
  // exhaust a limit of 1 and answer 413 for a request this endpoint has no quarrel with.
  // "At most one part named `file`" is this route's own rule, enforced below — not
  // busboy's blunter "at most one file part total".
  await app.register(fastifyMultipart, {
    limits: { fileSize: deps.maxUploadBytes },
  });

  app.post('/handouts', async (request, reply) => {
    const claims = requireSession(request, reply);
    if (claims === undefined) return;

    let explicitDisplayName: string | undefined;
    let filename: string | undefined;
    let stagedDir: string | undefined;
    let sawFilePart = false;
    let refusal: Refusal | undefined;

    // Never stops early and never returns from inside this loop: @fastify/multipart parses
    // one shared stream, and abandoning the iterator before it ends (a `break`, an early
    // `return`) leaves whatever comes after in the request body unread — the client never
    // sees a response, and a staged directory from an earlier part in the same request is
    // never cleaned up. Every part is walked to the end; only once that is done does the
    // handler decide what to answer.
    try {
      for await (const part of request.parts()) {
        if (part.type === 'field') {
          if (part.fieldname === 'displayName' && typeof part.value === 'string') {
            explicitDisplayName = part.value;
          }
          continue;
        }

        // A file part under a field name other than `file` (a thumbnail, say) is nobody's
        // upload as far as this endpoint is concerned — drained so busboy can move on, then
        // ignored, never a reason to refuse the request.
        if (part.fieldname !== 'file') {
          part.file.resume();
          continue;
        }

        if (sawFilePart) {
          // A second part named `file`. Drained for the same reason as above; refused for
          // a different one — this endpoint accepts exactly one file.
          part.file.resume();
          refusal ??= badRequest('only one file may be uploaded');
          continue;
        }
        sawFilePart = true;
        filename = part.filename;

        if (!isHtmlFilename(part.filename)) {
          part.file.resume();
          refusal ??= badRequest('file must be an .html or .htm file');
          continue;
        }

        stagedDir = createStagingDir(deps.stagingDir);
        await pipeline(part.file, createWriteStream(path.join(stagedDir, INDEX_FILE)));

        if (part.file.truncated) {
          refusal ??= {
            statusCode: 413,
            error: 'Payload Too Large',
            message: `file exceeds the maximum upload size of ${deps.maxUploadBytes} bytes`,
          };
        }
      }
    } catch (error) {
      // @fastify/multipart surfaces a file-too-large error of its own once parsing reaches
      // the end of the body that followed a truncated file — not at the truncation itself,
      // which is why this cannot be seen inside the loop above. `refusal` was already set
      // there from `part.file.truncated`, with a message that actually names the limit
      // (busboy's own says only "request file too large"), so there is nothing left to do
      // here but swallow the error the library still throws on top of it. Anything else is
      // a real failure and has to propagate.
      if (refusal === undefined) throw error;
    }

    if (refusal !== undefined) {
      if (stagedDir !== undefined) discardStagingDir(stagedDir);
      reply.code(refusal.statusCode).send(refusal);
      return;
    }

    if (stagedDir === undefined || filename === undefined) {
      reply.code(400).send(badRequest('no file was uploaded'));
      return;
    }

    const nameResult = displayNameFrom(explicitDisplayName, filename);
    if (!nameResult.ok) {
      discardStagingDir(stagedDir);
      reply.code(400).send(badRequest(nameResult.reason));
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
