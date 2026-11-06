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
  const synced = await runProjectCatalog(root, { action: 'sync' })
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
} finally {
  await client?.close()
  await mcp?.close()
  if (server) await new Promise(resolve => server.close(resolve))
  fs.rmSync(temporary, { recursive: true, force: true })
}
