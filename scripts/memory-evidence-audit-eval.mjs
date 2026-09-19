/* eslint-disable no-console */
import { chromium } from 'playwright'

// M06（2026-09-18 夜间 A 线）：来源修订/删除影响清单接入事实审核。
// 真实 IndexedDB + factLedger + evidenceAudit + MemoryHistoryWorkspace。
//   E1 审计列出 revision-changed / source-deleted 影响清单（含事实与提案引用）
//   E2 采纳强制点：证据过期且未显式确认 → evidence-source-stale 拒绝
//   E3 显式 allowStaleEvidence → 放行（作者知情后可接受）
//   E4 UI 两步接受：警告出现 → 普通接受按钮被替换 → 显式确认才走通
const BASE_URL = process.env.PINAX_EVIDENCE_AUDIT_EVAL_URL || 'http://127.0.0.1:5179'
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
    const A = await import('/src/services/memory/ledger/evidenceAudit.js')
    const check = (condition, message) => { if (!condition) throw new Error(message) }
    const scope = { domain: 'book', bookId: 'book-audit' }

    const opened = await L.openLedgerDb()
    check(opened.ok, 'ledger open failed')
    const db = opened.db

    // 来源 chapter:r1 的事实已采纳；来源 chapter:gone 的事实已采纳（来源将被删除）
    const evR1 = await F.appendEvidence(db, { scope, sourceKind: 'chapter-quote', sourceId: 'chapter:live', sourceRevision: 'r1', quote: '原句一。' })
    const p1 = await F.createProposal(db, { scope, subjectKey: '塔主', subjectLabel: '塔主', predicate: ' residence'.trim(), object: '住在灯塔', evidenceIds: [evR1.evidence.id], origin: 'author', storyInterval: { timelineId: 't1', start: { eraId: 'e', ordinal: 1 }, endSemantic: 'open' } })
    check(p1.ok, 'p1 failed')
    const a1 = await F.adoptProposal(db, { scope, proposalId: p1.proposal.id, commandId: 'audit-adopt-1', actorRef: 'eval' })
    check(a1.ok, 'adopt1 failed')

    const evGone = await F.appendEvidence(db, { scope, sourceKind: 'chapter-quote', sourceId: 'chapter:gone', sourceRevision: 'r9', quote: '原句二。' })
    const p2 = await F.createProposal(db, { scope, subjectKey: '守塔人', subjectLabel: '守塔人', predicate: '去向', object: '留守北塔', evidenceIds: [evGone.evidence.id], origin: 'author', storyInterval: { timelineId: 't1', start: { eraId: 'e', ordinal: 2 }, endSemantic: 'open' } })
    check(p2.ok, 'p2 failed')
    const a2 = await F.adoptProposal(db, { scope, proposalId: p2.proposal.id, commandId: 'audit-adopt-2', actorRef: 'eval' })
    check(a2.ok, 'adopt2 failed')

    // 待审提案：引用已过期修订的来源
    const evStale = await F.appendEvidence(db, { scope, sourceKind: 'chapter-quote', sourceId: 'chapter:live', sourceRevision: 'r1', quote: '原句三。' })
    const pStale = await F.createProposal(db, { scope, subjectKey: '塔灯', subjectLabel: '塔灯', predicate: '状态', object: '每夜点亮', evidenceIds: [evStale.evidence.id], origin: 'author', storyInterval: { timelineId: 't1', start: { eraId: 'e', ordinal: 3 }, endSemantic: 'open' } })
    check(pStale.ok, 'pStale failed')

    // E1 审计：chapter:live 现为 r2（revision-changed）；chapter:gone 已删除
    const audit = await A.auditEvidenceCurrentness(db, {
      scope,
      currentRevisions: { 'chapter:live': 'r2' },
      sourceDeleted: ['chapter:gone']
    })
    check(audit.ok, `audit failed: ${audit.reason || ''}`)
    const byStatus = { 'revision-changed': [], 'source-deleted': [] }
    for (const item of audit.items) byStatus[item.status].push(item)
    check(byStatus['revision-changed'].length === 2, `修订变化应影响 2 条证据（含已采纳与待审），got ${byStatus['revision-changed'].length}`)
    check(byStatus['source-deleted'].length === 1, '删除来源应影响 1 条证据')
    const goneItem = byStatus['source-deleted'][0]
    check(goneItem.factVersionIds.length === 1 && goneItem.currentRevision === null, '删除来源的影响清单应含引用它的事实版本')
    const staleAuditItem = byStatus['revision-changed'].find(item => item.proposalIds.includes(pStale.proposal.id))
    check(staleAuditItem, '待审提案应出现在影响清单里')
    check(audit.completeness === 'complete', '小表审计应 complete')

    // E2 采纳强制点：带现时性且未确认 → 拒绝
    const refused = await F.adoptProposal(db, {
      scope, proposalId: pStale.proposal.id, commandId: 'audit-adopt-stale', actorRef: 'eval',
      evidenceCurrentness: { [evStale.evidence.id]: 'revision-changed' }
    })
    check(!refused.ok && refused.reason === 'evidence-source-stale', `过期证据未确认应拒绝，got ${refused.reason || refused.ok}`)

    // E3 显式确认 → 放行
    const forced = await F.adoptProposal(db, {
      scope, proposalId: pStale.proposal.id, commandId: 'audit-adopt-stale', actorRef: 'eval',
      evidenceCurrentness: { [evStale.evidence.id]: 'revision-changed' },
      allowStaleEvidence: true
    })
    check(forced.ok, `显式确认后应放行：${forced.reason || ''}`)

    // 不带现时性（未接线的调用方）→ 行为不变（放行）
    const evFresh = await F.appendEvidence(db, { scope, sourceKind: 'chapter-quote', sourceId: 'chapter:fresh', sourceRevision: 'r1', quote: '原句四。' })
    const pFresh = await F.createProposal(db, { scope, subjectKey: '雾季', subjectLabel: '雾季', predicate: '时间', object: '每年冬至', evidenceIds: [evFresh.evidence.id], origin: 'author', storyInterval: { timelineId: 't1', start: { eraId: 'e', ordinal: 4 }, endSemantic: 'open' } })
    const unwired = await F.adoptProposal(db, { scope, proposalId: pFresh.proposal.id, commandId: 'audit-adopt-fresh', actorRef: 'eval' })
    check(unwired.ok, '未接线调用方行为不应改变')

    // 给 UI 阶段留一条待审的过期证据提案（上面 pStale 已被显式采纳）
    const evUi = await F.appendEvidence(db, { scope, sourceKind: 'chapter-quote', sourceId: 'chapter:live', sourceRevision: 'r1', quote: '原句五。' })
    const pUi = await F.createProposal(db, { scope, subjectKey: '潮汐', subjectLabel: '潮汐', predicate: '规律', object: '晚间涨潮', evidenceIds: [evUi.evidence.id], origin: 'author', storyInterval: { timelineId: 't1', start: { eraId: 'e', ordinal: 5 }, endSemantic: 'open' } })
    check(pUi.ok, 'pUi failed')

    // UI 锚点候选（归属下拉来源，与 memory-ledger-smoke 同一模式）
    const c = await import('/src/services/memory/memoryCandidates.js')
    c.queueMemoryCandidate({ id: 'audit-ui-anchor', content: '证据审计 UI 锚点记忆。', scope: 'project', scopeId: 'book-audit', sourceRefs: ['chapter:live'], sourceRevision: 'r1' })
    c.confirmMemoryCandidate('audit-ui-anchor')

    await L.closeLedgerDb(db)
    return { e1: audit.counts, e2: refused.reason, e3: forced.ok, unwiredOk: unwired.ok }
  })
  console.log('[memory-evidence-audit-eval] data ok:', JSON.stringify(report))

  // E4 UI 两步接受：注入来源状态 provider，走真实确认入口
  await page.reload()
  await page.waitForSelector('.authoring-welcome')
  // 模拟宿主接线：资料区提供来源现时状态（全局接线点，挂载后设置也生效）
  await page.evaluate(() => {
    globalThis.__pinaxMemorySourceRevisionsProvider = async () => ({
      currentRevisions: { 'chapter:live': 'r2' },
      sourceDeleted: []
    })
  })
  await page.locator('.library-quick-actions').getByRole('button', { name: '备份与恢复' }).click()
  await page.getByRole('tab', { name: '记忆与历史' }).click()
  const workspace = page.locator('.memory-workspace')
  await workspace.getByLabel('归属').selectOption({ value: JSON.stringify(['project', 'book-audit']) })
  await page.getByRole('button', { name: '事实账本' }).click()
  const warning = workspace.locator('[data-test="evidence-stale-warning"]').first()
  await warning.waitFor({ timeout: 15000 })
  // 普通接受被两步拦截：第一次点击只出现显式确认按钮
  const acceptButton = workspace.getByRole('button', { name: '接受为事实', exact: true }).first()
  await acceptButton.click()
  const confirmButton = workspace.locator('[data-test="accept-stale"]').first()
  await confirmButton.waitFor({ timeout: 10000 })
  await confirmButton.click()
  const feedback = await page.locator('[role="status"], .memory-workspace__hint').last().innerText().catch(() => '')
  console.log('[memory-evidence-audit-eval] ui ok: 两步接受已生效', JSON.stringify({ feedback: feedback.slice(0, 40) }))
  if (pageErrors.length) {
    console.error('[memory-evidence-audit-eval] page errors:', pageErrors)
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
