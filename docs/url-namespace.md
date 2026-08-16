# Reserved URL namespace

In path mode a publication is addressed as `/<slug>` at the root of the instance domain.
The root of the instance domain is therefore publication space, and everything the
application itself owns has to sit under a prefix that a generated slug can never produce.

That prefix is **`/_handout`**.

## Sub-namespaces

| Path                | Owner                                                        |
| ------------------- | ------------------------------------------------------------ |
| `/_handout/api/**`  | the HTTP API (health today; uploads, publications, sessions later) |
| `/_handout/app/**`  | the front end's own routes once the service serves the built app |
| `/_handout/unlock/**` | the recipient password page                                 |
| `/_handout/assets/**` | the built front end's static assets                         |

Everything else at the root is publication space and belongs to the publication routes.

## The two rules that make this safe

1. **The slug alphabet must never contain `_`.** Slugs are six to eight characters from an
   alphabet without confusable characters; adding `_` to it would let a random slug collide
   with the application's own namespace.
2. **The prefix is matched as a whole path segment, never as a string prefix.**
   `/_handoutx/...` is publication space, not application space. An implementation that
   routes on `url.startsWith('/_handout')` is wrong.

## Why it is fixed now

Retrofitting the prefix after the first publication address has been handed out would break
addresses that already sit in customer mails. The prefix is reversible only until then,
which is why it is decided here and written down rather than left to the story that needs it.

## Open item for the story that serves the built front end

Vite's `base` is left at the default `/` while the front end is only served by the Vite dev
server. As soon as the service serves the built application, `base` has to become
`/_handout/` so the built asset URLs land inside the reserved namespace instead of in
publication space.
