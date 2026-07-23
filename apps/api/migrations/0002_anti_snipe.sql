-- 0002_anti_snipe: anti-snipe extension window for auctions (Step 3 decision).
-- A winning bid within `window` seconds of end_at pushes end_at out by `extend`
-- seconds. Defaults: window 30s, extend 60s. 0 disables the behavior.

ALTER TABLE auctions
  ADD COLUMN anti_snipe_window_seconds integer NOT NULL DEFAULT 30,
  ADD COLUMN anti_snipe_extend_seconds integer NOT NULL DEFAULT 60;

ALTER TABLE auctions
  ADD CONSTRAINT auctions_anti_snipe_window_nonneg CHECK (anti_snipe_window_seconds >= 0),
  ADD CONSTRAINT auctions_anti_snipe_extend_nonneg CHECK (anti_snipe_extend_seconds >= 0);
