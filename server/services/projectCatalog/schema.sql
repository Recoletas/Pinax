-- Namespaced projection: leave Electron schema_migrations/project_items untouched.
CREATE TABLE IF NOT EXISTS catalog_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS catalog_files (
  relative_path TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS catalog_items (
  rowid INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  item_id TEXT NOT NULL,
  relative_path TEXT NOT NULL REFERENCES catalog_files(relative_path) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT NOT NULL,
  record_json TEXT NOT NULL,
  UNIQUE(kind, item_id)
);
CREATE INDEX IF NOT EXISTS catalog_items_path ON catalog_items(relative_path);
CREATE VIRTUAL TABLE IF NOT EXISTS catalog_fts USING fts5(
  title, content, tags,
  content='catalog_items', content_rowid='rowid', tokenize='trigram'
);
CREATE TRIGGER IF NOT EXISTS catalog_items_insert AFTER INSERT ON catalog_items BEGIN
  INSERT INTO catalog_fts(rowid, title, content, tags)
  VALUES (new.rowid, new.title, new.content, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS catalog_items_delete AFTER DELETE ON catalog_items BEGIN
  INSERT INTO catalog_fts(catalog_fts, rowid, title, content, tags)
  VALUES ('delete', old.rowid, old.title, old.content, old.tags);
END;
CREATE TRIGGER IF NOT EXISTS catalog_items_update AFTER UPDATE ON catalog_items BEGIN
  INSERT INTO catalog_fts(catalog_fts, rowid, title, content, tags)
  VALUES ('delete', old.rowid, old.title, old.content, old.tags);
  INSERT INTO catalog_fts(rowid, title, content, tags)
  VALUES (new.rowid, new.title, new.content, new.tags);
END;
CREATE TABLE IF NOT EXISTS catalog_outline_endpoints (
  node_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'outline-node' CHECK(kind = 'outline-node'),
  FOREIGN KEY(kind, node_id) REFERENCES catalog_items(kind, item_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS catalog_outline_edges (
  edge_id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES catalog_outline_endpoints(node_id),
  to_id TEXT NOT NULL REFERENCES catalog_outline_endpoints(node_id),
  kind TEXT NOT NULL,
  CHECK(from_id <> to_id),
  UNIQUE(kind, from_id, to_id)
);
