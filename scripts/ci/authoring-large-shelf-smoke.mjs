// Isolated browser profile; exercises the editor's normal debounce and portable backups.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const vite = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' })
const profile = await mkdtemp(join(tmpdir(), 'pinax-chapter-storage-'))
let browser
try {
  await vite.listen()
  const origin = 'http://127.0.0.1:' + vite.httpServer.address().port
  async function openProfile() {
    browser = await chromium.launchPersistentContext(profile)
    await browser.route('**/api/**', route => route.fulfill({ status: 503, body: 'offline' }))
    await browser.addInitScript(() => {
      window.shelfWrites = []
      const request = navigator.locks.request.bind(navigator.locks)
      navigator.locks.request = (name, ...args) => {
        if (name !== 'pinax-writing-books-save') return request(name, ...args)
        const callback = args.pop()
        return request(name, ...args, lock => {
          const start = performance.now()
          try { return callback(lock) }
          finally { if (window.shelfCost) window.shelfCost.lockMs.push(performance.now() - start) }
        })
      }
      for (const operation of ['parse', 'stringify']) {
        const original = JSON[operation]
        JSON[operation] = function (...args) {
          const result = original.apply(this, args)
          const chars = operation === 'parse' ? args[0]?.length : result?.length
          if (window.shelfCost && chars >= 500_000) window.shelfCost[operation] += chars
          return result
        }
      }
      const save = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        const result = save.call(this, key, value)
        if (key === 'writing_books' || key.startsWith('pinax:writing-changes:')) {
          window.shelfWrites.push({ key, length: value.length })
        }
        return result
      }
    })
  }
  async function edit(page, text) {
    const editor = page.locator('.ProseMirror').first()
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.insertText(text)
  }
  async function waitSaved(page, marker, index) {
    await page.evaluate(async () => {
      window.readBooksForTest = (await import('/src/services/writing/writingBooksRepository.js')).loadWritingBooks
    })
    await page.waitForFunction(({ marker, index }) => window.readBooksForTest()[0].chapters[index].content.includes(marker),
      { marker, index }, { timeout: 60000, polling: 200 })
  }
  await openProfile()
  const page = await browser.newPage()
  await page.goto(origin)
  const fixture = await page.evaluate(async () => {
    const { loadWritingBooks, loadWritingBooksSnapshot, saveWritingBooksDurable } = await import('/src/services/writing/writingBooksRepository.js')
    const { createWritingDocument } = await import('/src/services/writing/writingDocumentSchema.js')
    let seed = 1234567
    const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0 }
    const places = ['灯塔', '航线', '海关', '沙洲', '旱季', '山口', '红树林', '石拱桥', '钟楼', '气压', '河岸']
    const chapters = Array.from({ length: 540 }, (_, i) => {
      let content = '第' + i + '段。'
      for (let n = 0; n < 300; n++) content += places[random() % places.length] + '记下'
        + String.fromCharCode(0x4e00 + random() % 5000, 0x4e00 + random() % 5000) + '，风速' + (random() % 70) + '。'
      return { id: 'ch-' + i, title: '章节' + i, content, editorDocument: createWritingDocument(content), revision: 1 }
    })
    const shelf = [{ id: 'long', title: '远航', createdAt: '2026', description: '', worldbookId: '', chapters }]
    const logical = JSON.stringify(shelf).length
    if (!saveWritingBooksDurable(shelf).ok) throw new Error('unable to store long fixture')
    const previous = localStorage.getItem('writing_books')
    if (!previous.startsWith('pinax:gzip:')) throw new Error('fixture did not exercise the previous quota path')
    const snapshot = loadWritingBooksSnapshot()
    if (snapshot !== loadWritingBooksSnapshot() || !Object.isFrozen(snapshot[0].chapters[0].editorDocument.content)) throw Error('expected a stable, immutable snapshot for the packed shelf')
    const edit = loadWritingBooks()
    edit[0].chapters[0].editorDocument.content.length = 0
    if (!snapshot[0].chapters[0].editorDocument.content.length || !loadWritingBooks()[0].chapters[0].editorDocument.content.length) throw Error('a private edit leaked into another reader')
    return { logical, wholeShelfChars: previous.length }
  })
  const url = origin + '/authoring?bookId=long&chapterId=ch-538'
  await page.goto(url)
  const conflict = await browser.newPage()
  await conflict.goto(url)
  await conflict.locator('.ProseMirror').first().waitFor()
  await edit(page, 'PROMOTION')
  await waitSaved(page, 'PROMOTION', 538)
  await page.evaluate(async () => {
    const { loadWritingBooksSnapshot } = await import('/src/services/writing/writingBooksRepository.js')
    window.beforeSecondEdit = loadWritingBooksSnapshot()
    window.shelfWrites = []
    window.shelfCost = { parse: 0, stringify: 0, lockMs: [] }
  })
  await edit(page, 'SECOND-UPDATE')
  await page.waitForFunction(() => window.shelfWrites.length > 0)
  const cost = await page.evaluate(() => { const cost = window.shelfCost; window.shelfCost = null; return cost })
  assert.equal(cost.parse, 0, 'saving a single chapter reparsed the shelf')
  assert.equal(cost.stringify, 0, 'saving a single chapter serialized the shelf')
  assert.ok(cost.lockMs.length > 0)
  await waitSaved(page, 'SECOND-UPDATE', 538)
  const updates = await page.evaluate(() => window.shelfWrites)
  assert.ok(updates.length && updates.every(row => row.key.startsWith('pinax:writing-changes:')))
  assert.ok(updates.reduce((sum, row) => sum + row.length, 0) < fixture.wholeShelfChars / 10)
  await edit(conflict, 'STALE-EDIT')
  await conflict.locator('.wall__save-rescue__text').waitFor()
  const other = await browser.newPage()
  await other.goto(origin + '/authoring?bookId=long&chapterId=ch-537')
  await edit(other, 'OTHER-CHAPTER')
  await waitSaved(other, 'OTHER-CHAPTER', 537)
  assert.equal(await page.evaluate(async () => {
    const { loadWritingBooksSnapshot } = await import('/src/services/writing/writingBooksRepository.js')
    const previous = window.beforeSecondEdit
    const current = loadWritingBooksSnapshot()
    return previous !== current && current === loadWritingBooksSnapshot() && previous[0].chapters[0] === current[0].chapters[0]
      && !previous[0].chapters[538].content.includes('SECOND-UPDATE') && current[0].chapters[538].content.includes('SECOND-UPDATE')
      && !previous[0].chapters[537].content.includes('OTHER-CHAPTER') && current[0].chapters[537].content.includes('OTHER-CHAPTER')
  }), true)
  await browser.close()
  await openProfile()
  const cold = await browser.newPage()
  await cold.goto(origin)
  // Simulate the process dying between staging its new generation and
  // publishing it. A second tab must wait for the live writer before sweeping.
  const orphan = 'pinax:writing-changes:interrupted-fixture'
  await cold.evaluate(key => new Promise(started => {
    void navigator.locks.request('pinax-writing-books-save', () => new Promise(release => {
      localStorage.setItem(key, 'unpublished fixture')
      window.finishInterruptedWrite = release
      started()
    }))
  }), orphan)
  const sweeper = await browser.newPage()
  await sweeper.goto(origin)
  await sweeper.evaluate(async () => { (await import('/src/services/writing/writingBooksRepository.js')).loadWritingBooks() })
  assert.equal(await cold.evaluate(key => localStorage.getItem(key), orphan), 'unpublished fixture')
  await cold.evaluate(() => window.finishInterruptedWrite())
  await sweeper.waitForFunction(key => localStorage.getItem(key) === null, orphan)
  await sweeper.close()
  const check = await cold.evaluate(async () => {
    const { buildBackup, restoreBackup } = await import('/src/utils/backupExport.js')
    const { buildWorkspaceBackupBundle, restoreWorkspaceBackupBundle } = await import('/src/services/storage/workspaceBackupBundle.js')
    const { buildLegacyMigrationBundle } = await import('/src/services/migration/legacyMigrationBundle.js')
    const { readStoredText } = await import('/src/services/storage/writingStorageCodec.js')
    const { removeItem } = await import('/src/composables/useStorage.js')
    const key = 'writing_books'
    const raw = readStoredText(localStorage, key)
    const chapters = JSON.parse(raw)[0].chapters
    const ensure = (condition, message) => { if (!condition) throw Error(message) }
    ensure(chapters[537].content.includes('OTHER-CHAPTER') && chapters[538].content.includes('SECOND-UPDATE')
      && !chapters[538].content.includes('STALE-EDIT'), 'cold restart lost an edit')
    const backup = buildBackup()
    ensure(backup.keys[key] === raw && !Object.keys(backup.keys).some(k => k.startsWith('pinax:writing-changes:')), 'nonportable JSON')
    const migration = await buildLegacyMigrationBundle()
    ensure(migration.records.find(row => row.sourceRecordId === key)?.raw === raw, 'nonportable migration')
    const zip = await buildWorkspaceBackupBundle()
    const pointer = localStorage.getItem(key)
    const deltaKey = Object.keys(localStorage).find(k => k.startsWith('pinax:writing-changes:'))
    const changes = localStorage.getItem(deltaKey)
    // A separate commit advances only the delta after plan construction.
    // The main baseline is unchanged, so comparing only that key would miss it.
    let intervened = false
    const newer = JSON.parse(changes)
    newer[0][1].title = '另页新章名'
    const racedStorage = { getItem: k => localStorage.getItem(k), removeItem: k => localStorage.removeItem(k), setItem(k, v) {
      localStorage.setItem(k, v)
      if (!intervened && String(v).startsWith('pending:')) {
        intervened = true
        localStorage.setItem(deltaKey, JSON.stringify(newer))
      }
    } }
    const raced = restoreBackup({ ...backup, keys: { [key]: '[]' } }, { storage: racedStorage, acceptRestoreRisk: true })
    ensure(intervened && !raced.success && readStoredText(localStorage, key).includes('另页新章名'), 'restore missed concurrent chapter change')
    localStorage.setItem(deltaKey, changes)
    // Simulate a restore that fails after replacing the shelf.
    const proxy = { getItem: k => localStorage.getItem(k), removeItem: k => localStorage.removeItem(k), setItem(k, v) {
      if (k === 'blocked-key') throw new DOMException('full', 'QuotaExceededError')
      localStorage.setItem(k, v)
    } }
    const failed = restoreBackup({ ...backup, keys: { [key]: '[]', 'blocked-key': '1' } }, { storage: proxy, acceptRestoreRisk: true })
    ensure(!failed.success && failed.rolledBack && localStorage.getItem(key) === pointer && localStorage.getItem(deltaKey) === changes
      && readStoredText(localStorage, key) === raw, 'rollback lost layered storage')
    localStorage.removeItem(deltaKey)
    try { readStoredText(localStorage, key); throw Error('missing chapter changes silently accepted') }
    catch (error) { if (error.code !== 'WRITING_STORAGE_CORRUPT') throw error }
    ensure(restoreBackup(backup, { acceptRestoreRisk: true }).success && readStoredText(localStorage, key) === raw, 'repair from JSON failed')
    removeItem(key)
    const restored = await restoreWorkspaceBackupBundle(zip.bytes, { acceptRestoreRisk: true })
    ensure(restored.success && readStoredText(localStorage, key) === raw, 'ZIP round trip failed')
    return chapters.length
  })
  assert.equal(check, 540)
  // If the new header cannot be installed, staging must leave the last shelf
  // usable and the editor must still save using the previous quota codec.
  await cold.goto(url)
  await cold.evaluate(() => {
    const save = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'writing_books' && value.startsWith('pinax:chapters:')) {
        window.blockedFirstHeader = true
        throw new DOMException('fixture rejects header', 'QuotaExceededError')
      }
      return save.call(this, key, value)
    }
  })
  await edit(cold, 'FALLBACK-AFTER-FAILED-STAGE')
  await waitSaved(cold, 'FALLBACK-AFTER-FAILED-STAGE', 538)
  assert.equal(await cold.evaluate(() => window.blockedFirstHeader
    && localStorage.writing_books.startsWith('pinax:gzip:')
    && !Object.keys(localStorage).some(key => key.startsWith('pinax:writing-changes:'))), true)
  process.stdout.write(JSON.stringify({ chapters: check, ...fixture, chapterCommitChars: updates.map(row => row.length), largeJsonChars: { parse: cost.parse, stringify: cost.stringify }, saveLockMs: cost.lockMs }) + '\n')
} finally {
  await browser?.close()
  await vite.close()
  await rm(profile, { recursive: true, force: true })
}
