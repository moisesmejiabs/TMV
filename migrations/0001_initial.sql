-- Tu Mejor Versión - D1 schema
-- Note: D1 is SQLite. Dates are stored as ISO-8601 TEXT.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  image_url TEXT,
  testimony TEXT,
  testimony_approved INTEGER NOT NULL DEFAULT 0,
  video_url TEXT,
  video_approved INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_user_email ON user(email);

CREATE TABLE IF NOT EXISTS milk_giveaway_registration (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registered_by INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  baby_name TEXT NOT NULL,
  baby_age_months INTEGER NOT NULL,
  formula_type TEXT NOT NULL,
  formula_other TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(registered_by) REFERENCES user(id)
);
CREATE INDEX IF NOT EXISTS idx_milk_registration_created_at
  ON milk_giveaway_registration(created_at);
CREATE INDEX IF NOT EXISTS idx_milk_registration_registered_by
  ON milk_giveaway_registration(registered_by);

CREATE TABLE IF NOT EXISTS event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  presenter TEXT NOT NULL,
  about TEXT NOT NULL,
  location TEXT NOT NULL,
  requirements TEXT,
  image_url TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  capacity INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(created_by) REFERENCES user(id)
);

CREATE TABLE IF NOT EXISTS course (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  presenter TEXT NOT NULL,
  about TEXT NOT NULL,
  location TEXT NOT NULL,
  requirements TEXT,
  image_url TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  capacity INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(created_by) REFERENCES user(id)
);

CREATE TABLE IF NOT EXISTS workshop (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  presenter TEXT NOT NULL,
  about TEXT NOT NULL,
  location TEXT NOT NULL,
  requirements TEXT,
  image_url TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  capacity INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(created_by) REFERENCES user(id)
);

CREATE TABLE IF NOT EXISTS workshop_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workshop_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  feedback TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(workshop_id) REFERENCES workshop(id),
  FOREIGN KEY(user_id) REFERENCES user(id)
);

CREATE TABLE IF NOT EXISTS enrollment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'registered',
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES user(id),
  FOREIGN KEY(course_id) REFERENCES course(id),
  UNIQUE(user_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_enrollment_user ON enrollment(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_course ON enrollment(course_id);

CREATE TABLE IF NOT EXISTS event_enrollment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  event_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'registered',
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES user(id),
  FOREIGN KEY(event_id) REFERENCES event(id),
  UNIQUE(user_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_event_enrollment_user ON event_enrollment(user_id);
CREATE INDEX IF NOT EXISTS idx_event_enrollment_event ON event_enrollment(event_id);

CREATE TABLE IF NOT EXISTS donation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  donor_user_id INTEGER,
  donor_name TEXT NOT NULL,
  donor_email TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  processor TEXT NOT NULL DEFAULT 'manual',
  processor_ref TEXT,
  campaign TEXT,
  restricted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(donor_user_id) REFERENCES user(id)
);
CREATE INDEX IF NOT EXISTS idx_donation_created_at ON donation(created_at);
CREATE INDEX IF NOT EXISTS idx_donation_donor_email ON donation(donor_email);

CREATE TABLE IF NOT EXISTS receipt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  donation_id INTEGER NOT NULL UNIQUE,
  receipt_number TEXT NOT NULL UNIQUE,
  issued_at TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  FOREIGN KEY(donation_id) REFERENCES donation(id)
);
CREATE INDEX IF NOT EXISTS idx_receipt_number ON receipt(receipt_number);

CREATE TABLE IF NOT EXISTS media_asset (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  r2_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mimetype TEXT NOT NULL,
  uploaded_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(uploaded_by) REFERENCES user(id)
);

CREATE TABLE IF NOT EXISTS app_setting (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_by INTEGER,
  updated_at TEXT,
  FOREIGN KEY(updated_by) REFERENCES user(id)
);

CREATE TABLE IF NOT EXISTS youtube_slider_video (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  youtube_url TEXT NOT NULL,
  embed_url TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(created_by) REFERENCES user(id)
);

CREATE TABLE IF NOT EXISTS agreement_doc (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mimetype TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(created_by) REFERENCES user(id)
);

CREATE TABLE IF NOT EXISTS user_agreement_acknowledgement (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  agreement_doc_id INTEGER NOT NULL,
  accepted_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES user(id),
  FOREIGN KEY(agreement_doc_id) REFERENCES agreement_doc(id),
  UNIQUE(user_id, agreement_doc_id)
);

CREATE TABLE IF NOT EXISTS thread (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(created_by) REFERENCES user(id)
);

CREATE TABLE IF NOT EXISTS post (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL,
  created_by INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(thread_id) REFERENCES thread(id),
  FOREIGN KEY(created_by) REFERENCES user(id)
);
CREATE INDEX IF NOT EXISTS idx_post_thread ON post(thread_id);
