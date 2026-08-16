-- Up Migration

-- Every address part ever issued, kept forever. A link from an old customer mail must
-- never resolve to someone else's content, so a slug is never released, not even when the
-- publication that used it is deleted.
CREATE TABLE slug_reservations (
  slug        text PRIMARY KEY
              CHECK (slug ~ '^[23456789abcdefghjkmnpqrstuvwxyz]{6,8}$'),
  reserved_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE publications (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- No ON DELETE clause on purpose: a reservation outlives its publication, and it can
  -- never be removed while a publication still uses it.
  slug               text NOT NULL UNIQUE REFERENCES slug_reservations (slug),
  display_name       text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 200),
  -- The OIDC subject: the immutable identity a publication belongs to.
  owner_subject      text NOT NULL,
  -- A human-readable copy, refreshed at login. Not every provider releases an email claim.
  owner_email        text,
  -- NULL means unprotected. The CHECK is what keeps a hash out of this column: the value
  -- has to be an envelope of the encrypting layer, because the owner has to be able to
  -- read the password back.
  encrypted_password text
                     CHECK (encrypted_password IS NULL
                            OR encrypted_password ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'),
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- Maintained by the statements that mean a change, deliberately not by a trigger: a
  -- recorded access must not count as a change to the publication.
  updated_at         timestamptz NOT NULL DEFAULT now(),
  last_accessed_at   timestamptz
);

CREATE INDEX publications_owner_subject_created_at_idx
  ON publications (owner_subject, created_at DESC);

-- The address part is fixed for the lifetime of a publication. Renaming must never change
-- it, and no hand-written UPDATE in psql may either.
CREATE FUNCTION publications_reject_slug_change() RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'slug is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER publications_slug_immutable
  BEFORE UPDATE ON publications
  FOR EACH ROW EXECUTE FUNCTION publications_reject_slug_change();

CREATE FUNCTION slug_reservations_reject_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'slug reservations are permanent and are never deleted' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER slug_reservations_permanent
  BEFORE DELETE ON slug_reservations
  FOR EACH ROW EXECUTE FUNCTION slug_reservations_reject_delete();

-- Down Migration

DROP TRIGGER slug_reservations_permanent ON slug_reservations;
DROP FUNCTION slug_reservations_reject_delete();
DROP TRIGGER publications_slug_immutable ON publications;
DROP FUNCTION publications_reject_slug_change();
DROP TABLE publications;
DROP TABLE slug_reservations;
