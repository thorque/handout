import path from 'node:path';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Config {
  port: number;
  host: string;
  logLevel: LogLevel;
  dataDir: string;
}

const DEFAULT_DATA_DIR = path.resolve(import.meta.dirname, '../../var/data');

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

/** Reads the service configuration from an environment, rejecting every bad value loudly. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: readPort(env.PORT),
    host: readHost(env.HOST),
    logLevel: readLogLevel(env.LOG_LEVEL),
    dataDir: readDataDir(env.HANDOUT_DATA_DIR),
  };
}
