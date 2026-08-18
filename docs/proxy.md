# The proxy in front

There is exactly **one** Caddyfile, at [`caddy/Caddyfile`](../caddy/Caddyfile). `AGENTS.md`
says why, verbatim: "Do not keep a second Caddyfile for deployment." The port and every
upstream are written as `{$VAR:default}`, so the same file serves the Monoceros workbench
and a deployment, and the variable names are the ones `.monoceros/deploy.md` lists as its
pipeline variables (`CADDY_SITE_PORT`, `APP_HOST`, `APP_PORT`) plus the two this layout
adds (`WEB_HOST`, `WEB_PORT`).

## The three handle blocks

| Block                            | What it is for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handle /_handout/*`             | the application's own routes, its assets and the API. In the workbench that reaches the Vite dev server, which proxies `/_handout/api` to the service; in a deployment `WEB_HOST`/`WEB_PORT` point at the service itself, which serves the built app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `@vite-dev` / `handle @vite-dev` | **workbench only, and inert anywhere else.** The Vite dev server serves its own client, the application's modules and its pre-bundled dependencies from paths outside `/_handout/` — measured: `/@vite/client`, `/@react-refresh`, `/src/**`, `/node_modules/.vite/deps/**`. Without this block the shell would load through the proxy while every module behind it 404s: the white-page failure a status-only check misses. None of these first path segments can ever be a publication address (`src` is too short for a slug, `node_modules` contains `_`, `@` is not in the slug alphabet), so the block cannot shadow a publication. In a deployment `WEB_HOST` is the service, which answers these paths exactly as the catch-all below would — the block changes nothing there. |
| `handle` (catch-all)             | everything else is publication space and belongs to the service.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

The permanent fix for the `@vite-dev` block is Vite's `base` becoming `/_handout/`, the
open item in [`docs/url-namespace.md`](url-namespace.md); it belongs to the story that
serves the built front end.

## Live reload (HMR) through the proxy

Vite's dev client opens its own WebSocket back to the dev server for live reload. By
default that socket sits at the site root (`/`), which falls into the catch-all `handle`
block above and reaches the service, not Vite — measured: an upgrade request to `/` through
Caddy answers Fastify's plain 404 page instead of `101 Switching Protocols`, while the same
upgrade sent directly to `127.0.0.1:5173` succeeds. `server.ws.clientPort` would not have
fixed this: the problem is the socket's **path**, not its port.

The fix is in `web/vite.config.ts`, not in this file: `server.ws.path` is set to
`/_handout/vite-hmr`, so the socket sits under the reserved prefix and the existing
`handle /_handout/*` block already carries it to Vite — no new Caddy block needed. Verified
with a real handshake through `http://caddy:81`: `101 Switching Protocols` with
`Sec-WebSocket-Protocol: vite-hmr`, the same response the direct connection to port 5173
gives. `scripts/smoke.ts`'s `proxy-hmr` check repeats that handshake so the route does not
silently break again behind a page that still loads fine.

Publication space is unaffected: the service registers no upgrade handler, so an upgrade
request anywhere else still gets the plain not-found page, not a socket.

## `trusted_proxies`

The Caddyfile opens with:

```
{
	servers {
		trusted_proxies static private_ranges
	}
}
```

This block **must stay first**. `monoceros share` puts its own HTTPS terminator in front
of Caddy and forwards over plain http, passing the original scheme in the headers; without
this block Caddy replaces `X-Forwarded-Proto` / `X-Forwarded-Host` with what it sees
itself, which is always http from a private address. Keycloak behind it would then stamp an
`http://` issuer into an https page and login would fail — the same failure mode this rule
prevents for every later story that reads those headers (see below).

## No domain name in the site address

`:{$CADDY_SITE_PORT:81}` carries no domain. With one, Caddy would try to obtain a TLS
certificate for it and fail — there is no certificate story yet. The port has to match the
`caddy` service's `port`/`httpPort` (81 in the workbench). Certificate behaviour is
deliberately not armed here: HAN-22 adds the endpoint Caddy has to ask before it may issue
a certificate per publication host, HAN-12 the address mode and the base domain that
decide when a host even needs one.

## Variables

| Variable          | Workbench default | Compose value                                                               |
| ----------------- | ----------------- | --------------------------------------------------------------------------- |
| `CADDY_SITE_PORT` | `81`              | `80` (or whatever `HANDOUT_HTTP_PORT` maps to)                              |
| `APP_HOST`        | `workspace`       | `handout` (the compose service name)                                        |
| `APP_PORT`        | `3000`            | `3000`                                                                      |
| `WEB_HOST`        | `workspace`       | `handout` (until the built app is served from the service, HAN-13 or later) |
| `WEB_PORT`        | `5173`            | `3000`                                                                      |

## The bind-mount

Only the host can add it — the container yml lives outside this container. See
[`README.md`](../README.md), "The proxy in front", for the exact block and the
`monoceros apply` command. Once applied, Caddy watches the file: every later edit to
`caddy/Caddyfile` is live on save, no further apply needed.

## The rule for later stories: per-request values come from the request

Anything that has to be correct **per request** — a link that is rendered (HAN-13), an
OIDC issuer that is stamped (HAN-8), a redirect target for the password page (HAN-20) —
comes from the request's `X-Forwarded-Host` / `X-Forwarded-Proto`, never from
`CADDY_PUBLIC_URL` or a configured base URL. The configured values are for what is written
once (this Caddyfile, for instance). The `trusted_proxies` block above is what makes those
headers trustworthy in the first place.

**HAN-7 builds none of this** — no header reading, no base-URL configuration. It is
recorded here so HAN-8, HAN-13 and HAN-20 do not each invent it independently.

## A harmless asymmetry

`handle /_handout/*` does not match the bare `/_handout` (no trailing slash), so that one
path reaches the service, which answers it with a JSON 404 —
`isReservedPath('/_handout')` is true. Worth stating, not worth a code change.
