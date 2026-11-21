ALTER TABLE users ADD COLUMN deleted_at timestamptz;

-- Backfill accounts anonymized by the original deletion flow.
UPDATE users
   SET deleted_at = now(), name = 'Deleted user', phone = NULL, phone2 = NULL
 WHERE email = 'deleted+' || id::text || '@deleted.invalid';
