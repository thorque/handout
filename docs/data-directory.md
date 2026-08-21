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

1. A fresh directory is created under `staging/` (`staging/upload-xxxxxx/`), and inside it
   a `content/` subdirectory — the one thing that eventually gets renamed into place. A
   single HTML file is streamed straight into `content/index.html`. A zip is streamed into
   `staging/upload-xxxxxx/upload.zip`, first — see _Unpacking a zip_ below for what happens
   to it next. Rejecting an upload here — the wrong extension, the file too large — costs
   nothing but a discarded staging directory.
2. Only once the content is on disk (and, for a zip, only once it has been unpacked
   successfully) does a row get inserted, which is also where the slug is drawn and
   reserved.
3. `content/` is renamed into place at `handouts/<slug>/` — not the staging directory that
   contains it. `staging/` sits on the same filesystem as `handouts/`, so this is an atomic
   `rename`, not a copy — there is no window in which a half-written directory is reachable
   at its final address.

Staging first, not the row first, is the choice: a row without content for every rejected
upload would be the alternative, and there is nothing to point that row at until the bytes
have already proven themselves acceptable. The one window this leaves is the rename itself
failing after the row exists — the row is deleted again in that case, and its slug
reservation is never reissued, the same way a deleted handout's slug never is.

## Unpacking a zip

A zip is staged as a whole file first — `yauzl` reads the central directory at the end of
the file and needs random access, so it cannot be unpacked from the upload stream directly.
Once it is on disk, unpacking runs in two passes, and nothing is written in the first:

1. **Read the whole entry list.** Every entry's name, declared size and mode are read from
   the central directory. Nothing is written yet.
2. **Decide.** Every entry is checked, in this order, against every rule below. The first
   entry that fails any rule refuses the whole archive — nothing about a zip is ever
   partially accepted.
3. **Write.** Only once the whole archive has been judged safe does anything land in
   `content/`.

Deciding before writing is what makes it possible to refuse an archive _before_ the limits
below are crossed, and it is what makes the structure rule (below) possible at all: whether
a top-level folder gets stripped depends on the entry list as a whole, not on any one entry.

**What is refused, and why:**

- **A path that could escape the target directory.** An absolute path (a leading `/`, or a
  Windows drive letter), a `..` segment however deep, an empty segment, a path over 512
  characters, or a segment over 255 bytes.
- **A symbolic link.** A published artifact has no legitimate need for one, and refusing
  anything that merely looks like one (by its stored mode) is the safe direction.
- **An encrypted entry**, or one using a compression method this service cannot decode —
  there is nothing to unpack it into.
- **Two entries that would land at the same path**, or a path used as both a file and a
  directory by two different entries. Which one would win is otherwise a matter of write
  order, not something a security-critical unpacker leaves to chance.
- **Three configurable limits**, each catching something the others do not:
  - `HANDOUT_MAX_UNPACKED_BYTES` (default 100 MB) bounds the total size once unpacked —
    the only one of the three that catches an archive that is large both packed and
    unpacked. Checked twice: once against the entries' declared sizes before a byte is
    written, and once against the bytes actually written, in case a central directory ever
    under-declares an entry's size.
  - `HANDOUT_MAX_ZIP_ENTRIES` (default 2000) bounds the number of files — what the other
    two do not catch is a million-entry archive of empty files, tiny packed and unpacked
    alike, but ruinous to keep as individual files on disk.
  - `HANDOUT_MAX_COMPRESSION_RATIO` (default 200) bounds amplification: a small upload that
    unpacks to something disproportionately larger. Enforced per entry, and only for an
    entry whose declared uncompressed size exceeds 1 MiB — a small, repetitive file
    legitimately reaches a high ratio, and it is harmless whatever the ratio.

**What decides the shape of what gets published** — this is a search for the entry file,
never a count of what sits at the top level of the archive:

1. If the archive's root holds a file named exactly `index.html`, the tree is published
   exactly as it is — whatever else sits in the root (one folder, twenty folders, other
   files) is irrelevant.
2. Otherwise, if the root holds exactly one entry, that entry is a folder, and that folder
   holds an `index.html` directly inside it, that one folder is stripped — its content
   becomes the root of the handout. Only one level: an `index.html` a level deeper than
   that is not found this way.
3. Otherwise the archive is refused, with a message naming both places that were searched.

Only `index.html` is searched for, never `index.htm` — "Resolution and its rules" below
appends exactly `index.html` when it resolves a directory, so an archive whose entry file
is `index.htm` would unpack fine and then answer not-found at its own address. Renaming it
while unpacking would be touching the delivered artifact, which this product does not do,
so such an archive is refused instead, naming the reason.

**What is skipped, rather than refused or published:** exactly three names —
`__MACOSX/`, `.DS_Store` and `Thumbs.db` (matched case-insensitively) — the debris a
zip-creating tool leaves beside the content a publisher actually meant to share. Nothing
else is filtered by name. In particular, a path starting with a dot (`.gitignore`,
`.well-known/x.json`) is written like any other entry: "Resolution and its rules" below
already makes such a path unfetchable, so leaving it on disk is harmless, while dropping an
entry nobody asked to have dropped would be a change to the delivered artifact. The safety
checks above run before this filter, not after — an entry that both looks like junk and
escapes the target directory still refuses the archive, rather than being quietly dropped.

Nothing here ever repairs an archive: no rewriting, no re-zipping, no mode taken from the
entries, no renaming an `index.htm` to fit. An archive Handout cannot serve safely is
refused whole.

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
