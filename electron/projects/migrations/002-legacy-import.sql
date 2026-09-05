CREATE TABLE legacy_imports (
  bundle_id TEXT PRIMARY KEY,
  source_schema_version INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('staging', 'complete', 'failed')),
  source_count INTEGER NOT NULL,
  imported_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE legacy_import_records (
  bundle_id TEXT NOT NULL REFERENCES legacy_imports(bundle_id),
  source_record_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('supported', 'converted', 'detached', 'orphaned', 'rejected')),
  target_kind TEXT,
  target_id TEXT,
  PRIMARY KEY (bundle_id, source_record_id)
);

CREATE TABLE legacy_records (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  json_payload TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE legacy_import_targets (
  bundle_id TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  source_nested_id TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  PRIMARY KEY (bundle_id, source_record_id, source_nested_id, target_kind, target_id),
  FOREIGN KEY (bundle_id, source_record_id)
    REFERENCES legacy_import_records(bundle_id, source_record_id)
);

CREATE INDEX legacy_records_source_idx ON legacy_records(source_record_id, record_type);
