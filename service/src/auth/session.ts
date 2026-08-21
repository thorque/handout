/**
 * The signed cookies: the Handout session and the short-lived sign-in flow. Both are
 * `@fastify/cookie`-signed compact JSON, base64url — no server-side session store, so a
 * restart of the service does not sign anyone out.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

export const SESSION_COOKIE = 'handout_session';
export const FLOW_COOKIE = 'handout_oidc_flow';
export const REAUTH_COOKIE = 'handout_reauth';

/** Twelve hours, enforced on every read — the browser's `maxAge` is a convenience only. */
const SESSION_TTL_SECONDS = 12 * 60 * 60;
/** Ten minutes: long enough for a login form, short enough that an abandoned flow expires. */
const FLOW_TTL_SECONDS = 10 * 60;
/**
 * Thirty days, deliberately generous rather than a short default. This marker is what
 * forces the *next* sign-in to re-authenticate at the provider after "Abmelden" — and the
 * failure mode of too short a lifetime is exactly the one this exists to close: the
 * provider's own SSO session can easily outlive a short marker, and once it does, the
 * next person on a shared machine is one click into the previous person's account again.
 * An unnecessary extra login screen costs a click; a missing one costs an account.
 */
const REAUTH_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface SessionClaims {
  sub: string;
  name: string;
  email: string;
  exp: number;
}

export interface FlowState {
  state: string;
  nonce: string;
  codeVerifier: string;
  exp: number;
}

function encode(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/** `undefined` for anything that does not decode to a plain JSON object — never a throw. */
function decode(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `Path=/api` because only the HTTP interface needs the cookie: `/app/**` is static files
 * and the delivery route at `/<slug>` must never receive it — a script inside a handout
 * runs on the same origin (see the shared-origin ADR) and must not be handed the cookie by
 * the browser in the first place. `secure` follows the request's own scheme, decided by
 * the caller from `request.protocol` (which itself follows `X-Forwarded-Proto` because
 * `buildApp` sets `trustProxy: true`) — on the directly exposed port 3000 a client could
 * claim https and get a `Secure` cookie it then cannot send back, a dev-only annoyance,
 * never a widening of what the cookie protects.
 */
function cookieOptions(secure: boolean, maxAgeSeconds: number) {
  return {
    path: '/api',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    signed: true,
    maxAge: maxAgeSeconds,
  };
}

export function writeSession(
  reply: FastifyReply,
  claims: { sub: string; name: string; email: string },
  secure: boolean,
): void {
  const exp = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload: SessionClaims = { ...claims, exp };
  reply.setCookie(SESSION_COOKIE, encode(payload), cookieOptions(secure, SESSION_TTL_SECONDS));
}

/** `undefined` for no cookie, a tampered one, or one whose `exp` has passed. */
export function readSession(request: FastifyRequest): SessionClaims | undefined {
  const raw = request.cookies[SESSION_COOKIE];
  if (raw === undefined) return undefined;

  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || unsigned.value === null) return undefined;

  const decoded = decode(unsigned.value);
  if (decoded === undefined) return undefined;

  const { sub, name, email, exp } = decoded;
  if (
    typeof sub !== 'string' ||
    typeof name !== 'string' ||
    typeof email !== 'string' ||
    typeof exp !== 'number'
  ) {
    return undefined;
  }
  if (exp <= Date.now()) return undefined;

  return { sub, name, email, exp };
}

export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/api' });
}

/** 401 in Fastify's own JSON error shape when there is no valid session; the session otherwise. */
export function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
): SessionClaims | undefined {
  const session = readSession(request);
  if (session === undefined) {
    reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Not signed in' });
    return undefined;
  }
  return session;
}

/**
 * Set on sign-out, read (and cleared) by the next sign-in start — see `readAndClearReauthMarker`.
 * Same attributes as the session cookie it stands in for the shadow of.
 */
export function writeReauthMarker(reply: FastifyReply, secure: boolean): void {
  reply.setCookie(REAUTH_COOKIE, '1', cookieOptions(secure, REAUTH_TTL_SECONDS));
}

/**
 * Whether the next sign-in must force re-authentication at the provider, and clears the
 * marker in the same call — a marker consumed once is a marker that cannot fire twice.
 * Reading and clearing together (rather than a separate `clearReauthMarker`) is what
 * guarantees the marker is gone even if the flow that follows is abandoned; the successful
 * callback clears it too, but only as a second, redundant safety net.
 */
export function readAndClearReauthMarker(request: FastifyRequest, reply: FastifyReply): boolean {
  const raw = request.cookies[REAUTH_COOKIE];
  // unsignCookie, not a bare presence check: clearCookie leaves an empty value behind
  // rather than removing the header, and an empty string is still "present".
  const present = raw !== undefined && request.unsignCookie(raw).valid;
  if (present) clearReauthMarker(reply);
  return present;
}

export function clearReauthMarker(reply: FastifyReply): void {
  reply.clearCookie(REAUTH_COOKIE, { path: '/api' });
}

export function writeFlowCookie(
  reply: FastifyReply,
  flow: { state: string; nonce: string; codeVerifier: string },
  secure: boolean,
): void {
  const exp = Date.now() + FLOW_TTL_SECONDS * 1000;
  const payload: FlowState = { ...flow, exp };
  reply.setCookie(FLOW_COOKIE, encode(payload), cookieOptions(secure, FLOW_TTL_SECONDS));
}

/** `undefined` for no cookie, a tampered one, or one whose `exp` has passed. */
export function readFlowCookie(request: FastifyRequest): FlowState | undefined {
  const raw = request.cookies[FLOW_COOKIE];
  if (raw === undefined) return undefined;

  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || unsigned.value === null) return undefined;

  const decoded = decode(unsigned.value);
  if (decoded === undefined) return undefined;

  const { state, nonce, codeVerifier, exp } = decoded;
  if (
    typeof state !== 'string' ||
    typeof nonce !== 'string' ||
    typeof codeVerifier !== 'string' ||
    typeof exp !== 'number'
  ) {
    return undefined;
  }
  if (exp <= Date.now()) return undefined;

  return { state, nonce, codeVerifier, exp };
}

export function clearFlowCookie(reply: FastifyReply): void {
  reply.clearCookie(FLOW_COOKIE, { path: '/api' });
}
