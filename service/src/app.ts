import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config';
import { API_PREFIX } from './namespace';
import { healthRoutes } from './routes/health';

export interface AppDeps {
  /** Whether the database answers *and* carries the schema. */
  checkDatabase: () => Promise<boolean>;
}

/** Builds the HTTP application. Nothing here listens; `main.ts` does that. */
export function buildApp(config: Config, deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: { level: config.logLevel } });

  app.register(healthRoutes, { prefix: API_PREFIX, checkDatabase: deps.checkDatabase });

  return app;
}
