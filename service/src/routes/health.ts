import { createRequire } from 'node:module';
import type { FastifyInstance } from 'fastify';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

interface HealthResponse {
  status: 'ok';
  service: 'handout';
  version: string;
}

/** Registered under the API prefix, so this resolves to `/_handout/api/health`. */
export function healthRoutes(app: FastifyInstance): void {
  app.get('/health', (): HealthResponse => {
    return { status: 'ok', service: 'handout', version };
  });
}
