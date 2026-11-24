// Chromium's debugger pins the point after all values have been checked and
// before the commit marker is written. No write or recovery adapter is mocked.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const key = 'pinax_assistant_edit_journal'
const vite = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' })
try {
  await vite.listen()
  const origin = 'http://127.0.0.1:' + vite.httpServer.address().port
  const probeUrl = origin + '/__journal_storage_probe'
  async function openApp(page) {
    await page.goto(origin)
    await page.locator('#app > *').first().waitFor({ state: 'attached' })
  }
  // Same origin, with no application code that could acquire a recovery lock.
  async function openProbe(page) {
    await page.route(probeUrl, route => route.fulfill({ contentType: 'text/html', body: '<title>Storage probe</title>' }))
    await page.goto(probeUrl)
  }
  function readPhysicalState(journalKey) {
    const record = JSON.parse(localStorage.getItem(journalKey))
    return {
      book: JSON.parse(localStorage.writing_books)[0].chapters[0].content,
      world: JSON.parse(localStorage.worldbook_w).name,
      journal: record && { version: record.version, committed: record.committed }
    }
  }
  const interrupted = { book: 'INTERRUPTED', world: 'INTERRUPTED', journal: { version: 2, committed: false } }
  for (const fallback of [false, true]) {
    const profile = await mkdtemp(join(tmpdir(), 'pinax-assistant-lock-'))
    let context
    async function openProfile() {
      context = await chromium.launchPersistentContext(profile)
      if (fallback) await context.addInitScript(() => Object.defineProperty(navigator, 'locks', { value: undefined }))
      await context.route('**/api/**', route => route.fulfill({ status: 503, body: 'offline' }))
      return context.newPage()
    }
    async function pauseCommit(page, text) {
      const cdp = await context.newCDPSession(page)
      await cdp.send('Debugger.enable')
      await page.evaluate(journal => {
        const original = Storage.prototype.setItem
        // Insert a breakpoint in this fixture's wrapper, before forwarding.
        Storage.prototype.setItem = function (k, value) {
          if (k === journal && JSON.parse(value)?.committed === true) {
            Storage.prototype.setItem = original
            debugger // eslint-disable-line no-debugger
          }
          return original.call(this, k, value)
        }
      }, key)
      const paused = new Promise(resolve => cdp.once('Debugger.paused', resolve))
      const commit = page.evaluate(async text => {
        const { persistAssistantEdits, withAssistantJournalLock } = await import('/src/services/storage/assistantEditJournal.js')
        const { withAssistantEditLock } = await import('/src/services/storage/assistantEditLock.js')
        const books = JSON.parse(localStorage.writing_books)
        books[0].chapters[0].content = text
        return withAssistantEditLock(() => withAssistantJournalLock(() => persistAssistantEdits([
          { key: 'writing_books', after: books }, { key: 'worldbook_w', after: { id: 'w', name: text, entries: [] } }
        ], 'A')))
      }, text)
      void commit.catch(() => {}) // forced tab termination below rejects the page evaluation
      await paused
      return { commit, cdp }
    }
    try {
      const writer = await openProfile()
      await openApp(writer)
      await writer.evaluate(() => {
        localStorage.setItem('writing_books', JSON.stringify([{ id: 'book', title: 'book', createdAt: 1, chapters: [{ id: 'ch', content: 'OLD' }] }]))
        localStorage.setItem('worldbook_w', JSON.stringify({ id: 'w', name: 'OLD', entries: [] }))
      })
      const reader = await context.newPage()
      await reader.goto(origin)
      await reader.evaluate(async () => {
        window.repos = await import('/src/services/writing/writingBooksRepository.js')
        window.readWorld = (await import('/src/stores/worldStore.js')).readWorldbookSnapshot
      })
      const held = await pauseCommit(writer, 'NEW')
      // Observe delivery of Chromium's cross-renderer storage notifications
      // before probing the exact intermediate state.
      await reader.waitForFunction(journal => JSON.parse(localStorage.writing_books)[0].chapters[0].content === 'NEW'
        && JSON.parse(localStorage.worldbook_w).name === 'NEW' && JSON.parse(localStorage.getItem(journal))?.committed === false,
      key, { timeout: 8000 })
      const seen = await reader.evaluate(journal => {
        const book = window.repos.loadWritingBooks()[0].chapters[0].content
        const chapter = window.repos.loadWritingChapter('book', 'ch').content
        const world = window.readWorld('w').name
        const refused = !window.repos.saveWritingBooksDurable([{ id: 'other' }]).ok
        return { book, chapter, world, refused, raw: JSON.parse(localStorage.writing_books)[0].chapters[0].content,
          rawWorld: JSON.parse(localStorage.worldbook_w).name, pending: JSON.parse(localStorage.getItem(journal)).committed === false }
      }, key)
      assert.deepEqual(seen, { book: 'OLD', chapter: 'OLD', world: 'OLD', refused: true, raw: 'NEW', rawWorld: 'NEW', pending: true })
      await held.cdp.send('Debugger.resume')
      assert.equal((await held.commit).committed, true)
      await held.cdp.detach()
      const result = await reader.evaluate(() => [window.repos.loadWritingBooks()[0].chapters[0].content, window.readWorld('w').name])
      assert.deepEqual(result, ['NEW', 'NEW'])

      // Leave a passive witness while crashing the only application renderer.
      await openProbe(reader)
      const doomed = await pauseCommit(writer, 'INTERRUPTED')
      await reader.waitForFunction(journal => JSON.parse(localStorage.getItem(journal))?.committed === false
        && JSON.parse(localStorage.worldbook_w).name === 'INTERRUPTED', key)
      assert.deepEqual(await reader.evaluate(readPhysicalState, key), interrupted)
      const crashed = writer.waitForEvent('crash', { timeout: 10000 })
      // CDP loses its target when the renderer dies, so the command itself
      // need not return. The crash event proves this wasn't a graceful close.
      void doomed.cdp.send('Page.crash').catch(() => {})
      await crashed
      await writer.close()
      await doomed.commit.catch(() => {})
      assert.deepEqual(await reader.evaluate(readPhysicalState, key), interrupted)
      await context.close()
      const restarted = await openProfile()
      await openProbe(restarted)
      assert.deepEqual(await restarted.evaluate(readPhysicalState, key), interrupted)
      await openApp(restarted)
      const recovered = await restarted.evaluate(journal => [
        JSON.parse(localStorage.writing_books)[0].chapters[0].content, JSON.parse(localStorage.worldbook_w).name,
        localStorage.getItem(journal)
      ], key)
      assert.deepEqual(recovered, ['NEW', 'NEW', null])
      // Legacy external payloads do not include the current V2 inverse patches.
      await restarted.evaluate(journal => {
        localStorage.setItem(journal, JSON.stringify({ version: 1, committed: false,
          writes: [{ key: 'worldbook_w', before: { id: 'w', name: 'V1', entries: [] } }] }))
      }, key)
      await restarted.reload()
      await restarted.locator('#app > *').first().waitFor({ state: 'attached' })
      assert.equal(await restarted.evaluate(journal => localStorage.getItem(journal) === null && JSON.parse(localStorage.worldbook_w).name, key), 'V1')
      const writerCheck = await restarted.evaluate(async ({ key, fallback }) => {
        const { loadWritingBooks, saveWritingBooksDurable } = await import('/src/services/writing/writingBooksRepository.js')
        const before = loadWritingBooks()
        const partial = JSON.parse(JSON.stringify(before))
        partial[0].chapters[0].content = 'UNCOMMITTED'
        localStorage.setItem('writing_books', JSON.stringify(partial))
        const record = JSON.stringify({ version: 1, committed: false, writes: [{ key: 'writing_books', before }] })
        localStorage.setItem(key, record)
        if (fallback) {
          // Storage access can be denied per host. Keep both physical records
          // intact while still returning the last committed chapter.
          const open = indexedDB.open
          indexedDB.open = () => { throw new DOMException('fixture', 'SecurityError') }
          try {
            const prior = loadWritingBooks()[0].chapters[0].content
            const rejected = !saveWritingBooksDurable(before).ok
            return rejected && prior === 'NEW' && localStorage.getItem(key) === record
              && JSON.parse(localStorage.writing_books)[0].chapters[0].content === 'UNCOMMITTED'
          } finally { indexedDB.open = open }
        }
        const { withWritingBooksLock } = await import('/src/services/storage/writingBooksLock.js')
        return withWritingBooksLock(() => {
          const prior = loadWritingBooks()
          if (localStorage.getItem(key) !== null || prior[0].chapters[0].content !== 'NEW') return false
          prior[0].chapters[0].content = 'NEXT-EDIT'
          return saveWritingBooksDurable(prior).ok && JSON.parse(localStorage.writing_books)[0].chapters[0].content === 'NEXT-EDIT'
        })
      }, { key, fallback })
      assert.equal(writerCheck, true)
      process.stdout.write((fallback ? 'IndexedDB' : 'Web Locks') + ': live reader, committed snapshot, V2 crash restart and V1 recovery passed\n')
    } finally {
      await context?.close()
      await rm(profile, { recursive: true, force: true })
    }
  }
} finally { await vite.close() }
