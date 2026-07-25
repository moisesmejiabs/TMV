-- Preserve which reusable lists were selected so Event Builder can restore
-- them during editing. Event participants remain independent snapshots.
CREATE TABLE event_participant_list (
  event_id INTEGER NOT NULL,
  participant_list_id INTEGER,
  list_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(event_id, participant_list_id),
  FOREIGN KEY(event_id) REFERENCES event(id) ON DELETE CASCADE,
  FOREIGN KEY(participant_list_id) REFERENCES participant_list(id) ON DELETE SET NULL
);
CREATE INDEX idx_event_participant_list_event
  ON event_participant_list(event_id);
