import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config';
import { API_PREFIX } from './namespace';
import { healthRoutes } from './routes/health';

/** Builds the HTTP application. Nothing here listens; `main.ts` does that. */
export function buildApp(config: Config): FastifyInstance {
  const app = Fastify({ logger: { level: config.logLevel } });

  app.register(healthRoutes, { prefix: API_PREFIX });

  return app;
}
