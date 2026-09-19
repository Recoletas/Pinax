/* eslint-disable no-console */
// S01（助手写作 Skills 接入计划 docs/plan/assistant-writing-skills-20260919.md）
// 基线冻结 Gate：在真实页面上固化既有“校对采纳/撤销”与“按批注改写”两条
// 写入旅程及其故障路径（provider 失败重试、正文变更后过期、取消），并把
// 可复现的输入/输出（请求载荷、finding、正文前后文本）写入基线 JSON。
// 后续 S02+ 切片不得让本 Gate 回退。隔离 Playwright context，不改用户数据。
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const FIXTURE_DIR = path.resolve('tmp/authoring-rollout')
const OUT_DIR = path.resolve('tmp/authoring-writing-baseline')
const state = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-state.json'), 'utf8'))
const baseStorage = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-localstorage.json'), 'utf8'))
fs.mkdirSync(OUT_DIR, { recursive: true })

const TARGET_PHRASE = '莉娜数完第三盏航灯'
const TARGET_REPLACEMENT = '莉娜数完了第三盏航灯'
const REWRITE_PHRASE = '码头石阶已经只剩顶端一线'
const REWRITE_CANDIDATES = [
  (text) => text.replace('已经只剩顶端一线', '只剩顶端一线'),
  (text) => `${text}她没有停留。`
]
const io = { reviewRequests: [], rewriteRequests: [], reviewStatuses: [], texts: {} }

function check(results, label, pass, detail = '') {
  const result = { label, pass: Boolean(pass), detail: String(detail).slice(0, 700) }
  results.push(result)
  console.log(`${result.pass ? 'PASS' : 'FAIL'} ${label}${result.detail ? ` — ${result.detail.slice(0, 160)}` : ''}`)
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

async function paragraphText(page, phrase) {
  return page.evaluate((needle) => {
    const paragraphs = [...document.querySelectorAll('.wall__dossier .ProseMirror p')]
    const hit = paragraphs.find((node) => node.textContent?.includes(needle))
    return hit?.textContent || ''
  }, phrase)
}

async function selectPhrase(page, phrase) {
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
  await page.waitForTimeout(64)
}

// advisor 路由 mock：校对（writing.chapter.health）按窗口 blocks 动态构造
// 一个可逐字核验的 finding；改写（writing.fix.selection）按选区文本构造两个
// 候选。mode 由各旅程在 Node 侧切换：ok / fail-review / fail-rewrite / delay。
async function installAdvisor(page, control) {
  const requests = []
  await page.addInitScript(() => {
    localStorage.setItem('text_model_configs', JSON.stringify([{
      id: 'writing-baseline-provider',
      name: 'Writing baseline deterministic provider',
      providerId: 'openai',
      baseUrl: 'https://writing-baseline.invalid/v1',
      apiKey: 'writing-baseline-test-key',
      model: 'writing-baseline-model'
    }]))
    localStorage.setItem('text_model_selected', 'writing-baseline-provider')
    localStorage.setItem('pinax_agent_runtime_policy_v1', JSON.stringify({ enabled: true, passiveHints: { 'writing-inline': false } }))
  })
  await page.route('**/api/advisor/task', async (route) => {
    let payload = null
    try { payload = route.request().postDataJSON() } catch { /* handled below */ }
    const taskType = String(payload?.taskType || '')
    // 客户端请求体携带 canonical 任务名（别名在 requestAdvisorTask 出口解析）。
    const isReview = ['writing.chapter.health', 'authoring.review.chapter'].includes(taskType)
    const isRewrite = ['writing.fix.selection', 'writing.fix.paragraph', 'authoring.rewrite'].includes(taskType)
    if (!isReview && !isRewrite) {
      return route.fulfill({
        status: 501,
        contentType: 'application/json',
        body: JSON.stringify({ error: `writing-skills baseline does not serve ${taskType || 'malformed request'}` })
      })
    }
    requests.push({
      taskType,
      question: String(payload?.question || '').slice(0, 200),
      targetText: String(payload?.target?.text || payload?.options?.targetBlocks?.map((block) => block.text).join('') || '').slice(0, 200),
      reviewBlockCount: Array.isArray(payload?.options?.reviewBlocks) ? payload.options.reviewBlocks.length : null
    })
    if (isReview) {
      if (control.review === 'fail') {
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'baseline deterministic review failure', retryable: true }) })
      }
      const blocks = Array.isArray(payload?.options?.reviewBlocks) ? payload.options.reviewBlocks : []
      const findings = []
      for (const block of blocks) {
        const start = Number(block?.text?.indexOf(TARGET_PHRASE))
        if (!block?.nodeId || start < 0) continue
        findings.push({
          issueType: 'grammar',
          severity: 'medium',
          confidence: 0.9,
          reason: '基线 fixture：句子缺少完成助词，建议补“了”。',
          target: { nodeId: block.nodeId, startOffset: start, endOffset: start + TARGET_PHRASE.length, exact: TARGET_PHRASE },
          replacement: TARGET_REPLACEMENT,
          evidenceRefs: (block.sourceRefs || []).slice(0, 2)
        })
        break
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          taskType,
          advice: JSON.stringify({ summary: 'writing-skills baseline review', findings }),
          result: { task: taskType, mode: 'review', summary: 'writing-skills baseline review', findings },
          meta: { fixture: 'writing-skills-baseline' }
        })
      })
    }
    if (isRewrite && control.rewrite === 'fail') {
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'baseline deterministic rewrite failure', retryable: true }) })
    }
    if (isRewrite && control.rewrite === 'delay') await new Promise((resolve) => setTimeout(resolve, 4000))
    // 请求体 target 来自 envelope（不含原文）；选区原文在 kind:'selection' 块。
    const selectionBlock = (payload?.envelope?.blocks || []).find((block) => (
      block?.kind === 'selection' && String(block?.content || '').startsWith('【必须处理的当前选区】')
    ))
    const selected = selectionBlock
      ? String(selectionBlock.content).slice('【必须处理的当前选区】\n'.length)
      : String(payload?.target?.text || '')
    const candidates = REWRITE_CANDIDATES.map((build, index) => ({
      id: `baseline-candidate-${index + 1}`,
      label: `方案 ${index + 1}`,
      replacement: build(selected),
      rationale: index === 0 ? '收紧重复表述。' : '在句末补一个动作收束。'
    })).filter((candidate) => candidate.replacement && candidate.replacement !== selected)
    if (!candidates.length) {
      return route.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ error: 'baseline rewrite fixture received unexpected selection' }) })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        taskType,
        advice: JSON.stringify({ summary: 'writing-skills baseline rewrite', candidates }),
        result: { task: taskType, mode: 'candidates', summary: 'writing-skills baseline rewrite', candidates },
        meta: { fixture: 'writing-skills-baseline' }
      })
    })
  })
  return requests
}

async function createPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await context.addInitScript((snapshot) => {
    localStorage.clear()
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
    localStorage.setItem('app_ui_zoom', '1')
  }, deepClone(baseStorage))
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    // 与 runner.mjs 同规则：资源级 HTTP/网络失败单独分类；故障旅程的 5xx 是 mock 有意注入。
    if (/Failed to load resource: (?:the server responded with a status of (?:4\d\d|5\d\d)|net::ERR_[A-Z_]+)/i.test(text)) return
    errors.push(`console:${text}`)
  })
  const control = { review: 'ok', rewrite: 'ok' }
  const requests = await installAdvisor(page, control)
  await page.goto(`${BASE}/authoring?bookId=${state.bookId}&chapterId=fogch-1`, { waitUntil: 'domcontentloaded' })
  await page.locator('.wall__dossier .ProseMirror').waitFor({ timeout: 30000 })
  await page.locator('.writing-tool-rail').waitFor({ timeout: 30000 })
  await page.waitForTimeout(900)
  return { context, page, errors, control, requests }
}

async function openReview(page) {
  await page.locator('.editor-toolbar').getByRole('button', { name: '校对', exact: true }).click()
  const panel = page.locator('[data-test="authoring-review-panel"]')
  await panel.waitFor({ state: 'visible', timeout: 10000 })
  return panel
}

async function waitForReviewComplete(page) {
  await page.locator('[data-test="authoring-review-panel"] .authoring-review-panel__toolbar button:not(.is-primary)').waitFor({ state: 'visible', timeout: 30000 }).catch(() => {})
  await page.waitForFunction(() => {
    const toolbar = document.querySelector('[data-test="authoring-review-panel"] .authoring-review-panel__toolbar')
    return toolbar && !toolbar.textContent.includes('正在检查')
  }, { timeout: 30000 })
  await page.waitForTimeout(240)
}

function baselineFinding(page) {
  return page.locator('.authoring-review-finding').filter({ hasText: TARGET_REPLACEMENT }).first()
}

async function runReviewScan(page, panel) {
  if (await panel.getByRole('button', { name: /开始校对|重新校对/ }).count()) {
    await panel.getByRole('button', { name: /开始校对|重新校对/ }).first().click()
  }
  await waitForReviewComplete(page)
}

async function closeReview(page) {
  await page.locator('[data-test="authoring-review-panel"] button[aria-label="关闭校对"]').click()
  await page.locator('[data-test="authoring-review-panel"]').waitFor({ state: 'hidden', timeout: 5000 })
}

const browser = await chromium.launch()
const results = []

try {
  // J1 校对采纳/撤销：定位建议 → 采用 → 正文变化 → 撤销恢复。
  {
    const run = await createPage(browser)
    try {
      const page = run.page
      io.texts.reviewBefore = await paragraphText(page, TARGET_PHRASE)
      const panel = await openReview(page)
      await runReviewScan(page, panel)
      const finding = await baselineFinding(page)
      check(results, '校对返回可逐字核验并带替换的建议', await finding.count() === 1)
      await finding.locator('footer button', { hasText: '采用' }).click()
      await page.waitForTimeout(600)
      io.texts.reviewAdopted = await paragraphText(page, TARGET_REPLACEMENT)
      check(results, '采纳后正文按建议变化', io.texts.reviewAdopted.includes(TARGET_REPLACEMENT), io.texts.reviewAdopted.slice(0, 80))
      check(results, '采纳后给出可撤销回执', await panel.getByRole('button', { name: '撤销采用' }).isVisible())
      await panel.getByRole('button', { name: '撤销采用' }).click()
      await page.waitForTimeout(600)
      io.texts.reviewUndone = await paragraphText(page, TARGET_PHRASE)
      check(results, '撤销后正文恢复原句', io.texts.reviewUndone.includes(TARGET_PHRASE) && !io.texts.reviewUndone.includes(TARGET_REPLACEMENT), io.texts.reviewUndone.slice(0, 80))
      check(results, '采纳/撤销旅程无控制台错误', run.errors.length === 0, run.errors.join(' | '))
    } finally {
      io.reviewRequests.push(...run.requests.filter((request) => request.taskType === 'writing.chapter.health'))
      await run.context.close()
    }
  }

  // J2 校对失败重试：批次全失败时保留只读态与明确报错，不写正文；重试后可用。
  {
    const run = await createPage(browser)
    try {
      const page = run.page
      run.control.review = 'fail'
      const before = await paragraphText(page, TARGET_PHRASE)
      const panel = await openReview(page)
      await runReviewScan(page, panel)
      const notice = await panel.locator('.authoring-review-panel__notice').textContent().catch(() => '')
      io.reviewStatuses.push({ journey: 'failure', notice })
      check(results, '校对批次失败给出明确报错', (notice || '').includes('批校对失败') || (notice || '').includes('已完成'), notice || '')
      check(results, '失败批次不产生可采纳建议', await baselineFinding(page).count() === 0)
      check(results, '失败后正文未变化', await paragraphText(page, TARGET_PHRASE) === before)
      run.control.review = 'ok'
      await runReviewScan(page, panel)
      check(results, '重试校对后建议可用', await baselineFinding(page).count() === 1)
      check(results, '失败重试旅程无控制台错误', run.errors.length === 0, run.errors.join(' | '))
    } finally {
      await run.context.close()
    }
  }

  // J3 采纳后正文再改动：旧撤销入口消失，建议转为过期只读，不得越过新修改写入。
  {
    const run = await createPage(browser)
    try {
      const page = run.page
      const panel = await openReview(page)
      await runReviewScan(page, panel)
      const finding = await baselineFinding(page)
      await finding.locator('footer button', { hasText: '采用' }).click()
      await page.waitForTimeout(500)
      await page.locator('.wall__dossier .ProseMirror p').filter({ hasText: TARGET_REPLACEMENT }).first().click()
      await page.keyboard.press('End')
      await page.keyboard.insertText('（J3后续修改）')
      await page.waitForTimeout(900)
      check(results, '采纳后正文再改，撤销入口消失', await panel.getByRole('button', { name: '撤销采用' }).count() === 0)
      check(results, '已采纳建议保留 applied 只读展示', await panel.locator('.authoring-review-finding.is-applied').count() >= 1)
      const staleNotice = await panel.locator('.authoring-review-panel__notice').last().textContent().catch(() => '')
      check(results, '过期态给出不能采用的说明', (staleNotice || '').includes('不能采用'), staleNotice || '')
      check(results, '过期旅程无控制台错误', run.errors.length === 0, run.errors.join(' | '))
    } finally {
      await run.context.close()
    }
  }

  // J4 按批注改写：批注 → 生成候选 → 差异 → 采用 → 正文变化。
  {
    const run = await createPage(browser)
    try {
      const page = run.page
      io.texts.rewriteBefore = await paragraphText(page, REWRITE_PHRASE)
      await selectPhrase(page, REWRITE_PHRASE)
      await page.locator('.writing-selection-actions button[title="为选中文字添加批注"]').click()
      const composer = page.locator('.writing-annotation-composer')
      await composer.locator('textarea[aria-label="批注内容"]').fill('基线 fixture：这句节奏偏松，请收紧。')
      await composer.locator('button[type="submit"]', { hasText: '添加' }).click()
      const annotation = page.locator('.writing-annotation').filter({ hasText: '这句节奏偏松' }).first()
      check(results, '选区批注创建成功', await annotation.isVisible())
      await annotation.locator('footer button', { hasText: '按批注改写' }).click()
      const rewrite = page.locator('.writing-annotation-rewrite')
      await rewrite.locator('button', { hasText: '生成改写' }).click()
      await page.waitForFunction(() => document.querySelectorAll('.writing-annotation-rewrite__choices button').length >= 2, { timeout: 20000 })
      check(results, '改写返回两个候选', await page.locator('.writing-annotation-rewrite__choices button').count() === 2)
      check(results, '候选展示原文/候选差异', await page.locator('.writing-rewrite-diff').first().isVisible())
      await page.locator('.writing-annotation-rewrite__choices button', { hasText: '2' }).click()
      const candidateText = REWRITE_CANDIDATES[1](REWRITE_PHRASE)
      await rewrite.locator('footer button', { hasText: '采用' }).click()
      await page.waitForTimeout(700)
      io.texts.rewriteAdopted = await paragraphText(page, REWRITE_PHRASE.slice(0, 6))
      check(results, '采纳候选后正文替换为候选文本', io.texts.rewriteAdopted.includes(candidateText), io.texts.rewriteAdopted.slice(0, 100))
      check(results, '采纳后候选区收起', await page.locator('.writing-annotation-rewrite').count() === 0)
      check(results, '改写旅程无控制台错误', run.errors.length === 0, run.errors.join(' | '))
    } finally {
      io.rewriteRequests.push(...run.requests.filter((request) => request.taskType.startsWith('writing.fix')))
      await run.context.close()
    }
  }

  // J5 改写失败重试与取消：失败可重试、进行中可停止且都不写正文。
  {
    const run = await createPage(browser)
    try {
      const page = run.page
      run.control.rewrite = 'fail'
      await selectPhrase(page, REWRITE_PHRASE)
      await page.locator('.writing-selection-actions button[title="为选中文字添加批注"]').click()
      const composer = page.locator('.writing-annotation-composer')
      await composer.locator('textarea[aria-label="批注内容"]').fill('基线 fixture：请改写这句。')
      await composer.locator('button[type="submit"]', { hasText: '添加' }).click()
      const annotation = page.locator('.writing-annotation').filter({ hasText: '请改写这句' }).first()
      await annotation.locator('footer button', { hasText: '按批注改写' }).click()
      const rewrite = page.locator('.writing-annotation-rewrite')
      await rewrite.locator('button', { hasText: '生成改写' }).click()
      await rewrite.locator('.writing-rewrite-panel__error').waitFor({ timeout: 20000 })
      const rewriteError = await rewrite.locator('.writing-rewrite-panel__error').textContent()
      check(results, '改写失败给出可读错误', Boolean(rewriteError && rewriteError.trim()), rewriteError || '')
      check(results, '改写失败后提供重试入口', await rewrite.locator('button', { hasText: '重试' }).isVisible())
      check(results, '改写失败不产生候选', await page.locator('.writing-annotation-rewrite__choices').count() === 0)
      run.control.rewrite = 'ok'
      await rewrite.locator('button', { hasText: '重试' }).click()
      await page.waitForFunction(() => document.querySelectorAll('.writing-annotation-rewrite__choices button').length >= 2, { timeout: 20000 })
      check(results, '重试改写后候选可用', true)
      run.control.rewrite = 'delay'
      await rewrite.locator('button', { hasText: '重新生成' }).click()
      await rewrite.locator('button', { hasText: '停止' }).waitFor({ timeout: 5000 })
      await rewrite.locator('button', { hasText: '停止' }).click()
      await rewrite.locator('.writing-rewrite-panel__error').waitFor({ timeout: 8000 })
      const cancelError = await rewrite.locator('.writing-rewrite-panel__error').textContent()
      check(results, '进行中的改写可停止且提示可重试', (cancelError || '').includes('取消'), cancelError || '')
      check(results, '失败/取消旅程无控制台错误', run.errors.length === 0, run.errors.join(' | '))
    } finally {
      io.rewriteRequests.push(...run.requests.filter((request) => request.taskType.startsWith('writing.fix')))
      await run.context.close()
    }
  }

  // J6 候选过期保护：生成候选后正文再改动，采用必须被拒绝且正文不变。
  {
    const run = await createPage(browser)
    try {
      const page = run.page
      await selectPhrase(page, REWRITE_PHRASE)
      await page.locator('.writing-selection-actions button[title="为选中文字添加批注"]').click()
      const composer = page.locator('.writing-annotation-composer')
      await composer.locator('textarea[aria-label="批注内容"]').fill('基线 fixture：请改写这句。')
      await composer.locator('button[type="submit"]', { hasText: '添加' }).click()
      const annotation = page.locator('.writing-annotation').filter({ hasText: '请改写这句' }).first()
      await annotation.locator('footer button', { hasText: '按批注改写' }).click()
      const rewrite = page.locator('.writing-annotation-rewrite')
      await rewrite.locator('button', { hasText: '生成改写' }).click()
      await page.waitForFunction(() => document.querySelectorAll('.writing-annotation-rewrite__choices button').length >= 1, { timeout: 20000 })
      await page.locator('.wall__dossier .ProseMirror p').filter({ hasText: REWRITE_PHRASE }).first().click()
      await page.keyboard.press('End')
      await page.keyboard.insertText('（J6正文变化）')
      await page.waitForTimeout(700)
      // 正文变化后候选由过期检查自动置为 stale：采用按钮禁用，无法写入。
      const adoptButton = rewrite.locator('footer button', { hasText: '采用' })
      await adoptButton.waitFor({ state: 'visible', timeout: 5000 })
      check(results, '正文变化后过期候选禁用采用', await adoptButton.isDisabled())
      const after = await paragraphText(page, REWRITE_PHRASE)
      check(results, '过期候选不写入正文', after.includes(REWRITE_PHRASE) && after.includes('（J6正文变化）'), after.slice(0, 100))
      check(results, '候选过期旅程无控制台错误', run.errors.length === 0, run.errors.join(' | '))
    } finally {
      await run.context.close()
    }
  }
} finally {
  await browser.close()
}

const failed = results.filter((result) => !result.pass)
fs.writeFileSync(path.join(OUT_DIR, 'baseline.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  total: results.length,
  failed: failed.length,
  results,
  io
}, null, 2))
console.log(`S01 writing-skills baseline Gate: ${results.length - failed.length}/${results.length}`)
if (failed.length) process.exitCode = 1
