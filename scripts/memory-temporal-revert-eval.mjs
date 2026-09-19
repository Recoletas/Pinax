/* eslint-disable no-console */
import { chromium } from 'playwright'

// M05（2026-09-18 夜间 A 线）：撤销协调与双轴回看。真实 IndexedDB +
// factLedger 生产链。收口行是引擎派生的区间断言；撤销只作废派生行，不动
// 作者的采纳（succession）。核心断言是三窗口 recordedAsOf 回放：
//   R1 收口前 → 目标行开放可见、无收口行
//   R2 收口后/撤销前 → 收口行（闭区间）可见、目标行不可见
//   R3 撤销后 → 收口行不可见（派生断言被撤），succession 不受影响
//   R4 非 收口行 / 重复撤销 的 typed 拒绝与命令重放
const BASE_URL = process.env.PINAX_TEMPORAL_REVERT_EVAL_URL || 'http://127.0.0.1:5179'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(BASE_URL)
  await page.waitForSelector('.authoring-welcome')

  const report = await page.evaluate(async () => {
    const L = await import('/src/services/memory/ledger/ledgerDb.js')
    const F = await import('/src/services/memory/ledger/factLedger.js')
    const { isVisibleAt } = await import('/src/services/memory/ledger/recordAxis.js')
    const check = (condition, message) => { if (!condition) throw new Error(message) }
    const scope = { domain: 'book', bookId: 'book-revert' }
    const timeline = { id: 't1', eras: [{ id: 'era-a', order: 1 }] }
    const at = ordinal => ({ timelineId: 't1', start: { eraId: 'era-a', ordinal }, endSemantic: 'open' })
    const versionsOf = async () => (await db.table('factVersions').where('scopeKey').equals('book\u001fbook-revert\u001f\u001f\u001f').toArray())
    const visibleAt = async cutoffSeq => {
      const rows = []
      for (const row of await versionsOf()) if (isVisibleAt(row, cutoffSeq)) rows.push(row)
      return rows
    }

    const opened = await L.openLedgerDb()
    check(opened.ok, 'ledger open failed')
    const db = opened.db
    const ev = await F.appendEvidence(db, { scope, sourceKind: 'chapter-quote', sourceId: 'chapter:r:1', sourceRevision: 'r1', quote: '原句。' })
    const evidenceIds = [ev.evidence.id]
    let n = 0
    const adopt = async (object, interval) => {
      n += 1
      const p = await F.createProposal(db, {
        scope, subjectKey: '盟主', subjectLabel: '盟主', predicate: '驻地', object,
        evidenceIds, origin: 'author', storyInterval: interval, timeline
      })
      check(p.ok, `proposal ${object} failed: ${p.reason || ''}`)
      const a = await F.adoptProposal(db, { scope, proposalId: p.proposal.id, commandId: `revert-adopt-${n}`, actorRef: 'eval' })
      check(a.ok, `adopt ${object} failed: ${a.reason || ''}`)
      return a
    }

    const a1 = await adopt('旧邑', at(3))
    const decisionsBefore = await db.table('factDecisions').where('scopeKey').equals('book\u001fbook-revert\u001f\u001f\u001f').toArray()
    const seqAfterFirst = decisionsBefore[decisionsBefore.length - 1].recordedSeq
    const a2 = await adopt('新邑', at(10))
    const decisionsMid = await db.table('factDecisions').where('scopeKey').equals('book\u001fbook-revert\u001f\u001f\u001f').toArray()
    const seqAfterSecond = decisionsMid[decisionsMid.length - 1].recordedSeq

    // 第二次采纳收口了旧邑（当时的 head）：收口行 supersedesKind 带标记
    const versions = await versionsOf()
    const v1Id = a1.result.factVersionId
    const v2Id = a2.result.factVersionId
    const closure = versions.find(row => row.supersedesKind?.startsWith('temporal-closure'))
    check(closure && closure.supersedes === v1Id, `旧邑应有一个收口行：${JSON.stringify(versions.map(row => [row.object, row.supersedesKind || null]))}`)
    check(closure.validInterval.endSemantic === 'exclusive' && closure.validInterval.end.ordinal === 10, '收口行应闭于新邑起点')

    // R1：as-of 收口行落库前一刻 → 旧邑开放可见，无收口行
    const asOfR1 = await visibleAt(closure.recordedSeq - 1)
    check(asOfR1.some(row => row.id === v1Id), 'R1 as-of 收口前：旧邑可见')
    check(asOfR1.every(row => !row.supersedesKind), 'R1 as-of 收口前：无收口行')

    // R2：as-of 收口行落库起 → 收口行可见、旧邑不可见
    const asOfR2 = await visibleAt(closure.recordedSeq)
    check(asOfR2.some(row => row.id === closure.id) && !asOfR2.some(row => row.id === v1Id), 'R2 as-of 收口后：收口行可见、旧邑不可见')
    const currentBeforeRevert = await visibleAt(null)
    check(currentBeforeRevert.some(row => row.id === closure.id) && currentBeforeRevert.some(row => row.id === v2Id), 'R2 当前视图：收口行 + 新邑（现任）并存')

    // R3：撤销收口 → 只撤派生断言；succession 不动
    const rev = await F.revertTemporalClosure(db, {
      scope, closureVersionId: closure.id, commandId: 'revert-1', actorRef: 'eval', reason: '作者裁定该区间收口证据不足'
    })
    check(rev.ok, `revert failed: ${rev.reason || ''}`)
    check(rev.result.ofVersion === v1Id, '撤销应记录其派生自旧邑')
    const asOfR3 = await visibleAt(rev.decision.recordedSeq)
    check(!asOfR3.some(row => row.id === closure.id), 'R3 撤销后：收口行不可见')
    check(asOfR3.some(row => row.id === v2Id) && !asOfR3.some(row => row.id === v1Id), 'R3 撤销后：succession 保持（新邑可见、旧邑仍不可见）')
    const asOfMidAgain = await visibleAt(closure.recordedSeq)
    check(asOfMidAgain.some(row => row.id === closure.id), 'R3 回放到撤销前时点：收口行仍在（历史不被改写）')

    // R4：非收口行拒绝 / 重复撤销拒绝 / 同 commandId 重放
    const revNormal = await F.revertTemporalClosure(db, { scope, closureVersionId: v2Id, commandId: 'revert-normal', actorRef: 'eval' })
    check(!revNormal.ok && revNormal.reason === 'not-temporal-closure', `普通行应拒绝，got ${revNormal.reason}`)
    const revReplay = await F.revertTemporalClosure(db, { scope, closureVersionId: closure.id, commandId: 'revert-1', actorRef: 'eval', reason: '作者裁定该区间收口证据不足' })
    check(revReplay.ok && revReplay.replay === true, '同 commandId 应命中决策重放')
    const revAgain = await F.revertTemporalClosure(db, { scope, closureVersionId: closure.id, commandId: 'revert-2', actorRef: 'eval' })
    check(!revAgain.ok && revAgain.reason === 'closure-already-reverted', `已撤销应拒绝，got ${revAgain.reason}`)

    await L.closeLedgerDb(db)
    return {
      r1OpenBeforeClosure: true,
      r2ClosedAfterClosure: true,
      r3DerivedOnlyUndo: true,
      r4Guards: [revNormal.reason, revReplay.replay, revAgain.reason]
    }
  })
  console.log('[memory-temporal-revert-eval] ok:', JSON.stringify(report))
  if (pageErrors.length) {
    console.error('[memory-temporal-revert-eval] page errors:', pageErrors)
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
