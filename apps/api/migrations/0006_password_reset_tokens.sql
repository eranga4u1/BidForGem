-- 0006_password_reset_tokens: single-use, short-lived, hashed password-reset tokens.
-- The token is a random opaque string emailed to the user; only its SHA-256
-- hash is stored, so a DB leak does not expose usable reset links. Redemption
-- sets used_at (single-use); a successful reset also revokes the user's other
-- outstanding tokens.

CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX password_reset_tokens_token_hash_idx ON password_reset_tokens (token_hash);
CREATE INDEX password_reset_tokens_user_id_idx ON password_reset_tokens (user_id);
