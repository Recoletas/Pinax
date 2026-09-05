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
    const claims = isFree ? [] : [{
      text: '艾德加曾在正文中出现。',
      confidence: edgarRefs.length ? 'supported' : 'unsupported',
      evidenceRefs: edgarRefs.slice(0, 4)
    }]
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

async function createPage(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const storage = isolatedStorage()
  await context.addInitScript((snapshot) => {
    localStorage.clear()
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
    localStorage.setItem('app_theme_variant', 'legacy')
    localStorage.setItem('app_ui_zoom', '1')
  }, storage)
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
  check(results, '助手首页只呈现成熟快捷任务', await assistant.getByRole('button', { name: /查设定|找伏笔|理线索|挖角色|算数值|问全书|自由问/ }).count() === 7)
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

  await assistant.getByRole('button', { name: '自由问', exact: true }).last().click()
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
  await dualAssistant.getByRole('button', { name: '挖角色', exact: true }).click()
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
    const taskButtons = [...document.querySelectorAll('.authoring-knowledge__tasks button, .authoring-knowledge__whole-book')]
    return {
      assistantHeight: assistantNode?.getBoundingClientRect().height || 0,
      inspectorWidth: inspector?.getBoundingClientRect().width || 0,
      minTaskHeight: Math.min(...taskButtons.map((node) => node.getBoundingClientRect().height)),
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

const failed = results.filter((result) => !result.pass)
fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2))
console.log(`F2-4 knowledge assistant Gate: ${results.length - failed.length}/${results.length}`)
if (failed.length) process.exitCode = 1
