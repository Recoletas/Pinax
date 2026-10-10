/* eslint-disable no-console */
// F2-4 real-page Gate: project-grounded knowledge assistant, exact evidence,
// stale reconciliation, read-only queries, editor-surface restoration and phone sheet.
// Runs in isolated Playwright contexts; never mutates the user's browser profile.
//
// ⚠️ 存量失靶（2026-10-11 W-B 核对，非本批引入）：
//   本 Gate 的 provider 前提是「knowledge 查询直打 /api/advisor/task」。
//   PR#5（2026-10-05，purpose 化）后助手入口改 purpose 菜单；agent 引擎接入
//   后（agent tool calling 批）ask 默认走 createAuthoringStoryAgent 的
//   /api/storyagent SSE 工具循环，不再直打 advisor 端点——本 Gate 的 canned
//   mock 拦不到查询，后续断言无法收敛。50bb0a7（P1，2026-10-08）已如实记录
//   「f2-knowledge/rehearsal 为 PR#5 起存量失靶」。W-B 只同步了选择器落点
//   （右轨退役→顶栏工具组、四段 dock 死代码删除、双栏旅程改直查），语义
//   断言未动；重铺 provider 前提（mock SSE 桥）归 W-C（Agent 前端域）。
//
// 跑法：
//   1) 播种 fixture（产物只写 tmp/authoring-rollout/，不动用户浏览器 localStorage）：
//        BASE=http://127.0.0.1:5174 node scripts/authoring-ui/rollout-fixture.mjs
//   2) 起 dev server（本 Gate 的接缝段会在页面里动态 import /src 模块，
//      走 Vite 转换管线，`vite preview`/dist 不提供 /src，必须用 dev）：
//        npm run dev   # 或复用已在跑的 dev server
//   3) 跑 Gate：
//        BASE=http://127.0.0.1:5174 node scripts/authoring-ui/f2-knowledge-assistant-check.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:5174'
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
    // scene/selection 块携带「当前落笔处」投影（作者此刻在哪一章哪一节），
    // 是副栏 target 断言的观察点。
    const sceneRefs = [...new Set((payload.envelope?.blocks || [])
      .filter((block) => ['scene', 'selection'].includes(block.kind))
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
    requests.push({ payload, refs, edgarRefs, sceneRefs, isFree })
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
  // W-B 外壳重构：右轨退役，等待顶栏工具组（工具入口落点随之迁移）。
  await page.locator('.authoring-inspector-toolbar').waitFor({ timeout: 30000 })
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

// 20261011 W-B 外壳重构同步：助手入口 data-authoring-tool="ai" 从右轨钮迁到
// 顶栏「助手」钮（点击即进助手会话段）；四段 dock 死代码已删除，不再有工具
// 面板 overlay 残留路径。引用预览若开着会顶掉会话段：先「关闭引用预览」回
// 对话，再等助手可见。
async function openAssistantSession(page) {
  await page.locator('[data-authoring-tool="ai"]').click()
  await page.waitForTimeout(300)
  // 引用预览若还开着会顶掉会话段（非展开态 has-preview 隐藏 conversation）：
  // 先「关闭引用预览」回对话，再等助手可见。
  const previewClose = page.locator('.authoring-assistant-workspace__preview-close')
  if (await previewClose.isVisible().catch(() => false)) {
    await previewClose.click()
    await page.waitForTimeout(150)
  }
  await page.locator('.authoring-knowledge').waitFor({ state: 'visible', timeout: 15000 })
}

// 20261008 purpose 化同步（PR#5 起）：问答范围不再是 composer 旁的 <select>，
// 而是 purpose 菜单（details.authoring-knowledge__purpose，summary=助手任务），
// 三个入口按钮：讨论故事（free）/ 写作与修改（agent，agent 引擎在时才有）/
// 查阅资料（whole-book）。选择即收起菜单并聚焦输入框。
async function purposeMenu(page) {
  const root = page.locator('.authoring-knowledge__purpose')
  const menu = root.locator('.authoring-knowledge__purpose-menu')
  if (!(await menu.isVisible().catch(() => false))) {
    await root.locator('summary').click()
    await menu.waitFor({ state: 'visible', timeout: 5000 })
  }
  return menu
}

async function choosePurpose(page, label) {
  const menu = await purposeMenu(page)
  await menu.getByRole('button', { name: label }).click()
  await page.waitForTimeout(150)
}

// 助手回答的证据 chips：正文类 label 形如「章节名 · 单元.节点」，
// 世界设定类 label 是条目名（如「艾德加」）；超出 3 条时先点开「另 N 条资料」。
async function answerEvidenceRows(scope) {
  const more = scope.locator('.authoring-knowledge__evidence-list > button.authoring-knowledge__more-sources')
  if (await more.isVisible().catch(() => false)) await more.click()
  return scope.locator('.authoring-knowledge__evidence-list > button:not(.authoring-knowledge__more-sources)')
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
  await openAssistantSession(page)
  const assistant = page.locator('.authoring-knowledge')
  await assistant.waitFor({ state: 'visible' })
  // 20261008 dock 化同步：助手入口不再是右 rail 按钮，data-authoring-tool="ai"
  // 改落在 dock 的会话段 tab（打开时）/收起徽标钮（收起时），任一时刻至多一个；
  // rail 按钮专属的 aria-label 断言同步改为入口唯一且可见。
  check(results, '助手入口可见且唯一', await page.locator('[data-authoring-tool="ai"]').count() === 1 && await page.locator('[data-authoring-tool="ai"]').isVisible())
  // 20261008 purpose 化同步（PR#5 起）：旧「成熟快捷任务」七项下拉
  // （查设定|找伏笔|理线索|挖角色|算数值|问全书|自由问）已被 purpose 菜单
  // 三入口取代（讨论故事=自由聊、写作与修改=agent、查阅资料=全书证据问答），
  // 等价断言改为菜单入口名与顺序。
  const purposeLabels = await (await purposeMenu(page)).locator('button span').evaluateAll((spans) => (
    spans.map((span) => (span.childNodes[0]?.textContent || '').trim())
  ))
  await page.locator('.authoring-knowledge__purpose summary').click()
  // 20261011 同步：purpose 菜单在快任务（检查文稿/生成插图）入列后为五入口；
  // 三入口断言属 PR#5 前旧形态，按产品现状收敛。
  check(results, '助手 purpose 菜单呈现五入口（讨论/写作修改/查阅资料/检查文稿/生成插图）',
    purposeLabels.join('|') === '讨论故事|写作与修改|查阅资料|检查文稿|生成插图', purposeLabels.join('|'))
  check(results, '助手首页不暴露诊断内部术语', !/manifest|receipt|candidate ID|token budget|上下文数量/i.test(await assistant.innerText()))
  await page.locator('.writing-inspector__icon-btn[title="关闭检查器"]').click()
  await page.waitForTimeout(120)
  const surfaceAfter = await page.evaluate(() => ({
    selection: window.getSelection()?.toString() || '',
    activeInEditor: Boolean(document.activeElement?.closest?.('.wall__dossier .ProseMirror')),
    scrollTop: document.querySelector('.wall__dossier [data-notebook-scroll-owner], .wall__dossier .writing-notebook-editor__scroll')?.scrollTop || 0
  }))
  check(results, '打开并关闭助手恢复正文选区、焦点和滚动', surfaceBefore.selection.length === 2 && surfaceAfter.selection === surfaceBefore.selection && surfaceAfter.activeInEditor && surfaceAfter.scrollTop === surfaceBefore.scrollTop, JSON.stringify({ surfaceBefore, surfaceAfter }))

  await openAssistantSession(page)
  const formalBefore = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  // 默认意图是「讨论故事」；全书证据问答显式走 purpose 菜单「查阅资料」。
  await choosePurpose(page, '查阅资料')
  await fillAndAsk(page, '艾德加此前在哪几章出现？')
  await assistant.getByText(/已在 \d+ 处正文片段找到艾德加/).waitFor({ timeout: 30000 })
  const firstRequest = desktop.requests[0]
  check(results, '生产查询使用 canonical knowledge task', firstRequest?.payload?.taskType === 'authoring.knowledge.query')
  check(results, '冻结证据引用唯一且只来自本次序列化块', firstRequest?.refs?.length > 0 && new Set(firstRequest.refs).size === firstRequest.refs.length)
  check(results, '问全书检索到艾德加正文证据', firstRequest?.edgarRefs?.length >= 1, JSON.stringify(firstRequest?.edgarRefs || []))
  check(results, '跨项目哨兵未进入 provider 上下文', !JSON.stringify(firstRequest?.payload?.envelope || {}).includes('艾德加跨项目哨兵'))
  const formalAfter = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  const changedFormalKeys = Object.keys(formalAfter)
    .filter((key) => (formalBefore[key] !== formalAfter[key]) && (key === 'writing_books' || key === 'worldbooks_index' || /worldbook|outline|memory_candidates|narrative_asset|authoring_document/i.test(key)))
  check(results, '资料查询对正文、设定、大纲、素材与记忆零写入', changedFormalKeys.length === 0, JSON.stringify(changedFormalKeys))
  // 20261008 证据直出化同步：证据 chips 不再折叠在 <details> summary 里，而是
  // 随回答直接展示（>3 条时收敛为「另 N 条资料」展开钮），等价断言改为 chips 直接可见。
  const firstAnswer = assistant.locator('.authoring-knowledge__answer').first()
  const evidenceRows = await answerEvidenceRows(firstAnswer)
  check(results, '回答直接展示可定位原文依据', await evidenceRows.count() >= 1)
  await page.screenshot({ path: path.join(OUT_DIR, 'knowledge-answer-1440.png'), fullPage: false })
  await page.screenshot({ path: path.join(FINAL_DIR, '03-assistant-answer-1440.png'), fullPage: false })

  const providerCountBeforeMissing = desktop.requests.length
  await fillAndAsk(page, '泽尔布星人的出生地在哪里？')
  await assistant.getByText('当前资料中没有找到足够依据。', { exact: true }).last().waitFor({ timeout: 10000 })
  check(results, '不存在的设定直接承认无资料且不调用模型', desktop.requests.length === providerCountBeforeMissing)

  // 20261008 purpose 化同步：自由问从 selectOption('free') 改为 purpose 菜单
  // 「讨论故事」；「自由建议」角标已改为回答元信息行的 is-free 态标记。
  await choosePurpose(page, '讨论故事')
  await fillAndAsk(page, '这一场的选择写得太散，应该怎么收束？')
  const freeAnswer = assistant.locator('.authoring-knowledge__answer').last()
  await freeAnswer.getByText('可以先把这一场的选择压缩成一个不可兼得的取舍，再决定落笔。', { exact: true }).waitFor({ timeout: 10000 })
  check(results, '自由问明确标为自由建议且不伪造证据',
    await freeAnswer.locator('.authoring-knowledge__answer-meta .is-free').count() === 1
    && await freeAnswer.locator('.authoring-knowledge__evidence').count() === 0)

  // 回到第一份回答并打开一条正文证据；随后真实编辑该 node，旧回答必须 stale。
  // 20261008 引用预览化同步：点 chip 先进助手内「引用片段」预览，再点
  // 「打开原文」跳回正文对应节点——两段式，语义仍是「依据可回原文」。
  const manuscriptEvidenceRow = evidenceRows.filter({ hasText: /\d+\.\d+/ }).first()
  await manuscriptEvidenceRow.click()
  const evidencePreview = page.locator('.authoring-assistant-workspace__preview')
  await evidencePreview.waitFor({ state: 'visible', timeout: 5000 })
  await evidencePreview.getByRole('button', { name: '打开原文' }).click()
  await page.waitForTimeout(600)
  const sourceVisible = (await editor.innerText()).includes('艾德加')
  check(results, '点击正文依据能跳到包含该证据的章节/节点', sourceVisible)
  // 预览若仍开着会盖住会话段（非展开态下 preview 取代 conversation），先收掉
  // 再做编辑与 stale 观察。
  const evidencePreviewClose = page.locator('.authoring-assistant-workspace__preview-close')
  if (await evidencePreviewClose.isVisible().catch(() => false)) await evidencePreviewClose.click()
  await page.waitForTimeout(150)
  await page.keyboard.press('End')
  await page.keyboard.insertText('（F2修订）')
  await page.waitForTimeout(1600)
  await assistant.getByText(/资料已更新/).first().waitFor({ timeout: 10000 })
  check(results, '来源修改后旧回答保留并标记 stale', await assistant.getByText(/已在 \d+ 处正文片段找到艾德加/).count() === 1)
  await page.locator('.writing-inspector__icon-btn[title="关闭检查器"]').click()
  await openAssistantSession(page)
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
  await openAssistantSession(liveDraft.page)
  await choosePurpose(liveDraft.page, '查阅资料')
  await fillAndAsk(liveDraft.page, `${liveSentinel}在哪里？`)
  const liveRequest = liveDraft.requests[0]
  check(results, '尚未自动保存的当前正文进入冻结证据', JSON.stringify(liveRequest?.payload?.envelope || {}).includes(liveSentinel))
  check(results, '内存稿证据仍使用当前项目稳定正文 ref', (liveRequest?.refs || []).some((ref) => ref.startsWith('node:fogch-1:')), JSON.stringify(liveRequest?.refs || []))
  check(results, '内存稿查询无控制台错误', liveDraft.errors.length === 0, liveDraft.errors.join('\n'))
  await liveDraft.context.close()

  // 整书查阅须覆盖未在当前章打开的后续章节。
  // 语义演化说明（20261011 W-B 同步，双栏退役的证据链）：
  // ① 双栏整体退役（plan §5 待裁 3）：AuthoringDualPane/右轨 dual 钮/
  //    f2-dual-pane Gate 已删除，原「双栏副窗打开第二章 → 退出双栏 → 整书
  //    查阅」旅程的前半段不再是产品交互；
  // ② 保留的等价旅程断言：助手整书查阅（查阅资料 intent）照常检索到
  //    第二章（fogch-2）正文证据——原断言的落点（副栏 target/排除后续章节）
  //    早已随 purpose 化删除，本段只保留「整书查阅覆盖 fogch-2」这一语义。
  const wholeBook = await createPage(browser, { width: 1440, height: 900 })
  const wholeBookPage = wholeBook.page
  await openAssistantSession(wholeBookPage)
  const wholeBookAssistant = wholeBookPage.locator('.authoring-knowledge')
  await wholeBookAssistant.waitFor({ state: 'visible' })
  await choosePurpose(wholeBookPage, '查阅资料')
  await fillAndAsk(wholeBookPage, '艾德加此前做过什么？')
  const wholeBookRequest = wholeBook.requests[0]
  check(results, '助手整书查阅覆盖后续章节（fogch-2）',
    wholeBookRequest?.payload?.options?.knowledgeIntent === 'whole-book'
    && (wholeBookRequest?.refs || []).some((ref) => ref.startsWith('node:fogch-2:')),
    JSON.stringify({ intent: wholeBookRequest?.payload?.options?.knowledgeIntent }))
  check(results, '整书查阅无控制台错误', wholeBook.errors.length === 0, wholeBook.errors.join('\n'))
  await wholeBook.context.close()

  const mobile = await createPage(browser, { width: 390, height: 844 })
  await openAssistantSession(mobile.page)
  const mobileAssistant = mobile.page.locator('.authoring-knowledge')
  await mobileAssistant.waitFor({ state: 'visible' })
  const mobileGeometry = await mobile.page.evaluate(() => {
    const assistantNode = document.querySelector('.authoring-knowledge')
    const inspector = document.querySelector('.writing-inspector')
    // 20261008 purpose 化同步：composer 的命中区=purpose 菜单 summary、写作
    // 工具菜单、发送键与写作起点建议 chips，一起量。
    const controls = [...document.querySelectorAll(
      '.authoring-knowledge__purpose summary, .authoring-knowledge__tools summary, .authoring-knowledge__send, .authoring-knowledge__prompt-list button'
    )]
    return {
      assistantHeight: assistantNode?.getBoundingClientRect().height || 0,
      inspectorWidth: inspector?.getBoundingClientRect().width || 0,
      minTaskHeight: Math.min(...controls.map((node) => node.getBoundingClientRect().height)),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }
  })
  check(results, '390 助手使用完整 sheet 而非压窄正文', mobileGeometry.assistantHeight > 500 && mobileGeometry.inspectorWidth >= 360, JSON.stringify(mobileGeometry))
  check(results, '390 助手操作命中区至少 44px', mobileGeometry.minTaskHeight >= 44, mobileGeometry.minTaskHeight)
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

  // 1) 无焦点来源的提问走旧路径：trace 0。（默认意图是「讨论故事」，全书
  //    证据问答显式走 purpose 菜单「查阅资料」。）
  await openAssistantSession(page)
  await choosePurpose(page, '查阅资料')
  await fillAndAsk(page, '艾德加此前在哪几章出现？')
  await assistant.getByText(/已在 \d+ 处正文片段找到艾德加/).waitFor({ timeout: 30000 })
  let trace = await page.evaluate(() => window.__pinaxKnowledgeSeamTrace)
  check(results, 'click: 无焦点来源时提问不走接缝', trace && trace.seamPrepares === 0, JSON.stringify(trace))

  // 2) 作者点开依据并点击一条 K 可映射来源（世界设定，chip=条目名「艾德加」）
  //    → 登记焦点 + 助手内预览。20261008 引用预览化同步：点 chip 不再直接跳
  //    原文，而是打开「引用片段」预览，由作者再点「打开原文」。
  const seamAnswerRows = await answerEvidenceRows(assistant.locator('.authoring-knowledge__answer').first())
  // chip 文本是资料名；必须精确点名世界书条目「艾德加」——子串匹配会先撞上
  // 探索 chip「艾德加视角：第三排第七格」（suggestion 权威，非 K 可映射，
  // 产品按设计不登记焦点）。
  const focusRow = seamAnswerRows.filter({ hasText: /^\s*艾德加\s*$/ }).first()
  await focusRow.click()
  const seamFocusPreview = page.locator('.authoring-assistant-workspace__preview')
  await seamFocusPreview.waitFor({ state: 'visible', timeout: 5000 })
  // 打开原文会切到设定面板——真实作者随后重新打开助手继续追问；焦点来源已登记在应用内。
  await seamFocusPreview.getByRole('button', { name: '打开原文' }).click()
  await page.waitForTimeout(400)
  await openAssistantSession(page)
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
  //    （20261008 证据直出化：旧代码在此点开 <details> summary 展开 chips，
  //    现在 chips 已随回答直接可见，无需展开动作。）
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

  // 4b) 接缝回答来源可点回原文：点 chip → 助手内预览 → 「打开原文」。
  //     （20261008 引用预览化同步：chip 点击先进预览，跳原文由预览的
  //     「打开原文」承担，语义仍是「依据可回原文」。）
  await assistant.locator('.authoring-knowledge__answer').last()
    .locator('.authoring-knowledge__evidence-list > button').first().click()
  const seamPreviewB = page.locator('.authoring-assistant-workspace__preview')
  await seamPreviewB.waitFor({ state: 'visible', timeout: 5000 })
  check(results, 'click: 接缝回答来源可回原文', await seamPreviewB.getByRole('button', { name: '打开原文' }).count() === 1)
  await seamPreviewB.getByRole('button', { name: '打开原文' }).click()
  await page.waitForTimeout(400)
  await openAssistantSession(page)
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
  // 关闭重开助手（dock 化同步：入口语义在 data-authoring-tool="ai"，重开直达
  // 会话段）：composable 实例不销毁，焦点已单次消费，追问走旧路径。
  await openAssistantSession(page)
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
