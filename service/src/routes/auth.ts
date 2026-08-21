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
  clearReauthMarker,
  clearSession,
  readFlowCookie,
  readReauthMarker,
  readSession,
  writeFlowCookie,
  writeReauthMarker,
  writeSession,
} from '../auth/session';

export interface AuthRoutesDeps {
  provider: Provider;
  allowedEmails: AllowList;
  signInLabel: string;
}

/**
 * The `redirect_uri` this instance answers under, built from the request that arrives.
 * `request.host`, not `request.hostname`: Fastify strips the port from `hostname`, and a
 * deployment behind a non-default port (`HANDOUT_HTTP_PORT`, see `.env.example`) would
 * otherwise send the provider a redirect_uri missing it — a registration mismatch at the
 * provider, or a redirect to an address nothing answers on. Measured against this Fastify.
 */
function callbackUrl(request: { protocol: string; host: string }): string {
  return `${request.protocol}://${request.host}/api/auth/callback`;
}

/** Same reasoning as `callbackUrl`: `host`, not `hostname`, to keep a non-default port. */
function currentUrl(request: { protocol: string; host: string; url: string }): URL {
  return new URL(request.url, `${request.protocol}://${request.host}`);
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
    // A sign-out marks every following sign-in for forced re-authentication (see
    // service/src/auth/session.ts) until one actually succeeds — otherwise the provider's
    // own SSO session lets a click straight back into the account that just signed out, on
    // a shared machine straight into whoever used it last. Read-only here: an abandoned
    // attempt must leave the marker standing, because nothing was re-authenticated.
    const forceReauth = readReauthMarker(request);
    const start = await deps.provider.startSignIn(callbackUrl(request), { forceReauth });
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
      // The reauth marker, if one is standing, is left alone: a refusal creates no
      // session, so its reason has not gone away and the next attempt must still force
      // re-authentication.
      return reply.redirect('/app/?error=not_allowed');
    }

    writeSession(
      reply,
      { sub: claims.subject, name: claims.name, email: claims.email ?? '' },
      secure,
    );
    // The only place this is cleared: a session now actually exists, which is the one
    // condition that ends the reason the marker was set for.
    clearReauthMarker(reply);
    return reply.redirect('/app/');
  });

  app.post('/auth/sign-out', async (request, reply) => {
    const secure = request.protocol === 'https';
    clearSession(reply);
    clearFlowCookie(reply);
    // Ends the Handout session only — the provider's SSO session stands, on purpose (see
    // docs/sign-in.md). This marker is what still makes "Abmelden" protect the account on
    // a shared machine: the next sign-in is forced to authenticate again rather than
    // riding that still-standing SSO session straight back in.
    writeReauthMarker(reply, secure);
    return reply.code(204).send();
  });
}
