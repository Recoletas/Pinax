export const COLLABORATION_SCHEMA_VERSION = 5

const MIGRATION_1 = `
CREATE TABLE IF NOT EXISTS collaboration_schema (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS collaboration_rooms (
  room_id TEXT PRIMARY KEY,
  room_slug TEXT NOT NULL UNIQUE,
  room_kind TEXT NOT NULL,
  status TEXT NOT NULL,
  host_id TEXT,
  host_epoch INTEGER NOT NULL,
  manifest_fingerprint TEXT,
  share_session_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  quota_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS collaboration_invites (
  invite_id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES collaboration_rooms(room_id) ON DELETE CASCADE,
  secret_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 20
);
CREATE INDEX IF NOT EXISTS collaboration_invites_room_idx ON collaboration_invites(room_id);
CREATE TABLE IF NOT EXISTS collaboration_members (
  member_id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES collaboration_rooms(room_id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  resume_hash TEXT NOT NULL,
  token_version INTEGER NOT NULL,
  joined_at INTEGER NOT NULL,
  connected_at INTEGER,
  disconnected_at INTEGER,
  lease_expires_at INTEGER NOT NULL,
  left_at INTEGER,
  UNIQUE(room_id, member_id)
);
CREATE INDEX IF NOT EXISTS collaboration_members_room_idx ON collaboration_members(room_id, joined_at, member_id);
CREATE TABLE IF NOT EXISTS collaboration_idempotency (
  room_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  ack_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(room_id, command_id)
);
CREATE TABLE IF NOT EXISTS collaboration_events (
  room_id TEXT NOT NULL REFERENCES collaboration_rooms(room_id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_display_name TEXT NOT NULL,
  command_id TEXT,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(room_id, seq)
);
CREATE INDEX IF NOT EXISTS collaboration_events_command_idx ON collaboration_events(room_id, command_id);
CREATE TABLE IF NOT EXISTS collaboration_snapshots (
  room_id TEXT PRIMARY KEY REFERENCES collaboration_rooms(room_id) ON DELETE CASCADE,
  last_seq INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS collaboration_retention (
  room_id TEXT PRIMARY KEY REFERENCES collaboration_rooms(room_id) ON DELETE CASCADE,
  min_retained_seq INTEGER NOT NULL DEFAULT 1,
  artifact_expires_at INTEGER NOT NULL,
  comment_expires_at INTEGER NOT NULL,
  event_quota INTEGER NOT NULL,
  byte_quota INTEGER NOT NULL,
  retained_bytes INTEGER NOT NULL DEFAULT 0,
  artifact_purged_at INTEGER,
  comment_purged_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS collaboration_deletion_receipts (
  receipt_id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  deleted_at INTEGER NOT NULL,
  last_seq INTEGER NOT NULL,
  event_count INTEGER NOT NULL
);
`

const MIGRATION_2 = `
ALTER TABLE collaboration_rooms ADD COLUMN encryption_policy TEXT NOT NULL DEFAULT 'none';
ALTER TABLE collaboration_rooms ADD COLUMN target_allowlist_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE collaboration_members ADD COLUMN invite_id TEXT;
ALTER TABLE collaboration_idempotency ADD COLUMN request_fingerprint TEXT NOT NULL DEFAULT '';
UPDATE collaboration_rooms SET encryption_policy = 'aes-256-gcm', status = 'closed' WHERE room_kind != 'experience';
UPDATE collaboration_rooms SET target_allowlist_json = '[{"artifactId":"experience-runtime","artifactRevision":1}]' WHERE room_kind = 'experience';
`

const MIGRATION_3 = `
CREATE TABLE collaboration_nonces (
  room_id TEXT NOT NULL REFERENCES collaboration_rooms(room_id) ON DELETE CASCADE,
  share_session_id TEXT NOT NULL,
  nonce_digest TEXT NOT NULL,
  command_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(room_id, share_session_id, nonce_digest)
);
`

const MIGRATION_4 = `
ALTER TABLE collaboration_members ADD COLUMN previous_resume_hash TEXT;
`

const MIGRATION_5 = `
ALTER TABLE collaboration_members ADD COLUMN previous_resume_expires_at INTEGER;
ALTER TABLE collaboration_members ADD COLUMN previous_resume_replayed_at INTEGER;
`

export function migrateCollaborationDatabase(db, now = Date.now()) {
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  db.exec('CREATE TABLE IF NOT EXISTS collaboration_schema (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)')
  const current = db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM collaboration_schema').get().version
  if (current > COLLABORATION_SCHEMA_VERSION) throw new Error('collaboration-schema-newer-than-supported')
  const apply = (version, sql) => db.transaction(() => {
    db.exec(sql)
    db.prepare('INSERT INTO collaboration_schema(version, applied_at) VALUES (?, ?)').run(version, now)
  })()
  if (current < 1) {
    apply(1, MIGRATION_1)
  }
  if (current < 2) {
    apply(2, MIGRATION_2)
  }
  if (current < 3) {
    apply(3, MIGRATION_3)
  }
  if (current < 4) {
    apply(4, MIGRATION_4)
  }
  if (current < 5) {
    apply(5, MIGRATION_5)
  }
}
