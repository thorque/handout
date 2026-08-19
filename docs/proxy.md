# The proxy in front

There is exactly **one** Caddyfile, at [`caddy/Caddyfile`](../caddy/Caddyfile). `AGENTS.md`
says why, verbatim: "Do not keep a second Caddyfile for deployment." The port and every
upstream are written as `{$VAR:default}`, so the same file serves the Monoceros workbench
and a deployment, and the variable names are the ones `.monoceros/deploy.md` lists as its
pipeline variables (`CADDY_SITE_PORT`, `APP_HOST`, `APP_PORT`) plus the two this layout
adds (`WEB_HOST`, `WEB_PORT`).

## The three handle blocks

| Block                  | What it is for                                                                                                                                                                                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@app` / `handle @app` | the application's own routes and its built assets, including the design layer below them. In the workbench that reaches the Vite dev server; in a deployment `WEB_HOST`/`WEB_PORT` point at the service, which serves the built app.                                                                                        |
| `@api` / `handle @api` | the HTTP interface. Goes straight to `APP_HOST` (the service) rather than through the dev server — in a deployment `WEB_HOST` is the service anyway, and the browser sees one origin either way because Caddy is the origin. The Vite proxy for `/api` stays, so a direct visit to the dev server's own port keeps working. |
| `handle` (catch-all)   | everything else is handout space and belongs to the service.                                                                                                                                                                                                                                                                |

Both `@app` and `@api` list the exact segment and the segment with a slash
(`path /app /app/*`), not a trailing-wildcard prefix on its own: `/app*` would also match
`/appleee`, a legal handout address, and shadow it. The same reasoning applies to `/api*`
and `apiiiii`.

## Live reload (HMR) through the proxy

Vite's dev client opens its own WebSocket back to the dev server for live reload. The
socket follows `base` (`hmrBase = config.base` in the installed Vite), and with
`base: '/app/'` and no `server.ws.path` set, that socket already sits at exactly `/app/` —
right where the `@app` block above carries it. Verified with a real handshake through
`http://caddy:81`: `101 Switching Protocols` with `Sec-WebSocket-Protocol: vite-hmr`, the
same response the direct connection to port 5173 gives. `scripts/smoke.ts`'s `proxy-hmr`
check repeats that handshake so the route does not silently break again behind a page that
still loads fine.

Handout space is unaffected: the service registers no upgrade handler, so an upgrade
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
certificate for it and fail. One instance answers under one hostname, so in a deployment
the site address carries that one hostname and Caddy obtains one ordinary certificate for
it. The port has to match the `caddy` service's `port`/`httpPort` (81 in the workbench).

## Variables

| Variable          | Workbench default | Compose value                                       |
| ----------------- | ----------------- | --------------------------------------------------- |
| `CADDY_SITE_PORT` | `81`              | `80` (or whatever `HANDOUT_HTTP_PORT` maps to)      |
| `APP_HOST`        | `workspace`       | `handout` (the compose service name)                |
| `APP_PORT`        | `3000`            | `3000`                                              |
| `WEB_HOST`        | `workspace`       | `handout` — the service, which serves the built app |
| `WEB_PORT`        | `5173`            | `3000`                                              |

## The bind-mount

Only the host can add it — the container yml lives outside this container. See
[`README.md`](../README.md), "The proxy in front", for the exact block and the
`monoceros apply` command. Once applied, Caddy watches the file: every later edit to
`caddy/Caddyfile` is live on save, no further apply needed.

## Per-request values come from the request

Anything that has to be correct **per request** — a rendered link, a stamped OIDC issuer, a
redirect target — comes from the request's `X-Forwarded-Host` / `X-Forwarded-Proto`, never
from `CADDY_PUBLIC_URL` or a configured base URL. Configured values are for what is written
once, this Caddyfile for instance. The `trusted_proxies` block above is what makes those
headers trustworthy in the first place; without it Caddy overwrites them with what it sees,
and a page reached over https gets told it arrived over http.
