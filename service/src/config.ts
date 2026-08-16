import path from 'node:path';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Config {
  port: number;
  host: string;
  logLevel: LogLevel;
  dataDir: string;
  databaseUrl: string;
  databaseSchema: string;
  passwordKey: Buffer;
}

const DEFAULT_DATA_DIR = path.resolve(import.meta.dirname, '../../var/data');

/** AES-256 takes a 32-byte key; anything else would only fail at the first encryption. */
const PASSWORD_KEY_BYTES = 32;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function readPort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 3000;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${raw}"`);
  }
  return port;
}

function readHost(raw: string | undefined): string {
  if (raw === undefined || raw === '') return '0.0.0.0';
  if (raw.trim() === '') {
    throw new Error(`HOST must be a non-empty string, got "${raw}"`);
  }
  return raw;
}

function readLogLevel(raw: string | undefined): LogLevel {
  if (raw === undefined || raw === '') return 'info';
  const level = LOG_LEVELS.find((candidate) => candidate === raw);
  if (level === undefined) {
    throw new Error(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}, got "${raw}"`);
  }
  return level;
}

function readDataDir(raw: string | undefined): string {
  if (raw === undefined || raw === '') return DEFAULT_DATA_DIR;
  if (!path.isAbsolute(raw)) {
    throw new Error(`HANDOUT_DATA_DIR must be an absolute path, got "${raw}"`);
  }
  return raw;
}

/**
 * The workbench exports POSTGRES_URL, so a checkout in it needs no .env entry at all —
 * which is the point: the credential stays out of every file.
 */
function readDatabaseUrl(raw: string | undefined, fallback: string | undefined): string {
  const url = raw !== undefined && raw !== '' ? raw : fallback;
  if (url === undefined || url === '') {
    throw new Error('DATABASE_URL must be set (or POSTGRES_URL, which it falls back to)');
  }
  return url;
}

function readDatabaseSchema(raw: string | undefined): string {
  if (raw === undefined || raw === '') return 'public';
  return raw;
}

function readPasswordKey(raw: string | undefined): Buffer {
  if (raw === undefined || raw === '') {
    throw new Error(
      'HANDOUT_PASSWORD_KEY must be set to 32 bytes, base64-encoded ' +
        '(generate one with: openssl rand -base64 32)',
    );
  }
  // Buffer.from() silently drops what it cannot decode, so junk has to be rejected first.
  if (!BASE64.test(raw)) {
    throw new Error(
      'HANDOUT_PASSWORD_KEY must be 32 bytes, base64-encoded ' +
        '(generate one with: openssl rand -base64 32), got a value that is not base64',
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== PASSWORD_KEY_BYTES) {
    throw new Error(
      'HANDOUT_PASSWORD_KEY must be 32 bytes, base64-encoded ' +
        `(generate one with: openssl rand -base64 32), got ${key.length} bytes`,
    );
  }
  return key;
}

/** Reads the service configuration from an environment, rejecting every bad value loudly. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: readPort(env.PORT),
    host: readHost(env.HOST),
    logLevel: readLogLevel(env.LOG_LEVEL),
    dataDir: readDataDir(env.HANDOUT_DATA_DIR),
    databaseUrl: readDatabaseUrl(env.DATABASE_URL, env.POSTGRES_URL),
    databaseSchema: readDatabaseSchema(env.HANDOUT_DATABASE_SCHEMA),
    passwordKey: readPasswordKey(env.HANDOUT_PASSWORD_KEY),
  };
}
