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
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_email ON user(email);

CREATE TABLE IF NOT EXISTS event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  presenter TEXT NOT NULL,
  about TEXT NOT NULL,
  location TEXT NOT NULL,
  requirements TEXT,
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
  capacity INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(created_by) REFERENCES user(id)
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
