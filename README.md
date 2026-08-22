# Handout

Handout is a self-hosted service that turns a finished HTML artifact — a single file or a
zip — into a shareable URL on infrastructure you control. Recipients need nothing but the
link: no account, no installation, no consent banner. Handout serves what it is given; it
never builds, bundles, edits or rewrites an artifact.

This repository holds the whole application: the HTTP service (`service/`) and the
publisher front end (`web/`), as two npm workspaces of one root project.

## Prerequisites

- Node.js ≥ 22.18 (the repository is developed on 22.23) and the npm that ships with it.
- A PostgreSQL server. Inside the Monoceros workbench one is already running and reachable
  through `POSTGRES_URL`; nothing has to be configured for it.

## Getting started

```
npm install
cp .env.example .env
npm run dev:service   # http://localhost:3000
npm run dev:web       # http://localhost:5173
```

The service applies its migrations at start and refuses to start when they fail — it never
serves without its schema. `/api/health` reports the database, and answers 503
with `"status": "degraded"` when the schema is not there.

## Configuration

Everything is read from the environment; `.env` is loaded for local development.

| Variable                        | Meaning                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `PORT`, `HOST`                  | where the service listens; defaults `3000` and `0.0.0.0`                                                 |
| `LOG_LEVEL`                     | Fastify's log level, default `info`                                                                      |
| `HANDOUT_DATA_DIR`              | where content lives: `<HANDOUT_DATA_DIR>/handouts/<slug>/`, absolute (default `<repo>/var/data`)         |
| `DATABASE_URL`                  | the database; falls back to `POSTGRES_URL`, which the workbench provides                                 |
| `HANDOUT_DATABASE_SCHEMA`       | the schema migrations and queries work in, default `public`                                              |
| `HANDOUT_PASSWORD_KEY`          | **required**, 32 bytes base64 — encrypts handout passwords                                               |
| `HANDOUT_OIDC_ISSUER_URL`       | **required** — the identity provider's issuer URL                                                        |
| `HANDOUT_OIDC_CLIENT_ID`        | **required** — this instance's client id at the provider                                                 |
| `HANDOUT_OIDC_CLIENT_SECRET`    | **required** — this instance's client secret at the provider                                             |
| `HANDOUT_ALLOWED_EMAILS`        | **required** — who may publish, domains and addresses; see [`docs/sign-in.md`](docs/sign-in.md)          |
| `HANDOUT_SIGN_IN_LABEL`         | the sign-in button's caption, default `Mit Firmenkonto anmelden`                                         |
| `HANDOUT_OIDC_INTERNAL_ORIGIN`  | where the service reaches the provider, when that differs from the browser; falls back to `KEYCLOAK_URL` |
| `HANDOUT_MAX_UPLOAD_BYTES`      | the largest file `POST /api/handouts` accepts, in bytes, default `26214400` (25 MB)                      |
| `HANDOUT_MAX_UNPACKED_BYTES`    | the largest a zip may unpack to, in bytes, default `104857600` (100 MB)                                  |
| `HANDOUT_MAX_ZIP_ENTRIES`       | the largest number of files a zip may contain, default `2000`                                            |
| `HANDOUT_MAX_COMPRESSION_RATIO` | the largest ratio of unpacked to packed size a single zip entry may have, default `200`                  |

25 MB is generous enough for a Claude artifact with embedded images. A zip is capped by
that same limit as it is posted, and its unpacked tree is capped separately by
`HANDOUT_MAX_UNPACKED_BYTES` — a small archive can still unpack to something much larger.
See [`docs/data-directory.md`](docs/data-directory.md) for what each of the three zip
limits catches that the others do not, and for the rest of the unpacking rules.

`HANDOUT_PASSWORD_KEY` has no default and no fallback: handout passwords have to stay
readable for their owner, so they are encrypted rather than hashed, and losing the key
loses every password. Generate one with `openssl rand -base64 32`, keep it out of every
tracked file, and put it in the backup plan. See [`docs/database.md`](docs/database.md).

The database tests create a schema of their own (`handout_test_<random>`), migrate it and
drop it again, so a test run leaves the development database untouched. They take the URL
from `HANDOUT_TEST_DATABASE_URL`, `DATABASE_URL` or `POSTGRES_URL`; with none of them set
they skip themselves and say so, with one set but unreachable they fail.

Compose-only variables: `docker compose` reads `.env` too, so the variables the compose
stack needs (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `HANDOUT_HTTP_PORT`,
`CADDY_SITE_PORT`, `APP_HOST`, `APP_PORT`, `WEB_HOST`, `WEB_PORT`) sit in the same file, in
their own fenced block in `.env.example`, commented so they fail loudly until filled in.

Inside the Monoceros workbench both servers are started together with
`monoceros-ctl start handout-app`, and are then reachable at
<http://handout.localhost> (service) and <http://handout-5173.localhost> (front end).

The front end talks to the service through its own origin under a relative path: the Vite
dev server proxies `/api` to the service, so the browser only ever sees one
origin.

## The proxy in front

Caddy fronts everything, including the front end — one Caddyfile at
[`caddy/Caddyfile`](caddy/Caddyfile), for the workbench and for a deployment alike. See
[`docs/proxy.md`](docs/proxy.md) for the three routes it exposes and the reasoning behind
each. The address to use behind it is <http://handout-caddy.localhost>.

The bind-mount that gives Caddy this file lives in the container yml on the host, so it
needs a one-time step there:

```yaml
volumes:
  - projects/handout-app/caddy:/etc/caddy:ro
```

under the `caddy` service, followed by `monoceros apply handout`. After that, Caddy
watches the file: every later edit is live on save.

## The workbench identity provider

Keycloak is the local OIDC provider, and its realm is a file in this repository at
[`keycloak/realm.json`](keycloak/realm.json) — never configured by hand in the admin
console, because Keycloak's database is ephemeral and re-seeds from the import directory on
every apply. The bind-mount that feeds it there lives in the container yml on the host:

```yaml
volumes:
  - projects/handout-app/keycloak/realm.json:/opt/keycloak/data/import/handout-app.json:ro
```

under the `keycloak` service, followed by `monoceros apply handout`. That import only fills
an _empty_ database, so a later edit to the realm file needs its own step to reach the
_running_ Keycloak, from the workspace root:

```
.monoceros/bin/keycloak-realm projects/handout-app/keycloak/realm.json
```

This replaces the realm from the file — every session, and every secret Keycloak generated
itself, is gone afterwards, which is why the client secret in that file is a fixed value
rather than a generated one.

The realm carries one confidential client (`handout`) and six test users, each there for a
different outcome — see [`docs/sign-in.md`](docs/sign-in.md) for the allow-rule they
exercise, and for why the realm turns Keycloak's "Verify Profile" required action off
(needed for `ohne`, the one with no address at all):

| Username | Address                         | Outcome                                 |
| -------- | ------------------------------- | --------------------------------------- |
| `jana`   | `j.berger@berger-partner.de`    | allowed, by domain                      |
| `tim`    | `t.kuhn@extern-gmbh.de`         | allowed, by the single address entry    |
| `kim`    | `k.lang@fremde-firma.de`        | refused — not on the allow-list         |
| `mira`   | `m.roth@mail.berger-partner.de` | refused — a subdomain is not the domain |
| `nils`   | `n.weber@berger-partner.de`     | refused — the address is not verified   |
| `ohne`   | _(no address at all)_           | refused — no address                    |

All six share the password `handout-dev-password`. Sign in at
<http://handout-caddy.localhost/app/> — the only workbench origin sign-in can work at all,
because the browser has to reach the provider through Caddy.

## Running the compose stack

`compose.yaml` and the `Dockerfile` describe the stack Handout actually runs in:
`handout` + `postgres` + `caddy`, each with the volumes that keep their state across a
restart. **This container has no Docker** — it can build and test the application, not run
the stack — so this is a host-side operation:

```
docker compose up -d --build
docker compose ps
```

`.env.example` has the compose-only variables `docker compose` needs, commented, in
addition to the service's own. See [`docs/data-directory.md`](docs/data-directory.md) for
the data layout the `handout-data` volume holds.

## Commands

| Command                | What it does                                                       |
| ---------------------- | ------------------------------------------------------------------ |
| `npm run dev:service`  | starts the service with `tsx watch` on port 3000                   |
| `npm run dev:web`      | starts the Vite dev server on port 5173                            |
| `npm run test`         | runs the unit and integration tests of both workspaces             |
| `npm run typecheck`    | `tsc --noEmit` for the root scripts, the service and the front end |
| `npm run lint`         | oxlint, type-aware, warnings are errors                            |
| `npm run lint:fix`     | oxlint with its auto-fixes applied                                 |
| `npm run format`       | Prettier, writing                                                  |
| `npm run format:check` | Prettier, checking only                                            |
| `npm run smoke`        | checks the two running servers end to end (they must be up)        |
| `npm run check`        | everything in `verify` that needs no running server — what CI runs |
| `npm run verify`       | lint → format:check → typecheck → test → smoke                     |

`npm run verify` is the gate: it is what a change has to pass before it is proposed.

### What runs on a pull request

Every pull request against `main`, and every push to `main`, runs `npm run check` in
GitHub Actions (`.github/workflows/checks.yml`). Not `smoke`: that needs the service, Vite
and Caddy up at once, which the pipeline does not bring up. The workflow starts a Postgres
service container and points the database suites at it, so a database that is missing —
rather than one that fails — cannot leave them skipped behind a green run.

A second, independent job checks the sign-off trailers. It looks at the pull request's own
commits only — `base.sha..head.sha` — which is why the history from before that rule does
not go red.

## Layout

```
service/          the HTTP service (Fastify)
  src/            application code, unit tests next to it
  migrations/     plain SQL, NNNN_name.sql, applied at start
  test/           integration tests, driven through Fastify's app.inject()
web/              the publisher front end (React, Vite)
  src/            components and their tests
  public/design/   tokens.css, fonts, brand assets — served verbatim, under /app/
caddy/Caddyfile   the one proxy config, for the workbench and for a deployment
.github/workflows/  the checks every pull request has to pass
Dockerfile        the service image
compose.yaml      the operating stack: handout + postgres + caddy
scripts/smoke.ts  the end-to-end check behind `npm run smoke`
scripts/check-signoff.sh  the sign-off check behind the pull-request `signoff` job
docs/             decisions that outlive a single story
```

## Conventions

- **Everything in this repository is written in English** — code, comments, documentation
  and commit messages.
- **Every commit carries a `Signed-off-by` trailer** (`git commit -s`). The hook in
  `.husky/` appends it for you — it exists only after an `npm install` in your clone; the
  pull-request check enforces it either way. See [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **TypeScript 7 with oxlint for linting.** The linter is oxlint plus `oxlint-tsgolint`,
  which does type-aware linting against the compiler TypeScript 7 actually ships and
  requires TypeScript 7.0+. The usual alternative, `typescript-eslint`, still declares a
  peer range of `>=4.8.4 <6.1.0` and would pin the project to TypeScript 5.x. Rules that
  need type information — `typescript/no-floating-promises`,
  `typescript/no-misused-promises` — are on. TypeScript 7 removed `baseUrl` and `paths`,
  and the type-aware engine does not support them either: use relative imports.
- **Prettier formats, and nothing argues about it.** `oxfmt` is the intended replacement
  once it reaches 1.0 — its output is Prettier-conformant, so the swap will be a no-diff
  change. Until then a pre-1.0 formatter whose output can move between minor versions is
  the wrong tool for settling formatting.
- **`moduleResolution` is `bundler`** because nothing is emitted yet: `tsx` runs the
  service and Vite builds the front end, so relative imports stay extensionless. This has
  to be revisited when the service gets a real build.
- **The application owns three reserved path segments — `/app`, `/api`, `/unlock`** —
  everything else at the root is handout space. Read
  [`docs/url-namespace.md`](docs/url-namespace.md) before adding a route.
- **Colours, spacings, radii and states come from design tokens**, from the one
  `tokens.css` both the application and a page without React link.
  [`docs/design-system.md`](docs/design-system.md) has the theme resolution, the token-only
  rule and the contrast table, each with the test that enforces it.
- **Direct SQL, no ORM**, and only through the access layer in `service/src/handouts/`.
  [`docs/database.md`](docs/database.md) has the schema and the two invariants it protects:
  the address part of a handout never changes, and an address is never reissued.
- **Published content is a plain directory, deliberately with no storage abstraction.**
  [`docs/data-directory.md`](docs/data-directory.md) has the layout and the resolution
  rules that keep delivery inside a handout's own directory.
- **One identity provider per instance, publishers only.** [`docs/sign-in.md`](docs/sign-in.md)
  has the four configuration values, the allow-rule, the session cookie's attributes, and
  why the provider can answer under two addresses in the workbench.

## License

Handout is licensed under [Apache-2.0](LICENSE) — chosen over MIT for its explicit patent
grant. Copyright belongs to the Handout authors.

Contributions need no Contributor License Agreement; every commit instead carries a
`Signed-off-by` trailer, produced by `git commit -s`. See
[`CONTRIBUTING.md`](CONTRIBUTING.md) for how and why.

The maintainer may build a closed-source commercial fork of this code — Apache-2.0 §5
means a contribution arrives already carrying that permission, for everyone, which is why
no CLA is needed. The open project itself stays under Apache-2.0 either way.

"Handout" and its wordmark are not part of the licence grant — see
[`TRADEMARKS.md`](TRADEMARKS.md).
