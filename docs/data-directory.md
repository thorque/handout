# The data directory

Published content is not the database's business. It stays plain directories on disk,
under `<HANDOUT_DATA_DIR>/handouts/<slug>/` — one directory per handout.

## The layout, and why the intermediate level exists

```
<HANDOUT_DATA_DIR>/
  handouts/
    <slug>/
      index.html
      ...
  staging/
```

`handouts/` sits between the data directory and a handout on purpose. Delivery
(`resolveHandoutFile`) looks only under this directory, so nothing else that later
lands directly under `<HANDOUT_DATA_DIR>` — `staging/`, below, is exactly that — can
ever become a reachable address by accident.

## The write path: stage, row, rename

A publish writes in this order, and the order is deliberate:

1. The uploaded bytes are streamed into a fresh directory under `staging/`, as
   `index.html`. Rejecting an upload here — the wrong extension, the file too large — costs
   nothing but a discarded staging directory.
2. Only once the bytes are on disk does a row get inserted, which is also where the slug is
   drawn and reserved.
3. The staging directory is renamed into place at `handouts/<slug>/`. `staging/` sits on
   the same filesystem as `handouts/`, so this is an atomic `rename`, not a copy — there is
   no window in which a half-written directory is reachable at its final address.

Staging first, not the row first, is the choice: a row without content for every rejected
upload would be the alternative, and there is nothing to point that row at until the bytes
have already proven themselves acceptable. The one window this leaves is the rename itself
failing after the row exists — the row is deleted again in that case, and its slug
reservation is never reissued, the same way a deleted handout's slug never is.

This endpoint is create-only: a target directory that already exists under `handouts/` is
refused, never overwritten. Replacing a handout under its existing address is its own
concern, not a side effect of the address happening to collide.

The directory name **may be the slug**, because the slug is immutable for the
handout's whole lifetime: the `BEFORE UPDATE` trigger and `updateHandout` both
refuse to change it, and renaming touches `display_name` only. See
[`docs/database.md`](database.md) for the trigger. If the address could change, the
directory name would have to be something else, with a lookup in between.

## Storage is a plain filesystem directory, deliberately with no abstraction seam

Local disk or a mounted network share both work with no code change — Node's `fs` module
does not care which. S3-compatible object storage was considered and rejected: it has no
real directories and no atomic `rename`, which the publish flow needs for its atomic swap;
it would force a choice between proxying every byte through the service or issuing
presigned redirects per sub-resource (a stylesheet, a script, an image — the fixture in the
integration tests references three files, and a real handout can reference many more); and
it loses the free `ETag`, conditional handling and byte ranges a filesystem gets from
`@fastify/static`. There is therefore no storage interface in the code — a directory path
is the whole contract.

## Resolution and its rules

`resolveHandoutFile(handoutsDir, slug, rest)` resolves `rest` (the path after the slug,
already decoded and split) against the handout directory, in this order:

1. Reject any part that contains a NUL byte or starts with `.` — this rejects `.`, `..` and
   every dotfile (`.env`, `.git/config`) in one rule.
2. Join the parts onto the handout directory and require **string containment**: the
   result has to be the handout directory itself or a path under it.
3. `realpath` the result. A missing file or directory answers not-found here — this is
   criterion 3 for a slug whose directory was never created.
4. Require containment **again**, this time of the realpath against the realpath of the
   handout directory. Step 2's string check does not see through a symlink; this is
   what makes a hand-placed symlink out of the handout — to `/etc`, or to a sibling
   handout's directory — answer not-found instead of leaking. A symlink that stays
   inside the handout still resolves: the check rejects escapes, not symlinks as such.
5. A directory gets `index.html` appended once and the same rule reapplied — no recursion,
   no directory listing, ever. A regular file is the answer. Anything else (fifo, socket,
   device) is not found.

`/<slug>` and `/<slug>/` both resolve through the directory rule in step 5, so there is no
separate special case for the bare address.

## Byte-sending

`@fastify/static` is registered with `serve: false`, which adds no route of its own — it
only decorates the reply with `sendFile`. Address resolution and containment above stay
this application's own code; only the actual sending is delegated, once resolution has
already proven the path safe. The defaults it sends, measured rather than
assumed, so a change to them shows up as a change here:

| Header          | Measured value                 |
| --------------- | ------------------------------ |
| `Cache-Control` | `public, max-age=0`            |
| `ETag`          | a weak tag from size and mtime |
| `Last-Modified` | the file's mtime               |
| `Accept-Ranges` | `bytes`                        |

Conditional requests (a 304 on a matching `If-None-Match`/`If-Modified-Since`), range
requests and a correct `HEAD` come for free with the same plugin.

## The not-found answer, and the namespace split

An address that cannot be resolved answers a plain, undesigned not-found page — see
[`docs/url-namespace.md`](url-namespace.md) for the split between handout space and the
application's own reserved segments.

## No origin isolation between handouts

Every handout is served from the same origin (`https://<instance-domain>/<slug>/`), so a
script in one handout shares that origin with every other — there is no browser-level
isolation between them. That follows from operating one host with one certificate, and it
bounds what a password on a handout can promise: reachable is whatever that browser can
already reach.

## What decides whether an address exists

The **filesystem** decides: a directory that resolves is served, one that does not answers
not-found. The database is not consulted, so delivery keeps working while it is unreachable.
The cost is that removing a handout means removing both the row and the directory, and a
directory left behind is a live address.
