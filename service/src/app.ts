import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { createProvider, internalOriginNotice } from './auth/provider';
import { requireSession } from './auth/session';
import type { Config } from './config';
import type { HandoutRepository } from './handouts/repository';
import { API_PREFIX, isReservedPath } from './namespace';
import { authRoutes } from './routes/auth';
import { handoutApiRoutes } from './routes/handouts-api';
import { handoutRoutes } from './routes/handouts';
import { healthRoutes } from './routes/health';
import { sendNotFoundPage } from './routes/not-found';
import { ensureHandoutsDir, ensureStagingDir, stagingDir } from './handouts/storage';

export interface AppDeps {
  /** Whether the database answers *and* carries the schema. */
  checkDatabase: () => Promise<boolean>;
  handouts: HandoutRepository;
}

/** Paths under `/api/**` the session gate leaves open: the health probe and the sign-in flow. */
function isPublicApiPath(pathname: string): boolean {
  return pathname === `${API_PREFIX}/health` || pathname.startsWith(`${API_PREFIX}/auth/`);
}

/** Whole segment, the same rule `isReservedPath` follows — `/apiiiii` is handout space. */
function isApiPath(pathname: string): boolean {
  return (pathname.split('/')[1] ?? '') === 'api';
}

/** Builds the HTTP application. Nothing here listens; `main.ts` does that. */
export function buildApp(config: Config, deps: AppDeps): FastifyInstance {
  // Caddy is the only thing in front of this service, and its `trusted_proxies` block is
  // what makes X-Forwarded-Proto/-Host trustworthy — this is what lets `secure` and the
  // derived redirect_uri follow the request instead of the raw socket.
  const app = Fastify({ logger: { level: config.logLevel }, trustProxy: true });

  app.register(fastifyCookie, { secret: config.sessionKey });

  const notice = internalOriginNotice(config);
  if (notice !== undefined) app.log.info(notice);

  const provider = createProvider(config);

  app.register(healthRoutes, { prefix: API_PREFIX, checkDatabase: deps.checkDatabase });
  app.register(authRoutes, {
    prefix: API_PREFIX,
    provider,
    allowedEmails: config.allowedEmails,
    signInLabel: config.signInLabel,
  });

  // Everything under /api/** needs a session except /api/health and /api/auth/* — and this
  // has to answer for a path with no route at all too, so the upload endpoints of the
  // coming stories are covered the moment they exist. Measured: Fastify's onRequest hook
  // runs for an unrouted request as well, and stopping here (by sending the reply) keeps
  // the not-found handler from running afterwards — so no separate check is needed there.
  app.addHook('onRequest', async (request, reply) => {
    const pathname = request.url.split('?')[0] ?? '/';
    if (!isApiPath(pathname) || isPublicApiPath(pathname)) return;
    requireSession(request, reply);
  });

  // The service cannot serve without these directories, so they are created before the
  // routes that depend on them are registered rather than lazily on the first request.
  const handoutsDir = ensureHandoutsDir(config);
  ensureStagingDir(config);

  app.register(handoutApiRoutes, {
    prefix: API_PREFIX,
    handouts: deps.handouts,
    handoutsDir,
    stagingDir: stagingDir(config),
    maxUploadBytes: config.maxUploadBytes,
  });

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
