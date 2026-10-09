/* eslint-disable no-console */
// Phase 3 real-page Gate：前端可见性增强（助手侧）。
// 覆盖：advisor 问答 → 回答旁 🔍（提示词快照面板、Esc 焦点恢复、刷新后失效文案）；
// 右 dock「执行」tab 运行记录（trace 摘要、按作品过滤、刷新持久化）。
// 模型响应以 canned /api/advisor/task 注入（本机 5173/5174 origin 无可用凭据，
// 读 apiKey 被禁止）——与 Phase 1「canned 注入 + 前端链路真实执行」先例一致；
// advisorTaskService 的 requestId → trace → 快照全链仍真实执行。
// 只跑隔离 Playwright context，绝不触碰用户浏览器 profile。
//
// 跑法：
//   1) 播种 fixture（产物只写 tmp/authoring-rollout/）：
//        BASE=http://127.0.0.1:5174 node scripts/authoring-ui/rollout-fixture.mjs
//   2) 起 dev server（本 Gate 走 Vite 转换管线，preview/dist 不适用）：
//        npm run dev
//   3) 跑 Gate：
//        BASE=http://127.0.0.1:5174 node scripts/authoring-ui/visibility-runlog-check.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:5174'
const FIXTURE_DIR = path.resolve('tmp/authoring-rollout')
const OUT_DIR = path.resolve('docs/screenshots/visibility-runlog-20261009')
const TRACE_KEY = 'pinax_agent_request_trace_v1'
const state = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-state.json'), 'utf8'))
const baseStorage = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-localstorage.json'), 'utf8'))
fs.mkdirSync(OUT_DIR, { recursive: true })

function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

// 干净起点：fixture 存储可能带旧会话/旧 trace，全部剥掉，断言才有唯一解。
function isolatedStorage() {
  const storage = deepClone(baseStorage)
  for (const key of Object.keys(storage)) {
    if (key.startsWith('authoring_assistant_conversation:') || key.startsWith('authoring_assistant_draft:')) delete storage[key]
  }
  delete storage[TRACE_KEY]
  return storage
}

function check(results, label, pass, detail = '') {
  const result = { label, pass: Boolean(pass), detail: String(detail).slice(0, 900) }
  results.push(result)
  console.log(`${result.pass ? 'PASS' : 'FAIL'} ${label}${result.detail ? ` — ${result.detail}` : ''}`)
}

async function installCannedAdvisor(page) {
  const requests = []
  await page.route('**/api/advisor/task', async (route) => {
    let payload = null
    try { payload = route.request().postDataJSON() } catch { /* handled below */ }
    if (!payload || payload.taskType !== 'authoring.knowledge.query') {
      return route.fulfill({
        status: 501,
        contentType: 'application/json',
        body: JSON.stringify({ error: `visibility-runlog fixture does not serve ${payload?.taskType || 'malformed request'}` })
      })
    }
    const blocks = (payload.envelope?.blocks || []).filter((block) => Array.isArray(block?.sourceRefs) && block.sourceRefs.length)
    const refs = [...new Set(blocks.flatMap((block) => block.sourceRefs || []))]
    const edgarRefs = [...new Set(blocks
      .filter((block) => String(block.content || '').includes('艾德加'))
      .flatMap((block) => block.sourceRefs || []))]
    const worldRefs = refs.filter((ref) => ref.startsWith('worldbook-entry:')).slice(0, 2)
    const claims = [{
      text: '艾德加曾在正文中出现。',
      confidence: edgarRefs.length ? 'supported' : 'unsupported',
      evidenceRefs: edgarRefs.slice(0, 4)
    }]
    if (worldRefs.length) {
      claims.push({ text: '设定资料中存在相关记录，可点击依据回原文。', confidence: 'supported', evidenceRefs: worldRefs })
    }
    const knowledgeAnswer = {
      answer: edgarRefs.length ? `已在 ${edgarRefs.length} 处正文片段找到艾德加。` : '当前资料中没有找到足够依据。',
      claims,
      missingInformation: edgarRefs.length ? [] : ['没有找到艾德加的正文记录。'],
      calculations: []
    }
    requests.push({ payload })
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        taskType: payload.taskType,
        advice: JSON.stringify(knowledgeAnswer),
        result: { task: payload.taskType, mode: 'review', summary: knowledgeAnswer.answer, knowledgeAnswer },
        meta: { fixture: 'visibility-runlog' }
      })
    })
  })
  return requests
}

async function createPage(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const storage = isolatedStorage()
  await context.addInitScript(({ snapshot }) => {
    // addInitScript 每次导航都会重跑（含 reload）：只在首载播种，否则会把
    // 应用刚写入的会话与 trace 清掉，reload 持久化断言永远测不到。
    if (localStorage.getItem('__visibility_runlog_seeded')) return
    localStorage.clear()
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
    localStorage.setItem('app_ui_zoom', '1')
    localStorage.setItem('text_model_configs', JSON.stringify([{
      id: 'visibility-runlog-provider',
      name: 'Visibility runlog deterministic provider',
      providerId: 'openai',
      baseUrl: 'https://visibility-runlog.invalid/v1',
      apiKey: 'visibility-runlog-test-key',
      model: 'visibility-runlog-model'
    }]))
    localStorage.setItem('text_model_selected', 'visibility-runlog-provider')
    localStorage.setItem('pinax_agent_runtime_policy_v1', JSON.stringify({ enabled: true, passiveHints: { 'writing-inline': false } }))
    localStorage.setItem('__visibility_runlog_seeded', '1')
  }, { snapshot: storage })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console:${message.text()}`) })
  const requests = await installCannedAdvisor(page)
  await page.goto(`${BASE}/authoring?bookId=${state.bookId}`, { waitUntil: 'domcontentloaded' })
  await page.locator('.writing-tool-rail').waitFor({ timeout: 30000 })
  await page.locator('.wall__dossier .ProseMirror').waitFor({ timeout: 30000 })
  await page.waitForTimeout(900)
  return { context, page, requests, errors }
}

async function openAssistantSession(page) {
  await page.locator('[data-authoring-tool="ai"]').click()
  await page.waitForTimeout(300)
  if (await page.locator('.authoring-dock__panel').isVisible().catch(() => false)) {
    console.log('NOTE openAssistantSession: dock reopened onto a tool panel overlay; clicking session tab to return to assistant')
    await page.locator('[data-authoring-tool="ai"]').click()
    await page.waitForTimeout(300)
  }
  const previewClose = page.locator('.authoring-assistant-workspace__preview-close')
  if (await previewClose.isVisible().catch(() => false)) {
    await previewClose.click()
    await page.waitForTimeout(150)
  }
  await page.locator('.authoring-knowledge').waitFor({ state: 'visible', timeout: 15000 })
}

async function chooseWholeBook(page) {
  const root = page.locator('.authoring-knowledge__purpose')
  const menu = root.locator('.authoring-knowledge__purpose-menu')
  if (!(await menu.isVisible().catch(() => false))) {
    await root.locator('summary').click()
    await menu.waitFor({ state: 'visible', timeout: 5000 })
  }
  await menu.getByRole('button', { name: '查阅资料' }).click()
  await page.waitForTimeout(150)
}

async function fillAndAsk(page, question) {
  const assistant = page.locator('.authoring-knowledge')
  await assistant.getByRole('textbox', { name: '向助手提问' }).fill(question)
  await assistant.getByRole('button', { name: '发送问题' }).click()
  await assistant.locator('.authoring-knowledge__thinking').waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(120)
  return assistant
}

async function openRunTab(page) {
  await page.locator('.authoring-dock__tabs').getByRole('tab', { name: '执行', exact: true }).click()
  await page.locator('[data-test="authoring-run-log"]').waitFor({ state: 'visible', timeout: 10000 })
}

async function readTraces(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '[]'), TRACE_KEY)
}

const browser = await chromium.launch()
const results = []

try {
  // ── 桌面 1440：advisor 回合 → 🔍 → 执行 tab ──────────────────────────────
  const desktop = await createPage(browser, { width: 1440, height: 900 })
  const page = desktop.page
  await openAssistantSession(page)
  const assistant = page.locator('.authoring-knowledge')
  check(results, '助手入口可见', await assistant.isVisible())

  await chooseWholeBook(page)
  await fillAndAsk(page, '艾德加此前在哪几章出现？')
  const answer = assistant.locator('.authoring-knowledge__answer').last()
  await answer.getByText(/已在 \d+ 处正文片段找到艾德加/).waitFor({ timeout: 30000 })
  check(results, '生产查询使用 canonical knowledge task', desktop.requests[0]?.payload?.taskType === 'authoring.knowledge.query')

  // 回答旁 🔍：只对携带快照键的 advisor 回答出现。
  const promptButton = answer.locator('.authoring-knowledge__prompt')
  check(results, '回答旁出现查看提示词入口', await promptButton.count() === 1 && await promptButton.getAttribute('aria-label') === '查看本轮提示词')
  await page.screenshot({ path: path.join(OUT_DIR, '01-assistant-prompt-button-1440.png'), fullPage: false })

  // trace 摘要：按作品留档、不落内容。
  const traces = await readTraces(page)
  const advisorTraces = traces.filter((trace) => trace?.kind === 'advisor')
  const trace = advisorTraces[0]
  check(results, '执行 tab trace 已落档（kind/projectId/status）',
    advisorTraces.length === 1
    && trace?.projectId === state.bookId
    && trace?.status === 'completed'
    && trace?.taskType === 'authoring.knowledge.query'
    && Number(trace?.startedAt) > 0 && Number(trace?.completedAt) >= Number(trace?.startedAt),
    JSON.stringify({ count: advisorTraces.length, projectId: trace?.projectId, status: trace?.status }))
  const traceBlocks = trace?.context?.blocks || []
  check(results, 'trace 只存块级摘要（chars 数字、无 content）',
    traceBlocks.length >= 1
    && traceBlocks.every((block) => typeof block.chars === 'number' && !('content' in block)),
    JSON.stringify(traceBlocks.map((block) => ({ kind: block.kind, chars: block.chars }))))
  check(results, 'trace 永不落正文文本', !JSON.stringify(traces).includes('艾德加'))

  // 🔍 → 快照面板。
  await promptButton.click()
  const panel = page.locator('section.prompt-preview[role="dialog"]')
  await panel.waitFor({ state: 'visible', timeout: 5000 })
  check(results, '快照面板展示预算行', /字符/.test(await panel.locator('.prompt-preview__budget-line').innerText()))
  const panelBlockCount = await panel.locator('.prompt-preview__blocks > li').count()
  check(results, '快照块数与 trace 摘要一致', panelBlockCount === traceBlocks.length, `panel=${panelBlockCount} trace=${traceBlocks.length}`)
  const kindLabels = await panel.locator('.prompt-preview__kind').allInnerTexts()
  check(results, '面板块标签全部本地化（无原始 kind 回落）',
    kindLabels.length === panelBlockCount && kindLabels.every((label) => !/^[a-z][a-z-]*$/.test(label.trim())),
    JSON.stringify(kindLabels))
  const firstBlock = panel.locator('.prompt-preview__block').first()
  await firstBlock.locator('summary').click()
  const blockContent = await firstBlock.locator('.prompt-preview__content').innerText()
  check(results, '展开块可见实际内容草稿', blockContent.trim().length > 0, blockContent.slice(0, 60))
  check(results, '面板脚注展示意图与时间戳', /意图 whole-book/.test(await panel.locator('.prompt-preview__foot').innerText()))
  await page.screenshot({ path: path.join(OUT_DIR, '02-prompt-preview-1440.png'), fullPage: false })

  // Esc 关闭 + 焦点回 🔍。
  await page.keyboard.press('Escape')
  await panel.waitFor({ state: 'hidden', timeout: 5000 })
  const focusBack = await page.evaluate(() => document.activeElement?.className || '')
  check(results, 'Esc 关闭面板且焦点回到 🔍', focusBack.includes('authoring-knowledge__prompt'), focusBack)

  // 执行 tab：一条 advisor 记录 + 详情渲染。
  await openRunTab(page)
  const runLog = page.locator('[data-test="authoring-run-log"]')
  const entries = runLog.locator('details.authoring-run-log__entry')
  check(results, '执行 tab 显示 1 条本作品记录', await entries.count() === 1
    && await entries.first().getAttribute('data-kind') === 'advisor'
    && await entries.first().getAttribute('data-status') === 'completed')
  check(results, '空态提示已让位', !(await runLog.locator('[data-test="authoring-run-log-empty"]').isVisible().catch(() => false)))
  await entries.first().locator('summary').click()
  const detail = entries.first().locator('.authoring-run-log__detail')
  const detailText = await detail.innerText()
  check(results, '详情展示任务类型与块分布', detailText.includes('任务类型 authoring.knowledge.query') && detailText.includes('字符'), detailText.slice(0, 120))
  check(results, '详情块数与 trace 一致', await detail.locator('.authoring-run-log__blocks li').count() === traceBlocks.length)
  await page.screenshot({ path: path.join(OUT_DIR, '03-run-log-entry-1440.png'), fullPage: false })

  // 按作品过滤：播种异作品 trace，刷新列表后仍只显示本作品。
  await page.evaluate((key) => {
    const list = JSON.parse(localStorage.getItem(key) || '[]')
    list.unshift({
      kind: 'advisor', requestId: 'visibility-foreign-trace', projectId: 'visibility-foreign-book',
      taskType: 'authoring.knowledge.query', startedAt: Date.now() - 2000, completedAt: Date.now() - 1000, status: 'completed',
      context: { blocks: [{ order: 0, kind: 'raw', chars: 1, sourceRefs: [], truncated: false, retainedChars: null }] }
    })
    localStorage.setItem(key, JSON.stringify(list))
  }, TRACE_KEY)
  await runLog.getByRole('button', { name: '刷新列表' }).click()
  await page.waitForTimeout(200)
  check(results, '刷新后异作品记录不进入列表', await entries.count() === 1
    && !(await runLog.innerText()).includes('visibility-foreign'))

  // ── reload：记录持久化 + 快照失效文案 ────────────────────────────────────
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.wall__dossier .ProseMirror').waitFor({ timeout: 30000 })
  await page.waitForTimeout(600)
  await openAssistantSession(page)
  const restoredAnswer = assistant.locator('.authoring-knowledge__answer').last()
  await restoredAnswer.getByText(/已在 \d+ 处正文片段找到艾德加/).waitFor({ timeout: 15000 })
  const restoredPromptButton = restoredAnswer.locator('.authoring-knowledge__prompt')
  check(results, '刷新后回答恢复且 🔍 入口保留', await restoredPromptButton.count() === 1)
  await restoredPromptButton.click()
  const missingPanel = page.locator('section.prompt-preview[role="dialog"]').last()
  await missingPanel.waitFor({ state: 'visible', timeout: 5000 })
  check(results, '刷新后快照失效文案如实展示', /快照已失效/.test(await missingPanel.innerText()) && await missingPanel.locator('.prompt-preview__missing').isVisible())
  await page.screenshot({ path: path.join(OUT_DIR, '05-prompt-missing-after-reload-1440.png'), fullPage: false })
  await page.keyboard.press('Escape')
  await missingPanel.waitFor({ state: 'hidden', timeout: 5000 })

  await openRunTab(page)
  check(results, '刷新后运行记录仍在（1 条本作品）', await entries.count() === 1
    && !(await runLog.innerText()).includes('visibility-foreign'))
  await page.screenshot({ path: path.join(OUT_DIR, '04-run-log-after-reload-1440.png'), fullPage: false })
  check(results, '1440 无页面级横向溢出', await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth))
  check(results, '桌面旅程无控制台错误', desktop.errors.length === 0, desktop.errors.join('\n'))
  await desktop.context.close()

  // ── 390 窄屏：执行 tab 可用、无溢出、触控尺寸 ───────────────────────────
  const mobile = await createPage(browser, { width: 390, height: 844 })
  await openAssistantSession(mobile.page)
  await openRunTab(mobile.page)
  const mobileRunLog = mobile.page.locator('[data-test="authoring-run-log"]')
  await mobileRunLog.waitFor({ state: 'visible', timeout: 10000 })
  const mobileGeometry = await mobile.page.evaluate(() => {
    const refresh = document.querySelector('.authoring-run-log__refresh')
    const box = refresh?.getBoundingClientRect()
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      refreshMin: box ? Math.min(box.width, box.height) : 0
    }
  })
  check(results, '390 执行 tab 渲染且触控刷新钮 ≥44px', mobileGeometry.refreshMin >= 44, JSON.stringify(mobileGeometry))
  check(results, '390 无水平滚动', mobileGeometry.overflow === 0, mobileGeometry.overflow)
  await mobile.page.screenshot({ path: path.join(OUT_DIR, '06-run-log-390.png'), fullPage: false })
  check(results, '移动旅程无控制台错误', mobile.errors.length === 0, mobile.errors.join('\n'))
  await mobile.context.close()
} finally {
  await browser.close()
}

const failed = results.filter((result) => !result.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) process.exitCode = 1
