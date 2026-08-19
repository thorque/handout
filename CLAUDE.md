# Handout

Self-hosted service that turns a finished HTML artifact — a single file or a zip — into a
shareable URL on infrastructure we control. Recipients need nothing but the link: no
account, no installation, no consent banner.

Handout serves what it is given. It never builds, bundles, edits or rewrites an artifact,
and it runs no server-side logic on behalf of published content.

## Where the decisions are

The reasoning behind the rules below is written down, not folded into the code: product
decisions and architecture decision records live in the team's wiki, the work in its issue
tracker. Neither is public, so this file carries the decisions themselves rather than links
to them — that is what "Decisions that are easy to get wrong" below is for. Read it before
changing anything it touches.

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

- **Replace overwrites.** There is exactly one version per handout — no previous
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
  handout. Redirect with a validated target, return with a short-lived one-time token,
  session scoped to that single handout. Never a cookie on the parent domain.
- **Design tokens must work without React**, because the password page is server-rendered
  and needs the same look as the app. One file at `/app/design/tokens.css` for both
  consumers; see `docs/design-system.md`.
- **One identity provider per instance.** No provider picker, no provider-specific code
  paths — issuer URL, client ID and secret are the whole configuration.
- **Never touch the delivered artifact.** An absolute path in the upload produces a
  warning at publish time and nothing else.
- **Published content lives at `<dataDir>/handouts/<slug>/`**, one directory per
  handout. Delivery looks only there, and there is no storage abstraction — see
  `docs/data-directory.md`.
- **There is exactly one Caddyfile**, at `caddy/Caddyfile`, for the workbench and for a
  deployment alike — see `docs/proxy.md`.
- **The application owns three reserved path segments — `/app`, `/api`, `/unlock`.**
  Everything else at the root is handout space; a generated slug can never produce any of
  the three, by construction. See `docs/url-namespace.md`.

## Conventions

- Everything that goes into this repository is written in English: code, comments,
  documentation, commit messages.
- **`docs/` describes what the code does and why, never what is planned.** No issue keys, no
  links into an issue tracker or wiki, no "this will be added later" — a reader of the
  repository cannot follow any of it, and it is wrong the moment the plan changes. A reason
  that needs a ticket number to stand up has not been written down yet. If a file under
  `docs/` would only say which work comes next, it should not exist.
- Colors, spacing, radii and states come from design tokens. No hard-coded values in
  components.
- **Use the base components in `web/src/components/`** — look there before writing UI, and
  extend what is there rather than putting a second one beside it. A new base component
  needs a reason, not an occasion. The list is in `docs/design-system.md`; a raw `<button>`,
  `<a href>`, `<input>`, `<select>`, `<textarea>` or `<dialog>` outside that directory fails
  `web/src/design/component-reuse.test.ts`.
- **When a component is missing, ask — never decide it alone.** A missing component is a
  design decision: Thorsten updates the design system, or asks Claude Code to. **The design
  system is never changed unasked**, and an exception in the code is the last resort, not
  the first idea. `docs/design-system.md`, "When a component is missing".
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
- The workbench routes `handout.localhost` at the root, so every handout is served under a
  path on it — the only way an address is ever resolved, in the workbench and in a
  deployment alike.
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
| `npm run check`                           | everything in `verify` that needs no running server      |
| `npm run verify`                          | the gate: lint → format:check → typecheck → test → smoke |

`npm run verify` needs both servers running (`monoceros-ctl start handout-app`), because
`smoke` talks to them over the network. A pull request runs `npm run check` on GitHub;
`verify` stays the local gate.

TypeScript 7 with oxlint (`oxlint-tsgolint`) for type-aware linting; `typescript-eslint`
is deliberately not used, it would pin the project to TypeScript 5.x. `baseUrl` and
`paths` do not exist in TypeScript 7 — use relative imports. Prettier formats; see
`README.md` for the reasoning behind both.
