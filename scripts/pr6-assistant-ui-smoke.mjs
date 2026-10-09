import express from 'express'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
const app = express(); app.use(express.static('dist')); app.use((_req, res) => res.sendFile(path.resolve('dist/index.html')))
const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.on('listening', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ headless: true })
let checks = 0
const screenshots = '/tmp/pinax-pr6-ui-captures'; fs.mkdirSync(screenshots, { recursive: true })
const sse = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
try {
  for (const [name, viewport, dark] of [['desktop-light', { width: 1440, height: 1000 }, false], ['desktop-dark', { width: 1440, height: 1000 }, true], ['mobile-dark', { width: 390, height: 844 }, true]]) {
    const context = await browser.newContext({ viewport, colorScheme: dark ? 'dark' : 'light' })
    await context.addInitScript(({ dark }) => {
      const books = [{ id: 'ui-book', title: '合成验收作品', worldbookId: 'ui-world', chapters: [{ id: 'ui-chapter', title: '第一章', content: '甲站在码头。甲推开门。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }], outlineNodes: [{ id: 'ui-outline', title: '相遇', intent: '两人在码头相遇。' }], outlineEdges: [] }]
      localStorage.setItem('writing_books', JSON.stringify(books))
      localStorage.setItem('worldbook_ui-world', JSON.stringify({ id: 'ui-world', name: '合成资料库', entries: [{ id: 'ui-person', name: '甲', type: 'character', content: '甲是谨慎的船员。', keys: ['甲'], injection: { constant: true }, metadata: { review: 'confirmed', characterProfile: { background: '甲是谨慎的船员。', personality: '做事谨慎', appearance: '工作服', other: '自带绳索' } } }], sourceDocuments: [] }))
      localStorage.setItem('worldbooks_index', JSON.stringify([{ id: 'ui-world', name: '合成资料库' }]))
      localStorage.setItem('pinax-device-language', JSON.stringify({ uiLocale: 'zh-CN', assistantLanguage: '' }))
      localStorage.setItem('app_theme', dark ? 'dark' : 'light')
    }, { dark })
    const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', async route => {
      const request = route.request(); const url = new URL(request.url())
      if (url.pathname.endsWith('/capabilities')) return route.fulfill({ json: { ok: true, localFiles: false } })
      if (url.pathname.endsWith('/healthz')) return route.fulfill({ json: { ok: true } })
      if (url.pathname.endsWith('/model')) return route.fulfill({ json: { model: 'synthetic-model', provider: 'synthetic', keyMasked: 'configured' } })
      if (/\/v1\/pinax\/tasks(?:\/[^/]+\/resume)?$/.test(url.pathname) && request.method() === 'POST') {
        const body = request.postDataJSON(); const changes = [
          { kind: 'chapter', targetId: 'ui-chapter', operation: 'replace', field: 'content', before: '甲推开门。', after: '甲先敲了敲门。', reason: '符合人物谨慎的性格。' },
          { kind: 'worldbook', targetId: 'ui-person', operation: 'append', field: 'content', before: '', after: '他习惯先确认屋内是否有人。', reason: '补充人物行动习惯。' }
        ]
        const data = sse('task.started', { taskId: body.taskId, bookId: body.bookId, status: 'running' })
          + sse('tool.result', { toolName: 'submit_edit_proposals', result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, changes }) }] } })
          + sse('text.delta', { schemaVersion: 1, type: 'text.delta', content: '已提出正文和人物两处修改，等待你确认。' })
          + sse('task.completed', { taskId: body.taskId, bookId: body.bookId, status: 'completed', finalText: '已提出正文和人物两处修改，等待你确认。' })
        return route.fulfill({ contentType: 'text/event-stream', body: data })
      }
      if (url.pathname.includes('/localmirror')) return route.fulfill({ json: { ok: true, projects: [] } })
      return route.fulfill({ json: { ok: true, data: [], tasks: [] } })
    })
    await page.goto(`${base}/authoring?bookId=ui-book&chapterId=ui-chapter&view=assistant`, { waitUntil: 'networkidle' })
    // Force the selected theme through the actual root attribute for a stable capture.
    await page.evaluate(dark => { document.documentElement.classList.toggle('theme-dark', dark) }, dark)
    const input = page.locator('textarea[aria-label="向助手提问"]:visible').first()
    await input.waitFor({ state: 'visible', timeout: 20000 }); await input.fill('把甲的动作改得谨慎一些，并补充人物设定。'); await input.press('Enter')
    const reviewButton = page.getByRole('button', { name: '查看修改建议', exact: true }); await reviewButton.waitFor({ timeout: 15000 })
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('writing_books'))[0].chapters[0].content), '甲站在码头。甲推开门。'); checks++
    await reviewButton.click()
    const review = page.locator('[data-test="assistant-edit-review"]:visible').first(); await review.waitFor()
    await page.screenshot({ path: `${screenshots}/${name}-review.png`, fullPage: false })
    // A rejected worldbook write must roll back the preceding manuscript write.
    await page.evaluate(() => {
      window.originalStorageSetItem = Storage.prototype.setItem
      Storage.prototype.setItem = function(key, value) { if (key === 'worldbook_ui-world') throw new DOMException('Synthetic quota failure', 'QuotaExceededError'); return window.originalStorageSetItem.call(this, key, value) }
    })
    await review.getByRole('button', { name: '采用这组修改', exact: true }).click()
    await review.getByRole('alert').waitFor()
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('writing_books'))[0].chapters[0].content.trimEnd()), '甲站在码头。甲推开门。'); checks++
    await page.evaluate(() => { Storage.prototype.setItem = window.originalStorageSetItem; delete window.originalStorageSetItem })
    await review.getByRole('button', { name: '采用这组修改', exact: true }).click()
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('writing_books'))[0].chapters[0].content.includes('甲先敲了敲门。'))
    const world = await page.evaluate(() => JSON.parse(localStorage.getItem('worldbook_ui-world')))
    assert.ok(world.entries[0].content.includes('习惯先确认')); assert.equal(world.entries[0].metadata.review, 'confirmed'); checks += 2
    await page.locator('[data-authoring-tool="characters"]:visible').first().click()
    const rolePanel = page.locator('[data-catalog="characters"]:visible')
    await rolePanel.waitFor()
    const fields = await rolePanel.locator('textarea').evaluateAll(elements => elements.map(element => element.value))
    assert.ok(fields.some(value => value.includes('习惯先确认'))); assert.ok(fields.includes('做事谨慎')); checks += 2
    await page.screenshot({ path: `${screenshots}/${name}-character.png`, fullPage: false })
    await rolePanel.getByRole('button', { name: '关闭角色工作台' }).click()
    await review.getByRole('button', { name: '撤销这次修改', exact: true }).click()
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('writing_books'))[0].chapters[0].content.trimEnd() === '甲站在码头。甲推开门。'); checks++
    await page.reload({ waitUntil: 'networkidle' })
    await page.locator('[data-authoring-tool="ai"]:visible').first().click()
    await page.getByRole('button', { name: '查看修改建议', exact: true }).waitFor(); checks++
    assert.deepEqual(errors, []); checks++
    console.log(`${name}: proposal preview / two-domain durable adoption / undo / reload / no page errors passed`)
    await context.close()
  }
  console.log(`assistant-ui: ${checks} checks passed; screenshots ${screenshots}`)
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
