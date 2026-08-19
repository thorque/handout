import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config';
import { API_PREFIX, isReservedPath } from './namespace';
import { sendNotFoundPage } from './routes/not-found';
import { healthRoutes } from './routes/health';
import { handoutRoutes } from './routes/handouts';
import { ensureHandoutsDir } from './handouts/storage';

export interface AppDeps {
  /** Whether the database answers *and* carries the schema. */
  checkDatabase: () => Promise<boolean>;
}

/** Builds the HTTP application. Nothing here listens; `main.ts` does that. */
export function buildApp(config: Config, deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: { level: config.logLevel } });

  app.register(healthRoutes, { prefix: API_PREFIX, checkDatabase: deps.checkDatabase });

  // The service cannot serve without this directory, so it is created before the
  // delivery route is registered rather than lazily on the first request.
  const handoutsDir = ensureHandoutsDir(config);

  // serve: false adds no route of its own; it only decorates the reply with sendFile,
  // which handoutRoutes calls once it has resolved and contained the path itself.
  app.register(fastifyStatic, { root: handoutsDir, serve: false });
  app.register(handoutRoutes, { handoutsDir });

  // Fastify's own JSON shape for the reserved half of the namespace, the plain page for
  // handout space — the same split handoutRoutes makes for a matched request.
  app.setNotFoundHandler((request, reply) => {
    const pathname = request.url.split('?')[0] ?? '/';
    if (isReservedPath(pathname)) {
      reply.code(404).send({ message: 'Not Found', error: 'Not Found', statusCode: 404 });
      return;
    }
    sendNotFoundPage(reply);
  });

  return app;
}
