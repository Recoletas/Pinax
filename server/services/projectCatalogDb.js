import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { catalogError, digest, parseSource, readSource, safePath, scanSources } from './projectCatalog/sources.js'

const schema = fs.readFileSync(new URL('./projectCatalog/schema.sql', import.meta.url), 'utf8')
const version = '1'
const maxResults = 100

function identity(rootPath) {
  if (String(process.env.PINAX_PUBLIC_ORIGINS || '').trim()) throw catalogError('CATALOG_LOCAL_ONLY', '派生目录仅用于本地项目')
  if (!path.isAbsolute(rootPath)) throw catalogError('CATALOG_PATH', '项目路径必须是绝对路径')
  const root = fs.realpathSync(rootPath)
  const marker = safePath(root, '.pinax/project.json')
  const manifest = JSON.parse(fs.readFileSync(marker, 'utf8'))
  if (manifest.spec !== 'pinax-project@1' || typeof manifest.projectId !== 'string' || !manifest.projectId.trim()) {
    throw catalogError('CATALOG_PROJECT_REQUIRED', '需要 pinax-project@1 项目标记及 projectId')
  }
  if (fs.existsSync(`${root}.pinax-sync.json`)) throw catalogError('CATALOG_MIRROR_PENDING', '项目有未完成镜像事务，请先在应用处理')
  return { root, projectId: manifest.projectId }
}

/**
 * Explicit, offline file-to-SQLite projection. Opening never scans source files;
 * reads never sync implicitly. Online callers use the separate Worker service.
 * SQLite's own tables are namespaced; Electron's schema version is untouched.
 */
export function openProjectCatalog(rootPath, { readOnly = false, expectedProjectId } = {}) {
  const { root, projectId } = identity(rootPath)
  if (expectedProjectId !== undefined && expectedProjectId !== projectId) throw catalogError('CATALOG_PROJECT_MISMATCH', '项目身份与请求目标不一致')
  const databasePath = safePath(root, '.pinax/project.sqlite', { missing: true })
  for (const suffix of ['-wal', '-shm', '-journal']) safePath(root, `.pinax/project.sqlite${suffix}`, { missing: true })
  if (readOnly && !fs.existsSync(databasePath)) throw catalogError('CATALOG_NOT_INITIALIZED', '尚未建立派生目录')
  const db = new DatabaseSync(databasePath, { readOnly })
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;')
    const hasMeta = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='catalog_meta'").get()
    if (hasMeta) {
      const stored = Object.fromEntries(db.prepare('SELECT key, value FROM catalog_meta').all().map(row => [row.key, row.value]))
      if (stored.schema_version !== version) throw catalogError('CATALOG_SCHEMA', '目录版本不兼容，未修改数据库')
      if (stored.project_id !== projectId) throw catalogError('CATALOG_PROJECT_MISMATCH', '数据库属于另一项目，未修改数据库')
    } else {
      if (readOnly) throw catalogError('CATALOG_NOT_INITIALIZED', '尚未建立派生目录')
      db.exec('BEGIN IMMEDIATE')
      try {
        db.exec(schema)
        const insert = db.prepare('INSERT INTO catalog_meta(key, value) VALUES (?, ?)')
        insert.run('schema_version', version)
        insert.run('project_id', projectId)
        db.exec('COMMIT')
      } catch (error) { db.exec('ROLLBACK'); throw error }
    }

    function transaction(work) {
      if (readOnly) throw catalogError('CATALOG_READ_ONLY', '只读目录不能同步')
      db.exec('BEGIN IMMEDIATE')
      try { const result = work(); db.exec('COMMIT'); return result } catch (error) { db.exec('ROLLBACK'); throw error }
    }
    const storedFiles = () => db.prepare('SELECT * FROM catalog_files ORDER BY relative_path').all()
    const meta = key => db.prepare('SELECT value FROM catalog_meta WHERE key=?').get(key)?.value || null
    function assertIdentity() {
      const current = identity(root)
      if (current.projectId !== projectId || current.root !== root) throw catalogError('CATALOG_PROJECT_MISMATCH', '项目身份已变化')
    }
    function sync({ verifyContent = false } = {}) {
      assertIdentity()
      // A writer lock serializes catalog syncs; filesystem source changes are
      // detected separately before commit. Malformed input rolls back the batch.
      return transaction(() => {
        const previous = new Map(storedFiles().map(file => [file.relative_path, file]))
        const files = scanSources(root)
        const changed = []
        const touched = []
        let read = 0
        const warningsByFile = JSON.parse(meta('warnings') || '{}')
        for (const file of files) {
          const old = previous.get(file.relative)
          if (!verifyContent && old?.fingerprint === file.fingerprint) continue
          const source = readSource(root, file)
          read++
          if (old?.content_hash === source.hash) { touched.push(file); continue }
          let parsed
          try { parsed = parseSource(file.relative, source.text) } catch (error) {
            throw catalogError(error.code || 'CATALOG_PARSE', error.message, { path: file.relative, ...error.details })
          }
          changed.push({ ...file, ...source, ...parsed, revision: Number(old?.revision || 0) + 1 })
          warningsByFile[file.relative] = parsed.warnings
        }
        const paths = new Set(files.map(file => file.relative))
        const deleted = [...previous.keys()].filter(relative => !paths.has(relative))
        // Edges reference node identities with real SQLite FKs. Clear and rebuild
        // only these small relation tables so a whole-outline file can be replaced.
        db.exec('DELETE FROM catalog_outline_edges; DELETE FROM catalog_outline_endpoints;')
        for (const relative of deleted) {
          db.prepare('DELETE FROM catalog_files WHERE relative_path=?').run(relative)
          delete warningsByFile[relative]
        }
        // Remove old rows for *all* changed files first (IDs may move files).
        for (const file of changed) db.prepare('DELETE FROM catalog_items WHERE relative_path=?').run(file.relative)
        const upsert = db.prepare(`INSERT INTO catalog_files(relative_path, fingerprint, content_hash, byte_length, revision, updated_at)
          VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(relative_path) DO UPDATE SET
          fingerprint=excluded.fingerprint, content_hash=excluded.content_hash,
          byte_length=excluded.byte_length, revision=excluded.revision, updated_at=excluded.updated_at`)
        const insert = db.prepare('INSERT INTO catalog_items(kind, item_id, relative_path, title, content, tags, record_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
        const now = new Date().toISOString()
        for (const file of changed) {
          upsert.run(file.relative, file.fingerprint, file.hash, file.byteLength, file.revision, now)
          for (const item of file.items) {
            try { insert.run(item.kind, item.id, file.relative, item.title, item.content, item.tags, JSON.stringify(item.data)) } catch (error) {
              throw catalogError('CATALOG_CONSTRAINT', '条目 id 重复或数据约束失败，保留旧目录', { path: file.relative, kind: item.kind, id: item.id, cause: error.message })
            }
          }
        }
        for (const file of touched) db.prepare('UPDATE catalog_files SET fingerprint=? WHERE relative_path=?').run(file.fingerprint, file.relative)
        db.exec("INSERT INTO catalog_outline_endpoints(node_id) SELECT item_id FROM catalog_items WHERE kind='outline-node'")
        const edgeInsert = db.prepare('INSERT INTO catalog_outline_edges(edge_id, from_id, to_id, kind) VALUES (?, ?, ?, ?)')
        for (const row of db.prepare("SELECT record_json FROM catalog_items WHERE kind='outline-edge'").all()) {
          const edge = JSON.parse(row.record_json)
          try { edgeInsert.run(edge.id, edge.fromNodeId, edge.toNodeId, edge.kind) } catch (error) {
            throw catalogError('CATALOG_OUTLINE_INTEGRITY', '大纲边引用缺失节点、存在自环或重复，保留旧目录', { edgeId: edge.id, cause: error.message })
          }
        }
        // Re-enumerate to catch deletion, newly created files and stat changes.
        if (JSON.stringify(scanSources(root)) !== JSON.stringify(files)) throw catalogError('CATALOG_SOURCE_CHANGED', '同步期间来源变化，请重试')
        assertIdentity()
        const revision = digest(JSON.stringify(storedFiles().map(file => [file.relative_path, file.content_hash])))
        const setMeta = db.prepare('INSERT INTO catalog_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
        setMeta.run('revision', revision)
        setMeta.run('indexed_at', now)
        setMeta.run('warnings', JSON.stringify(warningsByFile))
        return { projectId, revision, files: files.length, read, changed: changed.length, deleted: deleted.length, unchanged: files.length - changed.length, warnings: Object.values(warningsByFile).flat() }
      })
    }
    function mapItem(row) {
      if (!row) return null
      return { kind: row.kind, id: row.item_id, title: row.title, content: row.content, relativePath: row.relative_path, sourceHash: row.content_hash, fileRevision: row.revision, record: JSON.parse(row.record_json) }
    }
    const projection = 'SELECT i.*, f.content_hash, f.revision FROM catalog_items i JOIN catalog_files f USING(relative_path)'
    function list({ kind, limit = 100, offset = 0 } = {}) {
      assertIdentity()
      const size = boundedInteger(limit, 1, 1000, 100)
      const start = boundedInteger(offset, 0, 100000, 0)
      const condition = kind ? ' WHERE i.kind=?' : ''
      return db.prepare(`${projection}${condition} ORDER BY i.relative_path, i.rowid LIMIT ? OFFSET ?`).all(...(kind ? [kind] : []), size, start).map(mapItem)
    }
    function read(kind, id) {
      assertIdentity()
      return mapItem(db.prepare(`${projection} WHERE i.kind=? AND i.item_id=?`).get(kind, id))
    }
    function search(query, { kind, limit = 20 } = {}) {
      assertIdentity()
      if (typeof query !== 'string' || query.length > 500) throw catalogError('CATALOG_QUERY', '查询必须是最多 500 字符的字符串')
      const phrase = query.trim()
      if (!phrase) return { revision: meta('revision'), mode: 'empty', items: [] }
      const size = boundedInteger(limit, 1, maxResults, 20)
      const filter = kind ? ' AND i.kind=?' : ''
      const params = kind ? [kind] : []
      // Trigram needs >=3 Unicode characters. One/two-character Chinese words
      // use a bounded literal substring scan; never pretend FTS covered them.
      const trigram = Array.from(phrase).length >= 3
      const rows = trigram
        ? db.prepare(`${projection} JOIN catalog_fts ON catalog_fts.rowid=i.rowid WHERE catalog_fts MATCH ?${filter} ORDER BY bm25(catalog_fts), i.rowid LIMIT ?`).all(`"${phrase.replaceAll('"', '""')}"`, ...params, size)
        : db.prepare(`${projection} WHERE (instr(lower(i.title),lower(?))>0 OR instr(lower(i.content),lower(?))>0 OR instr(lower(i.tags),lower(?))>0)${filter} ORDER BY i.relative_path, i.rowid LIMIT ?`).all(phrase, phrase, phrase, ...params, size)
      return { revision: meta('revision'), mode: trigram ? 'fts5-trigram' : 'substring', items: rows.map(row => {
        const item = mapItem(row)
        const at = Math.max(0, item.content.toLowerCase().indexOf(phrase.toLowerCase()))
        return { kind: item.kind, id: item.id, title: item.title, relativePath: item.relativePath, sourceHash: item.sourceHash, fileRevision: item.fileRevision, excerpt: item.content.slice(Math.max(0, at - 80), at + phrase.length + 160) }
      }) }
    }
    function status() {
      assertIdentity()
      const files = storedFiles()
      const current = scanSources(root)
      const indexed = new Map(files.map(file => [file.relative_path, file.fingerprint]))
      const stale = !meta('revision') || current.length !== files.length || current.some(file => indexed.get(file.relative) !== file.fingerprint)
      return { projectId, databasePath, schemaVersion: version, revision: meta('revision'), indexedAt: meta('indexed_at'), stale, files: files.length, kinds: db.prepare('SELECT kind, count(*) AS count FROM catalog_items GROUP BY kind').all(), warnings: Object.values(JSON.parse(meta('warnings') || '{}')).flat() }
    }
    return Object.freeze({ sync, list, read, search, status, close: () => db.close() })
  } catch (error) { db.close(); throw error }
}

function boundedInteger(value, min, max, fallback) {
  return Number.isSafeInteger(value) ? Math.max(min, Math.min(max, value)) : fallback
}

export function syncCatalogFromDisk(rootPath, options = {}) {
  const catalog = openProjectCatalog(rootPath)
  try { return catalog.sync(options) } finally { catalog.close() }
}
