CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE project_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('volume', 'chapter', 'reference')),
  relative_path TEXT UNIQUE,
  parent_id TEXT REFERENCES project_items(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT,
  byte_length INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE file_transactions (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  staged_path TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  resulting_hash TEXT NOT NULL,
  resulting_bytes INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('staged', 'file_committed', 'complete', 'aborted')),
  created_at TEXT NOT NULL,
  committed_at TEXT
);
