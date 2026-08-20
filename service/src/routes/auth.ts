/**
 * The four endpoints of the sign-in flow, registered under `API_PREFIX` like
 * `healthRoutes` — this resolves to `/api/auth/session`, `/api/auth/sign-in`,
 * `/api/auth/callback` and `/api/auth/sign-out`.
 */
import type { FastifyInstance } from 'fastify';
import { decideAccess, type AllowList } from '../auth/access';
import type { Provider } from '../auth/provider';
import {
  clearFlowCookie,
  clearSession,
  readFlowCookie,
  readSession,
  writeFlowCookie,
  writeSession,
} from '../auth/session';

export interface AuthRoutesDeps {
  provider: Provider;
  allowedEmails: AllowList;
  signInLabel: string;
}

/** The `redirect_uri` this instance answers under, built from the request that arrives. */
function callbackUrl(request: { protocol: string; hostname: string }): string {
  return `${request.protocol}://${request.hostname}/api/auth/callback`;
}

function currentUrl(request: { protocol: string; hostname: string; url: string }): URL {
  return new URL(request.url, `${request.protocol}://${request.hostname}`);
}

export function authRoutes(app: FastifyInstance, deps: AuthRoutesDeps): void {
  app.get('/auth/session', async (request) => {
    const session = readSession(request);
    if (session === undefined) {
      return { signedIn: false, signInLabel: deps.signInLabel };
    }
    return { signedIn: true, user: { name: session.name, email: session.email } };
  });

  app.get('/auth/sign-in', async (request, reply) => {
    const secure = request.protocol === 'https';
    const start = await deps.provider.startSignIn(callbackUrl(request));
    writeFlowCookie(
      reply,
      { state: start.state, nonce: start.nonce, codeVerifier: start.codeVerifier },
      secure,
    );
    return reply.redirect(start.url.toString());
  });

  app.get('/auth/callback', async (request, reply) => {
    const secure = request.protocol === 'https';
    const flow = readFlowCookie(request);
    clearFlowCookie(reply);

    if (flow === undefined) {
      return reply.redirect('/app/?error=sign_in_failed');
    }

    let claims;
    try {
      claims = await deps.provider.completeSignIn({
        currentUrl: currentUrl(request),
        state: flow.state,
        nonce: flow.nonce,
        codeVerifier: flow.codeVerifier,
      });
    } catch (error) {
      request.log.warn({ err: error }, 'sign-in failed at the identity provider');
      return reply.redirect('/app/?error=sign_in_failed');
    }

    const decision = decideAccess(
      { email: claims.email, emailVerified: claims.emailVerified },
      deps.allowedEmails,
    );

    if (!decision.allowed) {
      // The domain only, never the local part and never a token — this is a warn-level
      // line about who was refused, not a record of who tried.
      const domain = claims.email?.split('@')[1] ?? '(no address)';
      request.log.warn({ refusal: decision.refusal, domain }, 'sign-in refused');
      return reply.redirect('/app/?error=not_allowed');
    }

    writeSession(
      reply,
      { sub: claims.subject, name: claims.name, email: claims.email ?? '' },
      secure,
    );
    return reply.redirect('/app/');
  });

  app.post('/auth/sign-out', async (_request, reply) => {
    clearSession(reply);
    clearFlowCookie(reply);
    return reply.code(204).send();
  });
}
