-- 0004_listings_media: soft-delete for gems; media upload lifecycle.

-- Soft-delete: gems are referenced by auctions/bids, so they are never hard-deleted.
ALTER TABLE gems ADD COLUMN deleted_at timestamptz;

-- Media upload lifecycle: a row is created 'pending' when an upload URL is issued
-- and flipped to 'ready' on completion. 'pending' media is never served.
CREATE TYPE media_status AS ENUM ('pending', 'ready');

ALTER TABLE media
  ADD COLUMN status media_status NOT NULL DEFAULT 'pending',
  ADD COLUMN storage_key text NOT NULL,
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

-- The public URL is unknown until completion (and never set for certificates),
-- so url becomes nullable.
ALTER TABLE media ALTER COLUMN url DROP NOT NULL;

CREATE INDEX media_gem_id_idx ON media (gem_id);
CREATE UNIQUE INDEX media_storage_key_uq ON media (storage_key);
