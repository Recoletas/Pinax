/* eslint-disable no-console */
import { chromium } from 'playwright'

// M03（2026-09-18 夜间 A 线）：时序协调接入真实确认入口的生产链反例。
// 真实 IndexedDB/Dexie + 真实 factLedger 命令事务。场景：
//   A1 提案创建即带协调计划（closes 指向旧版本、含快照指纹）
//   A2 采纳在同一事务收口旧版本故事轴（exclusive + endDerived 标记）
//   A3 计划过期：目标已被更正作废 → 收口按 target-invalidated 跳过，
//      新 head 不被误收口（诚实跳过，不猜）
//   A4 幂等重放：同 commandId 再采纳 → replay，无重复收口
//   A5 同时开始 → 冲突随提案进入确认入口显示层（UI 渲染）
const BASE_URL = process.env.PINAX_TEMPORAL_ADOPT_EVAL_URL || 'http://127.0.0.1:5179'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(BASE_URL)
  await page.waitForSelector('.authoring-welcome')

  const report = await page.evaluate(async () => {
    const L = await import('/src/services/memory/ledger/ledgerDb.js')
    const F = await import('/src/services/memory/ledger/factLedger.js')
    const check = (condition, message) => { if (!condition) throw new Error(message) }
    const scope = { domain: 'book', bookId: 'book-temporal' }
    const timeline = { id: 't1', eras: [{ id: 'era-a', order: 1 }] }
    const openAt = ordinal => ({ timelineId: 't1', start: { eraId: 'era-a', ordinal }, endSemantic: 'open' })

    const opened = await L.openLedgerDb()
    check(opened.ok, 'ledger open failed')
    const db = opened.db
    const ev = await F.appendEvidence(db, { scope, sourceKind: 'chapter-quote', sourceId: 'chapter:t:1', sourceRevision: 'r1', quote: '原句：城主迁居。' })
    check(ev.ok, 'evidence failed')
    const evidenceIds = [ev.evidence.id]

    // v1：旧状态，开区间
    const pa = await F.createProposal(db, {
      scope, subjectKey: '城主', subjectLabel: '城主', predicate: '居住地', object: '旧城',
      evidenceIds, origin: 'author', storyInterval: openAt(3)
    })
    check(pa.ok, `proposal A failed: ${pa.reason || ''}`)
    const adoptA = await F.adoptProposal(db, { scope, proposalId: pa.proposal.id, commandId: 'eval-adopt-a', actorRef: 'eval' })
    check(adoptA.ok, `adopt A failed: ${adoptA.reason || ''}`)
    const v1Id = adoptA.result.factVersionId
    check(!adoptA.result.temporalCloses.applied.length, '首条事实无收口')

    // B：新状态，明确起点 → 提案带收口计划
    const pb = await F.createProposal(db, {
      scope, subjectKey: '城主', subjectLabel: '城主', predicate: '居住地', object: '新城',
      evidenceIds, origin: 'author', storyInterval: openAt(7), timeline
    })
    check(pb.ok, `proposal B failed: ${pb.reason || ''}`)
    const planB = pb.proposal.temporalPlanV1
    check(planB && planB.closes.length === 1 && planB.closes[0].id === v1Id, `B 应计划收口 v1：${JSON.stringify(planB)}`)
    check(planB.closes[0].proposedEnd.kind === 'at' && planB.closes[0].proposedEnd.at === 1e9 + 7, '收口点应是 B 起点（era 序*1e9+ordinal）')
    check(planB.closes[0].proposedEnd.derivedFrom !== undefined, '收口应带依据行')
    check(planB.closes[0].snapshotHash, '收口应带计划时区间指纹')

    const adoptB = await F.adoptProposal(db, { scope, proposalId: pb.proposal.id, commandId: 'eval-adopt-b', actorRef: 'eval' })
    check(adoptB.ok, `adopt B failed: ${adoptB.reason || ''}`)
    check(adoptB.result.temporalCloses.applied.length === 1, 'B 采纳应原子应用 1 个收口')
    const versions = await db.table('factVersions').where('scopeKey').equals('book\u001fbook-temporal\u001f\u001f\u001f').toArray()
    const v1 = versions.find(row => row.id === v1Id)
    // M05 写形状：目标行原样保留（区间不动），另铸收口后继；"以当时的认知
    // 回放当时"——as-of 收口前看到的是开放的 v1。
    check(v1.validInterval.endSemantic === 'open', 'v1 目标行区间应原样保留（不原地改写）')
    check(Boolean(v1.invalidatedAt), 'v1 应被收口作废（记录轴）')
    const closureRow = versions.find(row => row.id === adoptB.result.temporalCloses.applied[0].id)
    check(closureRow.supersedes === v1Id && closureRow.supersedesKind === 'temporal-closure-head', '收口后继应指回 v1')
    check(closureRow.validInterval.endSemantic === 'exclusive', `收口后继应为 exclusive，got ${JSON.stringify(closureRow.validInterval)}`)
    check(closureRow.validInterval.end && closureRow.validInterval.end.ordinal === 7, '收口后继终点应写到 B 的起点')
    check(closureRow.validInterval.endDerived === true, '引擎收口应带 endDerived 标记')
    check(closureRow.object === '旧城' && closureRow.subjectKey === '城主', '收口后继沿用目标的主张')

    // C：再下一任 → 计划收口 v2；随后 v2 被更正作废 → 采纳时按过期跳过
    const pc = await F.createProposal(db, {
      scope, subjectKey: '城主', subjectLabel: '城主', predicate: '居住地', object: '行在',
      evidenceIds, origin: 'author', storyInterval: openAt(12), timeline
    })
    check(pc.ok, `proposal C failed: ${pc.reason || ''}`)
    const v2Id = adoptB.result.factVersionId
    check(pc.proposal.temporalPlanV1.closes.some(close => close.id === v2Id), 'C 应计划收口 v2')
    check(!pc.proposal.temporalPlanV1.closes.some(close => close.id === v1Id), 'v1 已被显式收口（引擎收口仍可重算——但更近后任是 v2，v1 止于 v2 起点不变）' )
    const correct = await F.correctFact(db, {
      scope, factKey: 'fact:城主:居住地', object: '新城（修订）', commandId: 'eval-correct-v2', actorRef: 'eval'
    })
    check(correct.ok, `correct failed: ${correct.reason || ''}`)
    const adoptC = await F.adoptProposal(db, { scope, proposalId: pc.proposal.id, commandId: 'eval-adopt-c', actorRef: 'eval' })
    check(adoptC.ok, `adopt C failed: ${adoptC.reason || ''}`)
    check(adoptC.result.temporalCloses.skipped.some(skip => skip.id === v2Id && skip.reason === 'target-invalidated'), `过期收口应如实跳过：${JSON.stringify(adoptC.result.temporalCloses)}`)
    const v2b = versions.find(row => row.id === correct.result.factVersionId) || await (async () => {
      const rows = await db.table('factVersions').where('scopeKey').equals('book\u001fbook-temporal\u001f\u001f\u001f').toArray()
      return rows.find(row => row.id === correct.result.factVersionId)
    })()
    check(v2b && !v2b.validInterval.endDerived, '更正后的新 head 不得被过期计划误收口')

    // 幂等重放：同 commandId 再采纳 C → replay，无重复收口
    const replayC = await F.adoptProposal(db, { scope, proposalId: pc.proposal.id, commandId: 'eval-adopt-c', actorRef: 'eval' })
    check(replayC.ok && replayC.replay === true, '同 commandId 应命中决策重放')
    const decisions = await db.table('factDecisions').where('scopeKey').equals('book\u001fbook-temporal\u001f\u001f\u001f').toArray()
    check(decisions.filter(row => row.commandId === 'eval-adopt-c').length === 1, '采纳决策不得重复')

    // 同时开始：冲突随 pending 提案进入确认入口（不自动收口、不自动采纳）
    const ev2 = await F.appendEvidence(db, { scope, sourceKind: 'chapter-quote', sourceId: 'chapter:t:2', sourceRevision: 'r2', quote: '原句：两舰并立。' })
    const pd1 = await F.createProposal(db, { scope, subjectKey: '舰队', subjectLabel: '舰队', predicate: '旗舰', object: '破晓号', evidenceIds: [ev2.evidence.id], origin: 'author', storyInterval: openAt(5), timeline })
    check(pd1.ok, 'proposal D1 failed')
    await F.adoptProposal(db, { scope, proposalId: pd1.proposal.id, commandId: 'eval-adopt-d1', actorRef: 'eval' })
    const pd2 = await F.createProposal(db, { scope, subjectKey: '舰队', subjectLabel: '舰队', predicate: '旗舰', object: '晨星号', evidenceIds: [ev2.evidence.id], origin: 'author', storyInterval: openAt(5), timeline })
    check(pd2.ok, 'proposal D2 failed')
    const planD2 = pd2.proposal.temporalPlanV1
    check(planD2 && planD2.conflicts.some(conflict => conflict.reason === 'simultaneous'), `同刻开始应记冲突：${JSON.stringify(planD2)}`)
    check(!planD2.closes.length, '同刻开始不得硬闭合')
    check(pd2.proposal.status === 'pending', '带冲突提案保持待审，等待作者裁决')

    // UI 锚点：归属下拉来自 books + 记忆候选（memory-ledger-smoke 同一模式），
    // 播种一条 book-temporal 候选让工作区能选到该 scope。
    const c = await import('/src/services/memory/memoryCandidates.js')
    c.queueMemoryCandidate({ id: 'temporal-ui-anchor', content: '时序协调 UI 锚点记忆。', scope: 'project', scopeId: 'book-temporal', sourceRefs: ['chapter:t:1'], sourceRevision: 'r1' })
    c.confirmMemoryCandidate('temporal-ui-anchor')

    await L.closeLedgerDb(db)
    return { v1Preserved: v1.validInterval.endSemantic, closureKind: closureRow.supersedesKind, skipped: adoptC.result.temporalCloses.skipped, conflictsD2: planD2.conflicts.map(row => row.reason) }
  })
  console.log('[memory-temporal-adoption-eval] data ok:', JSON.stringify(report))

  // UI：确认入口渲染协调计划摘要
  await page.reload()
  await page.waitForSelector('.authoring-welcome')
  await page.locator('.library-quick-actions').getByRole('button', { name: '备份与恢复' }).click()
  await page.getByRole('tab', { name: '记忆与历史' }).click()
  const workspace = page.locator('.memory-workspace')
  await workspace.getByLabel('归属').selectOption({ value: JSON.stringify(['project', 'book-temporal']) })
  await page.getByRole('button', { name: '事实账本' }).click()
  const planCard = workspace.locator('[data-test="temporal-plan"]')
  await planCard.first().waitFor({ timeout: 15000 })
  const summaryText = await planCard.first().innerText()
  if (!/需人工注意/.test(summaryText) || !/同一时刻开始/.test(summaryText)) {
    throw new Error(`确认入口未渲染冲突摘要：${summaryText}`)
  }
  console.log('[memory-temporal-adoption-eval] ui ok: 冲突摘要已渲染于提案卡')

  if (pageErrors.length) {
    console.error('[memory-temporal-adoption-eval] page errors:', pageErrors)
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
