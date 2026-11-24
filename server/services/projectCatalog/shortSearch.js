// One- and two-code-point phrases cannot produce an FTS5 trigram. Store a
// posting per document and distinct literal gram instead of token positions.
const alphabet = 0x110000

function foldedCodePoint(character) {
  const code = character.codePointAt(0)
  // Match SQLite lower() in the existing substring query (ASCII only).
  return code >= 65 && code <= 90 ? code + 32 : code
}
function pair(left, right) {
  return (left + 1) * alphabet + right
}
export function shortQueryTerm(points) {
  const first = foldedCodePoint(points[0])
  const value = points.length === 1 ? first : pair(first, foldedCodePoint(points[1]))
  return value.toString(36)
}

function indexTerms(fields) {
  const grams = new Set()
  for (const text of fields) {
    let previous = -1
    for (const character of text) {
      const code = foldedCodePoint(character)
      grams.add(code)
      if (previous >= 0) grams.add(pair(previous, code))
      previous = code
      // Keep memory and token generation bounded for a giant archive entry.
      // Its original fields stay searchable via the fallback below.
      if (grams.size > 32768) return null
    }
  }
  return [...grams].map(value => value.toString(36)).join(' ')
}

export function hasShortSearch(db) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE name='catalog_short_pending' AND type='table'").get())
}

export function updateShortSearch(db) {
  if (!hasShortSearch(db)) {
    // A v1 reader may use the original substring scan until the next explicit
    // sync installs this index. Triggers also observe writes from older clients.
    db.exec(`
      CREATE VIRTUAL TABLE catalog_short_fts USING fts5(grams, content='', contentless_delete=1, tokenize='ascii', detail=none);
      CREATE TABLE catalog_short_pending (id INTEGER PRIMARY KEY, scan_only INTEGER NOT NULL DEFAULT 0);
      INSERT INTO catalog_short_pending(id) SELECT rowid FROM catalog_items;
      CREATE TRIGGER catalog_short_insert AFTER INSERT ON catalog_items BEGIN
        INSERT INTO catalog_short_pending(id) VALUES(new.rowid);
      END;
      CREATE TRIGGER catalog_short_delete AFTER DELETE ON catalog_items BEGIN
        DELETE FROM catalog_short_pending WHERE id=old.rowid;
        DELETE FROM catalog_short_fts WHERE rowid=old.rowid;
      END;
      CREATE TRIGGER catalog_short_update AFTER UPDATE ON catalog_items BEGIN
        DELETE FROM catalog_short_pending WHERE id=old.rowid;
        DELETE FROM catalog_short_fts WHERE rowid=old.rowid;
        INSERT INTO catalog_short_pending(id) VALUES(new.rowid);
      END;
    `)
  }
  const pending = db.prepare('SELECT id FROM catalog_short_pending WHERE scan_only=0').all()
  if (!pending.length) return
  // node:sqlite returns TEXT through a NUL-terminated string. Keep every byte
  // here so a match after an embedded NUL is also represented in the index.
  const fields = db.prepare(`SELECT CAST(title AS BLOB) AS title, CAST(content AS BLOB) AS content,
    CAST(tags AS BLOB) AS tags FROM catalog_items WHERE rowid=?`)
  const index = db.prepare('INSERT INTO catalog_short_fts(rowid, grams) VALUES (?,?)')
  const done = db.prepare('DELETE FROM catalog_short_pending WHERE id=?')
  const fallback = db.prepare('UPDATE catalog_short_pending SET scan_only=1 WHERE id=?')
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true })
  for (const { id } of pending) {
    const row = fields.get(id)
    const terms = indexTerms([decoder.decode(row.title), decoder.decode(row.content), decoder.decode(row.tags)])
    if (terms === null) { fallback.run(id); continue }
    index.run(id, terms)
    done.run(id)
  }
}
