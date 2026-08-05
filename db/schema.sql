CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE memorial_visibility AS ENUM ('public', 'unlisted', 'private');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE location_mode AS ENUM ('exact', 'approximate', 'symbolic', 'hidden');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tribute_kind AS ENUM ('candle', 'flower', 'message');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE friendship_status AS ENUM ('pending', 'accepted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name varchar(80) NOT NULL,
  avatar_url text,
  city varchar(120),
  bio varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS city varchar(120);

CREATE TABLE IF NOT EXISTS friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status friendship_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friendship_is_not_self CHECK (requester_id <> addressee_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_unique_idx
  ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX IF NOT EXISTS friendships_addressee_pending_idx
  ON friendships (addressee_id, created_at DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS friendships_requester_idx
  ON friendships (requester_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS pet_memorials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug varchar(140) NOT NULL UNIQUE,
  name varchar(80) NOT NULL,
  species varchar(80) NOT NULL,
  breed varchar(120),
  birth_date date,
  passing_date date,
  story text NOT NULL DEFAULT '',
  epitaph varchar(280),
  avatar_url text,
  visibility memorial_visibility NOT NULL DEFAULT 'public',
  location_mode location_mode NOT NULL DEFAULT 'hidden',
  latitude double precision,
  longitude double precision,
  public_latitude double precision,
  public_longitude double precision,
  location_label varchar(180),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_private_coordinates CHECK (
    (latitude IS NULL AND longitude IS NULL) OR
    (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  ),
  CONSTRAINT valid_public_coordinates CHECK (
    (public_latitude IS NULL AND public_longitude IS NULL) OR
    (public_latitude BETWEEN -90 AND 90 AND public_longitude BETWEEN -180 AND 180)
  )
);

CREATE INDEX IF NOT EXISTS pet_memorials_owner_idx ON pet_memorials(owner_id);
CREATE INDEX IF NOT EXISTS pet_memorials_public_map_idx
  ON pet_memorials(public_latitude, public_longitude)
  WHERE visibility = 'public' AND public_latitude IS NOT NULL;

CREATE TABLE IF NOT EXISTS ceremonies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memorial_id uuid NOT NULL UNIQUE REFERENCES pet_memorials(id) ON DELETE CASCADE,
  title varchar(140) NOT NULL,
  farewell_message text NOT NULL DEFAULT '',
  starts_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memorial_id uuid NOT NULL REFERENCES pet_memorials(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  guest_name varchar(80),
  kind tribute_kind NOT NULL,
  message varchar(700),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tribute_has_author CHECK (author_id IS NOT NULL OR guest_name IS NOT NULL),
  CONSTRAINT message_has_text CHECK (kind <> 'message' OR length(trim(message)) > 0)
);

CREATE INDEX IF NOT EXISTS tributes_memorial_idx ON tributes(memorial_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memorial_id uuid REFERENCES pet_memorials(id) ON DELETE CASCADE,
  reporter_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reason varchar(500) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status, created_at);
