-- 0001_init: core schema for the Gem platform.
-- gen_random_uuid() is native in PostgreSQL 13+ (also present in PGlite);
-- do NOT `CREATE EXTENSION pgcrypto`.

CREATE TYPE user_role AS ENUM ('user', 'admin');
CREATE TYPE gem_status AS ENUM ('draft', 'active', 'sold', 'closed');
CREATE TYPE auction_status AS ENUM ('scheduled', 'active', 'closed', 'canceled');
CREATE TYPE media_type AS ENUM ('photo', 'video', 'certificate');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role user_role NOT NULL DEFAULT 'user',
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE gems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES users (id),
  title text NOT NULL,
  description text,
  type text NOT NULL,
  carat_milli integer NOT NULL,
  color text,
  clarity text,
  cut text,
  origin text,
  status gem_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gems_carat_milli_nonneg CHECK (carat_milli >= 0)
);

CREATE TABLE media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gem_id uuid NOT NULL REFERENCES gems (id) ON DELETE CASCADE,
  type media_type NOT NULL,
  url text NOT NULL,
  mime text NOT NULL,
  size integer NOT NULL,
  CONSTRAINT media_size_nonneg CHECK (size >= 0)
);

CREATE TABLE auctions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gem_id uuid NOT NULL REFERENCES gems (id),
  start_price bigint NOT NULL,
  reserve_price bigint,
  min_increment bigint NOT NULL,
  currency text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status auction_status NOT NULL DEFAULT 'scheduled',
  highest_bid bigint,
  highest_bidder_id uuid REFERENCES users (id),
  winner_id uuid REFERENCES users (id),
  CONSTRAINT auctions_start_price_nonneg CHECK (start_price >= 0),
  CONSTRAINT auctions_reserve_nonneg CHECK (reserve_price IS NULL OR reserve_price >= 0),
  CONSTRAINT auctions_min_increment_pos CHECK (min_increment > 0),
  CONSTRAINT auctions_time_order CHECK (end_at > start_at),
  CONSTRAINT auctions_highest_bid_nonneg CHECK (highest_bid IS NULL OR highest_bid >= 0)
);

CREATE INDEX auctions_status_end_at_idx ON auctions (status, end_at);

CREATE TABLE bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid NOT NULL REFERENCES auctions (id) ON DELETE CASCADE,
  bidder_id uuid NOT NULL REFERENCES users (id),
  amount bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bids_amount_pos CHECK (amount > 0)
);

CREATE INDEX bids_auction_amount_idx ON bids (auction_id, amount DESC);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz
);

CREATE TABLE app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users (id)
);
