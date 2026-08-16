# Handout

Handout is a self-hosted service that turns a finished HTML artifact — a single file or a
zip — into a shareable URL on infrastructure you control. Recipients need nothing but the
link: no account, no installation, no consent banner. Handout serves what it is given; it
never builds, bundles, edits or rewrites an artifact.

This repository holds the whole application: the HTTP service (`service/`) and the
publisher front end (`web/`), as two npm workspaces of one root project.

## Prerequisites

- Node.js ≥ 22.18 (the repository is developed on 22.23) and the npm that ships with it.

## Getting started

```
npm install
cp .env.example .env
npm run dev:service   # http://localhost:3000
npm run dev:web       # http://localhost:5173
```

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
