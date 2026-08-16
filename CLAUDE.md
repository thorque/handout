# Handout

Self-hosted service that turns a finished HTML artifact — a single file or a zip — into a
shareable URL on infrastructure we control. Recipients need nothing but the link: no
account, no installation, no consent banner.

Handout serves what it is given. It never builds, bundles, edits or rewrites an artifact,
and it runs no server-side logic on behalf of published content.

## Source of truth

Product and technical decisions live in Confluence, the work in Jira project `HAN`. Read
the page belonging to a story before implementing it — the reasoning behind the rules
below is there, and it matters more than the rules themselves.

- Brief — <https://conciso.atlassian.net/wiki/spaces/EE/pages/4683890693>
- Technical Brief — <https://conciso.atlassian.net/wiki/spaces/EE/pages/4684578875>
- Design Brief — <https://conciso.atlassian.net/wiki/spaces/EE/pages/4684316710>
- Personas: Thomas (publishes, 4684480514), Katrin (receives, 4684316676)
- Journeys 1–3 under 4684415010
- Design system and prototype — <https://claude.ai/design/p/973f31d0-9780-4437-9d14-6bea66e7c39f>

If the code and Confluence disagree, Confluence wins. Raise the mismatch instead of
coding around it.

## Architecture

- **Service**: one Node.js HTTP service. It accepts uploads, validates and unpacks them,
  swaps the target directory atomically, and serves the content. No ORM, no extra layers.
- **Front end**: React with Vite, talking only to the HTTP API — the same path a CLI or an
  agent would use. There are no UI-only shortcuts into the service.
- **Storage**: published content stays plain directories on disk; metadata lives in
  Postgres.
- **Proxy**: Caddy terminates TLS and routes by hostname or path. It asks Handout whether
  a hostname is known before issuing a certificate.
- **Login**: exactly one OIDC provider per instance, for publishers only. Recipients never
  log in.

## Decisions that are easy to get wrong

- **Replace overwrites.** There is exactly one version per publication — no previous
  version, no timeline, no address for earlier states. A bad upload is fixed by exporting
  again from the agent and replacing again.
- **The password is encrypted, not hashed.** It has to stay retrievable so the owner can
  look it up weeks later. The key comes from instance configuration, never from the
  database. Plaintext goes to the owner only, only on request, never in a list response,
  never into logs.
- **The address part is random only.** Six to eight characters, never derived from the
  name, never reissued after deletion — a link from an old customer mail must never
  resolve to someone else's content later.
- **Display name and address are separate.** Renaming must never change the address.
- **The password page belongs to the application**, under the instance domain, not to the
  publication. Redirect with a validated target, return with a short-lived one-time token,
  session scoped to that single publication. Never a cookie on the parent domain.
- **Design tokens must work without React**, because the password page is server-rendered
  and needs the same look as the app. One file at `/_handout/design/tokens.css` for both
  consumers; see `docs/design-system.md`.
- **One identity provider per instance.** No provider picker, no provider-specific code
  paths — issuer URL, client ID and secret are the whole configuration.
- **Never touch the delivered artifact.** Absolute paths in path mode produce a warning at
  publish time and nothing else.
- **The application owns `/_handout/`, everything else at the root is publication space.**
  API, app routes, the password page and the built assets all live under that prefix; a
  generated slug must never be able to produce it, so the slug alphabet excludes `_`. See
  `docs/url-namespace.md`.

## Conventions

- Everything that goes into this repository is written in English: code, comments,
  documentation, commit messages.
- Colors, spacing, radii and states come from design tokens. No hard-coded values in
  components.
- Nothing is conveyed by color alone.
- Unpacking is the security-critical part of the product. Validate every entry path
  against the target directory before writing, reject symlinks and absolute paths, cap
  unpacked size, entry count and compression ratio, unpack into a temp directory and swap
  atomically. Never leave a half-unpacked state behind.
- Read service credentials and URLs from the environment (`POSTGRES_URL`, `KEYCLOAK_URL`,
  …). Never hard-code them, never write them into tracked files.
- Tests: unit tests for unpacking, path validation and the atomic swap; integration tests
  against the HTTP API.

## Local development

The container, its services, exposed ports and how to run a server are described in the
workspace briefing at `../../AGENTS.md`. The parts specific to this project:

- Service on port 3000 (`http://handout.localhost`), Vite dev server on 5173.
- Start and stop servers with `monoceros-ctl start|stop|logs handout-app`, never from a
  shell of your own.
- Local development runs in **path mode**: the workbench routes `handout.localhost` but no
  level below it, so a subdomain per publication cannot be reproduced here. The redirect
  flow of the password page still has to be reasoned about against subdomain mode.
- Keycloak is the local OIDC provider. Its realm is a file in the repository at
  `keycloak/realm.json`; apply changes to the running instance with
  `.monoceros/bin/keycloak-realm` from the workspace root.

The repository is one npm project with two workspaces: `service/` (Fastify) and `web/`
(React, Vite). Commands, all run from the project root:

| Command                                   | What it does                                             |
| ----------------------------------------- | -------------------------------------------------------- |
| `npm install`                             | installs both workspaces                                 |
| `npm run dev:service` / `npm run dev:web` | the two dev servers (usually via `monoceros-ctl`)        |
| `npm run test`                            | unit and integration tests of both workspaces            |
| `npm run typecheck`                       | `tsc --noEmit`, root plus both workspaces                |
| `npm run lint` / `npm run lint:fix`       | oxlint, type-aware, warnings are errors                  |
| `npm run format` / `npm run format:check` | Prettier                                                 |
| `npm run smoke`                           | end-to-end check against the two running servers         |
| `npm run verify`                          | the gate: lint → format:check → typecheck → test → smoke |

`npm run verify` needs both servers running (`monoceros-ctl start handout-app`), because
`smoke` talks to them over the network.

TypeScript 7 with oxlint (`oxlint-tsgolint`) for type-aware linting; `typescript-eslint`
is deliberately not used, it would pin the project to TypeScript 5.x. `baseUrl` and
`paths` do not exist in TypeScript 7 — use relative imports. Prettier formats; see
`README.md` for the reasoning behind both.
