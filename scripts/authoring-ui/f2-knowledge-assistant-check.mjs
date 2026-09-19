/* eslint-disable no-console */
// F2-4 real-page Gate: project-grounded knowledge assistant, exact evidence,
// stale reconciliation, read-only queries, editor-surface restoration and phone sheet.
// Runs in isolated Playwright contexts; never mutates the user's browser profile.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const FIXTURE_DIR = path.resolve('tmp/authoring-rollout')
const OUT_DIR = path.resolve('/tmp/pinax-f2-knowledge')
const FINAL_DIR = path.resolve('/tmp/pinax-f2-final')
const state = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-state.json'), 'utf8'))
const baseStorage = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-localstorage.json'), 'utf8'))
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.mkdirSync(FINAL_DIR, { recursive: true })

function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

function isolatedStorage() {
  const storage = deepClone(baseStorage)
  const books = JSON.parse(storage.writing_books || '[]')
  const sourceBook = books.find((book) => String(book.id) === String(state.bookId))
  const sourceChapter = deepClone(sourceBook?.chapters?.[0] || {})
  const firstNode = sourceChapter?.editorDocument?.content?.[0]?.content?.[0]
  if (firstNode) {
    const sentinel = '艾德加跨项目哨兵只属于另一部作品。'
    firstNode.content = [{ type: 'text', text: sentinel }]
    firstNode.attrs = {
      ...(firstNode.attrs || {}),
      rawMarkdown: sentinel,
      originalText: sentinel,
      nodeRevision: Number(firstNode.attrs?.nodeRevision || 0) + 1
    }
  }
  books.push({
    id: 'f2-knowledge-other-project',
    title: '不应被读取的作品',
    worldbookId: '',
    chapters: [{ ...sourceChapter, id: 'f2-other-chapter', title: '跨项目哨兵章' }]
  })
  storage.writing_books = JSON.stringify(books)
  return storage
}

function check(results, label, pass, detail = '') {
  const result = { label, pass: Boolean(pass), detail: String(detail).slice(0, 900) }
  results.push(result)
  console.log(`${result.pass ? 'PASS' : 'FAIL'} ${label}${result.detail ? ` — ${result.detail}` : ''}`)
}

function formalProjectSnapshot(entries) {
  const included = {}
  for (const [key, value] of Object.entries(entries)) {
    if (
      key === 'writing_books'
      || key === 'worldbooks_index'
      || /worldbook|outline|memory_candidates|narrative_asset|authoring_document/i.test(key)
    ) included[key] = value
  }
  return JSON.stringify(included)
}

function sourceBlocks(payload) {
  return (payload?.envelope?.blocks || []).filter((block) => (
    Array.isArray(block?.sourceRefs) && block.sourceRefs.length
  ))
}

async function installKnowledgeProvider(page) {
  const requests = []
  await page.addInitScript(() => {
    localStorage.setItem('text_model_configs', JSON.stringify([{
      id: 'f2-knowledge-provider',
      name: 'F2 knowledge deterministic provider',
      providerId: 'openai',
      baseUrl: 'https://f2-knowledge.invalid/v1',
      apiKey: 'f2-knowledge-test-key',
      model: 'f2-knowledge-model'
    }]))
    localStorage.setItem('text_model_selected', 'f2-knowledge-provider')
    localStorage.setItem('pinax_agent_runtime_policy_v1', JSON.stringify({ enabled: true, passiveHints: { 'writing-inline': false } }))
  })
  await page.route('**/api/advisor/task', async (route) => {
    let payload = null
    try { payload = route.request().postDataJSON() } catch { /* handled below */ }
    if (!payload || payload.taskType !== 'authoring.knowledge.query') {
      return route.fulfill({
        status: 501,
        contentType: 'application/json',
        body: JSON.stringify({ error: `F2 knowledge fixture does not serve ${payload?.taskType || 'malformed request'}` })
      })
    }
    const blocks = sourceBlocks(payload)
    const refs = [...new Set(blocks.flatMap((block) => block.sourceRefs || []))]
    const edgarRefs = [...new Set(blocks
      .filter((block) => String(block.content || '').includes('艾德加'))
      .flatMap((block) => block.sourceRefs || []))]
    const isFree = payload.options?.knowledgeIntent === 'free'
    const worldRefs = refs.filter((ref) => ref.startsWith('worldbook-entry:')).slice(0, 2)
    const claims = isFree ? [] : [{
      text: '艾德加曾在正文中出现。',
      confidence: edgarRefs.length ? 'supported' : 'unsupported',
      evidenceRefs: edgarRefs.slice(0, 4)
    }]
    if (!isFree && worldRefs.length) {
      claims.push({
        text: '设定资料中存在相关记录，可点击依据回原文。',
        confidence: 'supported',
        evidenceRefs: worldRefs
      })
    }
    const knowledgeAnswer = {
      answer: isFree
        ? '可以先把这一场的选择压缩成一个不可兼得的取舍，再决定落笔。'
        : (edgarRefs.length ? `已在 ${edgarRefs.length} 处正文片段找到艾德加。` : '当前资料中没有找到足够依据。'),
      claims,
      missingInformation: edgarRefs.length || isFree ? [] : ['没有找到艾德加的正文记录。'],
      calculations: []
    }
    requests.push({ payload, refs, edgarRefs, isFree })
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        taskType: payload.taskType,
        advice: JSON.stringify(knowledgeAnswer),
        result: { task: payload.taskType, mode: 'review', summary: knowledgeAnswer.answer, knowledgeAnswer },
        meta: { fixture: 'f2-knowledge' }
      })
    })
  })
  return requests
}

async function createPage(browser, viewport, { knowledgeSeamFlag = false } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const storage = isolatedStorage()
  await context.addInitScript(({ flag, snapshot }) => {
    localStorage.clear()
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
    localStorage.setItem('app_ui_zoom', '1')
    if (flag) localStorage.setItem('pinax_knowledge_read_model_enabled', '1')
  }, { flag: knowledgeSeamFlag, snapshot: storage })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console:${message.text()}`) })
  const requests = await installKnowledgeProvider(page)
  await page.goto(`${BASE}/authoring?bookId=${state.bookId}`, { waitUntil: 'domcontentloaded' })
  await page.locator('.writing-tool-rail').waitFor({ timeout: 30000 })
  await page.locator('.wall__dossier .ProseMirror').waitFor({ timeout: 30000 })
  await page.waitForTimeout(900)
  return { context, page, requests, errors }
}

async function fillAndAsk(page, question) {
  const assistant = page.locator('.authoring-knowledge')
  const composer = assistant.getByRole('textbox', { name: '向助手提问' })
  await composer.fill(question)
  await assistant.getByRole('button', { name: '发送问题' }).click()
  await assistant.locator('.authoring-knowledge__thinking').waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(120)
  return assistant
}

const browser = await chromium.launch()
const results = []

try {
  const desktop = await createPage(browser, { width: 1440, height: 900 })
  const page = desktop.page
  const editor = page.locator('.wall__dossier .ProseMirror')
  await editor.locator('p').nth(2).evaluate((paragraph) => {
    paragraph.closest('.ProseMirror')?.focus()
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
    const textNode = walker.nextNode()
    if (!textNode || !textNode.textContent?.length) throw new Error('selection fixture paragraph has no text')
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, Math.min(2, textNode.textContent.length))
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }))
  })
  // selection-change 与 PM bookmark 同一帧收敛后再模拟作者移向 rail。
  await page.waitForTimeout(48)
  const surfaceBefore = await page.evaluate(() => ({
    selection: window.getSelection()?.toString() || '',
    scrollTop: document.querySelector('.wall__dossier [data-notebook-scroll-owner], .wall__dossier .writing-notebook-editor__scroll')?.scrollTop || 0
  }))
  await page.locator('[data-authoring-tool="ai"]').click()
  const assistant = page.locator('.authoring-knowledge')
  await assistant.waitFor({ state: 'visible' })
  check(results, '右 rail 入口命名为助手', await page.locator('[data-authoring-tool="ai"]').getAttribute('aria-label') === '助手')
  // 20260917 UI 线起快捷任务从按钮组改为 composer 的“问答范围”下拉。
  const intentOptions = await assistant.locator('.authoring-knowledge__tasks select option').allTextContents()
  check(results, '助手首页只呈现成熟快捷任务', intentOptions.join('|') === '查设定|找伏笔|理线索|挖角色|算数值|问全书|自由问', intentOptions.join('|'))
  check(results, '助手首页不暴露诊断内部术语', !/manifest|receipt|candidate ID|token budget|上下文数量/i.test(await assistant.innerText()))
  await page.locator('.writing-inspector__icon-btn[title="关闭检查器"]').click()
  await page.waitForTimeout(120)
  const surfaceAfter = await page.evaluate(() => ({
    selection: window.getSelection()?.toString() || '',
    activeInEditor: Boolean(document.activeElement?.closest?.('.wall__dossier .ProseMirror')),
    scrollTop: document.querySelector('.wall__dossier [data-notebook-scroll-owner], .wall__dossier .writing-notebook-editor__scroll')?.scrollTop || 0
  }))
  check(results, '打开并关闭助手恢复正文选区、焦点和滚动', surfaceBefore.selection.length === 2 && surfaceAfter.selection === surfaceBefore.selection && surfaceAfter.activeInEditor && surfaceAfter.scrollTop === surfaceBefore.scrollTop, JSON.stringify({ surfaceBefore, surfaceAfter }))

  await page.locator('[data-authoring-tool="ai"]').click()
  const formalBefore = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  await fillAndAsk(page, '艾德加此前在哪几章出现？')
  await assistant.getByText(/已在 \d+ 处正文片段找到艾德加/).waitFor({ timeout: 30000 })
  const firstRequest = desktop.requests[0]
  check(results, '生产查询使用 canonical knowledge task', firstRequest?.payload?.taskType === 'authoring.knowledge.query')
  check(results, '冻结证据引用唯一且只来自本次序列化块', firstRequest?.refs?.length > 0 && new Set(firstRequest.refs).size === firstRequest.refs.length)
  check(results, '问全书检索到艾德加正文证据', firstRequest?.edgarRefs?.length >= 1, JSON.stringify(firstRequest?.edgarRefs || []))
  check(results, '跨项目哨兵未进入 provider 上下文', !JSON.stringify(firstRequest?.payload?.envelope || {}).includes('艾德加跨项目哨兵'))
  const formalAfter = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  check(results, '资料查询对正文、设定、大纲、素材与记忆零写入', formalProjectSnapshot(formalAfter) === formalProjectSnapshot(formalBefore))
  await assistant.locator('.authoring-knowledge__evidence summary').click()
  const evidenceRows = assistant.locator('.authoring-knowledge__evidence-list > button')
  check(results, '回答折叠展示可定位原文依据', await evidenceRows.count() >= 1)
  await page.screenshot({ path: path.join(OUT_DIR, 'knowledge-answer-1440.png'), fullPage: false })
  await page.screenshot({ path: path.join(FINAL_DIR, '03-assistant-answer-1440.png'), fullPage: false })

  const providerCountBeforeMissing = desktop.requests.length
  await fillAndAsk(page, '泽尔布星人的出生地在哪里？')
  await assistant.getByText('当前资料中没有找到足够依据。', { exact: true }).last().waitFor({ timeout: 10000 })
  check(results, '不存在的设定直接承认无资料且不调用模型', desktop.requests.length === providerCountBeforeMissing)

  await assistant.locator('.authoring-knowledge__tasks select').selectOption('free')
  await fillAndAsk(page, '这一场的选择写得太散，应该怎么收束？')
  await assistant.getByText('自由建议', { exact: true }).last().waitFor({ timeout: 10000 })
  check(results, '自由问明确标为自由建议且不伪造证据', await assistant.locator('.authoring-knowledge__answer').last().locator('.authoring-knowledge__evidence').count() === 0)

  // 回到第一份回答并打开一条正文证据；随后真实编辑该 node，旧回答必须 stale。
  const manuscriptEvidenceRow = evidenceRows.filter({ hasText: '正文' }).first()
  await manuscriptEvidenceRow.click()
  await page.waitForTimeout(350)
  const sourceVisible = (await editor.innerText()).includes('艾德加')
  check(results, '点击正文依据能跳到包含该证据的章节/节点', sourceVisible)
  await page.keyboard.press('End')
  await page.keyboard.insertText('（F2修订）')
  await page.waitForTimeout(1600)
  await assistant.getByText(/资料已更新/).first().waitFor({ timeout: 10000 })
  check(results, '来源修改后旧回答保留并标记 stale', await assistant.getByText(/已在 \d+ 处正文片段找到艾德加/).count() === 1)
  await page.locator('.writing-inspector__icon-btn[title="关闭检查器"]').click()
  await page.locator('[data-authoring-tool="ai"]').click()
  check(results, '重新打开助手仍可返回原回答', await assistant.getByText(/已在 \d+ 处正文片段找到艾德加/).count() === 1)
  check(results, '1440 无页面级横向溢出', await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth))
  check(results, '桌面旅程无控制台错误', desktop.errors.length === 0, desktop.errors.join('\n'))
  await desktop.context.close()

  // 查询必须直接读取尚未等到自动保存的当前内存稿，不能要求作者先写入
  // localStorage，也不能在查询层偷偷触发保存。
  const liveDraft = await createPage(browser, { width: 1440, height: 900 })
  const liveEditor = liveDraft.page.locator('.wall__dossier .ProseMirror')
  const liveSentinel = '玄紫未存印记'
  await liveEditor.locator('p').first().click()
  await liveDraft.page.keyboard.press('End')
  await liveDraft.page.keyboard.insertText(liveSentinel)
  await liveDraft.page.locator('[data-authoring-tool="ai"]').click()
  await fillAndAsk(liveDraft.page, `${liveSentinel}在哪里？`)
  const liveRequest = liveDraft.requests[0]
  check(results, '尚未自动保存的当前正文进入冻结证据', JSON.stringify(liveRequest?.payload?.envelope || {}).includes(liveSentinel))
  check(results, '内存稿证据仍使用当前项目稳定正文 ref', (liveRequest?.refs || []).some((ref) => ref.startsWith('node:fogch-1:')), JSON.stringify(liveRequest?.refs || []))
  check(results, '内存稿查询无控制台错误', liveDraft.errors.length === 0, liveDraft.errors.join('\n'))
  await liveDraft.context.close()

  // 双栏是平级可编辑面：从副栏第二章打开助手时，character 查询应按
  // 第二章的 target 截止，不能借主栏第一章，也不能泄漏后续章节。
  const dualTarget = await createPage(browser, { width: 1440, height: 900 })
  const dualPage = dualTarget.page
  await dualPage.locator('[data-authoring-tool="dual"]').click()
  const dualPane = dualPage.locator('.authoring-dual-pane')
  await dualPane.waitFor({ state: 'visible' })
  const dualDirectory = dualPane.locator('.authoring-dual-pane__directory')
  if (!await dualDirectory.isVisible().catch(() => false)) {
    await dualPane.getByRole('button', { name: '切换副窗内容' }).click()
  }
  await dualPane.locator('.authoring-dual-pane__chapter[data-chapter-id="fogch-2"]').click()
  const dualEditor = dualPane.locator('.ProseMirror')
  await dualEditor.locator('p').first().click()
  await dualPage.waitForTimeout(48)
  await dualPage.locator('[data-authoring-tool="ai"]').click()
  const dualAssistant = dualPage.locator('.authoring-knowledge')
  await dualAssistant.waitFor({ state: 'visible' })
  await dualAssistant.locator('.authoring-knowledge__tasks select').selectOption('character')
  await fillAndAsk(dualPage, '艾德加此前做过什么？')
  const dualRequest = dualTarget.requests[0]
  const dualManuscriptRefs = (dualRequest?.refs || []).filter((ref) => ref.startsWith('node:'))
  check(results, '双栏第二章查询使用副栏 target', dualManuscriptRefs.some((ref) => ref.startsWith('node:fogch-2:')), JSON.stringify(dualManuscriptRefs))
  check(results, '双栏 target 排除后续章节', dualManuscriptRefs.every((ref) => /^node:fogch-[12]:/.test(ref)), JSON.stringify(dualManuscriptRefs))
  check(results, '双栏资料查询无控制台错误', dualTarget.errors.length === 0, dualTarget.errors.join('\n'))
  await dualTarget.context.close()

  const mobile = await createPage(browser, { width: 390, height: 844 })
  await mobile.page.locator('[data-authoring-tool="ai"]').click()
  const mobileAssistant = mobile.page.locator('.authoring-knowledge')
  await mobileAssistant.waitFor({ state: 'visible' })
  const mobileGeometry = await mobile.page.evaluate(() => {
    const assistantNode = document.querySelector('.authoring-knowledge')
    const inspector = document.querySelector('.writing-inspector')
    // 快捷任务自 20260917 起是 composer 内的下拉选择，命中区与发送键一起量。
    const controls = [...document.querySelectorAll('.authoring-knowledge__tasks select, .authoring-knowledge__tasks button, .authoring-knowledge__whole-book, .authoring-knowledge__send')]
    return {
      assistantHeight: assistantNode?.getBoundingClientRect().height || 0,
      inspectorWidth: inspector?.getBoundingClientRect().width || 0,
      minTaskHeight: Math.min(...controls.map((node) => node.getBoundingClientRect().height)),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }
  })
  check(results, '390 助手使用完整 sheet 而非压窄正文', mobileGeometry.assistantHeight > 500 && mobileGeometry.inspectorWidth >= 360, JSON.stringify(mobileGeometry))
  check(results, '390 快捷任务命中区至少 44px', mobileGeometry.minTaskHeight >= 44, mobileGeometry.minTaskHeight)
  check(results, '390 无水平滚动', mobileGeometry.overflow === 0, mobileGeometry.overflow)
  await mobile.page.screenshot({ path: path.join(OUT_DIR, 'knowledge-home-390.png'), fullPage: false })
  check(results, '移动旅程无控制台错误', mobile.errors.length === 0, mobile.errors.join('\n'))
  await mobile.context.close()
} finally {
  await browser.close()
}

// --- 知识接缝（round-2 K24）浏览器运行时闭环 ---------------------------------
// 默认关闭的 UI 回归已由上方页面旅程覆盖；本节在**真实浏览器运行时**里
// 动态 import 生产 session 模块（走同一 dev server 转换管线），用内存
// 仓库跑接缝四段流：默认关/精确查询溯源/取消终态/越权拒绝/来源改后失效。
// 这不是点击旅程（接缝无 UI 入口，按计划 default-off），但它在浏览器里
// 执行的正是将随 I0 启用的模块本体。
async function runKnowledgeSeamBrowserGate(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const seamStorage = isolatedStorage()
  await context.addInitScript((snapshot) => {
    localStorage.clear()
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
    localStorage.setItem('app_ui_zoom', '1')
  }, seamStorage)
  const page = await context.newPage()
  const seamErrors = []
  page.on('pageerror', (error) => seamErrors.push(`pageerror:${error.message}`))
  await page.goto(`${BASE}/authoring`, { waitUntil: 'domcontentloaded' })
  const seam = await page.evaluate(async () => {
    const sessionModule = await import('/src/services/agents/authoring/authoringKnowledgeQuerySession.js')
    const answerModule = await import('/src/services/agents/authoring/authoringKnowledgeAnswerContract.js')
    const writingModule = await import('/src/services/writing/writingDocumentSchema.js')
    const { createAuthoringKnowledgeQuerySession } = sessionModule
    const { createAuthoringKnowledgeAnswer, reconcileAuthoringKnowledgeAnswer } = answerModule
    const { createWritingDocument } = writingModule

    const chapterOne = createWritingDocument('艾德加在钟楼下把钥匙交给莉娜。')
    let worldbookEntries = [
      { id: 'entry_key', name: '蓝铜钥匙', type: 'item', content: '旧港档案室的钥匙，艾德加保管多年。' },
      { id: 'entry_edgar', name: '艾德加', type: 'character', content: '旧港档案员。' }
    ]
    const repositories = {
      getBook: async () => ({
        id: 'seam-book', title: '接缝浏览器验证', worldbookId: 'seam-worldbook',
        chapters: [{ id: 'seam-chapter-1', title: '第一章', editorDocument: chapterOne }]
      }),
      getBoundWorldbook: async () => ({
        projectId: 'seam-book', worldbookId: 'seam-worldbook',
        worldbook: { id: 'seam-worldbook', entries: worldbookEntries }
      }),
      listExplorations: async () => [],
      listOutlineNodes: async () => [],
      listOutlineEdges: async () => [],
      listMemories: async () => []
    }
    const session = createAuthoringKnowledgeQuerySession({ repositories, maxEvidence: 12 })
    const request = {
      projectId: 'seam-book', queryIntent: 'whole-book', question: '蓝铜钥匙有什么设定？'
    }
    const out = {}

    // 0) 默认关闭：无标记，原路径照常
    const off = await session.prepare({ ...request })
    out.offNoMarker = off.ok && off.session.knowledgeReadModel === undefined

    // 1) 启用：精确来源、revision 可溯源
    const on = await session.prepare({
      ...request, knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:entry_key'] }
    })
    out.onReady = on.ok && on.session.knowledgeReadModel?.status === 'ready'
    out.onExactRefs = JSON.stringify(on.session.evidenceEnvelope.evidence.map((item) => item.sourceRef).sort())
      === JSON.stringify(['worldbook-entry:entry_key'])
    const originalRevision = on.session.evidenceEnvelope.evidence[0]?.revision ?? null

    // 2) 取消是终态：不回退旧检索、零内容
    const controller = new AbortController()
    controller.abort()
    const aborted = await session.prepare({
      ...request, knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:entry_key'], signal: controller.signal }
    })
    out.abortedTerminal = aborted.ok === false && aborted.reason === 'knowledge-read-model-aborted'

    // 3) 越权拒绝：目录外来源 typed 失败、零内容
    const denied = await session.prepare({
      ...request, knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:not-authorized'] }
    })
    out.deniedTyped = denied.ok === false && denied.reason === 'knowledge-read-model-source-unauthorized'

    // 4) 来源改后旧答案失效（stale 对账）
    const answer = createAuthoringKnowledgeAnswer({
      evidenceEnvelope: on.session.evidenceEnvelope,
      modelOutput: { answer: '钥匙由艾德加保管。', claims: [{ text: '钥匙由艾德加保管。', evidenceRefs: ['worldbook-entry:entry_key'], confidence: 'supported' }] }
    })
    const before = reconcileAuthoringKnowledgeAnswer(answer, await session.collectCurrentRevisions(on.session))
    worldbookEntries = worldbookEntries.map((entry) => entry.id === 'entry_key'
      ? { ...entry, content: '（作者已改写）钥匙被扔进海里。' }
      : entry)
    const after = reconcileAuthoringKnowledgeAnswer(answer, await session.collectCurrentRevisions(on.session))
    out.staleFlow = answer.stale === false
      && before.stale === false
      && after.stale === true
      && after.staleSources.some((item) => item.sourceRef === 'worldbook-entry:entry_key' && item.reason === 'revision-changed')
    out.revisionCarried = typeof originalRevision === 'string' && originalRevision.length > 0
    return out
  })
  await context.close()
  check(results, '接缝浏览器运行时：默认关闭无标记', seam.offNoMarker === true)
  check(results, '接缝浏览器运行时：精确来源且 revision 直通', seam.onReady === true && seam.onExactRefs === true && seam.revisionCarried === true)
  check(results, '接缝浏览器运行时：已取消请求终态失败、零内容回退', seam.abortedTerminal === true)
  check(results, '接缝浏览器运行时：越权来源 typed 拒绝', seam.deniedTyped === true)
  check(results, '接缝浏览器运行时：来源改后旧答案 stale 失效', seam.staleFlow === true)
  check(results, '接缝浏览器运行时：无页面错误', seamErrors.length === 0, seamErrors.join('\n'))
}

// --- K34 点击闭环：作者可操作入口真实进入接缝（非 page.evaluate/CLI）------
async function runKnowledgeSeamClickGate(browser) {
  const desktop = await createPage(browser, { width: 1440, height: 900 }, { knowledgeSeamFlag: true })
  const page = desktop.page
  const editor = page.locator('.wall__dossier .ProseMirror')
  const assistant = page.locator('.authoring-knowledge')
  await editor.locator('p').first().waitFor({ timeout: 30000 })

  // 1) 无焦点来源的提问走旧路径：trace 0。
  await page.locator('[data-authoring-tool="ai"]').click()
  await fillAndAsk(page, '艾德加此前在哪几章出现？')
  await assistant.getByText(/已在 \d+ 处正文片段找到艾德加/).waitFor({ timeout: 30000 })
  let trace = await page.evaluate(() => window.__pinaxKnowledgeSeamTrace)
  check(results, 'click: 无焦点来源时提问不走接缝', trace && trace.seamPrepares === 0, JSON.stringify(trace))

  // 2) 作者点开依据并点击一条 K 可映射来源（世界设定）→ 登记焦点 + 回原文。
  await assistant.locator('.authoring-knowledge__evidence summary').first().click()
  const seamRows = assistant.locator('.authoring-knowledge__evidence-list > button')
  const focusRow = seamRows.filter({ hasText: '世界设定' }).first()
  await focusRow.click()
  await page.waitForTimeout(400)
  // 世界设定来源的"回到原文"会切到设定面板，助手抽屉随之关闭——真实作者
  // 会重新打开助手继续追问；焦点来源已登记在应用内。
  await page.locator('[data-authoring-tool="ai"]').click()
  await assistant.getByRole('textbox', { name: '向助手提问' }).waitFor({ timeout: 30000 })

  // 3) 追问：本次真实进入接缝（trace +1），envelope 只含焦点来源，
  //    provider 请求每次提问恰好一次（无第二次调用）。
  const providerCountBefore = desktop.requests.length
  await fillAndAsk(page, '再核对一次这个来源里艾德加的记录。')
  await assistant.locator('.authoring-knowledge__answer').last().getByText(/已在 \d+ 处正文片段找到艾德加|当前资料中没有找到足够依据/).first().waitFor({ timeout: 30000 })
  trace = await page.evaluate(() => window.__pinaxKnowledgeSeamTrace)
  check(results, 'click: 追问真实进入 K 接缝（trace+1）', trace && trace.seamPrepares === 1, JSON.stringify(trace))
  const seamRequest = desktop.requests[desktop.requests.length - 1]
  const seamEnvelopeRefs = JSON.stringify(seamRequest?.refs || [])
  check(results, 'click: 接缝请求只含点名的焦点来源', seamEnvelopeRefs === JSON.stringify(trace?.lastSeamRefs || []) && (trace?.lastSeamRefs?.length ?? 0) === 1, seamEnvelopeRefs)
  check(results, 'click: 接缝提问没有第二次 provider 调用', desktop.requests.length === providerCountBefore + 1, `${desktop.requests.length - providerCountBefore}`)

  // 4) 启用态完整闭环：修改聚焦来源（世界书条目，经正式存储层写合成
  //    fixture）→ 正文写入触发刷新信号 → 接缝回答 stale。
  await assistant.locator('.authoring-knowledge__answer').last()
    .locator('.authoring-knowledge__evidence summary').first().click()
  const focusedEntryId = trace.lastFocusRef.replace('worldbook-entry:', '')
  const sourceChanged = await page.evaluate(({ entryId }) => {
    return (async () => {
      const { createBrowserStorageRepository } = await import('/src/services/storage/browserStorageRepository.js')
      const storage = createBrowserStorageRepository()
      const books = JSON.parse(storage.getText('writing_books') || '[]')
      const book = books.find((item) => Array.isArray(item.chapters))
      if (!book?.worldbookId) return { ok: false, reason: 'no-bound-worldbook' }
      const key = 'worldbook_' + book.worldbookId
      const worldbook = JSON.parse(storage.getText(key) || 'null')
      if (!worldbook?.entries) return { ok: false, reason: 'no-worldbook' }
      const entry = worldbook.entries.find((item) => item.id === entryId)
      if (!entry) return { ok: false, reason: 'entry-missing' }
      entry.content = '（作者已改写）' + entry.content
      storage.setText(key, JSON.stringify(worldbook))
      return { ok: true }
    })()
  }, { entryId: focusedEntryId })
  check(results, 'click: 聚焦来源内容已在存储层改写', sourceChanged.ok === true, JSON.stringify(sourceChanged))
  // 正文写入只是触发助手刷新信号的真实作者动作；导致 stale 的原因是
  // 聚焦的世界书条目内容已变（revision 对账）。
  await editor.locator('p').first().click()
  await page.keyboard.press('End')
  await page.keyboard.insertText('（触发刷新）')
  await assistant.getByText(/资料已更新/).first().waitFor({ timeout: 10000 })
  const staleSeamChips = await assistant.locator('.authoring-knowledge__answer').last()
    .locator('.authoring-knowledge__evidence-list > button.is-stale').count()
  check(results, 'click: 来源修改后接缝回答标记 stale', staleSeamChips >= 1, `stale=${staleSeamChips}`)

  // 4b) 接缝回答来源可点回原文（点击会切到设定面板，旅程随后重开助手）。
  await assistant.locator('.authoring-knowledge__answer').last()
    .locator('.authoring-knowledge__evidence-list > button').first().click()
  await page.waitForTimeout(300)
  check(results, 'click: 接缝回答来源可回原文', (await editor.count()) > 0)
  await page.locator('[data-authoring-tool="ai"]').click()
  await assistant.getByRole('textbox', { name: '向助手提问' }).waitFor({ timeout: 30000 })

  // 5) 点名来源失效是终态：删除该条目后再追问 → typed 停止，provider 零
  //    调用，其他资料不因回退进入模型。
  const providerCountBeforeDelete = desktop.requests.length
  const removed = await page.evaluate(({ entryId }) => {
    return (async () => {
      const { createBrowserStorageRepository } = await import('/src/services/storage/browserStorageRepository.js')
      const storage = createBrowserStorageRepository()
      const books = JSON.parse(storage.getText('writing_books') || '[]')
      const book = books.find((item) => Array.isArray(item.chapters))
      const key = 'worldbook_' + book.worldbookId
      const worldbook = JSON.parse(storage.getText(key) || 'null')
      worldbook.entries = worldbook.entries.filter((item) => item.id !== entryId)
      storage.setText(key, JSON.stringify(worldbook))
      return { ok: true }
    })()
  }, { entryId: focusedEntryId })
  check(results, 'click: 聚焦来源已从存储层移除', removed.ok === true)
  await fillAndAsk(page, '再核对一次这个来源里艾德加的记录。')
  const seamRejectionTrace = await page.evaluate(() => window.__pinaxKnowledgeSeamTrace)
  check(results, 'click: 点名来源失效 → 终态停止（不回退旧查询）',
    seamRejectionTrace.seamRejections === 1 && seamRejectionTrace.seamPrepares === 1,
    JSON.stringify(seamRejectionTrace))
  check(results, 'click: 终态停止后 provider 零调用、其他资料未进入模型',
    desktop.requests.length === providerCountBeforeDelete,
    `${desktop.requests.length - providerCountBeforeDelete}`)
  const stopErrorVisible = await assistant.getByText('聚焦的资料当前不可用，本次查询已停止；请重新选择来源后再试.').count()
    + await assistant.getByText('聚焦的资料当前不可用，本次查询已停止；请重新选择来源后再试。').count()
  check(results, 'click: 作者看到可理解的停止原因', stopErrorVisible >= 1)
  // 关闭重开助手：composable 实例不销毁，焦点已单次消费，追问走旧路径。
  await page.locator('[data-authoring-tool="ai"]').click()
  await page.waitForTimeout(200)
  await page.locator('[data-authoring-tool="ai"]').click()
  await assistant.getByRole('textbox', { name: '向助手提问' }).waitFor({ timeout: 30000 })
  const providerCountReopen = desktop.requests.length
  await fillAndAsk(page, '艾德加此前在哪几章出现？')
  await assistant.getByText(/已在 \d+ 处正文片段找到艾德加/).last().waitFor({ timeout: 30000 })
  const reopenTrace = await page.evaluate(() => window.__pinaxKnowledgeSeamTrace)
  check(results, 'click: 关闭重开后焦点已消费，追问走旧路径',
    desktop.requests.length === providerCountReopen + 1 && reopenTrace.seamPrepares === 1,
    JSON.stringify({ requests: desktop.requests.length - providerCountReopen, seamPrepares: reopenTrace.seamPrepares }))
  check(results, 'click: 接缝旅程无控制台错误', desktop.errors.length === 0, desktop.errors.join('\n'))
  await desktop.context.close()
}

const failed0 = results.filter((result) => !result.pass)

// 追加浏览器接缝段（复用已打开的浏览器实例会随上方 finally 关闭，这里独立重启）
const seamBrowser = await chromium.launch()
try {
  await runKnowledgeSeamBrowserGate(seamBrowser)
  await runKnowledgeSeamClickGate(seamBrowser)
} finally {
  await seamBrowser.close()
}

const failed = results.filter((result) => !result.pass)
fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2))
console.log(`F2-4 knowledge assistant Gate: ${results.length - failed.length}/${results.length}（含知识接缝浏览器运行时 6 项；默认关闭 UI 回归 ${results.length - failed0.length - 6}/${results.length - 6}）`)
if (failed.length) process.exitCode = 1
