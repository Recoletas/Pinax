import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chromium } from 'playwright'

// Use the author's existing development service; isolated browser data only.
const base = process.env.PINAX_PREVIEW_URL || 'http://127.0.0.1:5173'
const captures = '/tmp/pinax-composable-workspace-captures'
fs.mkdirSync(captures, { recursive: true })
const browser = await chromium.launch({ headless: true })
let checks = 0
try {
  for (const [name, width, dark] of [['desktop-light', 1440, false], ['desktop-dark', 1440, true], ['mobile-dark', 390, true]].filter(item => !process.env.PINAX_WORKSPACE_VIEWPORT || item[0] === process.env.PINAX_WORKSPACE_VIEWPORT)) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, hasTouch: width === 390 })
    await context.addInitScript(({ dark }) => {
      if (localStorage.getItem('workspace-fixture')) return
      localStorage.setItem('workspace-fixture', '1')
      localStorage.setItem('writing_books', JSON.stringify([{ id: 'workspace-book', title: '工作区验收', worldbookId: 'workspace-world', chapters: [{ id: 'workspace-chapter', title: '第一章 港口', content: '林昭在港口停下脚步。\n\n他看见窗内的灯还亮着。' }, { id: 'workspace-chapter-two', title: '第二章 灯塔', content: '林昭沿着石阶走向灯塔。' }] }]))
      localStorage.setItem('worldbook_workspace-world', JSON.stringify({ id: 'workspace-world', name: '港口资料', entries: [{ id: 'workspace-person', name: '林昭', type: 'character', content: '林昭是谨慎的船员。' }], sourceDocuments: [{ id: 'workspace-source', title: '航海记录', kind: 'pasted-text', contentPreview: '港口的潮汐与灯塔记录。', contentHash: 'fixture-hash', chunkIds: [] }] }))
      localStorage.setItem('worldbooks_index', JSON.stringify([{ id: 'workspace-world', name: '港口资料' }]))
      localStorage.setItem('pinax-device-language', JSON.stringify({ uiLocale: 'zh-CN', assistantLanguage: '' }))
      localStorage.setItem('app_theme', dark ? 'dark' : 'light')
    }, { dark })
    await context.addInitScript(() => {
      const NativeWebSocket = window.WebSocket
      window.__roomSockets = []
      window.WebSocket = class RoomFixtureSocket {
        static OPEN = 1; static CONNECTING = 0; static CLOSED = 3; static CLOSING = 2
        constructor(url, protocols) {
          if (!String(url).includes('/ws/rooms')) return new NativeWebSocket(url, protocols)
          this.readyState = 0; this.sent = []; this.closeCount = 0
          window.__roomSockets.push(this)
          queueMicrotask(() => { this.readyState = 1; this.onopen?.({}) })
        }
        receive(message) { this.onmessage?.({ data: JSON.stringify(message) }) }
        send(raw) {
          const message = JSON.parse(raw); this.sent.push(message)
          if (message.type === 'room.join') queueMicrotask(() => this.receive({ type: 'room.joined', payload: { memberId: 'fixture-self', room: { slug: message.roomSlug }, members: [{ id: 'fixture-self', nickname: message.nickname, role: 'participant' }], lastSeq: 0 } }))
        }
        close() { this.readyState = 3; this.closeCount++; this.onclose?.({}) }
      }
    })
    const page = await context.newPage()
    async function returnToWorkspace() {
      const sideBack = page.getByRole('button', { name: '回到工作区', exact: true })
      if (await sideBack.isVisible()) await sideBack.click()
      else await page.getByRole('button', { name: /^(回到正文|返回原页面)$/ }).click()
    }
    const errors = []
    page.on('pageerror', error => { errors.push(error.message); console.error('PAGEERROR', error.message) })
    let videoSubmissions = 0
    let videoStatus = 'running'
    let agentSubmissions = 0
    let agentChanges = null
    let finishAgent
    let agentReply = new Promise(resolve => { finishAgent = resolve })
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/healthz')) return route.fulfill({ json: { ok: true, assistantProtocolVersion: 2 } })
      if (url.pathname.endsWith('/model')) return route.fulfill({ json: { model: 'fixture-model', provider: 'fixture', keyMasked: 'configured' } })
      if (url.pathname.endsWith('/policies') && route.request().method() === 'POST') {
        const input = route.request().postDataJSON()
        return route.fulfill({ json: { ok: true, policy: { ...input, chapterIds: input.scope === 'current' ? [input.chapterId] : input.chapterIds, policyId: 'fixture-policy', revision: 1, expiresAt: Date.now() + 3600000 } } })
      }
      if (url.pathname.endsWith('/policies/check')) return route.fulfill({ json: { ok: true, policy: route.request().postDataJSON() } })
      if (/\/v1\/pinax\/tasks$/.test(url.pathname) && route.request().method() === 'POST') {
        agentSubmissions++
        const input = route.request().postDataJSON()
        await agentReply
        const event = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`
        const answer = '工作区验收回答：林昭在港口等待灯塔的信号。'
        return route.fulfill({ contentType: 'text/event-stream', body: event('task.started', { taskId: input.taskId, bookId: input.bookId, status: 'running' })
          + (agentChanges ? event('tool.result', { toolName: 'submit_edit_proposals', result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, changes: agentChanges }) }] } }) : '')
          + event('tool.result', { toolName: 'complete_assistant_task', result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, intent: agentChanges ? 'edit' : 'answer', outcome: agentChanges ? 'proposal' : 'answer', message: answer }) }] } })
          + event('text.delta', { schemaVersion: 1, type: 'text.delta', content: answer }) + event('task.completed', { taskId: input.taskId, bookId: input.bookId, status: 'completed', finalText: answer }) })
      }
      if (url.pathname === '/api/media/jobs' && route.request().method() === 'POST') { videoSubmissions++; return route.fulfill({ json: { id: 'workspace-video-job', status: videoStatus } }) }
      if (url.pathname === '/api/media/jobs/workspace-video-job/cancel') { videoStatus = 'cancelled'; return route.fulfill({ json: { id: 'workspace-video-job', status: videoStatus } }) }
      if (url.pathname === '/api/media/jobs/workspace-video-job') return route.fulfill({ json: { id: 'workspace-video-job', status: videoStatus } })
      return route.fulfill({ json: { ok: true, localFiles: false, projects: [], tasks: [], data: [] } })
    })
    await page.goto(`${base}/authoring?bookId=workspace-book&chapterId=workspace-chapter`, { waitUntil: 'networkidle' })
    const editor = page.locator('.workspace-primary-group .ProseMirror').first()
    await editor.waitFor({ state: 'attached' })
    await page.evaluate(() => { window.__originalWorkspaceEditor = document.querySelector('.workspace-primary-group .ProseMirror'); window.__originalToolRail = document.querySelector('.writing-tool-rail') })
    await page.locator('[data-authoring-tool="ai"]').click()
    const assistant = page.locator('.authoring-assistant-workspace:visible')
    const draft = assistant.locator('textarea[aria-label="向助手提问"]')
    await draft.fill('林昭现在在什么地方？'); await draft.press('Enter')
    await page.waitForFunction(() => document.querySelector('.authoring-knowledge__thinking'))
    await assistant.getByRole('button', { name: '资料', exact: true }).click()
    await page.locator('[data-test="workspace-sources-view"]').waitFor({ state: 'visible' })
    await page.getByRole('button', { name: '助手运行中', exact: true }).waitFor()
    checks++
    finishAgent()
    try {
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('authoring_assistant_conversation:workspace-book'))?.messages?.some(message => message.status === 'completed' && message.text?.includes('工作区验收回答')))
    } catch (error) {
      console.log(JSON.stringify({ agentSubmissions, fixture: await page.evaluate(() => localStorage.getItem('authoring_assistant_conversation:workspace-book')) }))
      throw error
    }
    assert.equal(agentSubmissions, 1); checks++
    assert.equal(await page.evaluate(() => document.querySelector('.workspace-primary-group .ProseMirror') === window.__originalWorkspaceEditor), true); checks++
    await page.getByRole('button', { name: '关闭 资料', exact: true }).click()
    await page.locator('[data-authoring-tool="annotations"]').click()
    await page.getByRole('button', { name: '打开工作区导航', exact: true }).click()
    await page.locator('#pinax-workspace-navigation').getByRole('button', { name: '资料', exact: true }).click()
    await page.locator('[data-test="workspace-sources-view"]').waitFor({ state: 'visible' })
    assert.match(page.url(), /\/authoring\?/); checks++
    assert.equal(await page.locator('.writing-inspector.is-open').isVisible(), false); checks++
    if (width > 900) {
      assert.equal(await page.locator('.workspace-writing-tools .writing-tool-rail').count(), 1); checks++
      assert.equal(await page.locator('.workspace-primary-group .wall__main').evaluate(element => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length), 2); checks++
      assert.equal(await page.locator('.writing-tool-rail').evaluate(element => element === window.__originalToolRail), true); checks++
      assert.equal(await page.evaluate(() => document.querySelector('.workspace-writing-tools').getBoundingClientRect().left >= document.querySelector('.workspace-reference-group').getBoundingClientRect().right - 2), true); checks++
      const inspector = await page.locator('.writing-inspector.is-open').elementHandle()
      await page.locator('[data-authoring-tool="annotations"]').click()
      assert.equal(await page.locator('.writing-inspector.is-open').isVisible(), true); checks++
      assert.equal(await page.locator('.workspace-reference-group').isVisible(), false); checks++
      assert.equal(await page.locator('.workspace-primary-group .writing-tool-rail').evaluate(element => element === window.__originalToolRail), true); checks++
      await page.getByRole('button', { name: '返回已打开内容', exact: true }).click()
      assert.equal(await inspector.evaluate(element => element === document.querySelector('.writing-inspector.is-open')), true); checks++
      assert.equal(await page.locator('.writing-inspector.is-open').isVisible(), false); checks++
      await page.locator('[data-authoring-tool="worldbook"]').click()
      await page.locator('[data-authoring-inspector="worldbook"]').waitFor({ state: 'visible' })
      assert.equal(await page.locator('.workspace-reference-group').isVisible(), false); checks++
      await page.locator('.authoring-setting-workbench').getByRole('button', { name: '查看与管理', exact: true }).waitFor({ state: 'visible' })
      await page.screenshot({ animations: 'disabled', path: `${captures}/${name}-original-setting-inspector.png` })
      await page.locator('[data-authoring-inspector="worldbook"]').getByRole('button', { name: '查看与管理', exact: true }).click()
      await page.locator('[data-test="workspace-sources-view"]:visible').waitFor()
      assert.equal(await page.locator('.workspace-primary-group .ProseMirror').first().isVisible(), true); checks++
      assert.equal(await page.locator('[data-authoring-inspector="worldbook"]').isVisible(), false); checks++
      await page.screenshot({ animations: 'disabled', path: `${captures}/${name}-sources-inspector.png` })
    }
    assert.equal(await page.evaluate(() => document.querySelector('.workspace-primary-group .ProseMirror') === window.__originalWorkspaceEditor), true); checks++
    const archivedChecks = await page.evaluate(async () => {
      const archive = await import('/src/services/worldbook/worldbookSourceArchive.js')
      const retrieval = await import('/src/services/agents/storyagent/assistantSourceRetrieval.js')
      const world = await import('/src/stores/worldStore.js')
      const content = Array.from({ length: 12 }, (_, i) => `第${i + 1}段灯塔记录。${'潮水与港口。'.repeat(1200)}`).join('\n\n')
      const documents = await archive.archiveSourceDocuments([{ id: 'workspace-long-source', title: '长篇航海档案', kind: 'pasted-text', content }])
      const shared = await archive.archiveSourceDocuments([{ id: 'shared-a', title: '共享 A', content: '灯塔记录。' }, { id: 'shared-b', title: '共享 B', content: '灯塔记录。' }])
      const hits = await retrieval.retrieveAssistantSourceChunks([...documents, ...shared], '灯塔')
      const result = await world.useWorldStore().updateWorldbookDurable('workspace-world', { sourceDocuments: [...world.readWorldbookSnapshot('workspace-world').sourceDocuments, ...documents] })
      return { saved: result.ok, nonzero: hits.some(hit => hit.sourceOffset > 0), aliases: hits.filter(hit => ['shared-a', 'shared-b'].includes(hit.sourceDocumentId)).map(hit => hit.id) }
    })
    assert.equal(archivedChecks.saved, true); checks++
    assert.equal(archivedChecks.nonzero, true); checks++
    assert.equal(new Set(archivedChecks.aliases).size, 2); checks++
    await page.getByRole('button', { name: '长篇航海档案', exact: true }).click()
    const longReference = page.locator('[data-test="workspace-reference-view"]:visible')
    await longReference.locator('.workspace-reference-chunks p').first().waitFor()
    assert.ok(await longReference.locator('.workspace-reference-chunks > p').count() <= 8); checks++
    const firstPage = await longReference.locator('.workspace-reference-chunks').innerText()
    await longReference.getByRole('button', { name: '下一页', exact: true }).click()
    await page.waitForFunction(first => document.querySelector('.workspace-reference-body:not([style*="display: none"]) .workspace-reference-chunks')?.textContent && document.querySelector('.workspace-reference-body:not([style*="display: none"]) .workspace-reference-chunks').textContent !== first, firstPage)
    assert.notEqual(await longReference.locator('.workspace-reference-chunks').innerText(), firstPage); checks++
    if (width > 900) {
      const secondPage = await longReference.locator('.workspace-reference-chunks').innerText()
      await longReference.evaluate(element => { window.__longReader = element })
      await page.locator('[data-authoring-tool="worldbook"]').click()
      await page.locator('.authoring-setting-workbench').waitFor({ state: 'visible' })
      await page.getByRole('button', { name: '返回已打开内容', exact: true }).click()
      assert.equal(await longReference.evaluate(element => element === window.__longReader), true); checks++
      assert.equal(await longReference.locator('.workspace-reference-chunks').innerText(), secondPage); checks++
    }
    await page.getByRole('button', { name: '关闭 长篇航海档案', exact: true }).click()
    await page.getByRole('button', { name: '航海记录', exact: true }).click()
    await page.locator('[data-test="workspace-reference-view"]:visible').waitFor()
    await page.locator('[data-test="workspace-reference-view"]:visible').getByText('港口的潮汐与灯塔记录。', { exact: true }).waitFor()
    assert.match(await page.locator('[data-test="workspace-reference-view"]:visible').innerText(), /港口的潮汐/); checks++
    const sourceElement = await page.locator('[data-test="workspace-reference-view"]:visible').evaluate(el => { window.__sourceView = el; return true })
    assert.equal(sourceElement, true)
    await page.getByRole('button', { name: '移到主区', exact: true }).click()
    assert.equal(await page.locator('.workspace-primary-group').getAttribute('inert'), null); checks++
    assert.equal(await page.locator('.workspace-original-primary').getAttribute('inert'), ''); checks++
    assert.equal(await page.locator('[data-test="workspace-reference-view"]:visible').evaluate(el => el === window.__sourceView), true); checks++
    await page.getByRole('button', { name: '放回旁边', exact: true }).click()
    await page.screenshot({ animations: 'disabled', path: `${captures}/${name}.png` })
    await returnToWorkspace()
    await editor.waitFor({ state: 'visible' })
    assert.equal(await page.evaluate(() => document.querySelector('.workspace-primary-group .ProseMirror') === window.__originalWorkspaceEditor), true); checks++
    await page.getByRole('button', { name: '返回已打开内容', exact: true }).click()
    await page.reload({ waitUntil: 'networkidle' })
    await page.locator('[data-test="workspace-reference-view"]:visible').waitFor()
    assert.match(await page.locator('[data-test="workspace-reference-view"]:visible').innerText(), /航海记录/); checks++
    await page.getByRole('button', { name: '关闭 航海记录', exact: true }).click()
    await page.locator('[data-test="workspace-sources-view"]:visible').waitFor()
    await page.getByRole('button', { name: '添加资料', exact: true }).click()
    await page.locator('dialog[open]').waitFor()
    assert.equal(await page.evaluate(async () => {
      const app = document.querySelector('#app').__vue_app__
      const result = await app.config.globalProperties.$router.push({ name: 'welcome' })
      return Boolean(result) && location.pathname === '/authoring'
    }), true); checks++
    await page.locator('dialog[open]').getByRole('button', { name: /关闭/ }).first().click()
    await page.locator('dialog[open]').waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: '关闭 资料', exact: true }).click()
    await editor.waitFor({ state: 'visible' })
    assert.equal(await page.locator('.workspace-reference-group:visible').count(), 0); checks++
    await page.evaluate(() => {
      localStorage.setItem('narrative_assets_v1', JSON.stringify([{ id: 'workspace-asset', projectId: 'workspace-book', title: '码头对白', content: '他问：灯塔今晚为什么熄灭？', status: 'accepted', kind: 'inspiration', sourceRefs: [{ refType: 'chapter', refId: 'workspace-chapter', projectId: 'workspace-book' }] }]))
      localStorage.setItem('comic_pages_v1', JSON.stringify([{ id: 'workspace-comic', projectId: 'workspace-book', title: '港口漫画', panels: [], layout: 'strip-4' }]))
      localStorage.setItem('storyboard_documents_v1', JSON.stringify([{ id: 'workspace-storyboard', projectId: 'workspace-book', source: { title: '港口镜头', sourceType: 'prose-card', sourceId: 'fixture' }, currentVersionId: 'workspace-version', versions: [{ versionId: 'workspace-version', shots: [{ nodeId: 'shot-1', sequence: 1, content: '灯塔映在海面上。' }], parameters: {} }] }]))
    })
    for (const [title, expected] of [['第一章 港口', '林昭在港口'], ['码头对白', '灯塔今晚'], ['港口漫画', '港口漫画'], ['港口镜头', '生成镜头视频']]) {
      await page.getByRole('button', { name: '返回已打开内容', exact: true }).count().then(async count => { if (count) await page.getByRole('button', { name: '返回已打开内容', exact: true }).click() })
      const back = page.getByRole('button', { name: '回到工作区', exact: true }).locator('visible=true')
      if (await back.count()) await back.click()
      await page.getByLabel('打开内容', { exact: true }).click()
      const menuBounds = await page.locator('.workspace-reference-menu-body').boundingBox()
      assert.ok(menuBounds.x >= -1 && menuBounds.x + menuBounds.width <= width + 1); checks++
      if (title === '第一章 港口') await page.screenshot({ animations: 'disabled', path: `${captures}/${name}-reference-menu.png` })
      await page.locator('.workspace-reference-menu-body').getByRole('button', { name: title, exact: true }).click()
      await page.waitForFunction(expected => document.querySelector('.workspace-reference-body:not([style*="display: none"])')?.textContent.includes(expected), expected)
      checks++
    }
    const video = page.locator('.video-panel.is-embedded:visible')
    await video.evaluate(el => { window.__videoPanel = el })
    await page.getByRole('button', { name: '移到主区', exact: true }).click()
    assert.equal(await video.evaluate(el => el === window.__videoPanel), true); checks++
    await page.screenshot({ animations: 'disabled', path: `${captures}/${name}-video.png` })
    await video.getByRole('button', { name: '生成当前镜头', exact: true }).click()
    await video.getByRole('button', { name: '停止等待', exact: true }).waitFor()
    await page.getByRole('button', { name: '关闭 港口镜头', exact: true }).click()
    assert.equal(await video.count(), 1); checks++
    await returnToWorkspace()
    await page.evaluate(async () => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push({ name: 'comics', query: { bookId: 'workspace-book' } }))
    await page.getByRole('button', { name: '返回已打开内容', exact: true }).click()
    assert.equal(await video.evaluate(el => el === window.__videoPanel), true); checks++
    assert.equal(videoSubmissions, 1); checks++
    assert.equal(await page.evaluate(async () => {
      const router = document.querySelector('#app').__vue_app__.config.globalProperties.$router
      const result = await router.push({ name: 'welcome' })
      return Boolean(result) && router.currentRoute.value.name === 'comics'
    }), true); checks++
    await video.getByRole('button', { name: '停止等待', exact: true }).click()
    await video.getByText('已停止等待。视频渠道可能仍在生成，请在渠道记录中确认。', { exact: true }).waitFor()
    checks++
    await returnToWorkspace()
    const sessionBefore = await page.evaluate(async () => {
      const { useGameStore } = await import('/src/stores/gameStore.js')
      const { useWorldStore } = await import('/src/stores/worldStore.js')
      await useWorldStore().setActiveWorldbook('workspace-world')
      const game = useGameStore()
      game.createSession({ title: '港口跑团', worldbookId: 'workspace-world' })
      game.messages = [{ id: 'workspace-message', role: 'assistant', content: '港口的灯还亮着。', timestamp: Date.now() }]
      game.saveCurrentSession()
      game.flushSaveSessions()
      return { id: game.currentSessionId, count: game.messages.length }
    })
    await page.evaluate(async sessionId => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push({ name: 'experience', query: { worldbookId: 'workspace-world', sessionId } }), sessionBefore.id)
    try { await page.locator('.ws-topstrip').getByRole('button', { name: '资料', exact: true }).click({ timeout: 10000 }) }
    catch (error) { console.log(JSON.stringify({ stage: 'experience', url: page.url(), errors, header: await page.locator('.ws-topstrip').evaluate(el => ({ html: el.outerHTML, componentProps: el.__vueParentComponent?.props, actions: getComputedStyle(el.querySelector('.ws-topstrip__actions')).display, button: [...el.querySelectorAll('button')].map(button => ({ text: button.textContent, visibility: getComputedStyle(button).visibility, display: getComputedStyle(button).display, rect: button.getBoundingClientRect().toJSON(), hidden: button.closest('[aria-hidden="true"]')?.className })), groups: document.querySelector('.workspace-content-groups').className })), text: (await page.locator('body').innerText()).slice(0, 1500) })); throw error }
    await page.locator('[data-test="workspace-sources-view"]:visible').waitFor()
    const sessionAfter = await page.evaluate(async () => { const { useGameStore } = await import('/src/stores/gameStore.js'); const game = useGameStore(); return { id: game.currentSessionId, count: game.messages.length } })
    assert.deepEqual(sessionAfter, sessionBefore); checks++
    assert.match(page.url(), /\/experience\?/); checks++
    await page.screenshot({ animations: 'disabled', path: `${captures}/${name}-roleplay-sources.png` })
    await returnToWorkspace()
    await page.evaluate(async () => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push({ name: 'settings-sources', query: { bookId: 'workspace-book', import: 'add' } }))
    await page.locator('dialog[open]').waitFor()
    assert.equal(await page.evaluate(async () => {
      const router = document.querySelector('#app').__vue_app__.config.globalProperties.$router
      const result = await router.push({ name: 'authoring', query: { bookId: 'workspace-book' } })
      return Boolean(result) && router.currentRoute.value.name === 'settings-sources'
    }), true); checks++
    await page.locator('dialog[open]').getByRole('button', { name: /关闭/ }).first().click()
    await page.locator('dialog[open]').waitFor({ state: 'hidden' })
    assert.equal(await page.getByRole('button', { name: '添加资料', exact: true }).count(), 1); checks++
    await page.evaluate(async () => document.querySelector('#app').__vue_app__.config.globalProperties.$router.replace({ name: 'settings-sources', query: { bookId: 'workspace-book', sourceId: 'workspace-source' } }))
    await page.locator('[data-test="workspace-reference-view"]:visible').getByText('港口的潮汐与灯塔记录。', { exact: true }).waitFor()
    assert.match(page.url(), /sourceId=workspace-source/); checks++
    await returnToWorkspace()
    await page.evaluate(async () => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push({ name: 'authoring', query: { bookId: 'workspace-book', chapterId: 'workspace-chapter', view: 'assistant' } }))
    const conversation = page.locator('.authoring-assistant-workspace:visible')
    await conversation.waitFor()
    const closeIndex = conversation.locator('.authoring-assistant-workspace__nav-close')
    if (await closeIndex.isVisible()) await closeIndex.click()
    await conversation.getByRole('button', { name: '重新开始', exact: true }).click()
    agentReply = new Promise(resolve => { finishAgent = resolve })
    await conversation.locator('textarea[aria-label="向助手提问"]').fill('查完资料后告诉我灯塔的位置。')
    await conversation.locator('textarea[aria-label="向助手提问"]').press('Enter')
    await page.waitForFunction(() => document.querySelector('.authoring-knowledge__thinking'))
    await page.evaluate(async () => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push({ name: 'comics', query: { bookId: 'workspace-book' } }))
    assert.match(page.url(), /\/comics\?/); checks++
    assert.equal(await page.locator('.authoring-assistant-workspace').count(), 0); checks++
    await page.locator('.shell-assistant-task[aria-label="助手运行中"]').waitFor()
    await page.getByRole('button', { name: '关闭 工作区验收', exact: true }).click()
    assert.equal(await page.locator('.ws-tab[data-tab-key^="project:workspace-book:"]').count(), 1); checks++
    assert.match(page.url(), /\/comics\?/); checks++
    assert.equal(await page.evaluate(async () => {
      const router = document.querySelector('#app').__vue_app__.config.globalProperties.$router
      const failure = await router.push({ name: 'authoring', query: { bookId: 'different-project' } })
      return Boolean(failure) && router.currentRoute.value.name === 'comics'
    }), true); checks++
    finishAgent()
    await page.locator('.shell-assistant-task[aria-label="助手有新结果"]').waitFor()
    assert.equal(await page.locator('.workspace-host-notice').count(), 0); checks++
    assert.equal(agentSubmissions, 2); checks++
    await page.screenshot({ animations: 'disabled', path: `${captures}/${name}-assistant-background.png` })
    await page.locator('.shell-assistant-task').click()
    await conversation.waitFor()
    if (await closeIndex.isVisible()) await closeIndex.click()
    await conversation.getByText('工作区验收回答：林昭在港口等待灯塔的信号。', { exact: true }).waitFor()
    assert.match(page.url(), /chapterId=workspace-chapter/); checks++
    assert.equal(agentSubmissions, 2); checks++
    await conversation.getByRole('button', { name: '重新开始', exact: true }).click()
    await conversation.getByLabel('助手权限', { exact: true }).first().click()
    await conversation.getByRole('button', { name: '自动修改 在授权范围内直接修改', exact: true }).click()
    await conversation.getByRole('button', { name: '自动修改 在授权范围内直接修改', exact: true }).press('Escape')
    await conversation.locator('textarea[aria-label="向助手提问"]').click()
    const manuscriptBefore = await page.evaluate(async () => {
      const { getChapterMarkdown } = await import('/src/services/writing/writingDocumentSchema.js')
      return getChapterMarkdown(JSON.parse(localStorage.getItem('writing_books')).find(book => book.id === 'workspace-book').chapters[0])
    })
    agentChanges = [{ kind: 'chapter', targetId: 'workspace-chapter', operation: 'append', field: 'content', before: '', after: '林昭走向灯塔，确认了信号来源。', reason: '将灯塔线索接入下一步行动' }]
    agentReply = new Promise(resolve => { finishAgent = resolve })
    await conversation.locator('textarea[aria-label="向助手提问"]').fill('接着正文补上林昭走向灯塔的行动。')
    await conversation.locator('textarea[aria-label="向助手提问"]').press('Enter')
    await page.waitForFunction(() => document.querySelector('.authoring-knowledge__thinking'))
    await page.evaluate(async () => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push({ name: 'settings-sources', query: { bookId: 'workspace-book' } }))
    finishAgent()
    await page.locator('.shell-assistant-task[aria-label="助手有新结果"]').waitFor()
    const manuscriptInBackground = await page.evaluate(async () => {
      const { getChapterMarkdown } = await import('/src/services/writing/writingDocumentSchema.js')
      return getChapterMarkdown(JSON.parse(localStorage.getItem('writing_books')).find(book => book.id === 'workspace-book').chapters[0])
    })
    assert.equal(manuscriptInBackground, manuscriptBefore); checks++
    await page.locator('.shell-assistant-task').click()
    await conversation.waitFor()
    if (await closeIndex.isVisible()) await closeIndex.click()
    await conversation.getByRole('button', { name: '查看修改建议', exact: true }).click()
    await page.locator('.assistant-edit-review:visible').getByRole('button', { name: '采用这组修改', exact: true }).first().click()
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('writing_books')).find(book => book.id === 'workspace-book').chapters[0].content.includes('林昭走向灯塔，确认了信号来源。'))
    assert.equal(agentSubmissions, 3); checks++
    await page.locator('.assistant-edit-review:visible').getByRole('button', { name: '撤销这次修改', exact: true }).first().click()
    await page.waitForFunction(() => !JSON.parse(localStorage.getItem('writing_books')).find(book => book.id === 'workspace-book').chapters[0].content.includes('林昭走向灯塔，确认了信号来源。'))
    checks++
    assert.equal(await page.locator('[data-test="workspace-modules"]').count(), 0); checks++
    async function openModule(label) {
      if (label === '对照资料') {
        await page.locator('.workspace-reference-menu summary').click()
        await page.locator('.workspace-reference-menu-body').getByRole('button', { name: '本书资料', exact: true }).click()
        return
      }
      if (label === '对照设定') {
        await openModule('设定')
        await page.getByRole('button', { name: '放回旁边', exact: true }).click()
        return
      }
      await page.getByRole('button', { name: '打开工作区导航', exact: true }).click()
      const drawer = page.locator('.shell-drawer.open')
      const button = drawer.locator('.workspace-project-nav').getByRole('button', { name: label, exact: true })
      if (!(await button.isVisible())) await drawer.locator('.workspace-project-nav details summary').click()
      await button.click()
      await page.locator('.shell-overlay').waitFor({ state: 'hidden' })
    }
    await openModule('设定')
    const settingsView = page.locator('[data-test="workspace-settings-view"]:visible')
    await settingsView.getByRole('button', { name: '创作基调', exact: true }).click()
    await settingsView.locator('[data-setting-field-card] textarea').first().waitFor()
    await settingsView.evaluate(element => { window.__settingsWorkspaceEditor = element })
    const settingField = settingsView.locator('[data-setting-field-card] textarea').first()
    await settingField.fill('港口位于北方海岸，灯塔以蓝色信号引航。')
    await settingField.press('Control+s')
    await page.waitForFunction(() => localStorage.getItem('worldbook_workspace-world')?.includes('港口位于北方海岸'))
    checks++
    await openModule('正文')
    await page.locator('.workspace-primary-group .ProseMirror').first().waitFor({ state: 'visible' })
    await openModule('设定')
    assert.equal(await settingsView.evaluate(element => element === window.__settingsWorkspaceEditor), true); checks++
    assert.equal(await settingField.inputValue(), '港口位于北方海岸，灯塔以蓝色信号引航。'); checks++
    await page.screenshot({ animations: 'disabled', path: `${captures}/${name}-integrated-settings.png` })
    await openModule('正文')
    if (width > 900) {
      await openModule('对照设定')
      assert.equal(await settingsView.evaluate(element => element === window.__settingsWorkspaceEditor), true); checks++
      assert.equal(await page.locator('.workspace-primary-group .ProseMirror').first().isVisible(), true); checks++
      await page.waitForFunction(() => { const slot = document.querySelector('.workspace-content-tab.is-active')?.closest('.workspace-content-tab-slot'); const strip = slot?.parentElement; if (!strip) return false; const box = slot.getBoundingClientRect(), bounds = strip.getBoundingClientRect(); return box.left >= bounds.left - 2 && box.right <= bounds.right + 2 }); checks++
      await page.screenshot({ animations: 'disabled', path: `${captures}/${name}-integrated-beside.png` })
    }
    for (const [label, path] of [['资料', null], ['漫画', /\/comics\?/], ['视频', /\/prose-essay\?/], ['跑团', /\/experience\?/]]) {
      await openModule(label)
      if (label === '漫画' || label === '视频') { await page.locator(`[data-module-editor="${label === '漫画' ? 'comics' : 'prose-essay'}"]:visible`).waitFor(); checks++ }
      else if (label === '跑团') { await page.locator('[data-module-editor="experience"]:visible .game-page').waitFor(); checks++ }
      else if (path) { await page.waitForURL(path); assert.match(page.url(), path); checks++ }
      else { await page.locator('[data-test="workspace-sources-view"]:visible').waitFor(); checks++ }
      if (label === '漫画' || label === '视频') {
        const moduleView = page.locator(`[data-module-editor="${label === '漫画' ? 'comics' : 'prose-essay'}"]:visible`)
        await moduleView.locator(label === '漫画' ? '.comic-studio' : '.prose-essay-page').waitFor({ state: 'visible' })

        await moduleView.getByRole('combobox', { name: '选择制作章节' }).selectOption('workspace-chapter')
        await moduleView.getByRole('button', { name: label === '漫画' ? '用作漫画素材' : '加入镜头画布', exact: true }).click()
        await page.waitForFunction(() => JSON.parse(localStorage.getItem('narrative_assets_v1') || '[]').some(asset => asset.source?.type === 'chapter' && asset.sourceRefs?.some(ref => ref.refType === 'chapter' && ref.refId === 'workspace-chapter')))
        checks++
        if (label === '漫画') {
          await moduleView.getByRole('button', { name: '整页制作', exact: true }).click()
          await moduleView.getByRole('button', { name: '新建漫画页', exact: true }).click()
          await moduleView.getByRole('button', { name: '当前格', exact: true }).click()
          const visual = moduleView.getByRole('textbox', { name: '当前格画面描述', exact: true })
          await visual.fill('船员站在灯塔下，抬头看向蓝色信号灯。')
          await visual.blur()
          await page.waitForFunction(async () => { const repo = await import('/src/services/media/comicPageStore.js'); return repo.listComicPages({ projectId: 'workspace-book' }).some(page => page.panels.some(panel => panel.visual === '船员站在灯塔下，抬头看向蓝色信号灯。')) })
          checks++
        } else {
          await page.waitForFunction(() => JSON.parse(localStorage.getItem('pinax-prose-workspace:v1:workspace-book') || '{}').workspace?.cards?.some(card => card.projectId === 'workspace-book'))
          checks++
        }
        await moduleView.evaluate(element => { window.__creativeModule = element.querySelector('.comic-studio,.prose-essay-page') })
        await moduleView.getByRole('button', { name: '对照原章', exact: true }).click()
        assert.equal(await moduleView.evaluate(element => element.querySelector('.comic-studio,.prose-essay-page') === window.__creativeModule), true); checks++
        if (width > 900) { assert.equal(await page.locator('.workspace-primary-group .ProseMirror').first().isVisible(), true); checks++ }
        await openModule('正文')
        await openModule(label)
        assert.equal(await moduleView.evaluate(element => element.querySelector('.comic-studio,.prose-essay-page') === window.__creativeModule), true); checks++
        if (width > 900) {
          await openModule('对照资料')
          assert.equal(await moduleView.isVisible(), true); checks++
          assert.equal(await page.locator('[data-test="workspace-sources-view"]:visible').isVisible(), true); checks++
          await page.screenshot({ animations: 'disabled', path: `${captures}/${name}-creative-sources-${label}.png` })
          await openModule(label)
          await page.getByRole('button', { name: '放回旁边', exact: true }).click()
          assert.equal(await moduleView.isVisible(), true); checks++
          assert.equal(await page.locator('.workspace-primary-group .ProseMirror').first().isVisible(), true); checks++
          await page.screenshot({ animations: 'disabled', path: `${captures}/${name}-creative-beside-${label}.png` })
          await page.getByRole('button', { name: '移到主区', exact: true }).click()
        }
      }
      assert.equal(await page.locator('.ws-tab[data-tab-key^="project:workspace-book:"]').count(), 1); checks++
      await page.screenshot({ animations: 'disabled', path: `${captures}/${name}-integrated-${label}.png` })
      if (label === '视频') {
        await page.evaluate(() => { window.__originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key === 'pinax-prose-workspace:v1:workspace-book') throw Error('fixture quota'); return window.__originalSetItem.call(this, key, value) } })
        await page.getByRole('button', { name: '关闭 视频', exact: true }).click()
        assert.equal(await page.locator('[data-module-editor="prose-essay"]:visible .prose-essay-page').isVisible(), true); checks++
        await page.evaluate(() => { Storage.prototype.setItem = window.__originalSetItem; delete window.__originalSetItem })
        await page.getByRole('button', { name: '关闭 视频', exact: true }).click()
        assert.equal(await page.locator('[data-module-editor="prose-essay"]').count(), 0); checks++
        await openModule('视频')
        await page.locator('[data-module-editor="prose-essay"]:visible .prose-essay-page').waitFor()
        await page.waitForFunction(() => document.querySelector('[data-module-editor="prose-essay"] .prose-top__id-count')?.textContent.includes('1'))
        checks++
      }
    }
    await openModule('素材')
    const materialView = page.locator('[data-module-editor="materials"]:visible')
    await materialView.locator('.writing-page').waitFor()
    await materialView.getByRole('button', { name: '新素材', exact: true }).click()
    await page.getByLabel('素材标题', { exact: true }).fill('灯塔画面素材')
    await page.getByRole('button', { name: '创建', exact: true }).click()
    await materialView.getByRole('button', { name: 'Markdown', exact: true }).click()
    const materialInput = materialView.locator('.markdown-textarea')
    await materialInput.fill('船员沿着石阶走向灯塔，海面反射着蓝色光芒。')
    await materialInput.blur()
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('narrative_assets_v1') || '[]').some(asset => asset.title === '灯塔画面素材' && asset.content.includes('海面反射着蓝色光芒') && asset.projectId === 'workspace-book'))
    checks++
    await materialView.evaluate(element => { window.__materialEditor = element.querySelector('.writing-page') })
    await page.screenshot({ animations: 'disabled', path: `${captures}/${name}-materials-editor.png` })
    if (width > 900) {
      await page.getByRole('button', { name: '放回旁边', exact: true }).click()
      assert.equal(await materialView.evaluate(element => element.querySelector('.writing-page') === window.__materialEditor), true); checks++
      await materialView.getByRole('radio', { name: '内容', exact: true }).click()
      assert.equal(await materialInput.inputValue(), '船员沿着石阶走向灯塔，海面反射着蓝色光芒。'); checks++
      const materialLabel = await materialView.locator('.manuscript-top__no').boundingBox()
      assert.ok(materialLabel.width > materialLabel.height); checks++
      await page.screenshot({ animations: 'disabled', path: `${captures}/${name}-materials-beside.png` })
      await page.getByRole('button', { name: '移到主区', exact: true }).click()
    }

    await materialView.getByRole('button', { name: '导当前到画布', exact: true }).click()
    const director = page.locator('[data-module-editor="prose-essay"]:visible')
    await director.locator('.prose-essay-page').waitFor()
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('pinax-prose-workspace:v1:workspace-book') || '{}').workspace?.cards?.some(card => card.content.includes('海面反射着蓝色光芒')))
    checks++
    await openModule('素材')
    assert.equal(await materialView.evaluate(element => element.querySelector('.writing-page') === window.__materialEditor), true); checks++
    assert.equal(await materialInput.inputValue(), '船员沿着石阶走向灯塔，海面反射着蓝色光芒。'); checks++
    await page.evaluate(async () => {
      const repo = await import('/src/services/media/narrativeAssets.js')
      const asset = repo.listNarrativeAssets().find(asset => asset.title === '灯塔画面素材')
      if (!repo.updateNarrativeAssetDurable(asset.id, { content: '来源已更新：灯塔暂时熄灭。' }).ok) throw Error('fixture update failed')
    })
    await materialInput.fill('尚未保存的本地改写。')
    await materialInput.blur()
    await materialView.getByRole('button', { name: '重新载入', exact: true }).waitFor()
    assert.equal(await materialInput.inputValue(), '尚未保存的本地改写。'); checks++
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('narrative_assets_v1')).find(asset => asset.title === '灯塔画面素材').content), '来源已更新：灯塔暂时熄灭。'); checks++
    await page.getByRole('button', { name: '关闭 素材与插画', exact: true }).click()
    assert.equal(await materialView.isVisible(), true); checks++
    page.once('dialog', dialog => dialog.accept())
    await materialView.getByRole('button', { name: '重新载入', exact: true }).click()
    assert.equal(await materialInput.inputValue(), '来源已更新：灯塔暂时熄灭。'); checks++
    assert.equal(await materialView.getByRole('button', { name: '重新载入', exact: true }).count(), 0); checks++
    if (width <= 900) await materialView.getByRole('radio', { name: '工具', exact: true }).click()
    await materialView.getByRole('button', { name: '插画生成', exact: true }).click()
    await materialView.locator('.image-generation-workbench').waitFor()
    await page.screenshot({ animations: 'disabled', path: `${captures}/${name}-materials-illustration.png` })
    await openModule('跑团')
    await page.locator('.game-page').waitFor()
    await openModule('条目')
    const entriesView = page.locator('[data-module-editor="settings-worldbook-advanced"]:visible')
    await entriesView.locator('[data-test="editor-tab-entries"]').click()
    const entryText = entriesView.getByRole('textbox', { name: '条目正文', exact: true })
    await entryText.waitFor()
    await entriesView.evaluate(element => { window.__entriesEditor = element.querySelector('.worldbook-page') })
    await entryText.fill('林昭保留了新的航海记录，尚未保存。')
    await openModule('正文')
    await openModule('条目')
    assert.equal(await entryText.inputValue(), '林昭保留了新的航海记录，尚未保存。'); checks++
    assert.equal(await entriesView.evaluate(element => element.querySelector('.worldbook-page') === window.__entriesEditor), true); checks++
    await page.getByRole('button', { name: '关闭 条目', exact: true }).click()
    assert.equal(await entriesView.isVisible(), true); checks++
    await entriesView.getByRole('button', { name: '保存条目', exact: true }).click()
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('worldbook_workspace-world')).entries.some(entry => entry.content === '林昭保留了新的航海记录，尚未保存。'))
    checks++
    await entryText.fill('不能覆盖更新的本地草稿。')
    await page.evaluate(async () => { const { useWorldStore } = await import('/src/stores/worldStore.js'); await useWorldStore().updateEntry('workspace-world', 'workspace-person', { content: '旁栏已确认的新资料。' }) })
    await entriesView.getByRole('button', { name: '保存条目', exact: true }).click()
    await entriesView.getByText(/条目已在别处更新/).waitFor()
    assert.equal(await entryText.inputValue(), '不能覆盖更新的本地草稿。'); checks++
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('worldbook_workspace-world')).entries.find(entry => entry.id === 'workspace-person').content), '旁栏已确认的新资料。'); checks++
    page.once('dialog', dialog => dialog.accept())
    await entriesView.getByRole('button', { name: '重新载入', exact: true }).click()
    await entryText.waitFor()
    assert.equal(await entryText.inputValue(), '旁栏已确认的新资料。'); checks++
    await page.screenshot({ animations: 'disabled', path: `${captures}/${name}-entries-editor.png` })
    if (width > 900) {
      await page.getByRole('button', { name: '放回旁边', exact: true }).click()
      await page.screenshot({ animations: 'disabled', path: `${captures}/${name}-entries-beside.png` })
      assert.equal(await entriesView.evaluate(element => element.querySelector('.worldbook-page') === window.__entriesEditor), true); checks++
      await page.getByRole('button', { name: '移到主区', exact: true }).click()
    }
    await page.evaluate(async () => { const { useGeographyStore } = await import('/src/stores/geographyStore.js'); const geo = useGeographyStore(); geo.loadAll(); geo.saveVoronoiConfig({ seed: 'workspace-map', width: 960, height: 640, gridPoints: 600, stateCount: 4, burgCount: 12, heightmapTemplate: 'continents', landRatio: .4, stylePreset: 'topographic' }) })
    await openModule('地图')
    const mapView = page.locator('[data-module-editor="settings-world-map"]:visible')
    await mapView.locator('.world-map-page').waitFor()
    await mapView.locator('.voronoi-container .info-bar').waitFor({ timeout: 60000 })
    const canvas = mapView.locator('.voronoi-canvas')
    await canvas.evaluate(element => { window.__mapCanvas = element })
    await page.screenshot({ animations: 'disabled', path: `${captures}/${name}-map-editor.png` })
    checks++
    if (width > 900) {
      await page.getByRole('button', { name: '放回旁边', exact: true }).click()
      await page.waitForFunction(() => { const canvas = window.__mapCanvas; const parent = canvas.parentElement; return canvas.width > 0 && Math.abs(canvas.width / devicePixelRatio - parent.clientWidth) < 4 && parent.clientWidth < 680 })
      assert.equal(await canvas.evaluate(element => element === window.__mapCanvas), true); checks++
      await page.screenshot({ animations: 'disabled', path: `${captures}/${name}-map-beside.png` })
      await page.getByRole('button', { name: '移到主区', exact: true }).click()
    }
    await openModule('正文')
    await openModule('地图')
    assert.equal(await canvas.evaluate(element => element === window.__mapCanvas), true); checks++
    await page.getByRole('button', { name: '关闭 地图', exact: true }).first().click()
    await openModule('条目')
    await page.getByRole('button', { name: '关闭 条目', exact: true }).first().click()
    await openModule('联机')
    const online = page.locator('[data-module-editor="online-experience"]:visible')
    await online.getByRole('textbox', { name: '昵称', exact: true }).fill('验收作者')
    await online.getByRole('textbox', { name: '房间码', exact: true }).fill('workspace-room')
    await online.getByRole('button', { name: '加入房间', exact: true }).click()
    await online.locator('.game-page').waitFor()
    await page.getByRole('button', { name: '联机房间 · workspace-room', exact: true }).first().waitFor()
    assert.equal(await page.locator('.game-page').count(), 1); checks++
    await online.evaluate(element => { window.__onlineEditor = element.querySelector('.online-page') })
    const joined = await page.evaluate(() => window.__roomSockets.length)
    assert.equal(joined, 1); checks++
    await openModule(width > 900 ? '对照资料' : '资料')
    await page.locator('[data-test="workspace-sources-view"]:visible').waitFor()
    checks++
    await page.getByRole('button', { name: '联机房间 · workspace-room', exact: true }).first().click()
    await online.waitFor()
    await page.screenshot({ animations: 'disabled', path: `${captures}/${name}-online-room.png` })
    await openModule('正文')
    await page.locator('.workspace-primary-group .ProseMirror').first().waitFor({ state: 'visible' })
    await page.evaluate(() => window.__roomSockets[0].receive({ type: 'event.append', payload: { id: 'background-chat', seq: 1, type: 'chat.message', payload: { text: '后台仍收到队友消息。', nickname: '队友', actorId: 'other' } } }))
    assert.equal(await page.evaluate(() => window.__roomSockets[0].closeCount), 0); checks++
    await page.getByRole('button', { name: '联机房间 · workspace-room', exact: true }).first().click()
    await online.getByText('后台仍收到队友消息。', { exact: true }).waitFor()
    assert.equal(await online.evaluate(element => element.querySelector('.online-page') === window.__onlineEditor), true); checks++
    assert.equal(await page.evaluate(() => window.__roomSockets.length), joined); checks++
    await openModule('跑团')
    assert.equal(await page.locator('.game-page').count(), 1); checks++
    assert.match(page.url(), /\/authoring\?/); checks++
    await page.getByRole('button', { name: '关闭 联机', exact: true }).click()
    assert.equal(await online.isVisible(), true); checks++
    await page.getByRole('button', { name: '关闭 工作区验收', exact: true }).click()
    assert.equal(await page.locator('.ws-tab[data-tab-key^="project:workspace-book:"]').count(), 1); checks++
    const roomToggle = online.getByRole('button', { name: /房间 · 1 人/ })
    if (await roomToggle.isVisible()) await roomToggle.click()
    await online.getByRole('button', { name: '离开房间', exact: true }).click()
    await online.getByRole('button', { name: '加入房间', exact: true }).waitFor()
    assert.equal(await page.evaluate(() => window.__roomSockets[0].closeCount), 1); checks++
    await page.getByRole('button', { name: '关闭 联机', exact: true }).click()
    assert.equal(await page.locator('[data-module-editor="online-experience"]').count(), 0); checks++
    await openModule('跑团')
    await page.locator('.game-page').waitFor()
    await page.evaluate(async () => { const { useGameStore } = await import('/src/stores/gameStore.js'); useGameStore().isLoading = true })
    await openModule('漫画')
    await page.locator('[data-module-editor="comics"]:visible .comic-studio').waitFor()
    await page.getByRole('button', { name: '跑团生成中', exact: true }).click()
    assert.equal(await page.locator('.game-page').isVisible(), true); checks++
    await openModule('正文')
    assert.equal(await page.locator('.workspace-primary-group .ProseMirror').first().isVisible(), true); checks++
    assert.equal(await page.locator('[data-module-editor="experience"]').count(), 1); checks++
    await page.getByRole('button', { name: '关闭 工作区验收', exact: true }).click()
    assert.equal(await page.locator('.ws-tab[data-tab-key^="project:workspace-book:"]').count(), 1); checks++
    await page.evaluate(async () => { const { useGameStore } = await import('/src/stores/gameStore.js'); useGameStore().isLoading = false })
    const roleplayBeforeRelink = await page.evaluate(async () => {
      const { useGameStore } = await import('/src/stores/gameStore.js')
      const game = useGameStore()
      return { id: game.currentSessionId, world: game.worldId, messages: game.messages.length }
    })
    async function changeFixtureBinding(worldbookId) {
      await page.evaluate(async id => {
        const repo = await import('/src/services/writing/writingBooksRepository.js')
        const books = repo.loadWritingBooks()
        books.find(book => book.id === 'workspace-book').worldbookId = id
        if (!repo.saveWritingBooksDurable(books).ok) throw Error('fixture relink failed')
      }, worldbookId)
    }
    await changeFixtureBinding('not-the-session-world')
    assert.equal(await page.locator('[data-test="workspace-modules"]').count(), 0); checks++
    checks++
    await changeFixtureBinding('workspace-world')
    await page.getByRole('button', { name: '打开工作区导航', exact: true }).waitFor()
    checks++
    assert.deepEqual(await page.evaluate(async () => {
      const { useGameStore } = await import('/src/stores/gameStore.js'); const game = useGameStore()
      return { id: game.currentSessionId, world: game.worldId, messages: game.messages.length }
    }), roleplayBeforeRelink); checks++
    await page.getByRole('button', { name: '关闭 工作区验收', exact: true }).click()
    assert.equal(await page.locator('.ws-tab[data-tab-key^="project:workspace-book:"]').count(), 0); checks++
    // An existing layout must obey an explicit room URL, with one scene owner.
    await page.evaluate(() => {
      const resource = { type: 'online-editor', bookId: 'workspace-book', worldbookId: 'workspace-world', id: '', roomSlug: 'old-room' }
      localStorage.setItem('pinax-workspace-views:v1:["workspace-book",""]', JSON.stringify({ version: 1, views: [{ id: 'restore-room', resource }], activeId: 'restore-room', mainModuleId: 'restore-room' }))
    })
    await page.goto(`${base}/experience/online/explicit-room?bookId=workspace-book&worldbookId=workspace-world`)
    const restoredOnline = page.locator('[data-module-editor="online-experience"]:visible')
    await restoredOnline.locator('.game-page').waitFor()
    await page.getByRole('button', { name: '联机房间 · explicit-room', exact: true }).first().waitFor()
    assert.equal(await page.locator('.game-page').count(), 1); checks++
    assert.deepEqual(await page.evaluate(() => window.__roomSockets.flatMap(socket => socket.sent.filter(message => message.type === 'room.join').map(message => message.roomSlug))), ['explicit-room']); checks++
    const restoredToggle = restoredOnline.getByRole('button', { name: /房间 · 1 人/ })
    await restoredToggle.click()
    await restoredOnline.getByRole('button', { name: '离开房间', exact: true }).click()
    await restoredOnline.locator('.online-page__lobby').waitFor({ state: 'visible' })
    assert.equal(await page.evaluate(() => window.__roomSockets[0].closeCount), 1); checks++
    await page.getByRole('button', { name: '关闭 联机', exact: true }).click()
    await page.evaluate(async () => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push({ name: 'authoring', query: { bookId: 'workspace-book', chapterId: 'workspace-chapter' } }))
    try { await page.locator('.workspace-primary-group .ProseMirror').waitFor({ state: 'visible' }) }
    catch (error) {
      console.log(JSON.stringify(await page.evaluate(() => {
        let component = document.querySelector('[data-test="workspace-content-groups"]')?.__vueParentComponent
        while (component && !component.setupState?.host) component = component.parent
        return { stage: 'resource-groups', url: location.href, state: component?.setupState.host.state, text: document.body.innerText.slice(0, 1200) }
      })))
      throw error
    }
    async function openContent(title, destination) {
      await page.getByLabel('打开内容', { exact: true }).click()
      const picker = page.locator('.workspace-reference-menu-body')
      await picker.getByRole('button', { name: destination, exact: true }).click()
      await picker.getByRole('searchbox').fill(title)
      await picker.locator('.workspace-resource-item').getByText(title, { exact: true }).first().click()
    }
    await openContent('航海记录', '主区')
    const groupedSource = page.locator('.workspace-primary-group [data-test="workspace-reference-view"]:visible')
    await groupedSource.getByText('港口的潮汐与灯塔记录。', { exact: true }).waitFor()
    await groupedSource.evaluate(element => { window.__groupedSource = element })
    assert.equal(await page.locator('.workspace-main-header').isVisible(), true); checks++
    await openContent('林昭', '旁边')
    const groupedEntry = page.locator('.workspace-reference-group [data-test="workspace-reference-view"]:visible')
    await groupedEntry.locator('h1').getByText('林昭', { exact: true }).waitFor()
    if (width > 900) { assert.equal(await groupedSource.isVisible(), true); checks++ }
    await page.screenshot({ animations: 'disabled', path: `${captures}/${name}-resource-groups.png` })
    await page.getByRole('button', { name: '移到主区', exact: true }).click()
    await page.locator('.workspace-main-header .workspace-content-tab').getByText('航海记录', { exact: true }).click()
    assert.equal(await groupedSource.evaluate(element => element === window.__groupedSource), true); checks++
    await page.keyboard.press('Control+p')
    const quickPicker = page.locator('.workspace-reference-menu-body')
    await quickPicker.getByRole('searchbox').fill('第二章 灯塔')
    await quickPicker.getByRole('searchbox').press('Enter')
    const secondEditor = page.locator('.workspace-primary-group .ProseMirror:visible')
    await secondEditor.getByText('林昭沿着石阶走向灯塔。', { exact: true }).waitFor()
    assert.match(page.url(), /chapterId=workspace-chapter-two/); checks++
    assert.equal(await secondEditor.getAttribute('contenteditable'), 'true'); checks++
    await secondEditor.fill('林昭登上灯塔，蓝色信号照亮了海面。')
    await secondEditor.press('Control+s')
    await page.waitForFunction(async () => {
      const { loadWritingBooks } = await import('/src/services/writing/writingBooksRepository.js')
      const { getChapterMarkdown } = await import('/src/services/writing/writingDocumentSchema.js')
      return getChapterMarkdown(loadWritingBooks().find(book => book.id === 'workspace-book').chapters.find(chapter => chapter.id === 'workspace-chapter-two')).includes('蓝色信号照亮了海面')
    }); checks++
    await page.locator('.workspace-main-header .workspace-content-tab').getByText('第一章 港口', { exact: true }).click()
    await page.waitForURL(/chapterId=workspace-chapter(?:&|$)/)
    assert.equal(await page.locator('.workspace-primary-group .ProseMirror:visible').innerText().then(text => text.includes('蓝色信号照亮了海面')), false); checks++
    await page.locator('.workspace-main-header .workspace-content-tab').getByText('第二章 灯塔', { exact: true }).click()
    await secondEditor.getByText('林昭登上灯塔，蓝色信号照亮了海面。', { exact: true }).waitFor()
    checks++
    if (width > 900) {
      await page.locator('.workspace-main-header .workspace-content-tab').getByText('第二章 灯塔', { exact: true }).dragTo(page.locator('.workspace-main-header .workspace-content-tab').getByText('航海记录', { exact: true }))
      const order = await page.locator('.workspace-main-header .workspace-content-tab').allTextContents()
      assert.ok(order.findIndex(title => title.includes('第二章 灯塔')) < order.findIndex(title => title.includes('航海记录'))); checks++
    }
    const layoutBeforeReload = await page.evaluate(() => JSON.parse(localStorage.getItem('pinax-workspace-views:v1:["workspace-book",""]')))
    await page.reload({ waitUntil: 'networkidle' })
    await page.locator('.workspace-primary-group .ProseMirror:visible').getByText('林昭登上灯塔，蓝色信号照亮了海面。', { exact: true }).waitFor()
    const layoutAfterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('pinax-workspace-views:v1:["workspace-book",""]')))
    assert.deepEqual(layoutAfterReload.views.map(view => [view.id, view.group]), layoutBeforeReload.views.map(view => [view.id, view.group])); checks++
    await page.screenshot({ animations: 'disabled', path: `${captures}/${name}-chapter-tabs.png` })
    assert.deepEqual(errors, []); checks++
    await context.close()
  }
  console.log(JSON.stringify({ checks, captures, providerCalls: 0 }))
} finally { await browser.close() }
