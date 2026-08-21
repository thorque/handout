/**
 * A valid, signed session cookie value for `readSession`/`requireSession` to accept.
 * Lifted out of `auth.session.integration.test.ts` so both new endpoint suites can share
 * it without a second copy drifting from the first.
 */
import fastifyCookie from '@fastify/cookie';
import Fastify from 'fastify';
import type { Config } from '../../src/config';
import { writeSession } from '../../src/auth/session';

export async function validSessionCookie(
  config: Config,
  claims: { sub: string; name: string; email: string } = {
    sub: 's1',
    name: 'Jana Berger',
    email: 'j.berger@berger-partner.de',
  },
): Promise<string> {
  const helper = Fastify();
  await helper.register(fastifyCookie, { secret: config.sessionKey });
  helper.get('/write', async (_request, reply) => {
    writeSession(reply, claims, false);
    return { ok: true };
  });
  await helper.ready();
  const response = await helper.inject({ method: 'GET', url: '/write' });
  const cookie = response.cookies.find((entry) => entry.name === 'handout_session');
  await helper.close();
  if (cookie === undefined) throw new Error('no session cookie was set');
  return cookie.value;
}
