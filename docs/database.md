# The database

Everything the application knows about a handout without reading its files lives in
Postgres. The published content itself does not: that stays plain directories on disk.

Access goes through one narrow layer, `service/src/handouts/repository.ts`. Nothing
else in the service writes SQL against these tables.

## The two tables

### `slug_reservations`

Every address part ever issued, and it is **never pruned**. Deleting a handout removes
its row in `handouts` and leaves the reservation standing, so the slug can never be
drawn again.

That is a product rule, not a technical convenience: a link from an old customer mail must
never resolve to someone else's content later. It is enforced by a `BEFORE DELETE` trigger
that always raises — a reservation cannot be deleted, not even by hand in psql.

| Column        | Meaning                                                      |
| ------------- | ------------------------------------------------------------ |
| `slug`        | primary key, six to eight characters from the alphabet below |
| `reserved_at` | when it was drawn                                            |

### `handouts`

| Column               | Meaning                                                       |
| -------------------- | ------------------------------------------------------------- |
| `id`                 | `uuid`, the internal handle                                   |
| `slug`               | the address part, unique, references `slug_reservations`      |
| `display_name`       | what the owner sees; 1–200 characters after trimming          |
| `owner_subject`      | the OIDC subject — the immutable identity a handout hangs off |
| `owner_email`        | a human-readable copy, refreshed at login, may be `NULL`      |
| `encrypted_password` | the password envelope, `NULL` when the handout is open        |
| `created_at`         | insertion time                                                |
| `updated_at`         | last change **to the handout**                                |
| `last_accessed_at`   | last delivery to a recipient, `NULL` until the first one      |

Two things about it are easy to get wrong:

- **The address part is immutable.** Renaming changes `display_name` and nothing else. A
  `BEFORE UPDATE` trigger raises `slug is immutable` on any attempt to change it, and the
  access layer rejects a `slug` key in a patch with `ImmutableFieldError` — both paths,
  because a caller can arrive either way.
- **`updated_at` is not maintained by a trigger.** It means "last change to the
  handout", so recording an access must not move it. The statements that mean a change
  set it explicitly.

The protection status is derived (`encrypted_password IS NOT NULL`) rather than kept in its
own boolean, so the two can never disagree.

## The password is encrypted, not hashed

The owner has to be able to look a password up weeks after publishing, so the plaintext
must stay recoverable. Hashing it would be the wrong tool, and the column's CHECK
constraint makes that concrete: only an envelope of the shape below fits, so a bcrypt or
SHA string cannot be stored even by accident.

The envelope is one self-describing string:

```
v1.<base64url(iv)>.<base64url(authTag)>.<base64url(ciphertext)>
```

AES-256-GCM, a fresh 12-byte IV per encryption and the 16-byte authentication tag, so a
tampered ciphertext fails to decrypt instead of returning garbage. base64url keeps `+`, `/`
and `=` out of a value that may pass through URLs and logs. The `v1.` prefix is the room a
later key rotation needs; nothing rotates anything today.

The **slug goes in as additional authenticated data**. It is immutable and known before the
row is inserted, so this binds a ciphertext to exactly one handout: copying the column
value to another row makes it undecryptable rather than silently working.

The key comes from `HANDOUT_PASSWORD_KEY` — 32 bytes, base64 — and from nowhere else. Never
from the database, never from a tracked file. It is required at start-up: a service that
cannot decrypt its passwords is broken and has to say so immediately rather than at the
first lookup. It belongs in the backup plan; without it no password can be read again.

## The slug alphabet

```
23456789abcdefghjkmnpqrstuvwxyz
```

31 characters. Lowercase only, because a slug gets read aloud and retyped; `0` and `1` are
dropped along with the letters `i`, `l` and `o` they are confused with. **`_` stays
excluded too, now for legibility** — it reads badly in a dictated or retyped address — see
[`url-namespace.md`](url-namespace.md).

Newly drawn slugs are eight characters, the top of the six-to-eight range the brief
permits; the CHECK constraint keeps the whole range so the documented contract stays. The
draw uses `crypto.randomInt`, which rejection-samples and therefore has no modulo bias, and
it is **never derived from the display name** in any way.

`createHandout` reserves the slug and inserts the handout in **one transaction**,
retrying with a fresh draw on a collision. A handout can therefore never exist without
its reservation, and a slug that was never handed out to anyone may be drawn again.

## Migrations

Plain SQL files in `service/migrations/`, applied by `node-pg-migrate` at service start
(`service/src/db/migrate.ts`). A failing migration ends the process — the service never
serves without its schema.

- Name them `NNNN_<name>.sql` with a zero-padded sequence, so they sort lexicographically in
  the order they were written. Do **not** let the CLI generate timestamped names; the two
  conventions do not sort against each other.
- Each file carries `-- Up Migration` and `-- Down Migration` markers.
- Migrations must be **schema-agnostic**: no `CREATE SCHEMA`, no `SET search_path`, no
  `public.` qualifications. The runner sets the search_path itself, which is what lets the
  tests apply the identical migrations to a throwaway schema.
- Two instances starting at the same moment queue up behind an advisory lock instead of one
  of them failing.

## How the tests reach a database

Each database test file creates a schema `handout_test_<random>`, runs the real migrations
into it and drops it `CASCADE` afterwards. The pool pins its `search_path` to that schema,
so the code under test is the code that runs in production.

The URL comes from `HANDOUT_TEST_DATABASE_URL`, `DATABASE_URL` or `POSTGRES_URL`, in that
order. With none of them set the database suites skip themselves and say so loudly. With
one set but unreachable they **fail** — a configured database that does not answer is a
real problem and must not hide behind a skip.
