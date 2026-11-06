/* eslint-disable no-console -- explicit filesystem integration report */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import { createLocalMirrorService } from '../server/services/localMirrorService.js'
import { createLocalMirrorRouter } from '../server/routes/localMirror.js'
import { createFileProjectStores } from '../server/services/fileProjectStores.js'
import { runFileProjectCommand } from '../server/services/fileProjectCommands.js'
import { createFileNoteStore, createFileMaterialStore } from '../server/services/fileCollectionStores.js'
import { runProjectCatalog } from '../server/services/projectCatalogService.js'
import { createFileBookStore } from '../server/services/fileBookStore.js'
import { createBookService, createNoteService, createMaterialService } from '@pinax/core'
import { listChapters, readChapter } from '../server/mcp/localProjects.js'
import { mirrorBookFingerprint } from '../server/services/localMirrorTransaction.js'

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pinax-file-stores-'))
const root = path.join(temp, 'project')
const service = createLocalMirrorService({ rootPath: path.join(temp, 'fallback'), appDataPath: path.join(temp, 'appdata') })
let server
try {
  service.createProjectAt({ path: root, name: '隔离项目', kind: 'novel', bookId: 'book-one' })
  const seed = { book: { id: 'book-one', title: '文稿', worldbookId: 'world-one', chapters: [
    { id: 'chapter-stable', title: '入城', content: '城门外有守卫。\n', revision: 2, editorDocument: { revision: 2, text: 'sidecar' }, custom: { keep: true } },
    { id: 'blank', title: '空章', content: '', revision: 0 }
  ], explorations: [{ id: 'idea1', title: '后续', content: '向河岸走。' }, { id: 'idea2', title: '后续', content: '另一个方向。' }],
  outline: { custom: 'keep-outline', nodes: [{ id: 'n1', title: '入城', revision: 1 }], edges: [] } },
  worldbook: { id: 'world-one', name: '本书设定', groups: ['人物'], entries: [{ id: 'guard', name: '守卫', type: 'character', content: '认识旅人。', keys: ['城门守卫'], tags: ['配角'], extra: { opaque: 'keep-me' }, relations: [{ to: 'traveler', type: '认识', stance: '友善', covert: true, weight: 0.7 }] }] } }
  service.mirrorBook(seed)
  const reopened = service.readBookFromFolder(root)
  assert.equal(reopened.book.chapters[0].id, 'chapter-stable')
  assert.equal(reopened.book.chapters[0].revision, 2)
  assert.equal(reopened.book.chapters[0].content, seed.book.chapters[0].content)
  assert.deepEqual(reopened.book.chapters[0].custom, { keep: true })
  assert.equal(reopened.book.chapters[1].id, 'blank')
  assert.equal(reopened.book.chapters[1].content, '')
  assert.deepEqual(reopened.book.explorations.map(item => item.id), ['idea1', 'idea2'])
  assert.equal(reopened.book.outline.custom, 'keep-outline')
  console.log('PASS real mirror roundtrip: stable IDs/revisions, exact whitespace, empty chapter, duplicate idea titles and rich fields')

  const initial = createFileProjectStores({ root, service })
  const frozen = initial.snapshot()
  const writer = createFileProjectStores({ root, service, expectedSnapshot: frozen })
  const saved = await writer.chapters.save('book-one', 'chapter-stable', { content: '旅人走进城门。', expectedRevision: 2 })
  assert.equal(saved.ok, true, JSON.stringify(saved))
  assert.equal(saved.value.revision, 3)
  const extraChapter = await writer.chapters.create('book-one', { id: 'created-chapter', title: '临时章节', content: '经Core创建。' })
  assert.equal(extraChapter.ok, true)
  assert.equal((await writer.chapters.remove('book-one', extraChapter.value.id, { expectedRevision: extraChapter.value.revision })).ok, true)
  const disk = service.readBookFromFolder(root)
  assert.equal(disk.book.chapters[0].content, '旅人走进城门。')
  assert.equal(disk.book.chapters[0].editorDocument, undefined)
  assert.equal(disk.book.chapters[0].custom.keep, true)
  const stale = createFileProjectStores({ root, service, expectedSnapshot: frozen })
  assert.equal((await stale.chapters.save('book-one', 'chapter-stable', { content: '旧请求不能覆盖', expectedRevision: 3 })).ok, false)
  assert.equal((await writer.chapters.read('another-book', 'chapter-stable')).ok, false)
  const sidecarFile = path.join(root, '正文', fs.readdirSync(path.join(root, '正文')).find(name => name.startsWith('001-')))
  const snapshotBeforeExternal = writer.snapshot()
  fs.writeFileSync(sidecarFile, '外部编辑器写的内容。\n')
  const external = createFileProjectStores({ root, service, expectedSnapshot: snapshotBeforeExternal })
  assert.equal((await external.chapters.save('book-one', 'chapter-stable', { content: '不得覆盖外部内容', expectedRevision: 4 })).ok, false)
  const unownedFile = path.join(root, '正文', '手写片段.md')
  fs.writeFileSync(unownedFile, '  保留手写空格与换行。\n\n')
  const unownedBody = fs.readFileSync(unownedFile, 'utf8')
  const newest = createFileProjectStores({ root, service })
  const accepted = createFileProjectStores({ root, service, expectedSnapshot: newest.snapshot() })
  const current = await accepted.chapters.read('book-one', 'chapter-stable')
  assert.equal(current.value.content, '外部编辑器写的内容。\n')
  assert.equal((await accepted.chapters.save('book-one', 'chapter-stable', { content: '作者确认后的正文。', expectedRevision: current.value.revision })).ok, true)
  assert.equal(fs.readFileSync(unownedFile, 'utf8'), unownedBody)
  assert.equal(service.readBookFromFolder(root).book.chapters.length, 3)
  console.log('PASS Core chapter port: durable save, content-only sidecar clearing, scope, revision and external-file snapshot protection')

  let state = createFileProjectStores({ root, service })
  let write = createFileProjectStores({ root, service, expectedSnapshot: state.snapshot() })
  assert.equal((await write.nodes.create('book-one', { id: 'n2', title: '过桥' })).ok, true)
  assert.equal((await write.edges.add('book-one', { id: 'e1', fromNodeId: 'n1', toNodeId: 'n2', kind: 'causes' })).ok, true)
  assert.equal((await write.edges.add('book-one', { id: 'invalid', fromNodeId: 'n1', toNodeId: 'absent', kind: 'causes' })).ok, false)
  assert.equal((await write.nodes.remove('book-one', 'n1', { expectedRevision: 1 })).ok, false)
  const extraEntry = await write.entries.create('world-one', { id: 'temporary-entry', name: '临时地点', content: '通过文件端口创建。' })
  assert.equal(extraEntry.ok, true)
  assert.equal((await write.entries.remove('world-one', 'temporary-entry')).ok, true)
  const worldBefore = service.readWorldbookFolder(root).worldbook.entries[0]
  assert.equal((await write.entries.update('world-one', 'guard', { content: '给旅人指路。' })).ok, true)
  const worldAfter = service.readWorldbookFolder(root).worldbook.entries[0]
  assert.equal(worldAfter.content, '给旅人指路。')
  assert.deepEqual(worldAfter.relations, worldBefore.relations)
  assert.deepEqual(worldAfter.extra, worldBefore.extra)
  assert.equal((await write.entries.update('other-world', 'guard', { content: '不能串书' })).ok, false)
  console.log('PASS Core entry/outline ports: relation and unknown-field retention, endpoint checks and referenced-node deletion rejection')

  const base = await runFileProjectCommand({ projectPath: root, action: 'snapshot' }, { service })
  const command = { projectPath: root, entity: 'chapter', action: 'save', id: 'blank', input: { content: '终于开始写。', expectedRevision: 0 }, expectedSnapshot: base.snapshot, operationId: 'one-operation' }
  const committed = await runFileProjectCommand(command, { service })
  assert.equal(committed.ok, true, JSON.stringify(committed))
  const fingerprint = mirrorBookFingerprint(root)
  const repeated = await runFileProjectCommand(command, { service })
  assert.equal(repeated.replayed, true)
  assert.equal(mirrorBookFingerprint(root), fingerprint)
  await assert.rejects(runFileProjectCommand({ ...command, input: { content: '同号不同内容', expectedRevision: 0 } }, { service }), { code: 'ERR_OPERATION_CONFLICT' })
  const failedSnapshot = await runFileProjectCommand({ projectPath: root, action: 'snapshot' }, { service })
  const metadata = path.join(root, 'meta.json')
  const originalMetadata = fs.readFileSync(metadata, 'utf8')
  fs.writeFileSync(metadata, '{broken')
  await assert.rejects(runFileProjectCommand({ projectPath: root, action: 'snapshot' }, { service }), { code: 'ERR_DOCUMENT_METADATA' })
  fs.writeFileSync(metadata, originalMetadata)
  assert.equal((await runFileProjectCommand({ projectPath: root, entity: 'chapter', action: 'save', id: 'blank', input: { content: '持久化仍可用', expectedRevision: 1 }, operationId: 'second-operation', expectedSnapshot: failedSnapshot.snapshot }, { service })).ok, true)
  const lateRepeat = await runFileProjectCommand(command, { service })
  assert.equal(lateRepeat.replayed, true)
  assert.equal(lateRepeat.requiresReload, true)
  assert.equal(lateRepeat.snapshot, null)
  console.log('PASS application commands: operation receipts survive reopen/intervening writes, reused-ID conflict and damaged-metadata preservation')

  const beforeFailure = mirrorBookFingerprint(root)
  const faultBase = await runFileProjectCommand({ projectPath: root, action: 'snapshot' }, { service })
  const faultCommand = { projectPath: root, entity: 'chapter', action: 'save', id: 'blank', input: { content: '失败的保存不能残留', expectedRevision: 2 }, expectedSnapshot: faultBase.snapshot, operationId: 'retry-after-failure' }
  const rename = fs.renameSync
  fs.renameSync = (from, to) => {
    if (from === `${root}.pinax-next-sync` && to === root) throw Object.assign(new Error('fixture replace failure'), { code: 'EIO' })
    return rename(from, to)
  }
  let failed
  try { failed = await runFileProjectCommand(faultCommand, { service }) } finally { fs.renameSync = rename }
  assert.equal(failed.ok, false)
  assert.equal(mirrorBookFingerprint(root), beforeFailure)
  assert.equal((await runFileProjectCommand(faultCommand, { service })).ok, true)
  const beforeCrash = mirrorBookFingerprint(root)
  fs.renameSync(root, `${root}.pinax-before-sync`)
  fs.cpSync(`${root}.pinax-before-sync`, root, { recursive: true })
  fs.writeFileSync(path.join(root, '正文', '001-入城.md'), '模拟未提交的新树')
  fs.writeFileSync(`${root}.pinax-sync.json`, JSON.stringify({ hadOriginal: true, committed: false }))
  assert.throws(() => createFileProjectStores({ root, service }), { code: 'ERR_SYNC_RECOVERY' })
  const recovered = await runFileProjectCommand({ projectPath: root, action: 'recover' }, { service })
  assert.equal(recovered.ok, true)
  assert.equal(mirrorBookFingerprint(root), beforeCrash)
  console.log('PASS real replacement failure rollback, same-operation retry and explicit interrupted-tree recovery')

  const notesFile = path.join(temp, 'global-notes.json')
  const materialFile = path.join(temp, 'global-materials.json')
  const notes = createNoteService({ store: createFileNoteStore({ file: notesFile }) })
  const materials = createMaterialService({ store: createFileMaterialStore({ file: materialFile }) })
  const newNote = await notes.create({ id: 'note-one', content: '独立笔记，不是项目构思。' })
  assert.equal(newNote.ok, true, JSON.stringify(newNote))
  const material = await materials.create({ id: 'material-one', title: '草稿素材', content: '一小段草稿', kind: 'draft-prose' })
  assert.equal(material.ok, true, JSON.stringify(material))
  assert.equal((await notes.update('note-one', { content: '笔记更新后也能重开。' })).ok, true)
  assert.equal((await materials.update('material-one', { title: '更新后的素材' })).ok, true)
  const reopenedNotes = createNoteService({ store: createFileNoteStore({ file: notesFile }) })
  assert.equal((await reopenedNotes.read('note-one')).value.content, '笔记更新后也能重开。')
  assert.equal((await materials.read('material-one')).value.title, '更新后的素材')
  const wrong = createFileMaterialStore({ file: notesFile })
  assert.equal((await wrong.list()).ok, false)
  assert.equal((await notes.remove('note-one')).ok, true)
  assert.equal((await materials.remove('material-one')).ok, true)
  assert.equal((await reopenedNotes.list()).value.length, 0)
  assert.equal(service.readBookFromFolder(root).book.explorations.length, 2)
  console.log('PASS independent Core Note/Material file ports: reopen, type separation and unchanged project ideas')
  const bookRoot = path.join(temp, 'new-book')
  service.createProjectAt({ path: bookRoot, name: '待建作品', kind: 'novel', bookId: 'new-book' })
  const books = createBookService({ store: createFileBookStore({ service }) })
  const createdBook = await books.create({ id: 'new-book', title: '新作品' })
  assert.equal(createdBook.ok, true, JSON.stringify(createdBook))
  assert.equal((await books.rename('new-book', '改名后的作品')).ok, true)
  assert.equal(service.readBookFromFolder(bookRoot).book.title, '改名后的作品')
  const beforeUnregister = fs.readFileSync(path.join(bookRoot, 'meta.json'), 'utf8')
  assert.equal((await books.remove('new-book')).ok, true)
  assert.equal(fs.readFileSync(path.join(bookRoot, 'meta.json'), 'utf8'), beforeUnregister)
  assert.equal((await createFileBookStore({ service }).read('new-book')).value, null)
  console.log('PASS Core Book file port: explicit project binding, create/rename and unregister without deleting original files')


  const app = express(); app.use(express.json()); app.use('/api/localmirror', createLocalMirrorRouter({ service }))
  server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)) })
  const post = body => fetch(`http://127.0.0.1:${server.address().port}/api/localmirror/core-operation`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const httpSnapshot = await (await post({ projectPath: root, action: 'snapshot' })).json()
  assert.equal(httpSnapshot.ok, true)
  const httpChapter = httpSnapshot.book.chapters.find(item => item.id === 'blank')
  const httpSaved = await post({ projectPath: root, entity: 'chapter', action: 'save', id: 'blank', input: { title: 'HTTP新标题', content: '从真实HTTP保存。', expectedRevision: httpChapter.revision }, expectedSnapshot: httpSnapshot.snapshot, operationId: 'http-save' })
  assert.equal(httpSaved.status, 200)
  assert.equal((await httpSaved.json()).ok, true)
  assert.equal(service.readBookFromFolder(root).book.chapters.find(item => item.id === 'blank').content, '从真实HTTP保存。')
  const listedChapters = listChapters(root)
  const position = listedChapters.findIndex(item => item.title === 'HTTP新标题')
  assert.ok(position >= 0)
  assert.match(readChapter(root, { index: position }).content, /从真实HTTP保存/)

  const previousPublic = process.env.PINAX_PUBLIC_ORIGINS
  process.env.PINAX_PUBLIC_ORIGINS = 'https://example.invalid'
  try { assert.equal((await post(command)).status, 403) }
  finally { if (previousPublic === undefined) delete process.env.PINAX_PUBLIC_ORIGINS; else process.env.PINAX_PUBLIC_ORIGINS = previousPublic }
  await runProjectCatalog(root, { action: 'sync' })
  const indexedChapter = await runProjectCatalog(root, { action: 'read', kind: 'chapter', id: 'blank' })
  assert.equal(indexedChapter.item.title, 'HTTP新标题')
  assert.equal(indexedChapter.item.content, '从真实HTTP保存。')
  const titleSnapshot = await runFileProjectCommand({ projectPath: root, action: 'snapshot' }, { service })
  assert.equal((await runFileProjectCommand({ projectPath: root, entity: 'chapter', action: 'save', id: 'blank', input: { title: '只改标题', expectedRevision: titleSnapshot.book.chapters.find(item => item.id === 'blank').revision }, expectedSnapshot: titleSnapshot.snapshot, operationId: 'rename-title' }, { service })).ok, true)
  assert.equal((await runProjectCatalog(root, { action: 'status' })).stale, true)
  await runProjectCatalog(root, { action: 'sync' })
  assert.equal((await runProjectCatalog(root, { action: 'read', kind: 'chapter', id: 'blank' })).item.title, '只改标题')
  console.log('PASS actual HTTP write, public rejection, MCP titles and catalog stable-ID/metadata-only refresh')
} finally {
  if (server) await new Promise(resolve => server.close(resolve))
  fs.rmSync(temp, { recursive: true, force: true })
}
