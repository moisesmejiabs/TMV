-- Explicitly distinguish traditional self-registration events from events
-- whose attendance is assigned by an administrator.
ALTER TABLE event
  ADD COLUMN uses_external_participants INTEGER NOT NULL DEFAULT 0;
