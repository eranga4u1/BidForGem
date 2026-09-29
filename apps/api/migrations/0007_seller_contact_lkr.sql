-- 0007_seller_contact_lkr: seller contact numbers + switch the marketplace to LKR.

-- Up to two contact numbers per user (a primary and an optional second, e.g.
-- WhatsApp or a land line). Nullable: they're optional at sign-up, and the
-- "a seller needs one before publishing" rule is enforced in the API, so
-- existing accounts stay valid.
ALTER TABLE users ADD COLUMN phone text;
ALTER TABLE users ADD COLUMN phone2 text;

-- The marketplace now trades in Sri Lankan rupees. Relabel the existing
-- close-testing data from USD to LKR. Amounts are relabeled, NOT converted
-- (a US$100 bid becomes Rs. 100) — acceptable for test data only.
UPDATE auctions SET currency = 'LKR' WHERE currency = 'USD';

UPDATE app_settings
   SET value = jsonb_set(value, '{currency}', '"LKR"')
 WHERE key = 'posting_fee' AND value->>'currency' = 'USD';

-- OUTBID notifications snapshot the currency in their payload.
UPDATE notifications
   SET payload = jsonb_set(payload, '{currency}', '"LKR"')
 WHERE payload->>'currency' = 'USD';
