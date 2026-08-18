/**
 * The plain, undesigned not-found page publication space answers with. No design tokens,
 * no stylesheet link, no application frame, no React — React is structurally impossible
 * here (it is the Vite app), and the designed version is HAN-19's `han19-ac-5`; this is
 * the deliberately plain stand-in HAN-7 leaves behind.
 *
 * German, because it is read by recipients (persona Katrin) and the application's
 * user-facing strings are German, while the repository itself stays English.
 *
 * The page never echoes any part of the request — no slug, no path — so there is nothing
 * to escape.
 */
import type { FastifyReply } from 'fastify';

const NOT_FOUND_PAGE = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Nicht gefunden — Handout</title>
  </head>
  <body>
    <h1>Diese Adresse gibt es nicht</h1>
    <p>
      Unter dieser Adresse liegt keine Veröffentlichung. Der Link kann falsch abgeschrieben
      worden sein, oder die Veröffentlichung ist inzwischen gelöscht.
    </p>
  </body>
</html>
`;

export function renderNotFoundPage(): string {
  return NOT_FOUND_PAGE;
}

export function sendNotFoundPage(reply: FastifyReply): void {
  reply.code(404).type('text/html; charset=utf-8').send(renderNotFoundPage());
}
