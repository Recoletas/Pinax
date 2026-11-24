import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { parseDocumentMetadata } from './projectDocumentMetadata.js'
import { catalogError, digest, parseSource, readSource, safePath, scanSources, sourceBinding } from './projectCatalog/sources.js'
import { hasShortSearch, shortQueryTerm, updateShortSearch } from './projectCatalog/shortSearch.js'
import { insertOutlineEdges, patchOutline } from './projectCatalog/outline.js'

const schema = fs.readFileSync(new URL('./projectCatalog/schema.sql', import.meta.url), 'utf8')
const version = '1'
const maxResults = 100
// node:sqlite's TEXT result ends at an embedded NUL. Decode the original
// UTF-8 bytes for complete manuscript content and search excerpts.
const decode = new TextDecoder('utf-8', { ignoreBOM: true })
// Each Worker serves one request at a time and at most one Worker stays idle.
// Keep only the last identity-checked chapter/exploration binding map.
let bindingCache = null

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
  if (bindingCache && (root !== bindingCache.root || projectId !== bindingCache.projectId)) bindingCache = null
  const databasePath = safePath(root, '.pinax/project.sqlite', { missing: true })
  for (const suffix of ['-wal', '-shm', '-journal']) safePath(root, `.pinax/project.sqlite${suffix}`, { missing: true })
  if (readOnly && !fs.existsSync(databasePath)) throw catalogError('CATALOG_NOT_INITIALIZED', '尚未建立派生目录')
  const db = new DatabaseSync(databasePath, { readOnly })
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;')
    function initialize() {
      const hasMeta = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='catalog_meta'").get()
      if (hasMeta) {
        const stored = Object.fromEntries(db.prepare("SELECT key, value FROM catalog_meta WHERE key IN ('project_id','schema_version')").all().map(row => [row.key, row.value]))
        if (stored.schema_version !== version) throw catalogError('CATALOG_SCHEMA', '目录版本不兼容，未修改数据库')
        if (stored.project_id !== projectId) throw catalogError('CATALOG_PROJECT_MISMATCH', '数据库属于另一项目，未修改数据库')
        return
      }
      if (readOnly) throw catalogError('CATALOG_NOT_INITIALIZED', '尚未建立派生目录')
      db.exec(schema)
      const insert = db.prepare('INSERT INTO catalog_meta(key, value) VALUES (?, ?)')
      insert.run('schema_version', version)
      insert.run('project_id', projectId)
    }
    if (readOnly) initialize()
    else transaction(initialize)

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
        const storedBindings = meta('binding_hashes_v2')
        const warningsByFile = JSON.parse(meta('warnings') || '{}')
        const checkSourceSnapshot = () => {
          if (JSON.stringify(scanSources(root)) !== JSON.stringify(files)) throw catalogError('CATALOG_SOURCE_CHANGED', '同步期间来源变化，请重试')
          assertIdentity()
        }
        const previousRevision = meta('revision')
        if (!verifyContent && storedBindings && previousRevision && previous.size === files.length
          && files.every(file => file.fingerprint === previous.get(file.relative)?.fingerprint)) {
          updateShortSearch(db)
          checkSourceSnapshot()
          return { projectId, revision: previousRevision, files: files.length, read: 0, changed: 0, deleted: 0, unchanged: files.length, warnings: Object.values(warningsByFile).flat() }
        }
        const metadataFile = files.find(file => file.relative === 'meta.json')
        const oldMetadata = previous.get('meta.json')
        if (!metadataFile && bindingCache?.root === root) bindingCache = null
        let read = 0
        let metadata, metadataSource
        function getMetadata() {
          if (metadata !== undefined) return metadata
          if (!metadataFile) { metadata = null; return metadata }
          const cached = bindingCache?.root === root && bindingCache.projectId === projectId ? bindingCache : null
          if (!verifyContent && cached && cached.hash === oldMetadata?.content_hash
            && cached.fingerprint === metadataFile.fingerprint && oldMetadata.fingerprint === metadataFile.fingerprint) {
            metadata = cached.metadata
            return metadata
          }
          metadataSource = readSource(root, metadataFile)
          read++
          if (cached?.hash === metadataSource.hash) {
            cached.fingerprint = metadataFile.fingerprint
            metadata = cached.metadata
            return metadata
          }
          try { metadata = parseDocumentMetadata(metadataSource.text) }
          catch (error) { throw catalogError('CATALOG_METADATA_INVALID', error.message, { path: 'meta.json' }) }
          bindingCache = { root, projectId, fingerprint: metadataFile.fingerprint, hash: metadataSource.hash,
            metadata: { chapterFiles: metadata.chapterFiles, explorationFiles: metadata.explorationFiles } }
          return metadata
        }
        if (verifyContent || oldMetadata?.fingerprint !== metadataFile?.fingerprint) getMetadata()
        const metadataChanged = metadata !== undefined && (oldMetadata?.content_hash || null) !== (metadataSource?.hash || null)
        const oldBindings = JSON.parse(storedBindings || '{}')
        const bindings = {}
        // Older catalogs lack per-file dependency hashes. Compare projected
        // records on the first sync so unchanged documents keep their revision.
        const oldRecord = db.prepare('SELECT record_json FROM catalog_items WHERE relative_path=?')
        const changed = []
        const touched = []
        for (const file of files) {
          const old = previous.get(file.relative)
          const document = /^(正文|构思)\//.test(file.relative)
          const legacyDocument = document && old && !storedBindings
          let dependencyChanged = false
          if (document) {
            if (!metadataChanged && storedBindings && old) {
              if (oldBindings[file.relative]) bindings[file.relative] = oldBindings[file.relative]
            } else {
              const binding = sourceBinding(file.relative, getMetadata())
              if (binding) bindings[file.relative] = digest(JSON.stringify(binding))
            }
            dependencyChanged = legacyDocument || bindings[file.relative] !== oldBindings[file.relative]
          }
          if (!verifyContent && !dependencyChanged && old?.fingerprint === file.fingerprint) continue
          const source = file.relative === 'meta.json' ? metadataSource : readSource(root, file)
          if (file.relative !== 'meta.json') read++
          if (!dependencyChanged && old?.content_hash === source.hash) {
            if (old.fingerprint !== file.fingerprint) touched.push(file)
            continue
          }
          let parsed
          try { parsed = parseSource(file.relative, source.text, { metadata: document ? getMetadata() : null }) } catch (error) {
            throw catalogError(error.code || 'CATALOG_PARSE', error.message, { path: file.relative, ...error.details })
          }
          if (legacyDocument && source.hash === old.content_hash && oldRecord.get(file.relative)?.record_json === JSON.stringify(parsed.items[0].data)) {
            if (old.fingerprint !== file.fingerprint) touched.push(file)
            continue
          }
          changed.push({ ...file, hash: source.hash, ...parsed, revision: Number(old?.revision || 0) + 1 })
          warningsByFile[file.relative] = parsed.warnings
        }
        const paths = new Set(files.map(file => file.relative))
        const deleted = [...previous.keys()].filter(relative => !paths.has(relative))
        const outline = changed.find(file => file.relative === '大纲/outline.json')
        const patched = outline && patchOutline(db, outline)
        const rebuildOutline = deleted.includes('大纲/outline.json') || (outline && !patched)
        if (rebuildOutline) db.exec('DELETE FROM catalog_outline_edges; DELETE FROM catalog_outline_endpoints;')
        for (const relative of deleted) {
          db.prepare('DELETE FROM catalog_files WHERE relative_path=?').run(relative)
          delete warningsByFile[relative]
        }
        // Remove old rows for *all* changed files first (IDs may move files).
        const removeItems = db.prepare('DELETE FROM catalog_items WHERE relative_path=?')
        for (const file of changed) if (!patched || file !== outline) removeItems.run(file.relative)
        const upsert = db.prepare(`INSERT INTO catalog_files(relative_path, fingerprint, content_hash, byte_length, revision, updated_at)
          VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(relative_path) DO UPDATE SET
          fingerprint=excluded.fingerprint, content_hash=excluded.content_hash,
          byte_length=excluded.byte_length, revision=excluded.revision, updated_at=excluded.updated_at`)
        const insert = db.prepare('INSERT INTO catalog_items(kind, item_id, relative_path, title, content, tags, record_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
        const now = new Date().toISOString()
        for (const file of changed) {
          upsert.run(file.relative, file.fingerprint, file.hash, file.byteLength, file.revision, now)
          if (patched && file === outline) continue
          for (const item of file.items) {
            try { insert.run(item.kind, item.id, file.relative, item.title, item.content, item.tags, JSON.stringify(item.data)) } catch (error) {
              throw catalogError('CATALOG_CONSTRAINT', '条目 id 重复或数据约束失败，保留旧目录', { path: file.relative, kind: item.kind, id: item.id, cause: error.message })
            }
          }
        }
        const updateFingerprint = db.prepare('UPDATE catalog_files SET fingerprint=? WHERE relative_path=?')
        for (const file of touched) updateFingerprint.run(file.fingerprint, file.relative)
        if (rebuildOutline) {
          db.exec("INSERT INTO catalog_outline_endpoints(node_id) SELECT item_id FROM catalog_items WHERE kind='outline-node'")
          if (outline) insertOutlineEdges(db, outline.edges)
        }
        // Re-enumerate to catch deletion, newly created files and stat changes.
        updateShortSearch(db)
        checkSourceSnapshot()
        const revision = digest(JSON.stringify([2, ...storedFiles().map(file => [file.relative_path, file.content_hash])]))
        const setMeta = db.prepare('INSERT INTO catalog_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
        const bindingJson = JSON.stringify(bindings)
        if (bindingJson !== storedBindings) setMeta.run('binding_hashes_v2', bindingJson)
        if (previousRevision !== revision) setMeta.run('revision', revision)
        if (changed.length || deleted.length || !previousRevision) {
          setMeta.run('indexed_at', now)
          setMeta.run('warnings', JSON.stringify(warningsByFile))
        }
        return { projectId, revision, files: files.length, read, changed: changed.length, deleted: deleted.length, unchanged: files.length - changed.length, warnings: Object.values(warningsByFile).flat() }
      })
    }
    function summary(row) {
      return { kind: row.kind, id: decode.decode(row.id_bytes), title: decode.decode(row.title_bytes), relativePath: row.relative_path, sourceHash: row.content_hash, fileRevision: row.revision }
    }
    function mapItem(row) {
      if (!row) return null
      return { ...summary(row), content: decode.decode(row.body), record: JSON.parse(row.record_json) }
    }
    const header = 'i.kind, CAST(i.item_id AS BLOB) AS id_bytes, CAST(i.title AS BLOB) AS title_bytes, i.relative_path, f.content_hash, f.revision'
    const fromFiles = 'FROM catalog_items i JOIN catalog_files f USING(relative_path)'
    const body = 'CAST(i.content AS BLOB) AS body'
    const projection = `SELECT ${header}, ${body}, i.record_json ${fromFiles}`
    function list({ kind, limit = 100, offset = 0, view = 'full' } = {}) {
      assertIdentity()
      const size = boundedInteger(limit, 1, 1000, 100)
      const start = boundedInteger(offset, 0, 100000, 0)
      const condition = kind ? ' WHERE i.kind=?' : ''
      const select = view === 'summary' ? `SELECT ${header} ${fromFiles}` : projection
      return db.prepare(`${select}${condition} ORDER BY i.relative_path, i.rowid LIMIT ? OFFSET ?`).all(...(kind ? [kind] : []), size, start).map(view === 'summary' ? summary : mapItem)
    }
    function read(kind, id) {
      assertIdentity()
      return mapItem(db.prepare(`${projection} WHERE i.kind=? AND i.item_id=?`).get(kind, id))
    }
    function search(query, { kind, limit = 20 } = {}) {
      assertIdentity()
      if (typeof query !== 'string' || query.length > 500) throw catalogError('CATALOG_QUERY', '查询必须是最多 500 字符的字符串')
      const phrase = query.trim().toWellFormed()
      if (!phrase) return { revision: meta('revision'), mode: 'empty', items: [] }
      const size = boundedInteger(limit, 1, maxResults, 20)
      const filter = kind ? ' AND i.kind=?' : ''
      const params = kind ? [kind] : []
      const points = Array.from(phrase)
      const trigram = points.length >= 3 && !phrase.includes('\0')
      const select = `SELECT ${header}, ${body} ${fromFiles}`
      let rows
      if (trigram) {
        rows = db.prepare(`${select} JOIN catalog_fts ON catalog_fts.rowid=i.rowid WHERE catalog_fts MATCH ?${filter} ORDER BY bm25(catalog_fts), i.rowid LIMIT ?`).all(`"${phrase.replaceAll('"', '""')}"`, ...params, size)
      } else {
        const literal = alias => ['title', 'content', 'tags'].map(column => `instr(lower(${alias}.${column}),lower(?))>0`).join(' OR ')
        const indexed = points.length <= 2 && hasShortSearch(db)
        const matches = indexed ? `i.rowid IN (SELECT rowid FROM catalog_short_fts WHERE catalog_short_fts MATCH ?
          UNION ALL SELECT p.id FROM catalog_short_pending p CROSS JOIN catalog_items t ON t.rowid=p.id WHERE ${literal('t')})` : `(${literal('i')})`
        const terms = indexed ? [`"${shortQueryTerm(points)}"`] : []
        // The path index already has the requested row order. Stop at the
        // page limit even when a common character appears in almost every row.
        const ordered = indexed ? `SELECT ${header}, ${body} FROM catalog_items i INDEXED BY catalog_items_path JOIN catalog_files f USING(relative_path)` : select
        rows = db.prepare(`${ordered} WHERE ${matches}${filter} ORDER BY i.relative_path, i.rowid LIMIT ?`).all(...terms, phrase, phrase, phrase, ...params, size)
      }
      return { revision: meta('revision'), mode: trigram ? 'fts5-trigram' : 'substring', items: rows.map(row => {
        const content = decode.decode(row.body)
        const at = Math.max(0, content.toLowerCase().indexOf(phrase.toLowerCase()))
        return { ...summary(row), excerpt: content.slice(Math.max(0, at - 80), at + phrase.length + 160) }
      }) }
    }
    function status() {
      assertIdentity()
      const files = db.prepare('SELECT relative_path, fingerprint FROM catalog_files').all()
      const current = scanSources(root)
      const indexed = new Map(files.map(file => [file.relative_path, file.fingerprint]))
      const hasLegacyNested = files.some(file => /^(正文|构思)\/[^/]+\//.test(file.relative_path)) && !db.prepare("SELECT 1 FROM catalog_meta WHERE key='binding_hashes_v2'").get()
      const revision = meta('revision')
      const stale = hasLegacyNested || !revision || current.length !== files.length || current.some(file => indexed.get(file.relative) !== file.fingerprint)
      return { projectId, databasePath, schemaVersion: version, revision, indexedAt: meta('indexed_at'), stale, files: files.length, kinds: db.prepare('SELECT kind, count(*) AS count FROM catalog_items GROUP BY kind').all(), warnings: Object.values(JSON.parse(meta('warnings') || '{}')).flat() }
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
