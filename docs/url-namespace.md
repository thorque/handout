# Reserved URL namespace

In path mode a publication is addressed as `/<slug>` at the root of the instance domain.
The root of the instance domain is therefore publication space, and everything the
application itself owns has to sit under a prefix that a generated slug can never produce.

That prefix is **`/_handout`**.

## Sub-namespaces

| Path                      | Owner                                                              |
| ------------------------- | ------------------------------------------------------------------ |
| `/_handout/api/**`        | the HTTP API (health today; uploads, publications, sessions later) |
| `/_handout/app/**`        | the front end's own routes once the service serves the built app   |
| `/_handout/unlock/**`     | the recipient password page                                        |
| `/_handout/assets/**`     | the built front end's static assets                                |
| `/_handout/design/**`     | the design layer: tokens, fonts, brand assets, the no-React page   |
| `/_handout/design-system` | the sample page showing every base component in every state        |

Everything else at the root is publication space and belongs to the publication routes.

## The two rules that make this safe

1. **The slug alphabet must never contain `_`.** Slugs are six to eight characters from an
   alphabet without confusable characters; adding `_` to it would let a random slug collide
   with the application's own namespace.
2. **The prefix is matched as a whole path segment, never as a string prefix.**
   `/_handoutx/...` is publication space, not application space. An implementation that
   routes on `url.startsWith('/_handout')` is wrong.

## How each half answers a request it cannot serve

`isReservedPath` (`service/src/namespace.ts`) is the single implementation of rule 2 above,
and the request handler consults it first, before anything else decides how to answer:

- Publication space (everything `isReservedPath` says no to — `/`, `/nope`,
  `/<slug>/missing.css`, and `/_handoutx/api/health` too) answers the plain,
  server-rendered not-found page: 404, `text/html`. A human with a browser is what is
  there, so HTML proves the address does not exist just as well as JSON would, and reads
  better. See [`docs/data-directory.md`](data-directory.md) for the resolution rules that
  decide this, and HAN-19's `han19-ac-5` for the designed version this story deliberately
  leaves undone.
- `/_handout/**` keeps Fastify's own JSON 404 shape — the API contract must not change.

Behind the proxy, the application's home is **`/_handout/`**, not `/`: `/` is publication
space and answers the not-found page, while Vite's SPA fallback serves the shell at
`/_handout/` and `resolveRoute` maps it to the `app` route. HAN-13 gives the publisher's
entry point a real landing page there; this story does not pre-empt it with a redirect.
See [`docs/proxy.md`](proxy.md) for the `@vite-dev` handle block that is the temporary
stand-in for Vite's `base` becoming `/_handout/` — the open item below.

## Why it is fixed now

Retrofitting the prefix after the first publication address has been handed out would break
addresses that already sit in customer mails. The prefix is reversible only until then,
which is why it is decided here and written down rather than left to the story that needs it.

## Open item for the story that serves the built front end

Vite's `base` is left at the default `/` while the front end is only served by the Vite dev
server. As soon as the service serves the built application, `base` has to become
`/_handout/` so the built asset URLs land inside the reserved namespace instead of in
publication space.

Files under `web/public/` are a second half of that item: they are copied verbatim and are
**not** rewritten the way hashed assets are. The design layer therefore carries the prefix
in its own path (`public/_handout/design/…`), and when `base` becomes `/_handout/` that
layout has to be revisited or the URLs double up.
