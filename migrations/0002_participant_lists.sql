-- Participant directory, reusable lists, and event membership snapshots.
-- Additive migration for Cloudflare D1 (SQLite).

PRAGMA foreign_keys = ON;

CREATE TABLE participant (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by) REFERENCES user(id)
);
CREATE INDEX idx_participant_name ON participant(name);
CREATE INDEX idx_participant_phone ON participant(phone);

CREATE TABLE participant_list (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(created_by) REFERENCES user(id)
);

CREATE TABLE participant_list_member (
  participant_list_id INTEGER NOT NULL,
  participant_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(participant_list_id, participant_id),
  FOREIGN KEY(participant_list_id) REFERENCES participant_list(id) ON DELETE CASCADE,
  FOREIGN KEY(participant_id) REFERENCES participant(id) ON DELETE CASCADE
);
CREATE INDEX idx_participant_list_member_participant
  ON participant_list_member(participant_id);

CREATE TABLE event_participant (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  participant_id INTEGER,
  user_id INTEGER,
  participant_type TEXT NOT NULL CHECK(participant_type IN ('registered', 'ad_hoc')),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(event_id) REFERENCES event(id) ON DELETE CASCADE,
  FOREIGN KEY(participant_id) REFERENCES participant(id) ON DELETE SET NULL,
  FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX idx_event_participant_registered_unique
  ON event_participant(event_id, participant_id)
  WHERE participant_id IS NOT NULL;
CREATE INDEX idx_event_participant_event ON event_participant(event_id);
CREATE INDEX idx_event_participant_user ON event_participant(user_id);
