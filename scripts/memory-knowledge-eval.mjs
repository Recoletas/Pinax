/* eslint-disable no-console */
import { chromium } from 'playwright'

// M08/M09（2026-09-18 夜间 A 线）：角色获知事件与读模型 + 信念状态反例。
// 真实 IndexedDB/Dexie + 真实 factLedger/knowledgeLedger 生产链。
//   K1 获知事件冻结 actor+scope+获知时刻；读模型还原主张与来源
//   K2 作者知道、角色没听说 → 角色视界不含该事实（author-only 排除计数）
//   K3 跨作用域注入拒绝（他书事实不能变成"他知道"）
//   K4 分支回溯：同书不同 branch 的秘密不可读
//   K5 双轴：as-of 获知前不可见；被新版本取代的旧知如 stale 标记
//   K6 无任何授权获知事件 → mode public-fallback（降级信号，不伪装角色视角）
//   K7 幂等重放 + 同键不同载荷拒绝
//   K9 信念转移（M09）：confirmed → disproved → forgotten；听说过 ≠ 客观成立
const BASE_URL = process.env.PINAX_KNOWLEDGE_EVAL_URL || 'http://127.0.0.1:5179'
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
    const K = await import('/src/services/memory/ledger/knowledgeLedger.js')
    const check = (condition, message) => { if (!condition) throw new Error(message) }
    const scope = { domain: 'book', bookId: 'book-know' }
    const at = ordinal => ({ timelineId: 't1', start: { eraId: 'era-a', ordinal }, endSemantic: 'open' })

    const opened = await L.openLedgerDb()
    check(opened.ok, 'ledger open failed')
    const db = opened.db
    const ev = await F.appendEvidence(db, { scope, sourceKind: 'chapter-quote', sourceId: 'chapter:k:1', sourceRevision: 'r1', quote: '原句。' })
    const evidenceIds = [ev.evidence.id]
    let n = 0
    const adopt = async (subjectKey, object, interval) => {
      n += 1
      const p = await F.createProposal(db, {
        scope, subjectKey, subjectLabel: subjectKey, predicate: '身世', object,
        evidenceIds, origin: 'author', storyInterval: interval, timeline: { id: 't1', eras: [{ id: 'era-a', order: 1 }] }
      })
      check(p.ok, `proposal failed: ${p.reason || ''}`)
      const a = await F.adoptProposal(db, { scope, proposalId: p.proposal.id, commandId: `know-adopt-${n}`, actorRef: 'eval' })
      check(a.ok, `adopt failed: ${a.reason || ''}`)
      return a.result.factVersionId
    }

    // 三条作者已确认事实：公开身世、秘密身世、另一分支的秘密
    const publicFact = await adopt('少主', '养父为铁匠', at(1))
    const secretFact = await adopt('少主', '生父为前朝皇室', at(2))

    // K3：跨作用域注入拒绝
    const cross = await K.recordKnowledgeEvent(db, {
      scope: { domain: 'book', bookId: 'book-other' }, actorKey: '沈青梧', actorLabel: '沈青梧',
      factVersionId: publicFact, channel: 'heard', sourceRef: 'chapter:k:1', storyAt: 5,
      commandId: 'know-cross', actorRef: 'eval'
    })
    check(!cross.ok && cross.reason === 'fact-version-scope-mismatch', `跨书注入应拒绝，got ${cross.reason}`)

    // K1：获知公开身世（ heard 传闻）；另一角色只耳闻了秘密
    const k1 = await K.recordKnowledgeEvent(db, {
      scope, actorKey: '沈青梧', actorLabel: '沈青梧',
      factVersionId: publicFact, channel: 'heard', sourceRef: 'chapter:k:1', storyAt: 5,
      commandId: 'know-1', actorRef: 'eval'
    })
    check(k1.ok, `record failed: ${k1.reason || ''}`)
    const k2 = await K.recordKnowledgeEvent(db, {
      scope, actorKey: '陆昭', actorLabel: '陆昭',
      factVersionId: secretFact, channel: 'witnessed', sourceRef: 'chapter:k:2', storyAt: 6,
      commandId: 'know-2', actorRef: 'eval'
    })
    check(k2.ok, `record failed: ${k2.reason || ''}`)

    // K7：同 commandId 重放；同 commandId 不同载荷拒绝
    const replay = await K.recordKnowledgeEvent(db, {
      scope, actorKey: '沈青梧', actorLabel: '沈青梧',
      factVersionId: publicFact, channel: 'heard', sourceRef: 'chapter:k:1', storyAt: 5,
      commandId: 'know-1', actorRef: 'eval'
    })
    check(replay.ok && replay.replay === true, '同 commandId 应重放')
    const conflict = await K.recordKnowledgeEvent(db, {
      scope, actorKey: '沈青梧', actorLabel: '沈青梧',
      factVersionId: publicFact, channel: 'witnessed', sourceRef: 'chapter:k:1', storyAt: 5,
      commandId: 'know-1', actorRef: 'eval'
    })
    check(!conflict.ok && conflict.reason === 'command-payload-conflict', `同键不同载荷应拒绝，got ${conflict.reason}`)

    // K2：读沈青梧的视界——只有公开身世；秘密（作者知道）不在，且排除计数如实
    const readShen = await K.readCharacterKnowledge(db, { scope, actorKeys: ['沈青梧'] })
    check(readShen.ok && readShen.mode === 'character', '沈青梧应有角色视角')
    const shen = readShen.actors['沈青梧']
    check(shen.facts.length === 1 && shen.facts[0].factVersionId === publicFact, `沈青梧只应知道公开身世：${JSON.stringify(shen.facts.map(f => f.claim.object))}`)
    check(shen.facts[0].knownVia === 'heard' && shen.facts[0].knownAtStory === 5, '获知来源与获知时刻应被冻结')
    const allFacts = await db.table('factVersions').where('scopeKey').equals('book\u001fbook-know\u001f\u001f\u001f').toArray()
    check(allFacts.length >= 2, '作者侧事实存在（作者知道）')
    check(!shen.facts.some(fact => fact.factVersionId === secretFact), '角色没听说的事实不得出现（作者知道 ≠ 角色听说）')

    // K4：分支回溯——session 分支作用域的秘密不可被主分支读者读到
    const branchScope = { domain: 'session', bookId: 'book-know', worldbookId: null, sessionId: 's-1', branchId: 'secret-branch' }
    const branchFact = await (async () => {
      const branchEv = await F.appendEvidence(db, { scope: branchScope, sourceKind: 'chapter-quote', sourceId: 'chapter:k:3', sourceRevision: 'r1', quote: '分支原句。' })
      check(branchEv.ok, 'branch evidence failed')
      const p = await F.createProposal(db, {
        scope: branchScope, subjectKey: '少主', subjectLabel: '少主', predicate: '身世', object: '分支线秘密',
        evidenceIds: [branchEv.evidence.id], origin: 'author', storyInterval: at(3)
      })
      check(p.ok, 'branch proposal failed')
      const a = await F.adoptProposal(db, { scope: branchScope, proposalId: p.proposal.id, commandId: 'know-adopt-branch', actorRef: 'eval' })
      check(a.ok, 'branch adopt failed')
      return a.result.factVersionId
    })()
    const kBranch = await K.recordKnowledgeEvent(db, {
      scope: branchScope, actorKey: '陆昭', actorLabel: '陆昭',
      factVersionId: branchFact, channel: 'witnessed', sourceRef: 'chapter:k:3', storyAt: 7,
      commandId: 'know-branch', actorRef: 'eval'
    })
    check(kBranch.ok, 'branch knowledge should record in its own scope')
    const readBranch = await K.readCharacterKnowledge(db, { scope: branchScope, actorKeys: ['陆昭'] })
    check(readBranch.ok && readBranch.actors['陆昭'].facts.some(fact => fact.factVersionId === branchFact), '分支内可读')
    const readMain = await K.readCharacterKnowledge(db, { scope, actorKeys: ['陆昭'] })
    check(!readMain.actors['陆昭'].facts.some(fact => fact.factVersionId === branchFact), 'K4 分支秘密不得泄漏到主作用域')

    // K9：信念转移（M09）。陆昭听说→确认→反证；沈青梧遗忘
    const d1 = await K.recordKnowledgeEvent(db, {
      scope, actorKey: '陆昭', actorLabel: '陆昭', factVersionId: secretFact,
      kind: 'belief', belief: 'confirmed', sourceRef: 'chapter:k:4', storyAt: 8, commandId: 'belief-1', actorRef: 'eval'
    })
    check(d1.ok, `belief confirm failed: ${d1.reason || ''}`)
    const d2 = await K.recordKnowledgeEvent(db, {
      scope, actorKey: '陆昭', actorLabel: '陆昭', factVersionId: secretFact,
      kind: 'belief', belief: 'disproved', sourceRef: 'chapter:k:5', storyAt: 9, commandId: 'belief-2', actorRef: 'eval'
    })
    check(d2.ok, `belief disprove failed: ${d2.reason || ''}`)
    const readLuBefore = await K.readCharacterKnowledge(db, { scope, actorKeys: ['陆昭'], recordedAsOf: { seq: d1.decision.recordedSeq } })
    check(readLuBefore.actors['陆昭'].facts.some(fact => fact.factVersionId === secretFact && fact.belief === 'confirmed'), 'as-of 确认后：信念应为 confirmed')
    const readLu = await K.readCharacterKnowledge(db, { scope, actorKeys: ['陆昭'] })
    const luSecret = readLu.actors['陆昭'].facts.find(fact => fact.factVersionId === secretFact)
    check(!luSecret, '被反证的事实不得再作为角色事实输出（防泄漏）')
    check(readLu.actors['陆昭'].excluded.disproved === 1, '反证事实应计入排除')
    // 听说过 ≠ 客观成立：陆昭的"秘密"已被反证，但事实本体（作者侧）仍成立
    const headOfSecret = await F.getFactHead(db, { scope, factKey: 'fact:少主:身世' })
    check(headOfSecret, '作者侧客观事实不受角色信念影响')

    const d3 = await K.recordKnowledgeEvent(db, {
      scope, actorKey: '沈青梧', actorLabel: '沈青梧', factVersionId: publicFact,
      kind: 'belief', belief: 'forgotten', sourceRef: null, storyAt: 10, commandId: 'belief-3', actorRef: 'eval'
    })
    check(d3.ok, `forget failed: ${d3.reason || ''}`)
    const readShenAfter = await K.readCharacterKnowledge(db, { scope, actorKeys: ['沈青梧'] })
    check(readShenAfter.actors['沈青梧'].facts.length === 0, '遗忘后事实不再出现在角色视界')
    check(readShenAfter.actors['沈青梧'].excluded.forgotten === 1, '遗忘应有排除计数')
    // as-of 遗忘前：还记得
    const readShenBeforeForget = await K.readCharacterKnowledge(db, { scope, actorKeys: ['沈青梧'], recordedAsOf: { seq: d3.decision.recordedSeq - 1 } })
    const shenOld = readShenBeforeForget.actors['沈青梧'].facts[0]
    check(shenOld && shenOld.factVersionId === publicFact, 'as-of 遗忘前：仍记得')
    check(shenOld.supersededForCharacter === true, '作者已更正：角色抱着旧版本应标 stale（客观成立 ≠ 角色听说）')

    // K5：双轴 + stale。作者更正公开身世 → 沈青梧（若未遗忘）抱着旧版本 = stale
    const corrected = await F.correctFact(db, {
      scope, factKey: 'fact:少主:身世', object: '养父为退休捕头', commandId: 'know-correct', actorRef: 'eval'
    })
    check(corrected.ok, `correct failed: ${corrected.reason || ''}`)
    const kNew = await K.recordKnowledgeEvent(db, {
      scope, actorKey: '陆昭', actorLabel: '陆昭', factVersionId: corrected.result.factVersionId,
      channel: 'inferred', sourceRef: 'chapter:k:6', storyAt: 11, commandId: 'know-3', actorRef: 'eval'
    })
    check(kNew.ok, 'new knowledge failed')
    // as-of 获知公开身世之前：沈青梧（未遗忘窗口）不可见该获知
    const readShenAsOfEarly = await K.readCharacterKnowledge(db, { scope, actorKeys: ['沈青梧'], recordedAsOf: { seq: k1.decision.recordedSeq - 1 } })
    check(readShenAsOfEarly.actors['沈青梧'].facts.length === 0, 'K5 as-of 获知前：视界为空')

    // K6：无任何获知事件的角色 → public-fallback 降级信号
    const readStranger = await K.readCharacterKnowledge(db, { scope, actorKeys: ['路人甲'] })
    check(readStranger.ok && readStranger.mode === 'public-fallback' && readStranger.actors['路人甲'].mode === 'public-fallback', 'K6 无授权事件应给 public-fallback 信号')

    await L.closeLedgerDb(db)
    return {
      k1Frozen: true, k2AuthorOnly: true, k3CrossScopeRefused: cross.reason,
      k4BranchIsolated: true, k5DualAxis: true, k6Fallback: readStranger.mode,
      k7Guards: [replay.replay, conflict.reason], k9BeliefLifecycle: 'confirmed→disproved→forgotten'
    }
  })
  console.log('[memory-knowledge-eval] ok:', JSON.stringify(report))
  if (pageErrors.length) {
    console.error('[memory-knowledge-eval] page errors:', pageErrors)
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
