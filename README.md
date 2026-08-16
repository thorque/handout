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
serves without its schema. `/_handout/api/health` reports the database, and answers 503
with `"status": "degraded"` when the schema is not there.

## Configuration

Everything is read from the environment; `.env` is loaded for local development.

| Variable                  | Meaning                                                                  |
| ------------------------- | ------------------------------------------------------------------------ |
| `PORT`, `HOST`            | where the service listens; defaults `3000` and `0.0.0.0`                 |
| `LOG_LEVEL`               | Fastify's log level, default `info`                                      |
| `HANDOUT_DATA_DIR`        | where published content will live, absolute                              |
| `DATABASE_URL`            | the database; falls back to `POSTGRES_URL`, which the workbench provides |
| `HANDOUT_DATABASE_SCHEMA` | the schema migrations and queries work in, default `public`              |
| `HANDOUT_PASSWORD_KEY`    | **required**, 32 bytes base64 — encrypts publication passwords           |

`HANDOUT_PASSWORD_KEY` has no default and no fallback: publication passwords have to stay
readable for their owner, so they are encrypted rather than hashed, and losing the key
loses every password. Generate one with `openssl rand -base64 32`, keep it out of every
tracked file, and put it in the backup plan. See [`docs/database.md`](docs/database.md).

The database tests create a schema of their own (`handout_test_<random>`), migrate it and
drop it again, so a test run leaves the development database untouched. They take the URL
from `HANDOUT_TEST_DATABASE_URL`, `DATABASE_URL` or `POSTGRES_URL`; with none of them set
they skip themselves and say so, with one set but unreachable they fail.

Inside the Monoceros workbench both servers are started together with
`monoceros-ctl start handout-app`, and are then reachable at
<http://handout.localhost> (service) and <http://handout-5173.localhost> (front end).

The front end talks to the service through its own origin under a relative path: the Vite
dev server proxies `/_handout/api` to the service, so the browser only ever sees one
origin.

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
| `npm run verify`       | lint → format:check → typecheck → test → smoke                     |

`npm run verify` is the gate: it is what a change has to pass before it is proposed.

## Layout

```
service/          the HTTP service (Fastify)
  src/            application code, unit tests next to it
  migrations/     plain SQL, NNNN_name.sql, applied at start
  test/           integration tests, driven through Fastify's app.inject()
web/              the publisher front end (React, Vite)
  src/            components and their tests
scripts/smoke.ts  the end-to-end check behind `npm run smoke`
docs/             decisions that outlive a single story
```

## Conventions

- **Everything in this repository is written in English** — code, comments, documentation
  and commit messages.
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
- **The application owns the `/_handout/` path namespace**, everything else at the root is
  publication space. Read [`docs/url-namespace.md`](docs/url-namespace.md) before adding a
  route.
- **Direct SQL, no ORM**, and only through the access layer in `service/src/publications/`.
  [`docs/database.md`](docs/database.md) has the schema and the two invariants it protects:
  the address part of a publication never changes, and an address is never reissued.
