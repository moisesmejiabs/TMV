-- Registrations for the Tu Mejor Versión baby formula giveaway.

CREATE TABLE IF NOT EXISTS milk_giveaway_registration (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registered_by INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  baby_name TEXT NOT NULL,
  baby_age_months INTEGER NOT NULL CHECK (baby_age_months BETWEEN 0 AND 36),
  formula_type TEXT NOT NULL,
  formula_other TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(registered_by) REFERENCES user(id)
);

CREATE INDEX IF NOT EXISTS idx_milk_registration_registered_by
  ON milk_giveaway_registration(registered_by);

CREATE INDEX IF NOT EXISTS idx_milk_registration_created_at
  ON milk_giveaway_registration(created_at);
