// A blank origin page allows the v4 database to be seeded before the app
// opens it. PINAX_SMOKE_URL can reuse an existing local dev server.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { checkLedgerWorkspace } from './fixtures/ledger/workspace-read-probe.mjs'
import { checkWorldModelWorkspace } from './fixtures/ledger/world-model-workspace-probe.mjs'

let server, cacheDir, browser
try {
  if (!process.env.PINAX_SMOKE_URL) {
    cacheDir = await mkdtemp(join(tmpdir(), 'pinax-storage-smoke-'))
    server = await createServer({ cacheDir, server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' })
  }
  await server?.listen()
  const base = process.env.PINAX_SMOKE_URL || 'http://127.0.0.1:' + server.httpServer.address().port
  browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.route('**/__storage_fixture__', route => route.fulfill({ contentType: 'text/html', body: '<title>Storage fixture</title>' }))
  await page.goto(base + '/__storage_fixture__')
  const history = await page.evaluate(async () => {
    const { openVersion4 } = await import('/scripts/fixtures/ledger/upgrade-probe.mjs')
    const H = await import('/src/services/memory/memoryHistoryStore.js')
    const db = await openVersion4(H.MEMORY_HISTORY_DB)
    const rows = Array.from({ length: 2200 }, (_, i) => ({
      id: 'rev-' + i, candidateId: 'candidate-' + i, parentId: null,
      recordedAt: i, after: { scope: 'project', scopeId: i < 200 ? 'my-book' : 'other-book' }
    }))
    // Many imported rows can share a millisecond across the page boundary.
    for (let i = 20; i < 110; i++) rows[i].recordedAt = 100
    // Locale-equivalent IDs remain distinct IndexedDB keys on import.
    Object.assign(rows[196], { id: 'révision', recordedAt: 197 })
    rows[197].id = 're\u0301vision'
    await db.revisions.bulkAdd(rows)
    db.close()
    let recordsRead = 0
    const restore = []
    for (const proto of [IDBObjectStore.prototype, IDBIndex.prototype]) {
      for (const method of ['getAll', 'openCursor']) {
        const original = proto[method]
        restore.push(() => { proto[method] = original })
        proto[method] = function (...args) {
          const request = original.apply(this, args)
          if ((this.objectStore || this).name === 'revisions') {
            request.addEventListener('success', () => {
              if (request.result) recordsRead += method === 'openCursor' ? 1 : request.result.length
            })
          }
          return request
        }
      }
    }
    let expected, first, before, after, secondReads, allRows
    try {
      expected = await H.readMemoryHistory({ scope: 'project', scopeId: 'my-book' })
      before = recordsRead
      recordsRead = 0
      first = await H.readMemoryActivity({ scope: 'project', scopeId: 'my-book', limit: 30 })
      after = recordsRead
      recordsRead = 0
      let next = await H.readMemoryActivity({ scope: 'project', scopeId: 'my-book', cursor: first.nextCursor })
      secondReads = recordsRead
      allRows = first.rows.concat(next.rows)
      while (next.hasMore) {
        next = await H.readMemoryActivity({ scope: 'project', scopeId: 'my-book', cursor: next.nextCursor })
        allRows.push(...next.rows)
      }
    } finally { restore.forEach(reset => reset()) }
    const tie = await H.readMemoryActivity({ scope: 'project', scopeId: 'my-book', limit: 120 })
    const empty = await H.readMemoryActivity({ scope: 'project', scopeId: 'absent' })
    return {
      before, after, secondReads, projectRows: expected.length, page: first.rows.length,
      identical: allRows.length === expected.length && allRows.every((row, i) => row.id === expected[i].id) && [first, tie].every(({ rows }) => rows.every((row, i) => row.id === expected[i].id)),
      hasMore: first.hasMore && tie.hasMore, absent: empty.rows.length === 0 && !empty.hasMore
    }
  })
  assert.deepEqual(history, { before: 2200, after: 31, secondReads: 31, projectRows: 200, page: 30, identical: true, hasMore: true, absent: true })

  const counts = await page.evaluate(async () => {
    const { buildBookMirrorPayload } = await import('/src/services/localMirrorService.js')
    const A = await import('/src/services/worldbook/worldbookSourceArchive.js')
    const { STORAGE_KEYS } = await import('/src/composables/useStorage.js')
    const artifacts = Array.from({ length: 500 }, (_, i) => ({ id: 'src-' + i, chunkIds: ['ck-' + i] }))
    artifacts[1].chunkIds.push('ck-2')
    const chunks = artifacts.map((_, i) => ({ id: 'ck-' + i, text: '段落 ' + i }))
    await A.replaceAllSourceArchiveRecords({ artifacts, chunks })
    const chapters = Array.from({ length: 600 }, (_, i) => ({ id: 'chapter-' + i, title: '章' + i }))
    const book = { id: 'mirror-book', worldbookId: 'wb-scope', chapters }
    localStorage.setItem('worldbook_wb-scope', JSON.stringify({
      id: book.worldbookId, name: '测试', sourceDocuments: [1, 2].map(i => ({ id: 'src-' + i, title: '资料' + i, content: '预览' + i, archiveRef: 'src-' + i }))
    }))

    const originals = []
    function observe(proto, key, record) {
      const original = proto[key]
      originals.push(() => { proto[key] = original })
      proto[key] = function (...args) {
        record(this, args)
        return original.apply(this, args)
      }
    }
    const stats = { archiveFullReads: 0, artifactReads: 0, chunkReads: 0, historyReads: 0 }
    observe(IDBObjectStore.prototype, 'getAll', store => {
      if (Object.values(A.SOURCE_ARCHIVE_STORES).includes(store.name)) stats.archiveFullReads++
    })
    observe(IDBObjectStore.prototype, 'get', store => {
      if (store.name === 'artifacts') stats.artifactReads++
      if (store.name === 'chunks') stats.chunkReads++
    })
    observe(Storage.prototype, 'getItem', (_, [key]) => {
      if ([STORAGE_KEYS.WRITING_BLOCK_HISTORY, STORAGE_KEYS.WRITING_SNAPSHOTS].includes(key)) stats.historyReads++
    })
    try {
      const payload = await buildBookMirrorPayload(book)
      const observed = { ...stats, refs: Object.keys(payload.sourceArchive), chunks: payload.sourceArchive['src-1'].chunks.map(chunk => chunk.id), previews: payload.materials.artifacts.map(row => row.content) }
      const world = JSON.parse(localStorage.getItem('worldbook_wb-scope'))
      world.sourceDocuments[0].archiveRef = 'missing-source'
      localStorage.setItem('worldbook_wb-scope', JSON.stringify(world))
      try { await buildBookMirrorPayload(book) } catch (err) { if (err.message.includes('归档缺失')) return observed; throw err }
      throw new Error('An explicit missing source reference must block synchronization')
    } finally { originals.forEach(reset => reset()) }
  })
  assert.deepEqual(counts, { archiveFullReads: 0, artifactReads: 2, chunkReads: 2, historyReads: 2, refs: ['src-1', 'src-2'], chunks: ['ck-1', 'ck-2'], previews: ['预览1', '预览2'] })
  const peer = await page.context().newPage()
  await peer.route('**/__storage_fixture__', route => route.fulfill({ contentType: 'text/html', body: '' }))
  await peer.goto(base + '/__storage_fixture__')
  await page.route('**/api/storyagent/policies**', async route => {
    if (route.request().url().endsWith('/check')) {
      await peer.evaluate(() => {
        const books = JSON.parse(localStorage.writing_books)
        books[0].chapters[0].content = '另一页刚保存的稿件'
        localStorage.setItem('writing_books', JSON.stringify(books))
      })
    }
    await route.fulfill({ json: { policy: { ...route.request().postDataJSON(), policyId: 'test-only', revision: 1 } } })
  })
  const assistant = await page.evaluate(async () => {
    const { createAuthoringStoryAgent } = await import('/src/services/agents/storyagent/authoringIntegration.js')
    const { loadWritingBooks, saveWritingBooksDurable } = await import('/src/services/writing/writingBooksRepository.js')
    const book = { id: 'assistant-test', worldbookId: '', chapters: [{ id: 'chapter', content: '原稿' }], outlineNodes: [{ id: 'outline', intent: '旧大纲' }] }
    localStorage.setItem('writing_books', JSON.stringify([book]))
    let protectedText
    const agent = createAuthoringStoryAgent({
      projectId: book.id, getBook: () => book, getChapter: () => book.chapters[0], getWorldbook: () => null,
      readBooks: loadWritingBooks, saveBooks: saveWritingBooksDurable, persistCurrent: () => true, publishBooks: () => {},
      protectCurrent: (_id, chapter) => { protectedText = chapter.content; return { ok: true } }
    })
    const prepared = { bookId: book.id, currentChapterId: 'chapter', editBaseline: { book, worldbook: null }, kernel: { serialization: { blocks: [] } } }
    await agent.authorize({ mode: 'review', scope: 'book', outline: true }, 'test-session', prepared)
    const proposal = await agent.prepareProposal({ changes: [{ kind: 'outline', targetId: 'outline', operation: 'replace', field: 'intent', before: '旧大纲', after: '新大纲', reason: '作者采纳' }] }, prepared, 'test-run')
    const applied = await agent.applyProposal(proposal)
    const stored = JSON.parse(localStorage.writing_books)[0]
    const undone = await agent.applyProposal(proposal, { undo: true })
    const reverted = JSON.parse(localStorage.writing_books)[0]
    const adopted = await agent.adopt({ id: 'append-test', projectId: book.id, chapterId: 'chapter', status: 'completed', text: '助手追加' })
    const appended = loadWritingBooks()[0].chapters[0].content
    return { applied: applied.ok, undone: undone.ok, outline: stored.outlineNodes[0].intent, reverted: reverted.outlineNodes[0].intent, texts: [stored.chapters[0].content, reverted.chapters[0].content, protectedText], appended: adopted.ok && appended.includes(protectedText) && appended.includes('助手追加') }
  })
  assert.deepEqual(assistant, { applied: true, undone: true, outline: '新大纲', reverted: '旧大纲', texts: Array(3).fill('另一页刚保存的稿件'), appended: true })
  await checkLedgerWorkspace(browser, base)
  await checkWorldModelWorkspace(browser, base)
  process.stdout.write(JSON.stringify({ history, mirror: counts, assistant }) + '\n')
} finally {
  await browser?.close()
  await server?.close()
  if (cacheDir) await rm(cacheDir, { recursive: true, force: true })
}
