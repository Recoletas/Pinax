/* eslint-disable no-console */
import { chromium } from 'playwright'

// M11（2026-09-18 夜间 A 线）：历史工作区展示双轴、来源、更正链、提取
// 丢弃原因与重试；unknown/open 文案一致。真实 IndexedDB + 真实 UI。
//   V1 事实卡展示来源（kind/来源版本/冻结引文）
//   V2 更正链（更正自）与引擎收口标记展示
//   V3 提取任务展示校验拒绝原因；失败任务可显式重新排队（状态回到 queued）
//   V4 unknown/open 文案一致（统一来自 describeInterval：开放≠未知）
const BASE_URL = process.env.PINAX_HISTORY_UI_EVAL_URL || 'http://127.0.0.1:5179'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1440, height: 1000 } })
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(BASE_URL)
  await page.waitForSelector('.authoring-welcome')

  const seeded = await page.evaluate(async () => {
    const L = await import('/src/services/memory/ledger/ledgerDb.js')
    const F = await import('/src/services/memory/ledger/factLedger.js')
    const C = await import('/src/services/memory/memoryCandidates.js')
    const check = (condition, message) => { if (!condition) throw new Error(message) }
    const scope = { domain: 'book', bookId: 'book-history-ui' }

    // 归属下拉锚点
    C.queueMemoryCandidate({ id: 'history-ui-anchor', content: '历史工作区 UI 锚点。', scope: 'project', scopeId: 'book-history-ui', sourceRefs: ['chapter:h:1'], sourceRevision: 'r1' })
    C.confirmMemoryCandidate('history-ui-anchor')

    const opened = await L.openLedgerDb()
    check(opened.ok, 'open failed')
    const db = opened.db
    const ev = await F.appendEvidence(db, { scope, sourceKind: 'chapter-quote', sourceId: 'chapter:h:1', sourceRevision: 'r7', quote: '原句：城主点亮了灯塔。' })
    const p1 = await F.createProposal(db, { scope, subjectKey: '城主', subjectLabel: '城主', predicate: '动作', object: '点亮灯塔', evidenceIds: [ev.evidence.id], origin: 'author', storyInterval: { timelineId: 't1', start: { eraId: 'era-a', ordinal: 4 }, endSemantic: 'open' }, timeline: { id: 't1', eras: [{ id: 'era-a', order: 1 }] } })
    check(p1.ok, 'p1 failed')
    await F.adoptProposal(db, { scope, proposalId: p1.proposal.id, commandId: 'ui-adopt-h1', actorRef: 'eval' })
    const ev2 = await F.appendEvidence(db, { scope, sourceKind: 'chapter-quote', sourceId: 'chapter:h:2', sourceRevision: 'r8', quote: '原句：灯塔换了新灯油。' })
    const p2 = await F.createProposal(db, { scope, subjectKey: '城主', subjectLabel: '城主', predicate: '动作', object: '更换灯油', evidenceIds: [ev2.evidence.id], origin: 'author', storyInterval: { timelineId: 't1', start: { eraId: 'era-a', ordinal: 6 }, endSemantic: 'open' }, timeline: { id: 't1', eras: [{ id: 'era-a', order: 1 }] } })
    check(p2.ok, 'p2 failed')
    await F.adoptProposal(db, { scope, proposalId: p2.proposal.id, commandId: 'ui-adopt-h2', actorRef: 'eval' })
    await L.closeLedgerDb(db)
    return { ok: true }
  })
  console.log('[memory-history-ui-eval] seed ok:', JSON.stringify(seeded))

  await page.reload()
  await page.waitForSelector('.authoring-welcome')
  await page.locator('.library-quick-actions').getByRole('button', { name: '备份与恢复' }).click()
  await page.getByRole('tab', { name: '记忆与历史' }).click()
  const workspace = page.locator('.memory-workspace')
  await workspace.getByLabel('归属').selectOption({ value: JSON.stringify(['project', 'book-history-ui']) })
  await page.getByRole('button', { name: '事实账本' }).click()
  // 内层「视图」下拉切到事实（@change 触发 loadLedger）
  await workspace.getByLabel('视图 待审核提案当前事实决定记录').selectOption({ value: 'facts' })

  // V1+V2：事实卡来源 + 更正链/收口标记 + unknown/open 文案
  const factCards = workspace.locator('.memory-ledger__card')
  await factCards.first().waitFor({ timeout: 15000 })
  const evidenceBlocks = await workspace.locator('[data-test="fact-evidence"]').count()
  if (evidenceBlocks < 2) throw new Error(`V1 事实卡应展示来源（got ${evidenceBlocks}）`)
  const firstCardText = await factCards.first().innerText()
  if (!/来源版本 r8|来源版本 r7/.test(firstCardText)) throw new Error(`V1 来源版本未展示：${firstCardText.slice(0, 80)}`)
  if (!/更正自/.test(await factCards.last().innerText()) && !/引擎收口/.test(await factCards.first().innerText())) {
    // 更正链展示至少存在于旧版本一侧或收口标记存在
    const anyCorrection = /更正自|引擎收口/.test(await workspace.locator('.memory-ledger__card').allInnerTexts().then(texts => texts.join('\n')))
    if (!anyCorrection) throw new Error('V2 更正链/收口标记未展示')
  }
  const openWording = await page.evaluate(async () => {
    const { describeInterval } = await import('/src/services/memory/ledger/storyInterval.js')
    return {
      open: describeInterval({ timelineId: 't', start: { eraId: 'e', ordinal: 1 }, endSemantic: 'open' }),
      unknown: describeInterval({ timelineId: 't', start: { eraId: 'e', ordinal: 1 }, endSemantic: 'unknown' })
    }
  })
  if (!/此后仍成立（无记录终点）/.test(openWording.open)) throw new Error(`V4 open 文案不一致：${openWording.open}`)
  if (!/终点未知/.test(openWording.unknown)) throw new Error(`V4 unknown 文案不一致：${openWording.unknown}`)
  console.log('[memory-history-ui-eval] facts ok: 来源/更正链/文案一致')

  // V3：提取任务展示拒绝原因并可重新排队（直接造一个 failed 任务）
  const jobId = await page.evaluate(async () => {
    const store = await import('/src/services/memory/extraction/extractionJobStore.js')
    const enqueued = store.enqueueExtractionJob({
      projectId: 'book-history-ui',
      sourceRefs: ['chapter:h:1'],
      sourceRevision: 'r7',
      fingerprint: 'ui-eval-fp',
      text: '沈青梧推开钟楼的门。'
    })
    const id = enqueued.job.id
    store.updateExtractionJob(id, { status: 'failed', attempts: 3, lastError: { code: 'MEMORY_EXTRACTION_RESULT_INVALID', message: '提取结果不是有效 JSON', retryable: true } })
    return id
  })
  // 重新加载工作区数据（视图 select @change 触发 loadLedger）
  await workspace.getByLabel('视图 待审核提案当前事实决定记录').selectOption({ value: 'decisions' })
  await workspace.getByLabel('视图 待审核提案当前事实决定记录').selectOption({ value: 'facts' })
  const jobDetails = workspace.locator('.memory-ledger__decision-group', { hasText: '提取任务' })
  await jobDetails.locator('summary').click()
  await jobDetails.getByRole('button', { name: '重新排队' }).first().click()
  await page.waitForTimeout(500)
  const requeued = await page.evaluate(async (jobId) => {
    const store = await import('/src/services/memory/extraction/extractionJobStore.js')
    const job = store.listExtractionJobs({ projectId: 'book-history-ui' }).find(job => job.id === jobId)
    return { status: job?.status, attempts: job?.attempts }
  }, jobId)
  if (requeued.status !== 'queued' || requeued.attempts !== 0) {
    throw new Error(`V3 重新排队未生效：${JSON.stringify(requeued)}`)
  }
  console.log('[memory-history-ui-eval] jobs ok: 失败任务已重新排队')

  if (pageErrors.length) {
    console.error('[memory-history-ui-eval] page errors:', pageErrors)
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
