/* eslint-disable no-console -- explicit integration report */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { execFileSync } from 'node:child_process'
import express from 'express'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { runProjectCatalog } from '../server/services/projectCatalogService.js'
import { openProjectCatalog } from '../server/services/projectCatalogDb.js'
import { documentBinding } from '../server/services/projectDocumentMetadata.js'
import { createLocalMirrorRouter } from '../server/routes/localMirror.js'
import { createPinaxMcpServer } from '../server/mcp/createMcpServer.js'
import { serializeWorldbookEntryFile } from '../shared/worldbookFileContract.js'

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pinax-catalog-online-'))
const root = path.join(temporary, 'project')
const write = (relative, value) => {
  const target = path.join(root, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value))
}
const treeHash = (dir, includeDatabase = false) => {
  const rows = []
  function visit(base) {
    for (const entry of fs.readdirSync(base, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      const target = path.join(base, entry.name), relative = path.relative(dir, target)
      if (!includeDatabase && relative.startsWith('.pinax'+path.sep) && entry.name !== 'project.json') continue
      if (entry.isDirectory()) visit(target)
      else { const stat = fs.statSync(target); rows.push([relative, stat.mtimeMs, createHash('sha256').update(fs.readFileSync(target)).digest('hex')]) }
    }
  }
  visit(dir)
  return JSON.stringify(rows)
}
let server, client, mcp
try {
  write('.pinax/project.json', { spec: 'pinax-project@1', projectId: 'catalog-smoke', name: '隔离目录', kind: 'novel' })
  write('正文/001-开篇.md', '守卫在城门外检查路引。旅人走向旧钟楼。')
  write('构思/后续.md', '旧钟楼将在第二章再次出现。')
  write('资料/参考.md', '旧钟楼的建筑资料，仅作创作参考。')
  write('世界书/人物/守卫.md', serializeWorldbookEntryFile({ id: 'guard', name: '守卫', type: 'character', content: '城门守卫，认识旅人。' }))
  write('大纲/outline.json', { nodes: [{ id: 'opening', title: '入城' }], edges: [] })
  const sourceBefore = treeHash(root)
  const wholeBefore = treeHash(root, true)
  assert.equal((await runProjectCatalog(root, { action: 'status' })).initialized, false)
  assert.equal(treeHash(root, true), wholeBefore, 'status must not create a database')
  await assert.rejects(runProjectCatalog(root, { action: 'search', query: '城门' }), { code: 'CATALOG_NOT_INITIALIZED' })
  await assert.rejects(runProjectCatalog(root, { action: 'sync' }, { expectedProjectId: 'another-project' }), { code: 'CATALOG_PROJECT_MISMATCH' })
  assert.equal(fs.existsSync(path.join(root, '.pinax/project.sqlite')), false)
  // An existing Electron database is not a catalog. Explicit sync must add only
  // namespaced tables, preserving its rows, migration records and user_version.
  const electron = new DatabaseSync(path.join(root, '.pinax/project.sqlite'))
  try {
    electron.exec("CREATE TABLE project_items(id TEXT PRIMARY KEY, kind TEXT); INSERT INTO project_items VALUES ('keep','chapter'); CREATE TABLE schema_migrations(version INTEGER); INSERT INTO schema_migrations VALUES (3); PRAGMA user_version=3;")
  } finally { electron.close() }
  assert.equal((await runProjectCatalog(root, { action: 'status' })).initialized, false)
  let ticks = 0
  const timer = setInterval(() => ticks++, 1)
  const initial = await Promise.all(Array.from({ length: 4 }, () => runProjectCatalog(root, { action: 'sync' })))
  const synced = initial[0]
  assert.ok(initial.every(result => result.revision === synced.revision))
  clearInterval(timer)
  assert.ok(ticks > 0, 'Worker must allow the calling event loop to run')
  assert.equal(synced.stale, false)
  assert.equal(synced.files, 5)
  const preserved = new DatabaseSync(path.join(root, '.pinax/project.sqlite'), { readOnly: true })
  try {
    assert.equal(preserved.prepare('SELECT kind FROM project_items WHERE id=?').get('keep').kind, 'chapter')
    assert.equal(preserved.prepare('SELECT version FROM schema_migrations').get().version, 3)
    assert.equal(preserved.prepare('PRAGMA user_version').get().user_version, 3)
  } finally { preserved.close() }
  assert.equal(treeHash(root), sourceBefore, 'sync changed source files')
  const short = await runProjectCatalog(root, { action: 'search', query: '城门' })
  assert.equal(short.mode, 'substring')
  assert.ok(short.items.some(item => item.kind === 'chapter'))
  const long = await runProjectCatalog(root, { action: 'search', query: '旧钟楼', expectedRevision: synced.revision })
  assert.equal(long.mode, 'fts5-trigram')
  assert.equal(long.items.length, 3)
  assert.ok(long.items.every(item => item.sourceHash && item.fileRevision && item.relativePath))
  const listed = await runProjectCatalog(root, { action: 'list', kind: 'worldbook-entry' })
  assert.equal(listed.items[0].id, 'guard')
  assert.match(listed.items[0].content, /认识旅人/)
  const read = await runProjectCatalog(root, { action: 'read', kind: 'worldbook-entry', id: 'guard' })
  assert.match(read.item.content, /认识旅人/)
  await assert.rejects(runProjectCatalog(root, { action: 'read', kind: 'worldbook-entry', id: 'guard', expectedRevision: 'old' }), { code: 'CATALOG_REVISION_MISMATCH' })
  write('正文/001-开篇.md', '守卫在城门外检查路引。旅人已抵达河岸。')
  assert.equal((await runProjectCatalog(root, { action: 'status' })).stale, true)
  await assert.rejects(runProjectCatalog(root, { action: 'search', query: '旧钟楼' }), { code: 'CATALOG_STALE' })
  const changed = await runProjectCatalog(root, { action: 'sync' })
  assert.equal(changed.changed, 1)
  assert.notEqual(changed.revision, synced.revision)
  const concurrent = await Promise.all([runProjectCatalog(root, { action: 'sync' }), runProjectCatalog(root, { action: 'sync' })])
  assert.ok(concurrent.every(result => result.changed === 0 && result.revision === changed.revision))
  write('大纲/outline.json', { nodes: [{ id: 'opening', title: '入城' }], edges: [{ id: 'bad', fromNodeId: 'opening', toNodeId: 'missing', kind: 'sequence' }] })
  await assert.rejects(runProjectCatalog(root, { action: 'sync' }), { code: 'CATALOG_OUTLINE_INTEGRITY' })
  const db = openProjectCatalog(root, { readOnly: true })
  try { assert.equal(db.status().revision, changed.revision); assert.ok(db.read('outline-node', 'opening')) } finally { db.close() }
  write('大纲/outline.json', { nodes: [{ id: 'opening', title: '入城' }], edges: [] })
  await runProjectCatalog(root, { action: 'sync' })
  const controller = new AbortController()
  const cancelled = runProjectCatalog(root, { action: 'sync' }, { signal: controller.signal })
  controller.abort()
  await assert.rejects(cancelled, { code: 'CATALOG_CANCELLED' })
  await runProjectCatalog(root, { action: 'sync' })
  console.log('PASS Worker: explicit sync/read, freshness/revision fences, nonblocking IO, rollback, concurrent sync and cancellation')

  const app = express()
  app.use(express.json())
  app.use('/api/localmirror', createLocalMirrorRouter({ service: { listProjects: () => [{ projectId: 'catalog-smoke', bookId: 'book-one', rootPath: root }] } }))
  server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)) })
  const endpoint = `http://127.0.0.1:${server.address().port}/api/localmirror/catalog`
  const http = body => fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const summaryList = await (await http({ projectId: 'book-one', action: 'list', view: 'summary', kind: 'worldbook-entry' })).json()
  assert.equal(summaryList.items[0].id, 'guard')
  assert.equal(Object.hasOwn(summaryList.items[0], 'content'), false)
  assert.equal(Object.hasOwn(summaryList.items[0], 'record'), false)
  assert.equal((await http({ projectId: 'book-one', action: 'list', view: 'unknown' })).status, 400)
  const httpRead = await http({ projectId: 'book-one', action: 'search', query: '河岸' })
  assert.equal(httpRead.status, 200)
  assert.equal((await httpRead.json()).items[0].kind, 'chapter')
  assert.equal((await http({ projectId: 'unbound', action: 'status' })).status, 404)
  assert.equal((await http({ projectPath: root, action: 'drop' })).status, 400)
  write('构思/后续.md', '旅人抵达河岸后转向旧钟楼。')
  assert.equal((await http({ projectPath: root, action: 'search', query: '城门' })).status, 409)
  assert.equal((await http({ projectPath: root, action: 'sync' })).status, 200)
  const oldPublic = process.env.PINAX_PUBLIC_ORIGINS
  process.env.PINAX_PUBLIC_ORIGINS = 'https://example.invalid'
  try {
    assert.equal((await http({ projectPath: root, action: 'sync' })).status, 403)
    await assert.rejects(runProjectCatalog(root, { action: 'sync' }), { code: 'CATALOG_LOCAL_ONLY' })
  } finally { if (oldPublic === undefined) delete process.env.PINAX_PUBLIC_ORIGINS; else process.env.PINAX_PUBLIC_ORIGINS = oldPublic }
  console.log('PASS HTTP: bound project resolution, real Worker search/sync, stale errors and production rejection')

  const [left, right] = InMemoryTransport.createLinkedPair()
  mcp = createPinaxMcpServer()
  client = new Client({ name: 'catalog-smoke', version: '1.0.0' }, { capabilities: {} })
  await mcp.connect(right)
  await client.connect(left)
  assert.ok((await client.listTools()).tools.some(tool => tool.name === 'pinax_project_catalog'))
  const call = arguments_ => client.callTool({ name: 'pinax_project_catalog', arguments: { projectPath: root, ...arguments_ } })
  const mcpSummary = await call({ action: 'list', kind: 'worldbook-entry', view: 'summary' })
  assert.deepEqual(mcpSummary.structuredContent.items, summaryList.items)
  const mcpSearch = await call({ action: 'search', query: '旧钟楼' })
  assert.equal(mcpSearch.isError, undefined)
  assert.equal(mcpSearch.structuredContent.stale, false)
  assert.ok(mcpSearch.structuredContent.items.length >= 2)
  const context = await client.callTool({ name: 'pinax_project_context', arguments: { projectPath: root } })
  assert.equal(context.structuredContent.catalog.initialized, true)
  assert.equal(context.structuredContent.catalog.stale, false)
  await assert.rejects(call({ action: 'delete' }), /Invalid arguments/)
  console.log('PASS MCP SDK: registered tool, actual catalog results, context readiness and invalid action rejection')

  const snapshot = treeHash(root, true)
  const card = JSON.parse(execFileSync(process.execPath, ['agent-skills/project-bootstrap/scripts/project-state.mjs', root, '--json'], { encoding: 'utf8' }))
  const catalog = card.sqlite.databases[0].read.catalog
  assert.equal(catalog.stale, false)
  assert.equal(catalog.projectMismatch, false)
  assert.equal(catalog.fileCount, 5)
  assert.equal(catalog.kinds.chapter, 1)
  assert.equal(treeHash(root, true), snapshot, 'readonly status card changed project files')
  console.log('PASS status card: actual catalog counts/freshness and unchanged project file hashes/mtime')
  const chapterPath = '正文/001-开篇.md'
  const chapterText = fs.readFileSync(path.join(root, chapterPath), 'utf8')
  const binding = documentBinding({ id: 'chapter-1', title: '序章' }, chapterText, { appendedNewline: false })
  const metadata = { book: { id: 'book-one' }, documentSchema: 1, chapterFiles: { '001-开篇.md': binding }, explorationFiles: {} }
  write('meta.json', metadata)
  write('正文/番外/001-开篇.md', '番外篇')
  const added = await runProjectCatalog(root, { action: 'sync' })
  assert.equal(added.changed, 3)
  const chapter = (await runProjectCatalog(root, { action: 'read', kind: 'chapter', id: 'chapter-1' })).item
  assert.equal(chapter.content, chapterText)
  const nested = (await runProjectCatalog(root, { action: 'search', query: '番外篇' })).items[0]
  assert.equal(nested.id, '正文/番外/001-开篇.md')
  metadata.book.title = '只改书名'
  write('meta.json', metadata)
  const retitled = await runProjectCatalog(root, { action: 'sync' })
  assert.equal(retitled.read, 1)
  assert.equal(retitled.changed, 1)
  assert.equal((await runProjectCatalog(root, { action: 'read', kind: 'chapter', id: 'chapter-1' })).item.fileRevision, chapter.fileRevision)
  binding.record.title = '章节改名'
  write('meta.json', metadata)
  const renamed = await runProjectCatalog(root, { action: 'sync' })
  assert.equal(renamed.changed, 2)
  const updated = (await runProjectCatalog(root, { action: 'read', kind: 'chapter', id: 'chapter-1' })).item
  assert.equal(updated.fileRevision, chapter.fileRevision + 1)
  assert.equal(updated.title, '章节改名')
  // Simulate a pre-fix catalog. The first sync checks old projections, but
  // identical chapter rows must retain their original file revisions.
  const legacy = new DatabaseSync(path.join(root, '.pinax/project.sqlite'))
  try { legacy.exec("DELETE FROM catalog_meta WHERE key='binding_hashes_v2'") } finally { legacy.close() }
  assert.equal((await runProjectCatalog(root, { action: 'status' })).stale, true)
  assert.equal((await runProjectCatalog(root, { action: 'sync' })).changed, 0)
  assert.equal((await runProjectCatalog(root, { action: 'read', kind: 'chapter', id: 'chapter-1' })).item.fileRevision, updated.fileRevision)
  console.log('PASS nested and legacy bindings, per-document revisions, metadata-only sync, complete and summary list projections')

  const literals = '旧城门 A.B "%_ 码头🧭⚓ À \0序章💌'
  write('资料/字面匹配.md', literals)
  // More distinct bigrams than the per-row indexing budget. This row must
  // still be returned alongside indexed rows, including after future edits.
  const alphabet = Array.from({ length: 185 }, (_, i) => String.fromCodePoint(0x4e00 + i))
  write('资料/长档案.md', alphabet.flatMap(a => alphabet.map(b => a + b)).join('') + ' 城门💌')
  assert.equal((await runProjectCatalog(root, { action: 'sync' })).read, 2, 'new materials do not require reading meta.json')
  const direct = openProjectCatalog(root)
  const sql = new DatabaseSync(path.join(root, '.pinax/project.sqlite'))
  try {
    const matches = sql.prepare(`SELECT item_id FROM catalog_items WHERE
      instr(lower(title),lower($phrase)) OR instr(lower(content),lower($phrase)) OR instr(lower(tags),lower($phrase))
      ORDER BY relative_path, rowid LIMIT 100`)
    function compareQueries() {
      for (const query of ['城', '城门', '💌', '🧭⚓', '🧭', 'a.', '"%', '%_', 'À', 'à', '\0序', '🧭⚓ À \0序']) {
        assert.deepEqual(direct.search(query, { limit: 100 }).items.map(item => item.id), matches.all({ $phrase: query }).map(row => row.item_id), JSON.stringify(query))
      }
      assert.equal(direct.read('material-file', '资料/字面匹配.md').content, literals)
      assert.ok(direct.search('\0序').items[0].excerpt.includes('\0序章'))
    }
    compareQueries()
    assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM catalog_short_pending WHERE scan_only=1').get().count, 1)
    const versionOfDb = () => sql.prepare('PRAGMA data_version').get().data_version
    const beforeNoop = versionOfDb()
    const indexedAt = direct.status().indexedAt
    assert.equal(direct.sync().changed, 0)
    assert.equal(direct.sync({ verifyContent: true }).read, direct.status().files)
    assert.equal(direct.status().indexedAt, indexedAt)
    assert.equal(versionOfDb(), beforeNoop, 'both no-change sync modes should leave SQLite pages alone')
    // A client that predates the index can change a row. It is immediately
    // searchable through the literal fallback until an explicit sync indexes it.
    sql.prepare("UPDATE catalog_items SET content=? WHERE relative_path='资料/字面匹配.md'").run('新锚点')
    assert.equal(direct.search('锚点').items.length, 1)
    assert.equal(direct.search('🧭').items.length, 0)
    sql.prepare("UPDATE catalog_items SET content=? WHERE relative_path='资料/字面匹配.md'").run(literals)
    // A v1 catalog without the index remains readable. Installing it changes
    // neither the manuscript revision nor the content and requires no source reads.
    sql.exec(`DROP TRIGGER catalog_short_insert; DROP TRIGGER catalog_short_update; DROP TRIGGER catalog_short_delete;
      DROP TABLE catalog_short_pending; DROP TABLE catalog_short_fts`)
    const oldRevision = direct.status().revision
    compareQueries()
    const upgraded = direct.sync()
    assert.equal(upgraded.read, 0)
    assert.equal(upgraded.revision, oldRevision)
    compareQueries()
    fs.unlinkSync(path.join(root, '资料/字面匹配.md'))
    assert.equal(direct.sync().deleted, 1)
    assert.equal(direct.search('🧭').items.length, 0)
    assert.deepEqual(direct.search('💌').items.map(item => item.id), ['资料/长档案.md'])

    // The verified pass warms the process-local binding cache. External edits
    // retain the bound id; a changed or invalid binding file must take precedence.
    direct.sync({ verifyContent: true })
    write(chapterPath, chapterText + '外部改稿')
    assert.equal(direct.sync().read, 1)
    assert.equal(direct.read('chapter', 'chapter-1').record.fileChanged, true)
    binding.record.id = 'new-chapter'
    write('meta.json', metadata)
    assert.equal(direct.sync().read, 2)
    assert.equal(direct.read('chapter', 'chapter-1'), null)
    assert.equal(direct.read('chapter', 'new-chapter').content, chapterText + '外部改稿')
    write('meta.json', '{')
    assert.throws(() => direct.sync(), { code: 'CATALOG_METADATA_INVALID' })
    assert.equal(direct.read('chapter', 'new-chapter').content, chapterText + '外部改稿')
    write('meta.json', metadata)

    const nodes = [{ id: 'a', title: '甲' }, { id: 'b\0尾', title: '乙\0段' }, { id: 'c', title: '丙' }]
    const edges = [{ id: 'ab', from: 'a', to: nodes[1].id }, { id: 'ac', from: 'a', to: 'c' }]
    const writeOutline = () => write('大纲/outline.json', { nodes, edges })
    writeOutline()
    direct.sync()
    sql.exec('CREATE TABLE outline_test_changes(table_name TEXT)')
    for (const table of ['catalog_items', 'catalog_outline_edges', 'catalog_outline_endpoints']) {
      for (const operation of ['UPDATE', 'DELETE', 'INSERT']) {
        sql.exec(`CREATE TRIGGER test_${table}_${operation} AFTER ${operation} ON ${table} BEGIN INSERT INTO outline_test_changes VALUES ('${table}'); END`)
      }
    }
    nodes[1].intent = '小雨'
    writeOutline()
    direct.sync()
    assert.deepEqual(sql.prepare('SELECT table_name FROM outline_test_changes').all().map(row => row.table_name), ['catalog_items'])
    const hit = direct.search('小雨').items[0]
    assert.equal(hit.id, nodes[1].id)
    assert.equal(hit.title, nodes[1].title)
    assert.equal(direct.read('outline-node', hit.id).record.intent, '小雨')
    const revision = direct.status().revision
    edges[0].to = 'missing'
    nodes[1].intent = '大风'
    writeOutline()
    assert.throws(() => direct.sync(), { code: 'CATALOG_OUTLINE_INTEGRITY' })
    assert.equal(direct.status().revision, revision)
    assert.equal(direct.search('大风').items.length, 0)
    // Swapping valid endpoints in the same edit is legal even though each
    // individual update would violate the unique (kind, from, to) constraint.
    edges[0].to = 'c'
    edges[1].to = nodes[1].id
    writeOutline()
    direct.sync()
    assert.equal(direct.search('小雨').items.length, 0)
    assert.equal(direct.read('outline-edge', 'ab').record.toNodeId, 'c')
    nodes.reverse()
    writeOutline()
    direct.sync()
    assert.deepEqual(direct.list({ kind: 'outline-node', view: 'summary' }).map(item => item.id), nodes.map(node => node.id))
    assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(), [])
  } finally { sql.close(); direct.close() }
  console.log('PASS indexed literal searches, giant row fallback, old writers, legacy upgrade, Unicode and zero-write repeated sync')
  console.log('PASS external chapter edits, binding cache invalidation, outline row deltas, endpoint swaps, rollback and file order')

} finally {
  await client?.close()
  await mcp?.close()
  if (server) await new Promise(resolve => server.close(resolve))
  fs.rmSync(temporary, { recursive: true, force: true })
}
