-- No migrations: deleting the db file is the upgrade path.
-- `from`/`to` are SQL keywords, hence from_address/to_address.

CREATE TABLE IF NOT EXISTS emails (
  id            TEXT PRIMARY KEY,
  thread_id     TEXT NOT NULL,
  from_address  TEXT NOT NULL,
  to_address    TEXT NOT NULL,
  subject       TEXT NOT NULL,
  body          TEXT NOT NULL,
  headers       TEXT NOT NULL,
  received_at   TEXT NOT NULL,
  sender_class  TEXT NOT NULL,
  archived_at   TEXT,
  read_at       TEXT,
  snoozed_until TEXT,
  labels        TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS decisions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id    TEXT NOT NULL UNIQUE REFERENCES emails(id),
  analysis    TEXT,
  injection   TEXT NOT NULL,
  floor       TEXT NOT NULL,
  learned     TEXT NOT NULL,
  brake       INTEGER NOT NULL,
  pin         TEXT,
  level       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_id  INTEGER NOT NULL UNIQUE REFERENCES decisions(id),
  kind         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open',
  -- own copy of the proposal because `edit` changes it
  proposal     TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at  TEXT
);

-- decision_id lets a transcript reach silent executions, which have no item.
CREATE TABLE IF NOT EXISTS executions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_id  INTEGER NOT NULL REFERENCES decisions(id),
  item_id      INTEGER REFERENCES items(id),
  action       TEXT NOT NULL,
  params       TEXT NOT NULL,
  executed_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  undone_at    TEXT
);

-- One draft per email, so undo can delete by email_id alone.
CREATE TABLE IF NOT EXISTS drafts (
  email_id    TEXT PRIMARY KEY REFERENCES emails(id),
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- item_id is UNIQUE: one item yields at most one feedback row.
CREATE TABLE IF NOT EXISTS feedback (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id       INTEGER NOT NULL UNIQUE REFERENCES items(id),
  action        TEXT NOT NULL,
  sender_class  TEXT NOT NULL,
  kind          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS pins (
  action        TEXT NOT NULL,
  sender_class  TEXT NOT NULL,
  level         TEXT NOT NULL,
  PRIMARY KEY (action, sender_class)
);

CREATE TABLE IF NOT EXISTS preferences (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  text  TEXT NOT NULL
);

INSERT OR IGNORE INTO preferences (id, text) VALUES (1, '');
