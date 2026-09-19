/* eslint-disable no-console */
import { chromium } from 'playwright'

// M04（2026-09-18 夜间 A 线）：已知/未知/开放终点的分别处理，以及重复
// 结束证据不重复生成版本。真实 IndexedDB + factLedger 生产链：
//   E1 开放终点：后任有明确起点 → 收口（exclusive）——已知形状回归
//   E2 已知终点：显式 exclusive 终点不被后任重算，只收口别的开放行
//   E3 未知终点：endSemantic 'unknown' 是闭合形状；无时间证据的后任
//      不产生任何收口/冲突提案（不把未知读成"此后一直成立"）
//   E4 重复结束证据：同主张同区间再采纳 → no-change 拒绝，版本数不变
const BASE_URL = process.env.PINAX_TEMPORAL_ENDPOINTS_EVAL_URL || 'http://127.0.0.1:5179'
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
    const check = (condition, message) => { if (!condition) throw new Error(message) }
    const scope = { domain: 'book', bookId: 'book-endpoints' }
    const timeline = { id: 't1', eras: [{ id: 'era-a', order: 1 }] }
    const at = ordinal => ({ timelineId: 't1', start: { eraId: 'era-a', ordinal }, endSemantic: 'open' })
    const versionsOf = async () => (await db.table('factVersions').where('scopeKey').equals('book\u001fbook-endpoints\u001f\u001f\u001f').toArray())

    const opened = await L.openLedgerDb()
    check(opened.ok, 'ledger open failed')
    const db = opened.db
    const ev = await F.appendEvidence(db, { scope, sourceKind: 'chapter-quote', sourceId: 'chapter:e:1', sourceRevision: 'r1', quote: '原句。' })
    const evidenceIds = [ev.evidence.id]
    let proposalSeq = 0
    const proposeAndAdopt = async (subjectKey, predicate, object, interval) => {
      proposalSeq += 1
      const p = await F.createProposal(db, {
        scope, subjectKey, subjectLabel: subjectKey, predicate, object,
        evidenceIds, origin: 'author', storyInterval: interval, timeline
      })
      check(p.ok, `proposal ${object} failed: ${p.reason || ''}`)
      const a = await F.adoptProposal(db, { scope, proposalId: p.proposal.id, commandId: `eval-adopt-${proposalSeq}`, actorRef: 'eval' })
      return { p, a }
    }

    // E1：开放终点被后任收口（M05 写形状：目标行保留开放区间并被作废，
    // 另铸闭区间收口行）
    const e1a = await proposeAndAdopt('将军', '驻地', '北营', at(3))
    const e1b = await proposeAndAdopt('将军', '驻地', '南营', at(8))
    const e1Versions = await versionsOf()
    const vNorth = e1Versions.find(row => row.id === e1a.a.result.factVersionId)
    check(vNorth.validInterval.endSemantic === 'open', 'E1 目标行区间应原样保留（开放）')
    check(Boolean(vNorth.invalidatedAt), 'E1 目标行应被收口作废')
    const e1Closure = e1Versions.find(row => row.supersedes === vNorth.id && row.supersedesKind?.startsWith('temporal-closure'))
    check(e1Closure, 'E1 应存在北营的收口行')
    check(e1Closure.validInterval.endSemantic === 'exclusive' && e1Closure.validInterval.end.ordinal === 8, `E1 收口行应为 exclusive@8，got ${JSON.stringify(e1Closure.validInterval)}`)
    check(e1Closure.validInterval.endDerived === true, 'E1 收口行应带 endDerived')

    // E2：显式终点不被重算。新主体（丞相）：v1 自带显式 exclusive 终点、
    // v2 开放；后任（start 25）只应计划收口 v2，显式终点的 v1 必须不在
    // closes 里。
    const e2v1 = await proposeAndAdopt('丞相', '开府', '雍州', { timelineId: 't1', start: { eraId: 'era-a', ordinal: 2 }, end: { eraId: 'era-a', ordinal: 10 }, endSemantic: 'exclusive' })
    check(e2v1.a.ok, 'E2 v1 adopt failed')
    check(e2v1.a.result.temporalCloses.applied.length === 0, 'E2 v1 是首条事实，无收口')
    const e2v2 = await proposeAndAdopt('丞相', '开府', '冀州', at(15))
    check(e2v2.a.ok, 'E2 v2 adopt failed')
    check(e2v2.a.result.temporalCloses.applied.length === 0, 'E2 v1 已显式闭合，v2 采纳无收口')
    const pNext = await F.createProposal(db, {
      scope, subjectKey: '丞相', subjectLabel: '丞相', predicate: '开府', object: '洛阳',
      evidenceIds, origin: 'author', storyInterval: at(25), timeline
    })
    check(pNext.ok, 'E2 successor proposal failed')
    const closesIds = (pNext.proposal.temporalPlanV1?.closes || []).map(close => close.id)
    const v1丞相 = e2v1.a.result.factVersionId
    const v2丞相 = e2v2.a.result.factVersionId
    check(!closesIds.includes(v1丞相), 'E2 显式 exclusive 终点（v1）不得被重算收口')
    check(closesIds.includes(v2丞相), 'E2 开放的 v2 应被计划收口')

    // E3：未知终点。新主体（史官）的区间 endSemantic 'unknown'：这是闭合
    // 形状；随后一个无任何时间证据的主张到来 → 计划为空（null），不产生
    // 收口也不产生冲突，更不把 unknown 读成开放。
    const e3a = await proposeAndAdopt('史官', '驻所', '兰台', { timelineId: 't1', start: { eraId: 'era-a', ordinal: 5 }, endSemantic: 'unknown' })
    check(e3a.a.ok, 'unknown-end adopt failed')
    const pNoTime = await F.createProposal(db, {
      scope, subjectKey: '史官', subjectLabel: '史官', predicate: '驻所', object: '石渠',
      evidenceIds, origin: 'author', storyInterval: { timelineId: 't1', endSemantic: 'open' }, timeline
    })
    check(pNoTime.ok, 'no-time proposal failed')
    check(pNoTime.proposal.temporalPlanV1 === null, `无时间后任对 unknown-end 前任应无计划：${JSON.stringify(pNoTime.proposal.temporalPlanV1)}`)

    // E4：重复结束证据。先采纳东营（收口 v2），再以相同主张+相同区间
    //（换 commandId 绕过命令幂等）再采纳 → no-change 拒绝，版本总量不变。
    proposalSeq += 1
    const adoptEast = await F.adoptProposal(db, { scope, proposalId: pNext.proposal.id, commandId: `eval-adopt-${proposalSeq}`, actorRef: 'eval' })
    check(adoptEast.ok, `E2 successor adopt failed: ${adoptEast.reason || ''}`)
    check(adoptEast.result.temporalCloses.applied.some(entry => entry.ofVersion === v2丞相), 'E2 采纳应收口开放的 v2')
    const before = (await versionsOf()).length
    const dup = await F.createProposal(db, {
      scope, subjectKey: '丞相', subjectLabel: '丞相', predicate: '开府', object: '洛阳',
      evidenceIds, origin: 'author', storyInterval: at(25), timeline
    })
    check(dup.ok, 'dup proposal failed')
    check(dup.proposal.temporalPlanV1 === null, `与 head 完全一致的主张不应再产生收口计划：${JSON.stringify(dup.proposal.temporalPlanV1)}`)
    proposalSeq += 1
    const dupAdopt = await F.adoptProposal(db, { scope, proposalId: dup.proposal.id, commandId: `eval-adopt-${proposalSeq}`, actorRef: 'eval' })
    check(!dupAdopt.ok && dupAdopt.reason === 'no-change', `重复结束证据应 no-change 拒绝，got ${dupAdopt.reason}`)
    const after = (await versionsOf()).length
    check(before === after, `重复采纳不得生成版本：${before} -> ${after}`)

    await L.closeLedgerDb(db)
    return { e1: vNorth.validInterval.endSemantic, e2ExplicitUntouched: !closesIds.includes(v1丞相), e3PlanNull: true, e4Refused: dupAdopt.reason }
  })
  console.log('[memory-temporal-endpoints-eval] ok:', JSON.stringify(report))
  if (pageErrors.length) {
    console.error('[memory-temporal-endpoints-eval] page errors:', pageErrors)
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
