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
import type { Handout, HandoutRepository } from '../handouts/repository';
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

function tooLarge(maxUploadBytes: number): Refusal {
  return {
    statusCode: 413,
    error: 'Payload Too Large',
    message: `file exceeds the maximum upload size of ${maxUploadBytes} bytes`,
  };
}

/**
 * `@fastify/multipart` raises this once parsing reaches the end of a body that contained a
 * part over `limits.fileSize` — including a part this route ignores, such as a foreign
 * file field over the limit — not only for the `file` part it actually cares about. Its own
 * message names no size at all, so every such case is answered with {@link tooLarge}
 * instead, which does.
 */
function isFileTooLargeError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'FST_REQ_FILE_TOO_LARGE'
  );
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
    let handout: Handout | undefined;

    // Cleanup happens exactly once, here, on every way out of the handler below — a
    // refusal, the happy path, or a rethrown error alike. Scattering `discardStagingDir`
    // calls across the branches that follow is how an orphaned staging directory slips
    // through: this one always runs, and it is harmless to call on a directory that has
    // already been moved into place or never existed, since `discardStagingDir` is a no-op
    // on a missing path.
    try {
      // Never stops early and never returns from inside this loop: @fastify/multipart
      // parses one shared stream, and abandoning the iterator before it ends (a `break`,
      // an early `return`) leaves whatever comes after in the request body unread — the
      // client never sees a response. Every part is walked to the end; only once that is
      // done does the handler decide what to answer.
      try {
        for await (const part of request.parts()) {
          if (part.type === 'field') {
            if (part.fieldname === 'displayName' && typeof part.value === 'string') {
              explicitDisplayName = part.value;
            }
            continue;
          }

          // A file part under a field name other than `file` (a thumbnail, say) is
          // nobody's upload as far as this endpoint is concerned — drained so busboy can
          // move on, then ignored, never a reason to refuse the request on its own. It can
          // still trip the size limit itself, which surfaces below, past this loop.
          if (part.fieldname !== 'file') {
            part.file.resume();
            continue;
          }

          if (sawFilePart) {
            // A second part named `file`. Drained for the same reason as above; refused
            // for a different one — this endpoint accepts exactly one file.
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
            refusal ??= tooLarge(deps.maxUploadBytes);
          }
        }
      } catch (error) {
        // Whichever part tripped the size limit — the one this route cares about, or an
        // ignored one under a foreign field name — @fastify/multipart raises this once
        // parsing reaches the end of the body, not at the truncation itself. By then the
        // whole body has already been drained, so there is nothing left to read; the
        // refusal just needs a message that actually names the limit.
        if (isFileTooLargeError(error)) {
          refusal ??= tooLarge(deps.maxUploadBytes);
        } else {
          throw error;
        }
      }

      if (refusal !== undefined) {
        reply.code(refusal.statusCode).send(refusal);
        return;
      }

      if (stagedDir === undefined || filename === undefined) {
        reply.code(400).send(badRequest('no file was uploaded'));
        return;
      }

      const nameResult = displayNameFrom(explicitDisplayName, filename);
      if (!nameResult.ok) {
        reply.code(400).send(badRequest(nameResult.reason));
        return;
      }

      handout = await deps.handouts.createHandout({
        displayName: nameResult.displayName,
        ownerSubject: claims.sub,
        ownerEmail: claims.email,
      });

      moveIntoPlace(deps.handoutsDir, handout.slug, stagedDir);
      stagedDir = undefined; // now lives under handoutsDir, not staging — nothing left to discard

      const url = handoutUrl({ protocol: request.protocol, host: request.host }, handout.slug);
      reply.code(201).header('Location', url).send({
        slug: handout.slug,
        displayName: handout.displayName,
        url,
        createdAt: handout.createdAt,
      });
    } catch (error) {
      // Reachable from every step above, not only a failed moveIntoPlace: the
      // rethrown multipart error, a staging or pipeline failure, createHandout itself.
      // The delete below only ever fires once a row actually exists — a handout must not
      // outlive its directory — and its slug reservation stays, by design.
      if (handout !== undefined) {
        await deps.handouts.deleteHandout(handout.id);
      }
      throw error;
    } finally {
      if (stagedDir !== undefined) discardStagingDir(stagedDir);
    }
  });
}
