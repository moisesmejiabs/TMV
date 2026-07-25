-- Prevent the same authentication account from appearing twice in one event.
CREATE UNIQUE INDEX idx_event_participant_user_unique
  ON event_participant(event_id, user_id)
  WHERE user_id IS NOT NULL;
