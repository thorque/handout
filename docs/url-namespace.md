# Reserved URL namespace

A handout is addressed as `/<slug>` at the root of the instance domain. The root of the
instance domain is therefore handout space, and everything the application itself owns has
to sit under a segment that a generated slug can never produce.

There are three such segments: **`app`**, **`api`**, **`unlock`**.

## Sub-namespaces

| Path         | Owner                                                                            |
| ------------ | -------------------------------------------------------------------------------- |
| `/app/**`    | the front end: its own routes, its built assets, and the design layer below them |
| `/api/**`    | the HTTP interface (health today; more later)                                    |
| `/unlock/**` | the recipient password page — reserved, no route behind it yet                   |

Everything else at the root is handout space and belongs to the delivery route.

## The two rules that make this safe

1. **A reserved segment must never be possible as a slug.** A slug is six to eight
   characters from an alphabet without confusable characters
   (`23456789abcdefghjkmnpqrstuvwxyz`); `app`, `api` and `unlock` are each safe for their
   own reason — `app` and `api` are shorter than the minimum length, `unlock` contains `l`
   and `o`, which are outside the alphabet. `assets` is exactly six lowercase letters from
   that alphabet, though, and is therefore _not_ a reserved word of its own — the built
   assets live under `/app/` instead, where the collision question does not arise.
   `service/src/namespace.ts` implements this check directly against length and alphabet
   (`cannotBeSlug`), not by leaning on the upper end of the slug length: widening that
   range later must not silently make a reserved word collidable.
2. **A reserved segment is matched as a whole path segment, never as a string prefix.**
   `/appleee/...` is handout space, not the application — `appleee` is a legal seven-
   character slug. An implementation that routes on `url.startsWith('/app')` is wrong.

## How each half answers a request it cannot serve

`isReservedPath` (`service/src/namespace.ts`) is the single implementation of rule 2 above,
and the request handler consults it first, before anything else decides how to answer:

- Handout space (everything `isReservedPath` says no to — `/`, `/nope`,
  `/<slug>/missing.css`, and `/appleee` too) answers the plain, server-rendered not-found
  page: 404, `text/html`. A human with a browser is what is there, so HTML proves the
  address does not exist just as well as JSON would, and reads better. See
  [`docs/data-directory.md`](data-directory.md) for the resolution rules that decide this.
- `app`, `api` and `unlock` keep Fastify's own JSON 404 shape — the API contract must not
  change, and a reserved segment with no route behind it (`unlock` today) answers exactly
  the same way as a missing API route does.

Behind the proxy, the application's home is **`/app/`**, not `/`: `/` is handout space and
answers the not-found page, while Vite's own base middleware serves the shell at `/app/`
and `resolveRoute` maps it to the `app` route. `/` is deliberately not redirected there —
the root belongs to handout space. See [`docs/proxy.md`](proxy.md) for how Caddy carries
each segment to its upstream.

## Why it is fixed now

Retrofitting a reserved segment after the first handout address has been handed out would
break addresses that already sit in customer mails. The namespace is reversible only until
then, which is why it is decided here and written down rather than left to the story that
needs it.

## `/realms/*` and `/resources/*` are diverted, not reserved

The identity provider's paths, `/realms/*` and `/resources/*`, never reach the service at
all: Caddy's `@provider` block answers them directly (see [`docs/proxy.md`](proxy.md)).
They are therefore not a fourth application segment, and `isReservedPath` does not know
them — the service never has to decide who owns them, because the request never arrives.
The same safety rule still has to hold, though: neither word may ever be generated as a
slug, or a proxy in front of a differently-configured instance could route a real handout
address to the provider instead of to its content. `cannotBeSlug` in
`service/src/namespace.ts` covers both, next to the three reserved segments above.

## The asymmetry between `index.html` and the design layer

`web/index.html` is transformed by Vite: a `/`-absolute reference inside it is rewritten
with `base` (`/app/`) at request or build time, so the file itself writes `/design/…` and
never `/app/design/…` — writing the latter would double up to `/app/app/design/…`. Files
under `web/public/`, including `tokens.css` and `no-react.html`, are copied verbatim and are
never rewritten, so they carry the **final** path, `/app/design/…`, themselves. Both halves
serve the same files at the same URLs; only the sources looks asymmetric.
