// Run with node scripts/ci/authoring-concurrency-smoke.mjs and Playwright Chromium.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const vite = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' })
let browser
try {
  await vite.listen()
  const origin = 'http://127.0.0.1:' + vite.httpServer.address().port
  browser = await chromium.launch()
  for (const action of ['switch', 'reselect', 'exit']) {
    const context = await browser.newContext()
    try {
      await context.route('**/api/**', route => route.fulfill({ status: 503, body: 'offline' }))
      const control = await context.newPage()
      await control.goto(origin)
      await control.evaluate(async () => {
        const { saveWritingBooks } = await import('/src/services/writing/writingBooksRepository.js')
        const { createWritingDocument } = await import('/src/services/writing/writingDocumentSchema.js')
        const chapters = ['aa', 'bb', 'cc'].map(id => ({ id, title: id, content: id, editorDocument: createWritingDocument(id) }))
        saveWritingBooks([{ id: 'tab-test', title: '双标签测试', chapters }])
      })
      const editors = await Promise.all(['aa', 'bb'].map(async id => {
        const page = await context.newPage()
        await page.goto(origin + '/authoring?bookId=tab-test&chapterId=' + id)
        const editor = page.locator('.ProseMirror').first()
        await page.waitForFunction(id => document.querySelector('.ProseMirror')?.textContent.includes(id), id)
        return { page, editor, id }
      }))
      // Pin the writer lock. A synchronous switch/unload that bypasses it
      // would publish to the shelf while this independent tab still owns it.
      await control.evaluate(() => new Promise(ready => {
        void navigator.locks.request('pinax-writing-books-save', () => new Promise(release => {
          window.releaseTestLock = release
          ready()
        }))
      }))
      await Promise.all(editors.map(async ({ page, editor, id }) => {
        await editor.click()
        await page.keyboard.press('End')
        await page.keyboard.insertText('-edited')
        if (action !== 'exit') {
          const target = action === 'switch' ? 'cc' : id
          await page.locator('.authoring-chapter-row').filter({ hasText: target }).first().dispatchEvent('click')
        } else {
          const cancelled = await page.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true })))
          assert.equal(cancelled, true)
          const draft = await page.evaluate(async id => {
            const { listWritingRecoveryDrafts } = await import('/src/services/writing/writingRecovery.js')
            return listWritingRecoveryDrafts(id, 'tab-test').some(row => row.markdown.includes(id + '-edited'))
              && listWritingRecoveryDrafts(id, 'unrelated-book').length === 0
          }, id)
          assert.equal(draft, true)
        }
      }))
      assert.equal(await control.evaluate(() => localStorage.writing_books.includes('-edited')), false)
      await control.evaluate(() => window.releaseTestLock())
      await control.waitForFunction(() => JSON.parse(localStorage.writing_books)[0].chapters.slice(0, 2)
        .every(chapter => chapter.content.includes(chapter.id + '-edited')))
      if (action === 'switch') {
        for (const { page } of editors) {
          await page.waitForFunction(() => document.querySelector('.authoring-chapter-row.is-active')?.textContent.includes('cc'))
        }
      }
      process.stdout.write(action + ' passed\n')
    } finally {
      await context.close()
    }
  }
} finally {
  await browser?.close()
  await vite.close()
}
