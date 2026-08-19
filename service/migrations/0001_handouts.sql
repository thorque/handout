-- Up Migration

-- Every address part ever issued, kept forever. A link from an old customer mail must
-- never resolve to someone else's content, so a slug is never released, not even when the
-- handout that used it is deleted.
CREATE TABLE slug_reservations (
  slug        text PRIMARY KEY
              CHECK (slug ~ '^[23456789abcdefghjkmnpqrstuvwxyz]{6,8}$'),
  reserved_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE handouts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- No ON DELETE clause on purpose: a reservation outlives its handout, and it can
  -- never be removed while a handout still uses it.
  slug               text NOT NULL UNIQUE REFERENCES slug_reservations (slug),
  display_name       text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 200),
  -- The OIDC subject: the immutable identity a handout belongs to.
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
  -- recorded access must not count as a change to the handout.
  updated_at         timestamptz NOT NULL DEFAULT now(),
  last_accessed_at   timestamptz
);

CREATE INDEX handouts_owner_subject_created_at_idx
  ON handouts (owner_subject, created_at DESC);

-- The address part is fixed for the lifetime of a handout. Renaming must never change
-- it, and no hand-written UPDATE in psql may either.
CREATE FUNCTION handouts_reject_slug_change() RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'slug is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER handouts_slug_immutable
  BEFORE UPDATE ON handouts
  FOR EACH ROW EXECUTE FUNCTION handouts_reject_slug_change();

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
DROP TRIGGER handouts_slug_immutable ON handouts;
DROP FUNCTION handouts_reject_slug_change();
DROP TABLE handouts;
DROP TABLE slug_reservations;
