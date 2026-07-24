-- 0005: auction 'sold' status + notification ordering.

-- A closed auction that met its reserve becomes 'sold' (winner set); an unsold
-- one becomes 'closed'.
ALTER TYPE auction_status ADD VALUE IF NOT EXISTS 'sold';

-- created_at enables newest-first notification listing.
ALTER TABLE notifications ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC);
