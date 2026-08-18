# The data directory

Published content is not the database's business. It stays plain directories on disk,
under `<HANDOUT_DATA_DIR>/handouts/<slug>/` — one directory per publication.

## The layout, and why the intermediate level exists

```
<HANDOUT_DATA_DIR>/
  handouts/
    <slug>/
      index.html
      ...
```

`handouts/` sits between the data directory and a publication on purpose. Delivery
(`resolvePublicationFile`) looks only under this directory, so nothing else that later
lands directly under `<HANDOUT_DATA_DIR>` — a staging area for unpacking, which HAN-9/HAN-10
will want — can ever become a reachable address by accident.

The directory name **may be the slug**, because the slug is immutable for the
publication's whole lifetime: the `BEFORE UPDATE` trigger and `updatePublication` both
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

`resolvePublicationFile(handoutsDir, slug, rest)` resolves `rest` (the path after the slug,
already decoded and split) against the publication directory, in this order:

1. Reject any part that contains a NUL byte or starts with `.` — this rejects `.`, `..` and
   every dotfile (`.env`, `.git/config`) in one rule.
2. Join the parts onto the publication directory and require **string containment**: the
   result has to be the publication directory itself or a path under it.
3. `realpath` the result. A missing file or directory answers not-found here — this is
   criterion 3 for a slug whose directory was never created.
4. Require containment **again**, this time of the realpath against the realpath of the
   publication directory. Step 2's string check does not see through a symlink; this is
   what makes a hand-placed symlink out of the publication — to `/etc`, or to a sibling
   publication's directory — answer not-found instead of leaking. A symlink that stays
   inside the publication still resolves: the check rejects escapes, not symlinks as such.
5. A directory gets `index.html` appended once and the same rule reapplied — no recursion,
   no directory listing, ever. A regular file is the answer. Anything else (fifo, socket,
   device) is not found.

`/<slug>` and `/<slug>/` both resolve through the directory rule in step 5, so there is no
separate special case for the bare address.

## Byte-sending

`@fastify/static` is registered with `serve: false`, which adds no route of its own — it
only decorates the reply with `sendFile`. Address resolution and containment above stay
this application's own code; only the actual sending is delegated, once resolution has
already proven the path safe. Measured defaults, recorded here because the _policy_ is
HAN-21's to decide:

| Header          | Measured value                 |
| --------------- | ------------------------------ |
| `Cache-Control` | `public, max-age=0`            |
| `ETag`          | a weak tag from size and mtime |
| `Last-Modified` | the file's mtime               |
| `Accept-Ranges` | `bytes`                        |

Conditional requests (a 304 on a matching `If-None-Match`/`If-Modified-Since`), range
requests and a correct `HEAD` come for free with the same plugin.

## The not-found answer, and the namespace split

An address that cannot be resolved answers the plain, undesigned not-found page — see
[`docs/url-namespace.md`](url-namespace.md) for the split between publication space and
`/_handout/**`, and HAN-19's `han19-ac-5` for the designed replacement this story
deliberately does not build.

## No origin isolation between publications, in path mode

Every publication in path mode is served from the same origin
(`http://<instance-domain>/<slug>/`), so a script in one publication shares that origin
with every other — there is no browser-level isolation between them. That is inherent to
path mode, not something this story fixes; it is the reason subdomain mode exists
(`https://<slug>.<base-domain>/`, HAN-12's to build).

## What decides whether an address exists, and why

In this story the **filesystem** decides — a directory that resolves is served, one that
does not answers not-found. Not the database: `createPublication` needs an `ownerSubject`
from OIDC, and there is no login until HAN-8, so no publication row can exist yet. Once
HAN-8 lands, later stories can choose to gate delivery on a database lookup too (a deleted
publication whose directory was not yet swept, for instance) — that decision does not
belong to HAN-7.

## Not delivery's business (yet)

- Recording the last access — HAN-19.
- Password protection at delivery time — HAN-11, HAN-20.
- Cache policy beyond the plugin's own defaults above — HAN-21.
