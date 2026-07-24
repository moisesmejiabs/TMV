-- Local-first Android/cellular SMS gateway queue.
-- Apply to production only after explicit authorization and backup review.

CREATE TABLE IF NOT EXISTS sms_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','claimed','sent','delivered','failed','canceled')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  claim_token TEXT,
  claimed_by TEXT,
  lease_expires_at TEXT,
  sent_at TEXT,
  delivered_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by INTEGER,
  FOREIGN KEY(created_by) REFERENCES user(id)
);

CREATE INDEX IF NOT EXISTS idx_sms_outbox_dispatch
  ON sms_outbox(status, available_at, id);
CREATE INDEX IF NOT EXISTS idx_sms_outbox_created_at
  ON sms_outbox(created_at);
