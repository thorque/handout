import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { buildApp } from './app';
import { loadConfig } from './config';

// The .env path is resolved from this module, not from the cwd: the process is started
// from the repository root while `npm run -w service` moves the cwd into `service/`.
loadDotenv({ path: path.resolve(import.meta.dirname, '../../.env'), quiet: true });

const config = loadConfig();
const app = buildApp(config);

try {
  // 0.0.0.0, never 127.0.0.1 — a loopback-bound server is unreachable through the proxy.
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
