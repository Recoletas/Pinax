import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chromium } from 'playwright'
const base = process.env.PINAX_PREVIEW_URL || 'http://127.0.0.1:5173'
const captures = '/tmp/pinax-resource-groups-captures'
fs.mkdirSync(captures, { recursive: true })
const browser = await chromium.launch({ headless: true })
let checks = 0
try {
  for (const [name, width, dark] of [['desktop-light', 1440, false], ['desktop-dark', 1440, true], ['mobile-dark', 390, true]]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, hasTouch: width === 390 })
    await context.addInitScript(({ dark }) => {
      if (localStorage.getItem('workspace-fixture')) return
      localStorage.setItem('workspace-fixture', '1')
      localStorage.setItem('writing_books', JSON.stringify([{ id: 'workspace-book', title: '工作区验收', worldbookId: 'workspace-world', chapters: [{ id: 'workspace-chapter', title: '第一章 港口', content: '林昭在港口停下脚步。' }, { id: 'workspace-chapter-two', title: '第二章 灯塔', content: '林昭沿着石阶走向灯塔。' }] }]))
      localStorage.setItem('worldbook_workspace-world', JSON.stringify({ id: 'workspace-world', name: '港口资料', entries: [{ id: 'workspace-person', name: '林昭', type: 'character', content: '林昭是谨慎的船员。' }], sourceDocuments: [{ id: 'workspace-source', title: '航海记录', kind: 'pasted-text', contentPreview: '港口的潮汐与灯塔记录。', contentHash: 'fixture-hash', chunkIds: [] }] }))
      localStorage.setItem('worldbooks_index', JSON.stringify([{ id: 'workspace-world', name: '港口资料' }]))
      localStorage.setItem('pinax-device-language', JSON.stringify({ uiLocale: 'zh-CN', assistantLanguage: '' }))
      localStorage.setItem('app_theme', dark ? 'dark' : 'light')
    }, { dark })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ json: { ok: true, localFiles: false, projects: [], tasks: [], data: [] } }))
    await page.goto(`${base}/authoring?bookId=workspace-book&chapterId=workspace-chapter`, { waitUntil: 'networkidle' })
    await page.locator('.workspace-primary-group .ProseMirror').waitFor({ state: 'visible' })
    async function openContent(title, destination) {
      await page.getByLabel('打开内容', { exact: true }).click()
      const picker = page.locator('.workspace-reference-menu-body')
      await picker.getByRole('button', { name: destination, exact: true }).click()
      await picker.getByRole('searchbox').fill(title)
      await picker.locator('.workspace-resource-item').getByText(title, { exact: true }).first().click()
      await picker.waitFor({ state: 'hidden' })
    }
    await openContent('航海记录', '主区')
    const source = page.locator('.workspace-primary-group [data-test="workspace-reference-view"]:visible')
    await source.getByText('港口的潮汐与灯塔记录。', { exact: true }).waitFor()
    await source.evaluate(element => { window.__groupedSource = element })
    assert.equal(await page.locator('.workspace-main-header').isVisible(), true); checks++
    await openContent('林昭', '旁边')
    const entry = page.locator('.workspace-reference-group [data-test="workspace-reference-view"]:visible')
    await entry.locator('h1').getByText('林昭', { exact: true }).waitFor()
    if (width > 900) { assert.equal(await source.isVisible(), true); checks++ }
    await page.screenshot({ animations: 'disabled', path: `${captures}/${name}-resource-groups.png` })
    await page.getByRole('button', { name: '移到主区', exact: true }).click()
    await page.locator('.workspace-main-header .workspace-content-tab').getByText('航海记录', { exact: true }).click()
    assert.equal(await source.evaluate(element => element === window.__groupedSource), true); checks++
    await page.keyboard.press('Control+p')
    const picker = page.locator('.workspace-reference-menu-body')
    await picker.getByRole('searchbox').fill('第二章 灯塔')
    await picker.getByRole('searchbox').press('Enter')
    const editor = page.locator('.workspace-primary-group .ProseMirror:visible')
    await editor.getByText('林昭沿着石阶走向灯塔。', { exact: true }).waitFor()
    assert.match(page.url(), /chapterId=workspace-chapter-two/); checks++
    assert.equal(await editor.getAttribute('contenteditable'), 'true'); checks++
    await editor.fill('林昭登上灯塔，蓝色信号照亮了海面。')
    await editor.press('Control+s')
    await page.waitForFunction(async () => {
      const { loadWritingBooks } = await import('/src/services/writing/writingBooksRepository.js')
      const { getChapterMarkdown } = await import('/src/services/writing/writingDocumentSchema.js')
      return getChapterMarkdown(loadWritingBooks().find(book => book.id === 'workspace-book').chapters.find(chapter => chapter.id === 'workspace-chapter-two')).includes('蓝色信号照亮了海面')
    }); checks++
    await page.locator('.workspace-main-header .workspace-content-tab').getByText('第一章 港口', { exact: true }).click()
    await page.waitForURL(/chapterId=workspace-chapter(?:&|$)/)
    assert.equal(await editor.innerText().then(text => text.includes('蓝色信号照亮了海面')), false); checks++
    await page.locator('.workspace-main-header .workspace-content-tab').getByText('第二章 灯塔', { exact: true }).click()
    await editor.getByText('林昭登上灯塔，蓝色信号照亮了海面。', { exact: true }).waitFor(); checks++
    if (width > 900) {
      await page.locator('.workspace-main-header .workspace-content-tab').getByText('第二章 灯塔', { exact: true }).dragTo(page.locator('.workspace-main-header .workspace-content-tab').getByText('航海记录', { exact: true }))
      const order = await page.locator('.workspace-main-header .workspace-content-tab').allTextContents()
      assert.ok(order.findIndex(title => title.includes('第二章 灯塔')) < order.findIndex(title => title.includes('航海记录'))); checks++
    }
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('pinax-workspace-views:v1:["workspace-book",""]')))
    await page.reload({ waitUntil: 'networkidle' })
    await editor.getByText('林昭登上灯塔，蓝色信号照亮了海面。', { exact: true }).waitFor()
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('pinax-workspace-views:v1:["workspace-book",""]')))
    assert.deepEqual(after.views.map(view => [view.id, view.group]), before.views.map(view => [view.id, view.group])); checks++
    await page.waitForFunction(() => { const tab = document.querySelector('.workspace-main-header .workspace-content-tab.is-active'); const strip = tab?.closest('.workspace-content-tabs'); if (!strip) return false; const box = tab.getBoundingClientRect(), bounds = strip.getBoundingClientRect(); return box.left >= bounds.left - 2 && box.right <= bounds.right + 2 }); checks++
    await page.screenshot({ animations: 'disabled', path: `${captures}/${name}-chapter-tabs.png` })
    await openContent('第二章 灯塔', '旁边')
    await page.getByRole('button', { name: '回到工作区', exact: true }).click()
    const primaryTab = page.locator('.workspace-primary-return')
    assert.equal(await primaryTab.innerText(), '第二章 灯塔'); checks++
    await primaryTab.click()
    assert.equal(await editor.isVisible(), true); checks++
    await page.evaluate(async () => {
      const { useGameStore } = await import('/src/stores/gameStore.js')
      const { useWorldStore } = await import('/src/stores/worldStore.js')
      await useWorldStore().setActiveWorldbook('workspace-world')
      const game = useGameStore()
      game.createSession({ title: '港口存档', worldbookId: 'workspace-world' })
      game.isPlaying = true
      game.messages = [{ id: 'fixture-message', role: 'assistant', content: '林昭等待灯塔的信号。', timestamp: Date.now() }]
      game.saveCurrentSession(); game.flushSaveSessions()
    })
    await openContent('本书跑团', '主区')
    const game = page.locator('[data-module-editor="experience"]:visible')
    await game.getByText('林昭等待灯塔的信号。', { exact: true }).waitFor()
    await game.evaluate(element => { window.__gameView = element })
    await openContent('航海记录', '旁边')
    if (width > 900) { assert.equal(await game.isVisible(), true); checks++ }
    await page.evaluate(async () => { const { useGameStore } = await import('/src/stores/gameStore.js'); useGameStore().isLoading = true })
    await openContent('第二章 灯塔', '主区')
    assert.equal(await editor.isVisible(), true); checks++
    assert.equal(await page.locator('[data-module-editor="experience"]').evaluate(element => element === window.__gameView), true); checks++
    await page.getByRole('button', { name: '跑团生成中', exact: true }).click()
    await page.getByRole('button', { name: '关闭 跑团', exact: true }).click()
    assert.equal(await game.count(), 1); checks++
    await page.evaluate(async () => { const { useGameStore } = await import('/src/stores/gameStore.js'); useGameStore().isLoading = false })
    await page.getByRole('button', { name: '关闭 跑团', exact: true }).click()
    await page.locator('[data-module-editor="experience"]').waitFor({ state: 'detached' }); checks++
    assert.deepEqual(errors, []); checks++
    await context.close()
    console.log(JSON.stringify({ viewport: name, checks }))
  }
  console.log(JSON.stringify({ checks, captures, providerCalls: 0 }))
} finally { await browser.close() }
