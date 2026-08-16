import { createRequire } from 'node:module';
import type { FastifyInstance } from 'fastify';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

interface HealthResponse {
  status: 'ok' | 'degraded';
  service: 'handout';
  version: string;
  database: 'ok' | 'unavailable';
}

export interface HealthDeps {
  /** Whether the database answers *and* carries the schema. */
  checkDatabase: () => Promise<boolean>;
}

/** Registered under the API prefix, so this resolves to `/_handout/api/health`. */
export function healthRoutes(app: FastifyInstance, deps: HealthDeps): void {
  app.get('/health', async (_request, reply): Promise<HealthResponse> => {
    const databaseOk = await deps.checkDatabase();
    if (!databaseOk) reply.code(503);

    return {
      status: databaseOk ? 'ok' : 'degraded',
      service: 'handout',
      version,
      database: databaseOk ? 'ok' : 'unavailable',
    };
  });
}
