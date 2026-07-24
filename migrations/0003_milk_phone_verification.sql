-- Phone-control verification for milk-giveaway registrations.
-- Codes are stored only as keyed hashes and expire after ten minutes.

CREATE TABLE IF NOT EXISTS milk_phone_verification (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  phone_e164 TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'milk_registration'
    CHECK (purpose = 'milk_registration'),
  code_salt TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts_remaining INTEGER NOT NULL DEFAULT 5
    CHECK (attempts_remaining BETWEEN 0 AND 5),
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  verified_expires_at TEXT,
  consumed_at TEXT,
  request_ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES user(id)
);

CREATE INDEX IF NOT EXISTS idx_milk_phone_verification_user_phone
  ON milk_phone_verification(user_id, phone_e164, created_at);
CREATE INDEX IF NOT EXISTS idx_milk_phone_verification_ip_created
  ON milk_phone_verification(request_ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_milk_phone_verification_expiry
  ON milk_phone_verification(expires_at);

ALTER TABLE milk_giveaway_registration
  ADD COLUMN phone_verification_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_milk_registration_phone_verification
  ON milk_giveaway_registration(phone_verification_id)
  WHERE phone_verification_id IS NOT NULL;
