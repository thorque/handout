/**
 * The catch-all delivery route. See docs/url-namespace.md for why the split between
 * handout space and the application's own namespace is a single predicate rather than
 * routing priority.
 */
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { isReservedPath } from '../namespace';
import { addressFromPath } from '../handouts/address';
import { resolveHandoutFile } from '../handouts/delivery';
import { sendNotFoundPage } from './not-found';

export interface HandoutRoutesDeps {
  handoutsDir: string;
}

export function handoutRoutes(app: FastifyInstance, deps: HandoutRoutesDeps): void {
  app.get('/*', async (request, reply) => {
    // request.url, not request.params['*']: whether find-my-way percent-decodes a
    // wildcard parameter is unverified, and decoding it ourselves in addressFromPath
    // keeps that unverified detail out of the traversal test's outcome.
    const pathname = request.url.split('?')[0] ?? '/';

    if (isReservedPath(pathname)) {
      reply.callNotFound();
      return;
    }

    const address = addressFromPath(pathname);
    if (address === undefined) {
      sendNotFoundPage(reply);
      return;
    }

    const resolved = await resolveHandoutFile(deps.handoutsDir, address.slug, address.rest);
    if (resolved === undefined) {
      sendNotFoundPage(reply);
      return;
    }

    return reply.sendFile(
      path.relative(resolved.realHandoutDir, resolved.realPath),
      resolved.realHandoutDir,
    );
  });
}
