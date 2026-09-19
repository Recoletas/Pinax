/* eslint-disable no-console */
// F2-6 real-page Gate: top-level proofing and project search workbenches plus
// automatic writing history. Every journey uses an isolated Playwright context
// seeded from the canonical Authoring fixture; it never touches the user's
// browser profile or starts/stops the existing dev server.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const FIXTURE_DIR = path.resolve('tmp/authoring-rollout')
const OUT_DIR = path.resolve('/tmp/pinax-f2-review-search-history')
const state = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-state.json'), 'utf8'))
const baseStorage = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-localstorage.json'), 'utf8'))
const fixtureWorldbookKey = Object.keys(baseStorage).find((key) => key.startsWith('worldbook_') && key !== 'worldbooks_index')
const fixtureWorldbook = fixtureWorldbookKey ? JSON.parse(baseStorage[fixtureWorldbookKey]) : { entries: [] }
const expectedReviewEntries = (fixtureWorldbook.entries || []).filter((entry) => ['莉娜', '旧港税务所', '星图回应'].includes(entry.name))
const excludedReviewEntry = (fixtureWorldbook.entries || []).find((entry) => entry.name === '艾德加')
const screenshots = {
  reviewDesktop: path.join(OUT_DIR, 'review-1440.png'),
  searchDesktop: path.join(OUT_DIR, 'search-1440.png'),
  historyDesktop: path.join(OUT_DIR, 'history-1440.png'),
  reviewMobile: path.join(OUT_DIR, 'review-390.png'),
  searchMobile: path.join(OUT_DIR, 'search-390.png'),
  historyMobile: path.join(OUT_DIR, 'history-390.png')
}
fs.mkdirSync(OUT_DIR, { recursive: true })

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function nodeText(node) {
  if (typeof node?.text === 'string') return node.text
  return (Array.isArray(node?.content) ? node.content : []).map(nodeText).join('')
}

function appendTextToLastLeaf(node, suffix) {
  if (!node || typeof node !== 'object') return false
  if (typeof node.text === 'string') {
    node.text += suffix
    return true
  }
  const children = Array.isArray(node.content) ? node.content : []
  for (let index = children.length - 1; index >= 0; index -= 1) {
    if (appendTextToLastLeaf(children[index], suffix)) return true
  }
  return false
}

function isolatedStorage() {
  const storage = clone(baseStorage)
  const books = JSON.parse(storage.writing_books || '[]')
  const book = books.find((candidate) => String(candidate.id) === String(state.bookId))
  const chapter = book?.chapters?.[0]
  const unit = chapter?.editorDocument?.content?.[0]
  const node = unit?.content?.[0]
  if (!book || !chapter || !unit || !node) {
    throw new Error('F2-6 fixture is missing the first manuscript node')
  }

  // Add one deterministic local proofing issue without rewriting the checked-in
  // fixture. It proves that opening the panel performs a real read-only scan.
  const before = nodeText(node)
  const sentinel = '校对哨兵，，'
  if (!appendTextToLastLeaf(node, sentinel)) throw new Error('F2-6 proofing sentinel could not be inserted')
  const after = nodeText(node)
  node.attrs = {
    ...(node.attrs || {}),
    rawMarkdown: after,
    originalText: after,
    nodeRevision: Number(node.attrs?.nodeRevision || 0) + 1
  }
  unit.attrs = {
    ...(unit.attrs || {}),
    unitRevision: Number(unit.attrs?.unitRevision || 0) + 1
  }
  chapter.editorDocument.revision = Number(chapter.editorDocument.revision || 0) + 1
  chapter.content = String(chapter.content || '').replace(before, after)
  chapter.wordCount = String(chapter.content || '').replace(/\s/gu, '').length
  storage.writing_books = JSON.stringify(books)
  storage.writing_history_preferences_v1 = JSON.stringify({ schemaVersion: 1, enabled: true, intervalWords: 500 })
  return storage
}

function check(results, label, pass, detail = '') {
  const result = { label, pass: Boolean(pass), detail: String(detail).slice(0, 900) }
  results.push(result)
  console.log(`${result.pass ? 'PASS' : 'FAIL'} ${label}${result.detail ? ` — ${result.detail}` : ''}`)
}

function inspectReviewProviderRequests(requests) {
  const expectedRefs = expectedReviewEntries.map((entry) => `worldbook-entry:${entry.id}`).sort()
  const excludedRef = excludedReviewEntry ? `worldbook-entry:${excludedReviewEntry.id}` : ''
  const batches = requests.map((request) => {
    const blocks = Array.isArray(request?.envelope?.blocks) ? request.envelope.blocks : []
    const refs = blocks.flatMap((block) => block.sourceRefs || []).filter((ref) => String(ref).startsWith('worldbook-entry:'))
    const serialized = blocks.map((block) => String(block.content || '')).join('\n')
    const reviewBlockCount = (serialized.match(/【章节审查目标块】/gu) || []).length
    return {
      refs,
      reviewBlockCount,
      exactEvidence: refs.length === expectedRefs.length
        && [...refs].sort().every((ref, index) => ref === expectedRefs[index])
        && (!excludedRef || !refs.includes(excludedRef))
        && expectedReviewEntries.every((entry) => serialized.includes(String(entry.content || '').slice(0, 24)))
    }
  })
  return {
    expectedRefs,
    excludedRef,
    batches,
    exactEvidence: batches.length > 0 && batches.every((batch) => batch.exactEvidence),
    reviewBlocksOnce: batches.length > 0 && batches.every((batch) => batch.reviewBlockCount === 1)
  }
}

async function probeServer() {
  const response = await fetch(BASE, { signal: AbortSignal.timeout(2500) }).catch(() => null)
  if (!response?.ok) throw new Error(`F2-6 Gate requires the existing dev server at ${BASE}`)
}

function installReviewProvider(page) {
  const requests = []
  page.route('**/api/advisor/task', async (route) => {
    let payload = null
    try { payload = route.request().postDataJSON() } catch { /* handled below */ }
    if (!['writing.chapter.health', 'authoring.review.chapter'].includes(payload?.taskType)) return route.continue()
    requests.push(payload)
    const advice = JSON.stringify({
      task: payload.taskType,
      mode: 'review',
      summary: 'F2-6 确定性校对完成。',
      findings: []
    })
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        taskType: payload.taskType,
        advice,
        result: { task: payload.taskType, mode: 'review', summary: 'F2-6 确定性校对完成。', findings: [] },
        meta: { fixture: 'f2-review-search-history' }
      })
    })
  })
  return requests
}

async function createPage(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await context.addInitScript((snapshot) => {
    localStorage.clear()
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
    localStorage.setItem('app_ui_zoom', '1')
    localStorage.setItem('pinax_agent_runtime_policy_v1', JSON.stringify({ enabled: true, passiveHints: { 'writing-inline': false } }))
  }, isolatedStorage())
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => {
    errors.push(`pageerror:${error.message}`)
    console.log('F2-6 page error', error.message)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console:${message.text()}`)
  })
  const reviewRequests = installReviewProvider(page)
  await page.goto(`${BASE}/authoring?bookId=${state.bookId}&chapterId=fogch-1`, { waitUntil: 'domcontentloaded' })
  await page.locator('.wall__dossier .ProseMirror').waitFor({ timeout: 30000 })
  await page.locator('.writing-tool-rail').waitFor({ timeout: 30000 })
  await page.waitForTimeout(900)
  return { context, page, errors, reviewRequests }
}

async function selectPhrase(page, phrase = '莉娜数完第三盏航灯') {
  const paragraph = page.locator('.wall__dossier .ProseMirror p').filter({ hasText: phrase }).first()
  await paragraph.waitFor({ state: 'visible' })
  await paragraph.evaluate((element, selectedText) => {
    element.closest('.ProseMirror')?.focus()
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const nodes = []
    let combined = ''
    while (walker.nextNode()) {
      nodes.push({ node: walker.currentNode, start: combined.length, end: combined.length + walker.currentNode.textContent.length })
      combined += walker.currentNode.textContent
    }
    const start = combined.indexOf(selectedText)
    if (start < 0) throw new Error(`selection phrase missing: ${selectedText}`)
    const end = start + selectedText.length
    const startNode = nodes.find((item) => start >= item.start && start <= item.end)
    const endNode = [...nodes].reverse().find((item) => end >= item.start && end <= item.end)
    if (!startNode || !endNode) throw new Error('selection range could not be mapped')
    const range = document.createRange()
    range.setStart(startNode.node, start - startNode.start)
    range.setEnd(endNode.node, end - endNode.start)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }))
  }, phrase)
  await page.waitForTimeout(80)
}

async function setEditorScroll(page, top) {
  return page.evaluate((nextTop) => {
    const owner = document.querySelector('.wall__dossier-scroll')
    if (!owner) return 0
    owner.scrollTop = Math.min(nextTop, Math.max(0, owner.scrollHeight - owner.clientHeight))
    return owner.scrollTop
  }, top)
}

async function surfaceState(page) {
  return page.evaluate(() => ({
    chapterTitle: document.querySelector('.wall__dossier-title')?.value || document.querySelector('.wall__dossier-title')?.textContent || '',
    selection: window.getSelection()?.toString() || '',
    scrollTop: Number(document.querySelector('.wall__dossier-scroll')?.scrollTop || 0),
    editorFocused: Boolean(document.activeElement?.closest?.('.wall__dossier .ProseMirror'))
  }))
}

function sameSurface(before, after) {
  return before.chapterTitle === after.chapterTitle
    && before.selection === after.selection
    && Math.abs(before.scrollTop - after.scrollTop) <= 1
    && after.editorFocused
}

async function waitForReviewComplete(page) {
  await page.waitForFunction(() => {
    const panel = document.querySelector('[data-test="authoring-review-panel"]')
    if (!panel) return false
    const status = panel.querySelector('.authoring-review-panel__notice')?.textContent || ''
    return /校对完成|批校对失败|已完成/.test(status)
  }, null, { timeout: 30000 })
}

async function openDesktopReview(page) {
  await page.locator('.editor-toolbar').getByRole('button', { name: '校对', exact: true }).click()
  const panel = page.locator('[data-test="authoring-review-panel"]')
  await panel.waitFor({ state: 'visible', timeout: 10000 })
  return panel
}

async function openDesktopSearch(page) {
  await page.locator('.editor-toolbar').getByRole('button', { name: '查找', exact: true }).click()
  const panel = page.locator('[data-test="authoring-search-panel"]')
  await panel.waitFor({ state: 'visible', timeout: 10000 })
  return panel
}

async function openMobileTool(page, label, panelSelector) {
  await page.getByRole('button', { name: '更多写作操作' }).click()
  const menu = page.locator('.wall__more-menu[aria-label="更多写作操作"]')
  await menu.waitFor({ state: 'visible' })
  await menu.getByRole('menuitem', { name: label, exact: true }).click()
  const panel = page.locator(panelSelector)
  await panel.waitFor({ state: 'visible', timeout: 10000 })
  return panel
}

async function closeReview(page) {
  const panel = page.locator('[data-test="authoring-review-panel"]')
  await panel.getByRole('button', { name: '关闭校对' }).click()
  await panel.waitFor({ state: 'hidden' })
  await page.waitForTimeout(160)
}

async function closeSearch(page) {
  const panel = page.locator('[data-test="authoring-search-panel"]')
  await panel.getByRole('button', { name: '关闭查找' }).click()
  await panel.waitFor({ state: 'hidden' })
  await page.waitForTimeout(160)
}

async function runFullBookSearch(page, panel) {
  await panel.getByRole('button', { name: '全书', exact: true }).click()
  await panel.getByRole('searchbox', { name: '查找文字' }).fill('艾德加')
  await panel.getByRole('button', { name: '查找', exact: true }).click()
  await panel.locator('.authoring-search-result').first().waitFor({ state: 'visible', timeout: 10000 })
  return panel.locator('.authoring-search-result')
}

async function openCrossChapterResultAndReturn(page, panel, origin) {
  const crossChapter = panel.locator('.authoring-search-result').filter({ hasText: '灯下空格' }).first()
  await crossChapter.waitFor({ state: 'visible', timeout: 10000 })
  await crossChapter.locator('.authoring-search-result__open').click()
  await page.waitForFunction(() => document.querySelector('.wall__dossier-title')?.value === '灯下空格')
  const returnButton = panel.getByRole('button', { name: '返回原处', exact: true })
  await returnButton.waitFor({ state: 'visible' })
  await returnButton.click()
  await page.waitForFunction((title) => document.querySelector('.wall__dossier-title')?.value === title, origin.chapterTitle)
  await page.waitForTimeout(140)
  return surfaceState(page)
}

// 20260917 UI 线（c445dd4）起，rail“历史”改开设置的记忆页；写作检查器的
// 版本面板从批注工具的“版本”页签进入。本 Gate 校对的是版本面板本体旅程。
async function inspectHistory(page) {
  await page.locator('[data-authoring-tool="annotations"]').click({ force: true })
  const inspector = page.locator('.writing-inspector.is-open')
  await inspector.waitFor({ state: 'visible', timeout: 10000 })
  await inspector.locator('.writing-inspector__tabs button', { hasText: '版本' }).click()
  const panel = inspector.locator('.writing-version-panel')
  await panel.waitFor({ state: 'visible', timeout: 10000 })
  const settings = panel.locator('.writing-version-panel__automatic')
  const checkbox = settings.locator('input[type="checkbox"]')
  const select = settings.locator('select')
  const options = await select.locator('option').allTextContents()
  return { inspector, settings, checkbox, select, options }
}

async function closeHistory(page) {
  await page.locator('.writing-inspector.is-open .writing-inspector__icon-btn[title="关闭检查器"]').click()
  await page.locator('.writing-inspector.is-open').waitFor({ state: 'hidden' })
  await page.waitForTimeout(160)
}

async function geometry(page, selector) {
  return page.evaluate((targetSelector) => {
    const node = document.querySelector(targetSelector)
    const box = node?.getBoundingClientRect()
    return {
      width: box?.width || 0,
      height: box?.height || 0,
      top: box?.top || 0,
      left: box?.left || 0,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      innerOverflow: node ? node.scrollWidth - node.clientWidth : null
    }
  }, selector)
}

async function runJourney(results, label, callback) {
  try {
    await callback()
  } catch (error) {
    check(results, `${label}旅程可完成`, false, error?.stack || error)
  }
}

await probeServer()
const browser = await chromium.launch()
const results = []

try {
  await runJourney(results, '1440', async () => {
    const run = await createPage(browser, { width: 1440, height: 900 })
    try {
      const page = run.page
      const editorToolbar = page.locator('.editor-toolbar')
      check(results, '1440 顶栏直接提供校对入口', await editorToolbar.getByRole('button', { name: '校对', exact: true }).count() === 1)
      check(results, '1440 顶栏直接提供查找入口', await editorToolbar.getByRole('button', { name: '查找', exact: true }).count() === 1)

      await selectPhrase(page)
      await setEditorScroll(page, 220)
      const beforeReview = await surfaceState(page)
      const review = await openDesktopReview(page)
      check(results, '校对是 modeless 编辑工作台', await review.getAttribute('aria-modal') === 'false')
      check(results, '校对面板没有聊天输入框', await review.getByRole('textbox').count() === 0 && await review.locator('textarea,[contenteditable="true"]').count() === 0)
      await waitForReviewComplete(page)
      await page.waitForTimeout(220)
      check(results, '真实校对扫描发现可定位的本地问题', await review.locator('.authoring-review-finding').count() >= 1, await review.innerText())
      check(results, '校对扫描调用受控章节检查而不写正文', run.reviewRequests.length >= 1, String(run.reviewRequests.length))
      const providerInspection = inspectReviewProviderRequests(run.reviewRequests)
      check(results, '校对请求只携带命中/当前场世界书证据', providerInspection.exactEvidence, JSON.stringify(providerInspection))
      check(results, '每批 provider envelope 只序列化一次审查目标块', providerInspection.reviewBlocksOnce, JSON.stringify(providerInspection.batches))
      check(results, '校对持有交互时正文选区浮条不穿透', await page.locator('.writing-selection-actions').count() === 0)
      await page.screenshot({ path: screenshots.reviewDesktop, fullPage: false })
      await closeReview(page)
      const afterReview = await surfaceState(page)
      check(results, '关闭校对恢复正文 scrollTop、焦点与选区', sameSurface(beforeReview, afterReview), JSON.stringify({ beforeReview, afterReview }))

      await selectPhrase(page)
      await setEditorScroll(page, 180)
      const beforeSearchClose = await surfaceState(page)
      let search = await openDesktopSearch(page)
      check(results, '查找公开当前章、全书、构思、设定四个范围', await search.locator('.authoring-search-panel__scopes button').allTextContents().then((items) => items.join('|')) === '当前章|全书|构思|设定')
      await closeSearch(page)
      const afterSearchClose = await surfaceState(page)
      check(results, '直接关闭查找恢复正文 scrollTop、焦点与选区', sameSurface(beforeSearchClose, afterSearchClose), JSON.stringify({ beforeSearchClose, afterSearchClose }))

      await selectPhrase(page)
      await setEditorScroll(page, 180)
      const searchOrigin = await surfaceState(page)
      search = await openDesktopSearch(page)
      const findings = await runFullBookSearch(page, search)
      check(results, '全书查找返回跨章定位结果', await findings.count() >= 2, String(await findings.count()))
      const returned = await openCrossChapterResultAndReturn(page, search, searchOrigin)
      check(results, '跨章结果提供返回原处并恢复原选区', sameSurface(searchOrigin, returned), JSON.stringify({ searchOrigin, returned }))
      check(results, '查找持有交互时正文选区浮条不覆盖查询框', await page.locator('.writing-selection-actions').count() === 0)
      await page.screenshot({ path: screenshots.searchDesktop, fullPage: false })
      await closeSearch(page)

      await selectPhrase(page)
      await setEditorScroll(page, 160)
      const beforeHistory = await surfaceState(page)
      const history = await inspectHistory(page)
      check(results, '历史栏公开默认开启的自动历史', await history.checkbox.isChecked())
      check(results, '自动历史提供 500、1000、2000 字间隔', history.options.join('|') === '每 500 字|每 1,000 字|每 2,000 字', history.options.join('|'))
      await history.select.selectOption('1000')
      const persistedPreference = await page.evaluate(() => JSON.parse(localStorage.getItem('writing_history_preferences_v1') || '{}'))
      check(results, '自动历史设置经唯一偏好键落盘', persistedPreference.enabled === true && persistedPreference.intervalWords === 1000, JSON.stringify(persistedPreference))
      await page.screenshot({ path: screenshots.historyDesktop, fullPage: false })
      await closeHistory(page)
      const afterHistory = await surfaceState(page)
      check(results, '关闭历史栏恢复正文 scrollTop、焦点与选区', sameSurface(beforeHistory, afterHistory), JSON.stringify({ beforeHistory, afterHistory }))
      check(results, '1440 无页面级横向滚动', await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth))
      check(results, '1440 旅程无控制台错误', run.errors.length === 0, run.errors.join(' | '))
    } finally {
      await run.context.close()
    }
  })

  await runJourney(results, '390', async () => {
    const run = await createPage(browser, { width: 390, height: 844 })
    try {
      const page = run.page
      await page.getByRole('button', { name: '更多写作操作' }).click()
      const menu = page.locator('.wall__more-menu[aria-label="更多写作操作"]')
      await menu.waitFor({ state: 'visible' })
      check(results, '390 More 直接提供校对与查找', await menu.getByRole('menuitem', { name: '校对', exact: true }).count() === 1 && await menu.getByRole('menuitem', { name: '查找', exact: true }).count() === 1)
      await page.getByRole('button', { name: '更多写作操作' }).click()

      await selectPhrase(page)
      await setEditorScroll(page, 120)
      const beforeReview = await surfaceState(page)
      const review = await openMobileTool(page, '校对', '[data-test="authoring-review-panel"]')
      await waitForReviewComplete(page)
      await page.waitForTimeout(220)
      const reviewGeometry = await geometry(page, '[data-test="authoring-review-panel"]')
      check(results, '390 校对为完整 viewport sheet 且无聊天框', Math.abs(reviewGeometry.width - 390) <= 1 && Math.abs(reviewGeometry.height - 844) <= 1 && reviewGeometry.overflow === 0 && await review.getByRole('textbox').count() === 0, JSON.stringify(reviewGeometry))
      check(results, '390 校对 sheet 不穿透正文选区浮条', await page.locator('.writing-selection-actions').count() === 0)
      await page.screenshot({ path: screenshots.reviewMobile, fullPage: false })
      await closeReview(page)
      const afterReview = await surfaceState(page)
      check(results, '390 关闭校对恢复正文 scrollTop、焦点与选区', sameSurface(beforeReview, afterReview), JSON.stringify({ beforeReview, afterReview }))

      await selectPhrase(page)
      await setEditorScroll(page, 120)
      const searchOrigin = await surfaceState(page)
      const search = await openMobileTool(page, '查找', '[data-test="authoring-search-panel"]')
      const searchGeometry = await geometry(page, '[data-test="authoring-search-panel"]')
      check(results, '390 查找为完整 viewport sheet 且四范围无横滚', Math.abs(searchGeometry.width - 390) <= 1 && Math.abs(searchGeometry.height - 844) <= 1 && searchGeometry.overflow === 0 && searchGeometry.innerOverflow === 0 && await search.locator('.authoring-search-panel__scopes button').count() === 4, JSON.stringify(searchGeometry))
      const findings = await runFullBookSearch(page, search)
      check(results, '390 可完成全书搜索', await findings.count() >= 2, String(await findings.count()))
      const returned = await openCrossChapterResultAndReturn(page, search, searchOrigin)
      check(results, '390 跨章搜索可返回原处', sameSurface(searchOrigin, returned), JSON.stringify({ searchOrigin, returned }))
      check(results, '390 查找 sheet 不穿透正文选区浮条', await page.locator('.writing-selection-actions').count() === 0)
      await page.screenshot({ path: screenshots.searchMobile, fullPage: false })
      await closeSearch(page)

      await selectPhrase(page)
      await setEditorScroll(page, 100)
      const beforeHistory = await surfaceState(page)
      const history = await inspectHistory(page)
      check(results, '390 历史 sheet 保留自动历史设置', await history.settings.isVisible() && await history.checkbox.isChecked() && history.options.length === 3)
      const historyGeometry = await geometry(page, '.writing-inspector.is-open')
      check(results, '390 历史栏不压窄正文且页面无横滚', historyGeometry.width >= 360 && historyGeometry.overflow === 0, JSON.stringify(historyGeometry))
      await page.screenshot({ path: screenshots.historyMobile, fullPage: false })
      await closeHistory(page)
      const afterHistory = await surfaceState(page)
      check(results, '390 关闭历史栏恢复正文 scrollTop、焦点与选区', sameSurface(beforeHistory, afterHistory), JSON.stringify({ beforeHistory, afterHistory }))
      check(results, '390 旅程无控制台错误', run.errors.length === 0, run.errors.join(' | '))
    } finally {
      await run.context.close()
    }
  })
} finally {
  await browser.close()
}

const failed = results.filter((result) => !result.pass)
const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  total: results.length,
  failed: failed.length,
  screenshots,
  results
}
fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
console.log(`F2-6 review/search/history Gate: ${results.length - failed.length}/${results.length}`)
console.log(`Report: ${path.join(OUT_DIR, 'report.json')}`)
if (failed.length) process.exitCode = 1
