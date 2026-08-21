import { hkdfSync } from 'node:crypto';
import path from 'node:path';
import { parseAllowList, type AllowList } from './auth/access';

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
  oidcIssuerUrl: string;
  oidcClientId: string;
  oidcClientSecret: string;
  allowedEmails: AllowList;
  signInLabel: string;
  oidcInternalOrigin: string | undefined;
  sessionKey: Buffer;
  maxUploadBytes: number;
  maxUnpackedBytes: number;
  maxZipEntries: number;
  maxCompressionRatio: number;
}

const DEFAULT_DATA_DIR = path.resolve(import.meta.dirname, '../../var/data');

/** AES-256 takes a 32-byte key; anything else would only fail at the first encryption. */
const PASSWORD_KEY_BYTES = 32;

/**
 * 25 MB. A Claude artifact with embedded images is rarely larger, and the same limit caps
 * the zip upload as it is posted — the unpacked tree it expands to is capped separately by
 * {@link DEFAULT_MAX_UNPACKED_BYTES}.
 */
const DEFAULT_MAX_UPLOAD_BYTES = 26_214_400;

/**
 * 100 MB, four times the upload limit: an export is mostly already-compressed media plus
 * text and JS that deflate around 4:1, so this covers a full-size upload with headroom and
 * still bounds the disk and the time spent inflating.
 */
const DEFAULT_MAX_UNPACKED_BYTES = 104_857_600;

/**
 * A Claude Design export is a handful of documents plus assets; even a heavy one stays in
 * the low hundreds. An order of magnitude of headroom, while bounding inodes per handout
 * and the pre-flight's own work.
 */
const DEFAULT_MAX_ZIP_ENTRIES = 2000;

/**
 * Text and JS deflate 3-8x, a repetitive dataset can reach the low hundreds; a zip bomb
 * needs thousands to matter.
 */
const DEFAULT_MAX_COMPRESSION_RATIO = 200;

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

function readMaxUploadBytes(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_MAX_UPLOAD_BYTES;
  const bytes = Number(raw);
  if (!Number.isInteger(bytes) || bytes <= 0) {
    throw new Error(`HANDOUT_MAX_UPLOAD_BYTES must be an integer greater than zero, got "${raw}"`);
  }
  return bytes;
}

function readMaxUnpackedBytes(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_MAX_UNPACKED_BYTES;
  const bytes = Number(raw);
  if (!Number.isInteger(bytes) || bytes <= 0) {
    throw new Error(
      `HANDOUT_MAX_UNPACKED_BYTES must be an integer greater than zero, got "${raw}"`,
    );
  }
  return bytes;
}

function readMaxZipEntries(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_MAX_ZIP_ENTRIES;
  const entries = Number(raw);
  if (!Number.isInteger(entries) || entries <= 0) {
    throw new Error(`HANDOUT_MAX_ZIP_ENTRIES must be an integer greater than zero, got "${raw}"`);
  }
  return entries;
}

function readMaxCompressionRatio(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_MAX_COMPRESSION_RATIO;
  const ratio = Number(raw);
  if (!Number.isInteger(ratio) || ratio <= 0) {
    throw new Error(
      `HANDOUT_MAX_COMPRESSION_RATIO must be an integer greater than zero, got "${raw}"`,
    );
  }
  return ratio;
}

function readDatabaseSchema(raw: string | undefined): string {
  if (raw === undefined || raw === '') return 'public';
  return raw;
}

/** The prototype's own default caption — configuration-driven, never hard-coded in the UI. */
const DEFAULT_SIGN_IN_LABEL = 'Mit Firmenkonto anmelden';

/** The derivation's info label: domain separation, so a change here changes every cookie. */
const SESSION_KEY_INFO = 'handout session cookie v1';
const SESSION_KEY_BYTES = 32;

/** Local names an http issuer is tolerated on — everywhere else it is a misconfiguration. */
function isLocalHttpHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

function readOidcIssuerUrl(raw: string | undefined): string {
  if (raw === undefined || raw === '') {
    throw new Error('HANDOUT_OIDC_ISSUER_URL must be set to the provider issuer URL');
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`HANDOUT_OIDC_ISSUER_URL must be an absolute URL, got "${raw}"`);
  }
  if (url.protocol === 'http:' && !isLocalHttpHost(url.hostname)) {
    throw new Error(
      `HANDOUT_OIDC_ISSUER_URL must use https on a real hostname, got "${raw}" — http is ` +
        'accepted only for localhost, a *.localhost name, 127.0.0.1 or [::1]',
    );
  }
  return url.toString().replace(/\/$/, '');
}

function readOidcClientId(raw: string | undefined): string {
  const trimmed = raw?.trim() ?? '';
  if (trimmed === '') {
    throw new Error('HANDOUT_OIDC_CLIENT_ID must be set to the provider client id');
  }
  return trimmed;
}

function readOidcClientSecret(raw: string | undefined): string {
  const trimmed = raw?.trim() ?? '';
  if (trimmed === '') {
    throw new Error('HANDOUT_OIDC_CLIENT_SECRET must be set to the provider client secret');
  }
  return trimmed;
}

function readAllowedEmails(raw: string | undefined): AllowList {
  if (raw === undefined || raw.trim() === '') {
    throw new Error(
      'HANDOUT_ALLOWED_EMAILS must be set — a missing or empty list would let everybody ' +
        'publish here',
    );
  }
  return parseAllowList(raw);
}

function readSignInLabel(raw: string | undefined): string {
  const trimmed = raw?.trim() ?? '';
  return trimmed === '' ? DEFAULT_SIGN_IN_LABEL : trimmed;
}

/**
 * The workbench publishes where its provider actually answers, mirroring `readDatabaseUrl`'s
 * fallback to `POSTGRES_URL` — a checkout in the workbench needs no entry in any file.
 * `undefined` in production, where no such fallback exists.
 */
function readOidcInternalOrigin(
  raw: string | undefined,
  fallback: string | undefined,
): string | undefined {
  const value = raw !== undefined && raw !== '' ? raw : fallback;
  if (value === undefined || value === '') return undefined;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`HANDOUT_OIDC_INTERNAL_ORIGIN must be an origin, got "${value}"`);
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error(`HANDOUT_OIDC_INTERNAL_ORIGIN must be an origin with no path, got "${value}"`);
  }
  return url.origin;
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

/**
 * Derived, not read: no second required secret to forget, domain separation from the
 * password ciphertext by the `info` label, and the only consequence of the key changing is
 * that everyone signs in again. The password key is already the one value the operator has
 * to keep and back up.
 */
function deriveSessionKey(passwordKey: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', passwordKey, '', SESSION_KEY_INFO, SESSION_KEY_BYTES));
}

/** Reads the service configuration from an environment, rejecting every bad value loudly. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = readPort(env.PORT);
  const host = readHost(env.HOST);
  const logLevel = readLogLevel(env.LOG_LEVEL);
  const dataDir = readDataDir(env.HANDOUT_DATA_DIR);
  const databaseUrl = readDatabaseUrl(env.DATABASE_URL, env.POSTGRES_URL);
  const databaseSchema = readDatabaseSchema(env.HANDOUT_DATABASE_SCHEMA);
  const passwordKey = readPasswordKey(env.HANDOUT_PASSWORD_KEY);
  const oidcIssuerUrl = readOidcIssuerUrl(env.HANDOUT_OIDC_ISSUER_URL);
  const oidcClientId = readOidcClientId(env.HANDOUT_OIDC_CLIENT_ID);
  const oidcClientSecret = readOidcClientSecret(env.HANDOUT_OIDC_CLIENT_SECRET);
  const allowedEmails = readAllowedEmails(env.HANDOUT_ALLOWED_EMAILS);
  const signInLabel = readSignInLabel(env.HANDOUT_SIGN_IN_LABEL);
  const oidcInternalOrigin = readOidcInternalOrigin(
    env.HANDOUT_OIDC_INTERNAL_ORIGIN,
    env.KEYCLOAK_URL,
  );
  const maxUploadBytes = readMaxUploadBytes(env.HANDOUT_MAX_UPLOAD_BYTES);
  const maxUnpackedBytes = readMaxUnpackedBytes(env.HANDOUT_MAX_UNPACKED_BYTES);
  const maxZipEntries = readMaxZipEntries(env.HANDOUT_MAX_ZIP_ENTRIES);
  const maxCompressionRatio = readMaxCompressionRatio(env.HANDOUT_MAX_COMPRESSION_RATIO);

  return {
    port,
    host,
    logLevel,
    dataDir,
    databaseUrl,
    databaseSchema,
    passwordKey,
    oidcIssuerUrl,
    oidcClientId,
    oidcClientSecret,
    allowedEmails,
    signInLabel,
    oidcInternalOrigin,
    sessionKey: deriveSessionKey(passwordKey),
    maxUploadBytes,
    maxUnpackedBytes,
    maxZipEntries,
    maxCompressionRatio,
  };
}
