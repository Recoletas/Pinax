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
    const context = await browser.newContext({ viewport, hasTouch: name === 'mobile-dark', isMobile: name === 'mobile-dark', colorScheme: dark ? 'dark' : 'light' })
    await context.addInitScript(({ dark }) => {
      const books = [{ id: 'ui-book', title: '合成验收作品', worldbookId: 'ui-world', chapters: [{ id: 'ui-chapter', title: '第一章', content: '甲站在码头。甲推开门。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }], outlineNodes: [{ id: 'ui-outline', title: '相遇', intent: '两人在码头相遇。' }], outlineEdges: [] }]
      localStorage.setItem('writing_books', JSON.stringify(books))
      localStorage.setItem('worldbook_ui-world', JSON.stringify({ id: 'ui-world', name: '合成资料库', entries: [{ id: 'ui-person', name: '甲', type: 'character', content: '甲是谨慎的船员。', keys: ['甲'], injection: { constant: true }, metadata: { review: 'confirmed', characterProfile: { background: '甲是谨慎的船员。', personality: '做事谨慎', appearance: '工作服', other: '自带绳索' } } }], sourceDocuments: [] }))
      localStorage.setItem('worldbooks_index', JSON.stringify([{ id: 'ui-world', name: '合成资料库' }]))
      localStorage.setItem('pinax-device-language', JSON.stringify({ uiLocale: 'zh-CN', assistantLanguage: '' }))
      localStorage.setItem('app_theme', dark ? 'dark' : 'light')
    }, { dark })
    let missingDelivery = false
    let ordinaryAnswer = false
    const requests = []
    const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', async route => {
      const request = route.request(); const url = new URL(request.url())
      if (url.pathname.endsWith('/capabilities')) return route.fulfill({ json: { ok: true, localFiles: false, assistantPermissions: true } })
      if (url.pathname.endsWith('/healthz')) return route.fulfill({ json: { ok: true, assistantProtocolVersion: 2 } })
      if (url.pathname.endsWith('/model')) return route.fulfill({ json: { model: 'synthetic-model', provider: 'synthetic', keyMasked: 'configured' } })
      if (url.pathname.endsWith('/policies') && request.method() === 'POST') {
        const input = request.postDataJSON()
        return route.fulfill({ json: { ok: true, policy: { ...input, chapterIds: input.scope === 'current' ? [input.chapterId] : input.chapterIds, policyId: 'synthetic-policy', revision: 1, expiresAt: Date.now() + 3600000 } } })
      }
      if (url.pathname.endsWith('/policies/check')) return route.fulfill({ json: { ok: true, policy: request.postDataJSON() } })
      if (/\/v1\/pinax\/tasks(?:\/[^/]+\/resume)?$/.test(url.pathname) && request.method() === 'POST') {
        const body = request.postDataJSON(); requests.push(body)
        if (ordinaryAnswer) {
          const prose = '这是完整讨论。**人物行动**与码头、推门的开头相连。\n\n可以让甲先确认屋内的动静，再循着线索继续。'
          const data = sse('task.started', { taskId: body.taskId, bookId: body.bookId, status: 'running' })
            + sse('text.delta', { schemaVersion: 1, type: 'text.delta', content: prose })
            + Array.from({ length: 13 }, () => sse('tool.result', { toolName: 'world_lookup', result: { content: [] } })).join('')
            + sse('tool.result', { toolName: 'complete_assistant_task', result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, intent: 'answer', outcome: 'answer', message: '已讨论。' }) }] } })
            + sse('task.completed', { taskId: body.taskId, bookId: body.bookId, status: 'completed', finalText: '已讨论。' })
          return route.fulfill({ contentType: 'text/event-stream', body: data })
        }
        const changes = [
          { kind: 'chapter', targetId: 'ui-chapter', operation: 'replace', field: 'content', before: '甲推开门。', after: '甲先敲了敲门。', reason: '符合人物谨慎的性格。' },
          { kind: 'worldbook', targetId: 'ui-person', operation: 'append', field: 'content', before: '', after: '他习惯先确认屋内是否有人。', reason: '补充人物行动习惯。' }
        ]
        const answerText = '\n\n根据资料，主角是**艾德格灰**。\n\n---\n\n**几个可能的发展方向：**\n\n1. **学城求学线**：从当前正文继续。\n2. **领地危机线**：人物先确认屋内是否有人。\n\n已提出正文和人物两处修改，等待你确认。'
        const data = sse('task.started', { taskId: body.taskId, bookId: body.bookId, status: 'running' })
          + sse('reasoning.delta', { delta: '正在核对人物和正文。' })
          + sse('tool.call', { schemaVersion: 1, type: 'tool.call', toolName: 'world_lookup', action: 'read' })
          + sse('tool.call', { schemaVersion: 1, type: 'tool.call', toolName: 'submit_edit_proposals', action: 'propose' })
          + sse('tool.result', { toolName: 'world_lookup', result: { content: [] } })
          + sse('tool.result', { toolName: 'submit_edit_proposals', result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, changes }) }] } })
          + (missingDelivery ? '' : sse('tool.result', { toolName: 'complete_assistant_task', result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, intent: 'mixed', outcome: 'proposal', message: answerText }) }] } }))
          + sse('text.delta', { schemaVersion: 1, type: 'text.delta', content: answerText })
          + sse('task.completed', { taskId: body.taskId, bookId: body.bookId, status: 'completed', finalText: answerText })
        return route.fulfill({ contentType: 'text/event-stream', body: data })
      }
      if (url.pathname.includes('/localmirror')) return route.fulfill({ json: { ok: true, projects: [] } })
      return route.fulfill({ json: { ok: true, data: [], tasks: [] } })
    })
    await page.goto(`${base}/authoring?bookId=ui-book&chapterId=ui-chapter&view=assistant`, { waitUntil: 'networkidle' })
    // Force the selected theme through the actual root attribute for a stable capture.
    await page.evaluate(dark => { document.documentElement.classList.toggle('theme-dark', dark) }, dark)
    const input = page.locator('textarea[aria-label="向助手提问"]:visible').first()
    await input.waitFor({ state: 'visible', timeout: 20000 })
    const permissionMenu = page.locator('details.authoring-knowledge__purpose:visible').first()
    await permissionMenu.locator('summary').click()
    await page.screenshot({ path: `${screenshots}/${name}-permissions.png`, fullPage: false })
    await permissionMenu.getByLabel('角色与设定', { exact: true }).check()
    await permissionMenu.press('Escape')
    await input.fill('把甲的动作改得谨慎一些，并补充人物设定。'); await input.press('Enter')
    await page.locator('.assistant-inline-edit:visible').first().waitFor({ timeout: 15000 }); checks++
    await page.locator('[data-authoring-tool="ai"]:visible').first().click()
    const reviewButton = page.getByRole('button', { name: '查看修改建议', exact: true }); await reviewButton.waitFor({ timeout: 15000 })
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('writing_books'))[0].chapters[0].content), '甲站在码头。甲推开门。'); checks++
    const markdown = page.locator('.authoring-knowledge__markdown:visible').first()
    assert.equal(await markdown.locator('strong').first().innerText(), '艾德格灰'); checks++
    assert.equal(await markdown.locator('ol li').count(), 2); checks++
    assert.equal(await markdown.locator('hr').count(), 1); checks++
    const process = page.locator('.authoring-knowledge__process:visible').first()
    assert.equal(await process.locator('details').count(), 2); checks++
    const gap = await page.evaluate(() => {
      const process = document.querySelector('.authoring-knowledge__process'); const body = document.querySelector('.authoring-knowledge__markdown')
      return body.getBoundingClientRect().top - process.getBoundingClientRect().bottom
    })
    assert.ok(gap >= 0 && gap <= 20, `process-to-answer gap ${gap}`); checks++
    await page.screenshot({ path: `${screenshots}/${name}-answer.png`, fullPage: false })
    await process.locator('summary').first().click()
    assert.equal(await process.locator('details').first().evaluate(element => element.open), true); checks++
    await process.locator('summary').first().click()
    await reviewButton.click()
    const review = page.locator('[data-test="assistant-edit-review"]:visible').first(); await review.waitFor()
    await page.locator('.assistant-inline-edit:visible').first().waitFor(); checks++
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
    await page.locator('[data-authoring-tool="ai"]:visible').first().click()
    const partialInput = page.locator('textarea[aria-label="向助手提问"]:visible').first()
    await partialInput.fill('再修改一下动作和人物。'); await partialInput.press('Enter')
    await page.waitForFunction(() => { const messages = JSON.parse(localStorage.getItem('authoring_assistant_conversation:ui-book')).messages; return messages.filter(message => message.proposal && message.status === 'completed').length >= 2 })
    await page.locator('.assistant-inline-edit:visible').first().waitFor(); checks++
    const inline = page.locator('.assistant-inline-edit:visible').first(); await inline.getByRole('button', { name: '接受', exact: true }).click()
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('writing_books'))[0].chapters[0].content.includes('甲先敲了敲门。')); checks++
    assert.ok(!await page.evaluate(() => JSON.parse(localStorage.getItem('worldbook_ui-world')).entries[0].content.includes('习惯先确认'))); checks++
    assert.equal(await page.locator('.assistant-inline-edit:visible').count(), 0); checks++
    // Ctrl+Z shares the manuscript transaction boundary rather than undoing a decoration.
    const editor = page.locator('.tiptap.ProseMirror[contenteditable="true"]:visible').first()
    await editor.click(); await editor.press('Control+z')
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('writing_books'))[0].chapters[0].content.trimEnd() === '甲站在码头。甲推开门。'); checks++
    await page.reload({ waitUntil: 'networkidle' })
    await page.locator('[data-authoring-tool="ai"]:visible').first().click()
    await page.getByRole('button', { name: '查看修改建议', exact: true }).last().waitFor(); checks++
    await page.screenshot({ path: `${screenshots}/${name}-sidebar-answer.png`, fullPage: false })
    await page.locator('.writing-inspector__icon-btn[title="关闭检查器"]:visible').click()
    await page.locator('.writing-unit-gap__action.is-primary').first().click()
    await page.locator('[data-test="rehearsal-current-scene"]:visible').waitFor(); checks++
    assert.equal(await page.locator('[data-authoring-tool="scene"]').count(), 0); checks++
    const composeHost = page.locator('.writing-inspector__compose-host:visible')
    await composeHost.locator('[data-test="block-composer"]').waitFor()
    const colors = await composeHost.evaluate(element => {
      const inspector = element.closest('.writing-inspector')
      return { inputArea: getComputedStyle(element).backgroundColor, panel: getComputedStyle(inspector).backgroundColor, head: getComputedStyle(inspector.querySelector('.writing-inspector__head')).backgroundColor }
    })
    assert.equal(colors.inputArea, colors.panel, `${name}: rehearsal input area matches inspector`); checks++
    assert.equal(colors.head, colors.panel, `${name}: rehearsal heading matches inspector`); checks++
    await composeHost.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${screenshots}/${name}-rehearsal.png`, fullPage: false })
    const currentScene = page.locator('[data-test="rehearsal-current-scene"]:visible')
    await currentScene.locator('summary').first().click()
    await currentScene.locator('[data-test="scene-overview-edit"]').click()
    const timeInput = currentScene.locator('[data-test="curation-time-label"]')
    await timeInput.waitFor(); await timeInput.fill('傍晚')
    await currentScene.locator('[data-test="curation-save"]').click()
    await page.waitForFunction(() => document.querySelector('[data-test="rehearsal-current-scene"] > summary')?.textContent.includes('傍晚')); checks++
    await page.screenshot({ path: `${screenshots}/${name}-current-scene.png`, fullPage: false })
    // Review remains default after reloading; automatic authorization is never persisted.
    await page.locator('[data-authoring-tool="ai"]:visible').first().click()
    const sidebarInput = page.locator('textarea[aria-label="向助手提问"]:visible').first()
    const sidebarPermission = page.locator('details.authoring-knowledge__purpose:visible').first()
    assert.ok((await sidebarPermission.locator('summary').innerText()).includes('审阅修改')); checks++
    await sidebarPermission.locator('summary').click()
    const placement = await sidebarPermission.evaluate(element => {
      const trigger = element.querySelector('summary').getBoundingClientRect(); const menu = element.querySelector('.authoring-knowledge__purpose-menu').getBoundingClientRect()
      return { difference: Math.abs(menu.right - trigger.right), left: menu.left, right: menu.right, top: menu.top, bottom: menu.bottom, viewport: innerWidth, height: innerHeight }
    })
    assert.ok(placement.difference < 3 || placement.left >= 0 && placement.right <= placement.viewport); checks++
    assert.ok(placement.top >= 0 && placement.bottom <= placement.height + 2); checks++
    await page.screenshot({ path: `${screenshots}/${name}-sidebar-permissions.png`, fullPage: false })
    await sidebarPermission.getByLabel('角色与设定', { exact: true }).check()
    await sidebarPermission.getByRole('button', { name: '自动修改', exact: false }).click()
    await sidebarPermission.press('Escape')
    await sidebarInput.fill('把动作改得谨慎些。'); await sidebarInput.press('Enter')
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('writing_books'))[0].chapters[0].content.includes('甲先敲了敲门。')); checks++
    await page.getByRole('button', { name: '撤销本次修改', exact: true }).last().click()
    await page.waitForFunction(() => !JSON.parse(localStorage.getItem('writing_books'))[0].chapters[0].content.includes('甲先敲了敲门。')); checks++
    // A model text completion without delivery cannot write or report success.
    missingDelivery = true
    await sidebarInput.fill('继续修改'); await sidebarInput.press('Enter')
    await page.locator('.authoring-knowledge__error:visible').first().waitFor(); checks++
    assert.ok(!await page.evaluate(() => JSON.parse(localStorage.getItem('writing_books'))[0].chapters[0].content.includes('甲先敲了敲门。'))); checks++
    assert.equal(await page.evaluate(() => Boolean(JSON.parse(localStorage.getItem('authoring_assistant_conversation:ui-book')).messages.at(-1).proposal)), false); checks++
    missingDelivery = false
    await sidebarPermission.locator('summary').click()
    await sidebarPermission.getByRole('button', { name: '只读', exact: false }).click()
    await sidebarPermission.press('Escape')
    await sidebarInput.fill('只读权限也不能修改'); await sidebarInput.press('Enter')
    await page.waitForFunction(() => { const saved = JSON.parse(localStorage.getItem('authoring_assistant_conversation:ui-book')); return saved.status === 'failed' && saved.lastRequest?.question === '只读权限也不能修改' }); checks++
    assert.ok(!await page.evaluate(() => JSON.parse(localStorage.getItem('writing_books'))[0].chapters[0].content.includes('甲先敲了敲门。'))); checks++

    // Scroll history with real wheel input: document capture must not restore the old position.
    const thread = page.locator('.authoring-knowledge__thread:visible').first()
    await thread.evaluate(element => { element.scrollTop = element.scrollHeight })
    await page.waitForTimeout(150)
    const beforeScroll = await thread.evaluate(element => element.scrollTop)
    assert.ok(beforeScroll > 100, 'fixture must overflow the message area'); checks++
    await thread.hover(); await page.mouse.wheel(0, -450); await page.waitForTimeout(350)
    const afterScroll = await thread.evaluate(element => element.scrollTop)
    assert.ok(afterScroll < beforeScroll - 50, `history wheel must move: ${beforeScroll} -> ${afterScroll}`); checks++
    await page.waitForTimeout(250)
    assert.ok(await thread.evaluate(element => element.scrollTop) < beforeScroll - 50, 'scroll position must stay where the author moved it'); checks++
    if (name === 'mobile-dark') {
      await thread.evaluate(element => { element.scrollTop = element.scrollHeight })
      await page.waitForTimeout(150)
      const touchStart = await thread.evaluate(element => element.scrollTop)
      const bounds = await thread.boundingBox()
      const cdp = await context.newCDPSession(page)
      const x = bounds.x + bounds.width / 2
      const y = Math.min(viewport.height - 300, bounds.y + bounds.height / 2)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
      for (let step = 1; step <= 8; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + step * 25 }] })
        await page.waitForTimeout(25)
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(350)
      const touchEnd = await thread.evaluate(element => element.scrollTop)
      assert.ok(touchEnd < touchStart - 50, `touch swipe must reach earlier messages: ${touchStart} -> ${touchEnd}`); checks++
      await cdp.detach()
    }
    await page.screenshot({ path: `${screenshots}/${name}-history-scroll.png`, fullPage: false })
    const oldSession = await page.evaluate(() => JSON.parse(localStorage.getItem('authoring_assistant_conversation:ui-book')).activeSessionId)
    await page.getByRole('button', { name: '重新开始', exact: true }).click()
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('authoring_assistant_conversation:ui-book')).messages.length === 0); checks++
    assert.equal(await page.locator('.authoring-knowledge__answer:visible').count(), 0); checks++
    assert.equal(await sidebarInput.inputValue(), ''); checks++
    await page.reload()
    await page.locator('[data-authoring-tool="ai"]:visible').first().click()
    await sidebarInput.waitFor({ state: 'visible' })
    assert.equal(await page.locator('.authoring-knowledge__answer:visible').count(), 0); checks++
    assert.ok(await page.evaluate(id => JSON.parse(localStorage.getItem('authoring_assistant_conversation:ui-book')).agentSessions.some(session => session.sessionId === id && session.messages.length > 0), oldSession)); checks++
    ordinaryAnswer = true
    await sidebarInput.fill('评论这个开头'); await sidebarInput.press('Enter')
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('authoring_assistant_conversation:ui-book')).status === 'completed'); checks++
    assert.ok((await page.locator('.authoring-knowledge__answer-text:visible').last().innerText()).includes('这是完整讨论')); checks++
    assert.equal(requests.at(-1).maxTokens, 6000); checks++
    assert.ok(requests.at(-1).kernel.blocks.some(block => block.kind === 'manuscript-context' && block.text.includes('甲站在码头'))); checks++
    assert.ok(requests.at(-1).kernel.blocks.some(block => block.kind === 'workspace' && block.text.includes('/works/ui-book'))); checks++
    const origin = await page.evaluate(() => JSON.parse(localStorage.getItem('authoring_assistant_conversation:ui-book')).activeSessionId)
    await sidebarInput.fill('后面这句必须排除'); await sidebarInput.press('Enter')
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('authoring_assistant_conversation:ui-book')).status === 'completed')
    await page.getByRole('button', { name: '从这里继续', exact: true }).first().click()
    await page.waitForFunction(id => { const state = JSON.parse(localStorage.getItem('authoring_assistant_conversation:ui-book')); return state.activeSessionId !== id && state.messages.length === 2 && !state.agentTaskId }, origin); checks++
    assert.equal(await sidebarInput.inputValue(), ''); checks++
    const question = page.locator('.authoring-knowledge__question-row:visible').first()
    const pencil = question.getByRole('button', { name: '编辑提问', exact: true })
    await question.scrollIntoViewIfNeeded()
    await page.mouse.move(0, 0); await sidebarInput.focus()
    const bubble = question.locator('.authoring-knowledge__question')
    const beforeHover = await bubble.boundingBox()
    assert.equal(await pencil.evaluate(element => getComputedStyle(element).opacity), name === 'mobile-dark' ? '1' : '0'); checks++
    await question.hover()
    assert.equal(await pencil.evaluate(element => getComputedStyle(element).opacity), '1'); checks++
    assert.deepEqual(await bubble.boundingBox(), beforeHover); checks++
    const pencilBox = await pencil.boundingBox(); const bubbleBox = await bubble.boundingBox()
    assert.ok(pencilBox.x + pencilBox.width <= bubbleBox.x && pencilBox.y < bubbleBox.y + bubbleBox.height); checks++
    assert.ok(Math.abs(pencilBox.y + pencilBox.height / 2 - bubbleBox.y - bubbleBox.height / 2) < 2, JSON.stringify({ pencilBox, bubbleBox, computed: await question.evaluate(row => { const button = row.querySelector('.authoring-knowledge__edit-trigger'); const bubble = row.querySelector('.authoring-knowledge__question'); const pick = element => { const s = getComputedStyle(element); return { display: s.display, alignItems: s.alignItems, alignSelf: s.alignSelf, margin: s.margin, padding: s.padding, transform: s.transform, height: s.height } }; return { row: pick(row), button: pick(button), bubble: pick(bubble) } }) })); checks++
    await page.screenshot({ path: `${screenshots}/${name}-hover-pencil.png`, fullPage: false })
    await page.mouse.move(0, 0); await pencil.focus()
    assert.equal(await pencil.evaluate(element => getComputedStyle(element).opacity), '1'); checks++
    await pencil.click()
    const edit = page.getByRole('textbox', { name: '编辑提问', exact: true })
    await edit.fill('重新评论这段'); await page.screenshot({ path: `${screenshots}/${name}-edit-question.png`, fullPage: false })
    await page.getByRole('button', { name: '保存并重新生成', exact: true }).click()
    await page.waitForFunction(() => { const state = JSON.parse(localStorage.getItem('authoring_assistant_conversation:ui-book')); return state.status === 'completed' && state.messages[0].question === '重新评论这段' }); checks++
    assert.ok(!requests.at(-1).intent.includes('后面这句必须排除')); checks++
    assert.ok(await page.evaluate(id => JSON.parse(localStorage.getItem('authoring_assistant_conversation:ui-book')).agentSessions.some(session => session.sessionId === id && session.messages.length === 4), origin)); checks++
    await page.screenshot({ path: `${screenshots}/${name}-branch-answer.png`, fullPage: false })
    await page.reload(); await page.locator('[data-authoring-tool="ai"]:visible').first().click()
    assert.ok((await page.locator('.authoring-knowledge__answer-text:visible').last().innerText()).includes('这是完整讨论')); checks++
    assert.deepEqual(errors, []); checks++
    console.log(`${name}: proposal preview / two-domain durable adoption / undo / reload / no page errors passed`)
    await context.close()
  }
  console.log(`assistant-ui: ${checks} checks passed; screenshots ${screenshots}`)
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
