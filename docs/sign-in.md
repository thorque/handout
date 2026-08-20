# Signing in

Exactly one identity provider per instance, for publishers only — recipients never sign in.
There is no provider picker and no provider-specific code path: `service/src/auth/provider.ts`
is the only file that imports `openid-client`, and it reads nothing but four values.

## The four knobs

| Variable                     | What it decides                               |
| ---------------------------- | --------------------------------------------- |
| `HANDOUT_OIDC_ISSUER_URL`    | the provider's issuer URL, used for discovery |
| `HANDOUT_OIDC_CLIENT_ID`     | this instance's client id at the provider     |
| `HANDOUT_OIDC_CLIENT_SECRET` | this instance's client secret at the provider |
| `HANDOUT_ALLOWED_EMAILS`     | who may publish here (see below)              |

Plus `HANDOUT_SIGN_IN_LABEL`, the sign-in button's caption, and — workbench only —
`HANDOUT_OIDC_INTERNAL_ORIGIN`, covered below. Endpoints come from OIDC discovery; name,
address and the immutable id come from the standard claims (`sub`, `name` or
`preferred_username`, `email`, `email_verified`). There is no configurable scope and no
configurable claim names — a provider-specific mapping would be exactly the code path the
story rules out. The requested scope is the fixed `openid profile email`.

## Who may publish: the allow-rule

`HANDOUT_ALLOWED_EMAILS` is a comma-separated mix of two kinds of entry, told apart by
whether they contain an `@`: a bare domain (`berger-partner.de`) or a full address
(`t.kuhn@extern-gmbh.de`). It is required — missing or empty is a start-up failure, the
same category as `HANDOUT_PASSWORD_KEY`: reading an absent list as "everybody may" would
let a forgotten value decide who can publish.

`decideAccess` (`service/src/auth/access.ts`) checks, in this order:

1. **No address at all, or an empty one, is refused.** This is the path that keeps the
   schema's promise: a handout's `owner_email` is nullable, but nothing ever creates an
   owner without an address.
2. **An address the provider explicitly marks unverified (`email_verified: false`) is
   refused.** Silence (the claim is absent) counts as verified — that is the decision of
   whoever configured the provider, not this service's to second-guess.
3. **The comparison is exact and case-insensitive, never a subdomain and never a suffix.**
   `t.mueller@BERGER-PARTNER.DE` matches the domain `berger-partner.de`;
   `m.roth@mail.berger-partner.de` does not, and neither does
   `x@berger-partner.de.angreifer.example`. An address entry matches only that one address,
   not its domain.

Whoever is refused sees one line above the sign-in button and nothing else — no list of the
allowed domains, because that is information about the instance handed to somebody who may
not enter — and no session cookie is ever set on that path.

## The session

A signed cookie, `handout_session`, `Path=/api`, `HttpOnly`, `SameSite=Lax`, `Secure` when
the request arrived over https. `Path=/api` because only the HTTP interface needs it:
`/app/**` is static files, and the delivery route at `/<slug>` must never receive it — a
script inside a published handout runs on the same origin (see the shared-origin ADR) and
must not be handed the cookie by the browser in the first place.

The cookie carries `{ sub, name, email, exp }`, twelve hours from sign-in, checked on every
read — the browser's own `Max-Age` is a convenience, the payload's `exp` is the authority.
There is no sliding renewal: a valid cookie is never re-issued on a normal request, so a
session always ends twelve hours after it began, not twelve hours after it was last used.

**"Abmelden" ends the Handout session only.** There is no RP-initiated logout at the
provider, on purpose — signing out of Handout must not throw anyone out of their company
account. The one visible consequence: signing straight back in afterwards asks for nothing,
because the session at the provider still stands.

The signing key is not a separate configured value. It is derived from
`HANDOUT_PASSWORD_KEY` with HKDF-SHA256 and the info label `handout session cookie v1`
(`service/src/config.ts`, `deriveSessionKey`) — domain separation keeps a session signature
from ever being confused with password ciphertext, and the only consequence of the password
key changing is that everyone signs in again. That is one fewer required secret to forget,
on top of the one the operator already has to back up.

## One provider, answering under two addresses

In the workbench, the browser reaches Keycloak through Caddy at
`http://handout-caddy.localhost/realms/handout`, while the service itself reaches it
in-network at `KEYCLOAK_URL` (`http://keycloak:8080`). Left alone, that is two different
issuers for one realm: Keycloak derives the issuer it stamps into its discovery document
and its tokens from the request it receives, so the two addresses would produce two
different issuer strings and issuer validation would fail on every sign-in.

`HANDOUT_OIDC_INTERNAL_ORIGIN` (falling back to `KEYCLOAK_URL`, mirroring `DATABASE_URL`'s
fallback to `POSTGRES_URL`) is the fix: `service/src/auth/provider-fetch.ts` rewrites every
outbound request whose URL origin matches the configured issuer's origin to this internal
one, and adds `X-Forwarded-Host` / `X-Forwarded-Proto` carrying the issuer's own host and
scheme — measured against the workbench Keycloak, which stamps both its discovery `issuer`
and a token's `iss` from exactly those headers. A production instance where the provider is
reachable at one address for everyone sets nothing here, and the service logs once at
start-up when the fallback fires with a value that differs from the issuer's own origin —
so a deployment whose environment happens to define `KEYCLOAK_URL` does not silently start
rewriting requests unnoticed.

## The sign-in page is not a route

`/app/**`'s static bundle stays public — the sign-in page has to be reachable before anyone
has a session, and it is the bundle's signed-out **state**, not an address of its own. The
gate sits on `/api/**` instead: every path there needs a valid session except
`/api/health` and `/api/auth/*`, including a path with no route behind it at all, so an
endpoint the coming stories add is covered the moment it exists rather than the moment
someone remembers to gate it.

## The dev realm turns off "Verify Profile"

`keycloak/realm.json` disables the realm's `VERIFY_PROFILE` required action
(`requiredActions`, `alias: "VERIFY_PROFILE"`, `enabled: false`). Keycloak's default user
profile marks the email attribute required, and without this override a user who has none
— `ohne`, the test user for the `no_email` refusal — gets redirected into a "complete your
profile" step at Keycloak instead of back to `/api/auth/callback`. That user only exists to
prove the allow-rule refuses a missing address; disabling the required action is what lets
the sign-in flow reach the point where it can. A real instance's provider is configured by
whoever runs it, not by this file, and carries no opinion either way.

## Dev-only values

The dev realm's client secret and its six test users' password
(`keycloak/realm.json`, restated in `.env.example` and `README.md`) are fixed, obviously
fake values for a throwaway local realm that `monoceros apply` recreates from that file on
every rebuild — the same category `HANDOUT_PASSWORD_KEY`'s placeholder already is. No real
instance's credential is written anywhere in this repository.
