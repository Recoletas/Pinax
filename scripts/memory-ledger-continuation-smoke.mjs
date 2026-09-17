import { chromium } from 'playwright'
import assert from 'node:assert/strict'

// A-line continuation smoke (nightly 20260917): AX01–AX06 counter-examples,
// fault injection, two-page races, bridge contract, lifecycle and scale.
// Real IndexedDB/Dexie, isolated browser profile, isolated dev server.
// NOT part of the 20-file/200-case vitest budget (explicit script per repo
// hard test-budget rule).
const BASE_URL = process.env.PINAX_LEDGER_SMOKE_URL || 'http://127.0.0.1:5179'
const browser = await chromium.launch({ headless: true })
const consoleErrors = []
let part34Watchdog
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const pageA = await context.newPage()
  pageA.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(`A:${msg.text()}`) })
  pageA.on('pageerror', error => consoleErrors.push(`A:pageerror: ${error.message}`))
  await pageA.goto(BASE_URL)
  await pageA.waitForSelector('.authoring-welcome')

  const evaluateWithWatchdog = async (page, fn, ms, label) => {
    let timer
    try {
      return await Promise.race([
        page.evaluate(fn),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`WATCHDOG[${label}] timed out`)), ms) })
      ])
    } finally { clearTimeout(timer) }
  }

  const result = await evaluateWithWatchdog(pageA, async () => {
    const L = await import('/src/services/memory/ledger/ledgerDb.js')
    const F = await import('/src/services/memory/ledger/factLedger.js')
    const Q = await import('/src/services/memory/ledger/queryFacts.js')
    const M = await import('/src/services/memory/ledger/legacyMigration.js')
    const P = await import('/src/services/memory/ledger/ledgerProjection.js')
    const R = await import('/src/services/memory/ledger/ledgerReceiptBridge.js')
    const H = await import('/src/services/memory/ledger/ledgerHistoryTool.js')
    const A = await import('/src/services/memory/ledger/ledgerProductionAdapter.js')
    const K = await import('/src/services/memory/ledger/ledgerContract.js')
    const check = (condition, message) => { if (!condition) throw new Error(message) }
    globalThis.__stage = 'boot'
    const stage = name => { globalThis.__stage = name }
    const opened = await L.openLedgerDb()
    check(opened.ok, `ledger open failed: ${opened.detail || opened.reason}`)
    const db = opened.db
    const scope = { domain: 'book', bookId: 'xa-book' }
    const seedEvidence = await F.appendEvidence(db, { scope, sourceKind: 'chapter-quote', sourceId: 'chapter:xa:0', sourceRevision: 'x0', quote: '通用引文。' })
    check(seedEvidence.ok, 'seed evidence failed')

    async function seedFact(subject, predicate, object, extra = {}) {
      const prop = await F.createProposal(db, { scope, subjectKey: subject, subjectLabel: subject, predicate, object, evidenceIds: [seedEvidence.evidence.id], ...extra })
      check(prop.ok && prop.proposal, `seed proposal failed: ${prop.reason || ''}`)
      const adopted = await F.adoptProposal(db, { scope, proposalId: prop.proposal.id, commandId: `xa-adopt-${subject}-${predicate}-${object}` })
      check(adopted.ok, `seed adopt failed: ${adopted.reason || ''}`)
      return adopted
    }

    stage("G01-seed")
    // ===== XA-G01: subject filter with DUPLICATE subject ids, paged walk =====
    for (let i = 1; i <= 17; i++) {
      const subject = i <= 5 ? '张三' : i <= 10 ? '李四' : i <= 15 ? '王五' : '赵六'
      await seedFact(subject, `事迹${i}`, `第${i}件事`)
    }
    stage("G01-walk")
    const pagedSeen = new Set()
    let pagesG01 = 0
    let g01cursor = null
    for (;;) {
      const q = await Q.queryFacts(db, { scope, subjectKeys: ['张三', '李四', '张三', '王五', '赵六'], limit: 3, cursor: g01cursor })
      check(q.ok, `G01 query failed: ${q.reason}`)
      for (const item of q.items) pagedSeen.add(item.factVersionId)
      pagesG01 += 1
      if (!q.nextCursor) break
      g01cursor = q.nextCursor
      if (pagesG01 > 20) throw new Error('G01 pagination did not terminate')
    }
    check(pagedSeen.size === 17, `G01 expected 17 unique versions, got ${pagedSeen.size}`)

    stage("G03")
    // ===== XA-G03: cursor bindings =====
    const scope2 = { domain: 'book', bookId: 'xa-book-2' }
    const qG01first = await Q.queryFacts(db, { scope, subjectKeys: ['张三', '李四', '张三', '王五', '赵六'], limit: 3 })
    check(qG01first.nextCursor, 'G01 first page should have a cursor')
    const crossScope = await Q.queryFacts(db, { scope: scope2, subjectKeys: ['张三'], limit: 3, cursor: qG01first.nextCursor })
    check(!crossScope.ok && crossScope.reason === 'cursor-scope-conflict', `cross-scope cursor honored: ${crossScope.reason}`)
    const crossFilter = await Q.queryFacts(db, { scope, subjectKeys: ['张三'], limit: 3, cursor: qG01first.nextCursor })
    check(!crossFilter.ok && crossFilter.reason === 'cursor-filter-conflict', `cross-filter cursor honored: ${crossFilter.reason}`)
    const env = JSON.parse(atob(qG01first.nextCursor))
    env.snapshotSeq = 1
    const tampered = await Q.queryFacts(db, { scope, subjectKeys: ['张三', '李四', '张三', '王五', '赵六'], limit: 3, cursor: btoa(JSON.stringify(env)) })
    check(!tampered.ok && tampered.reason === 'cursor-invalid', `tampered cursor honored: ${tampered.reason}`)
    const garbage = await Q.queryFacts(db, { scope, limit: 3, cursor: 'not-a-cursor' })
    check(!garbage.ok && garbage.reason === 'cursor-invalid', 'garbage cursor honored')

    stage("G02-seed")
    // ===== XA-G02: frozen snapshot across a pagination walk =====
    const scopeF = { domain: 'book', bookId: 'xa-freeze' }
    const evF = await F.appendEvidence(db, { scope: scopeF, sourceKind: 'chapter-quote', sourceId: 'chapter:xa:f', sourceRevision: 'xf', quote: '冻结引文。' })
    async function seedIn(scopeTarget, evidenceId, subject, object) {
      const prop = await F.createProposal(db, { scope: scopeTarget, subjectKey: subject, subjectLabel: subject, predicate: '行踪', object, evidenceIds: [evidenceId] })
      const adopted = await F.adoptProposal(db, { scope: scopeTarget, proposalId: prop.proposal.id, commandId: `xa-freeze-${subject}-${object}` })
      check(adopted.ok, `freeze seed failed: ${adopted.reason || ''}`)
      return adopted
    }
    for (let i = 1; i <= 10; i++) await seedIn(scopeF, evF.evidence.id, `旅人${i}`, `第${i}站`)
    stage("G02-p1")
    const freezeP1 = await Q.queryFacts(db, { scope: scopeF, limit: 4 })
    check(freezeP1.items.length === 4 && freezeP1.nextCursor, 'freeze page 1 broken')
    const frozenSeq = freezeP1.snapshotVersion
    // Mid-walk: one new fact recorded, one old fact retracted.
    await seedIn(scopeF, evF.evidence.id, '旅人11', '第11站')
    const midHead = await F.getFactHead(db, { scope: scopeF, factKey: 'fact:旅人10:行踪' })
    const retract = await F.retractFact(db, { scope: scopeF, factKey: midHead.factKey, expectedHead: midHead.id, commandId: 'xa-freeze-retract' })
    check(retract.ok, 'mid-walk retract failed')
    stage("G02-walk")
    const freezeSeen = new Set(freezeP1.items.map(item => item.factVersionId))
    let freezeCursor = freezeP1.nextCursor
    let freezeAdvanced = freezeP1.ledgerAdvanced
    for (;;) {
      const q = await Q.queryFacts(db, { scope: scopeF, limit: 4, cursor: freezeCursor })
      check(q.ok, 'freeze page failed')
      freezeAdvanced = freezeAdvanced || q.ledgerAdvanced
      for (const item of q.items) freezeSeen.add(item.factVersionId)
      if (!q.nextCursor) break
      freezeCursor = q.nextCursor
    }
    check(freezeSeen.size === 10, `frozen walk should hold 10 pre-snapshot versions, got ${freezeSeen.size}`)
    check(freezeAdvanced === true, 'ledgerAdvanced not reported for mid-walk mutation')
    // Current view DOES show the retraction and the newcomer.
    const currentAfterFreeze = await Q.queryFacts(db, { scope: scopeF, limit: 50 })
    check(currentAfterFreeze.items.length === 10, `current view should hold 10 heads (11 seeded, 1 retracted), got ${currentAfterFreeze.items.length}`)

    stage("AX05")
    // ===== AX05: mid-transaction fault injection leaves zero partial state =====
    function faultDb(real, table, method, countdown) {
      let remaining = countdown
      return new Proxy(real, {
        get(target, prop) {
          if (prop !== 'table') return Reflect.get(target, prop)
          return (name) => {
            const tableRef = target.table(name)
            if (name !== table) return tableRef
            return new Proxy(tableRef, {
              get(tableTarget, tableProp) {
                if (tableProp !== method) return Reflect.get(tableTarget, tableProp)
                return (...args) => {
                  if (remaining-- === 0) throw new DOMException('injected-fault', 'QuotaExceededError')
                  return Reflect.get(tableTarget, tableProp)(...args)
                }
              }
            })
          }
        }
      })
    }
    const counts = async () => ({
      evidence: await db.table('evidenceSnapshots').count(),
      proposals: await db.table('factProposals').count(),
      versions: await db.table('factVersions').count(),
      decisions: await db.table('factDecisions').count(),
      rejections: await db.table('rejectionMarks').count()
    })
    // adopt: fault on the version insert
    const beforeAdopt = await counts()
    const propFault = await F.createProposal(db, { scope, subjectKey: '故障', subjectLabel: '故障', predicate: '状态', object: '注入点', evidenceIds: [seedEvidence.evidence.id] })
    const adoptFault = await F.adoptProposal(faultDb(db, 'factVersions', 'add', 0), { scope, proposalId: propFault.proposal.id, commandId: 'xa-fault-adopt' })
    check(!adoptFault.ok && adoptFault.reason === 'db-unavailable' && /QuotaExceededError/.test(adoptFault.detail || ''), `adopt fault not typed: ${JSON.stringify(adoptFault)}`)
    const afterAdopt = await counts()
    check(afterAdopt.versions === beforeAdopt.versions && afterAdopt.decisions === beforeAdopt.decisions && afterAdopt.evidence === beforeAdopt.evidence, 'adopt fault left partial state')
    check((await F.listProposals(db, { scope, status: 'pending' })).some(row => row.id === propFault.proposal.id), 'faulted adopt consumed the proposal')
    // correct: fault on the head invalidation
    const head = await F.getFactHead(db, { scope, factKey: 'fact:张三:事迹1' })
    const beforeCorrect = await counts()
    const correctFault = await F.correctFact(faultDb(db, 'factVersions', 'update', 0), { scope, factKey: head.factKey, object: '迟到更正', expectedHead: head.id, commandId: 'xa-fault-correct' })
    check(!correctFault.ok && correctFault.reason === 'db-unavailable', 'correct fault not typed')
    const afterCorrect = await counts()
    check(afterCorrect.versions === beforeCorrect.versions && afterCorrect.decisions === beforeCorrect.decisions, 'correct fault left partial state')
    check((await F.getFactHead(db, { scope, factKey: head.factKey })).id === head.id, 'faulted correction invalidated the head')
    // reject: fault on the mark insert
    const beforeReject = await counts()
    const rejectFault = await F.rejectProposal(faultDb(db, 'rejectionMarks', 'add', 0), { scope, proposalId: propFault.proposal.id, commandId: 'xa-fault-reject' })
    check(!rejectFault.ok && rejectFault.reason === 'db-unavailable', 'reject fault not typed')
    const afterReject = await counts()
    check(afterReject.rejections === beforeReject.rejections && afterReject.decisions === beforeReject.decisions, 'reject fault left partial state')
    check((await F.listProposals(db, { scope, status: 'pending' })).some(row => row.id === propFault.proposal.id), 'faulted rejection consumed the proposal')
    // migrate: fault on the version insert (evidence rolled back too)
    const beforeMigrate = await counts()
    const migFault = await M.migrateLegacyCandidate(faultDb(db, 'factVersions', 'add', 0), {
      candidate: { id: 'xa-fault-legacy', scope: 'project', scopeId: 'xa-book', content: '故障迁移。', kind: 'project-fact', sourceRefs: ['chapter:xa:fault'], sourceRevision: 'q1', metadata: {} },
      commandId: 'xa-fault-migrate'
    })
    check(!migFault.ok && migFault.reason === 'db-unavailable', 'migrate fault not typed')
    const afterMigrate = await counts()
    check(afterMigrate.evidence === beforeMigrate.evidence && afterMigrate.versions === beforeMigrate.versions && afterMigrate.decisions === beforeMigrate.decisions, 'migrate fault left partial state')

    stage("AX04")
    // ===== AX04: meta initialization failure is typed =====
    const brokenMeta = new Proxy(db, {
      get(target, prop) {
        if (prop !== 'table') return Reflect.get(target, prop)
        return (name) => {
          if (name === 'ledgerMeta') {
            return { get: async () => { throw new DOMException('full', 'QuotaExceededError') }, put: async () => { throw new DOMException('full', 'QuotaExceededError') } }
          }
          return target.table(name)
        }
      }
    })
    const metaFailure = await L.ensureSchemaMeta(brokenMeta)
    check(!metaFailure.ok && metaFailure.reason === 'quota-exceeded' && metaFailure.retryable === true, `meta failure not typed: ${JSON.stringify(metaFailure)}`)

    stage("AX09")
    // ===== AX09: bridge contract (XA-G14) =====
    const bridge = R.createRoleplayArchiveParticipant(db)
    const sessionScope = { domain: 'session', sessionId: 'xa-sess', branchId: 'main' }
    const receiptScope = { domain: 'session', bookId: null, worldbookId: null, sessionId: 'xa-sess', branchId: 'main' }
    const mkReceipt = (i, over = {}) => ({
      receiptId: `xa-rc-${i}`, commandId: `xa-rc-${i}`, actionId: `xa-rc-${i}`,
      turnId: `xa-turn-${i}`, parentTurnId: i > 1 ? `xa-turn-${i - 1}` : null,
      branchId: 'main', scope: receiptScope, rulesVersion: '2d6@1', resolutionRef: null,
      stateDeltaRefs: [], evidenceRefs: [`session:xa-sess:turn:xa-turn-${i}`], committedAt: Date.now(), ...over
    })
    const nullBranch = await bridge.record({ scope: { domain: 'session', sessionId: 'xa-sess', branchId: null }, receipt: mkReceipt(901) })
    check(!nullBranch.ok && nullBranch.reason === 'roleplay-history-scope-rejected' && nullBranch.retryable === false, 'null branch accepted (XA-G14)')
    const noScopeReceipt = await bridge.record({ scope: sessionScope, receipt: mkReceipt(902, { scope: undefined }) })
    check(!noScopeReceipt.ok && noScopeReceipt.reason === 'roleplay-history-scope-rejected', 'receipt without scope accepted')
    const noRefs = await bridge.record({ scope: sessionScope, receipt: mkReceipt(903, { evidenceRefs: [] }) })
    check(!noRefs.ok && noRefs.reason === 'roleplay-history-receipt-invalid', 'receipt without any evidence ref accepted (引用无载荷)')
    const mismatch = await bridge.record({ scope: sessionScope, receipt: mkReceipt(904), actionId: 'different-action' })
    check(!mismatch.ok && mismatch.reason === 'roleplay-history-action-mismatch', 'actionId mismatch accepted')
    // Producer retry contract: the SAME receipt bytes are re-sent; a rebuilt
    // receipt with a new committedAt is a different payload and must conflict.
    const rc1 = mkReceipt(1)
    const ok1 = await bridge.record({ scope: sessionScope, receipt: rc1 })
    check(ok1.ok && ok1.eventId === 'xa-rc-1', `valid receipt rejected: ${ok1.reason}`)
    const replay1 = await bridge.record({ scope: sessionScope, receipt: rc1 })
    check(replay1.ok && replay1.replay === true, `receipt replay not idempotent: ${JSON.stringify(replay1)}`)
    const conflict = await bridge.record({ scope: sessionScope, receipt: mkReceipt(1, { turnId: 'xa-turn-hijack', committedAt: rc1.committedAt }) })
    check(!conflict.ok && conflict.reason === 'roleplay-history-receipt-conflict' && conflict.retryable === false, 'same receiptId different content accepted')

    stage("AX10")
    // ===== XA-G13 / AX10: offline drain, then paged branch reads =====
    const outbox = []
    for (let i = 10; i <= 49; i++) outbox.push(mkReceipt(i))
    // Retry contract: duplicates are the SAME receipt objects re-sent.
    outbox.push(...outbox.slice(0, 5))
    const drain1 = await R.drainReceiptArchive(db, { scope: sessionScope, receipts: outbox })
    check(drain1.ok && drain1.archived === 40 && drain1.duplicates === 5 && drain1.rejected.length === 0, `drain broken: ${JSON.stringify({ archived: drain1.archived, duplicates: drain1.duplicates, rejected: drain1.rejected.length })}`)
    const drain2 = await R.drainReceiptArchive(db, { scope: sessionScope, receipts: outbox })
    check(drain2.ok && drain2.archived === 0 && drain2.duplicates === 45, 're-drain not idempotent (XA-G13)')
    const readAll = await bridge.read({ scope: sessionScope, branchId: 'main', limit: 17 })
    check(readAll.ok && readAll.records.length === 17, `bridge read broken: ${readAll.reason || readAll.records.length}`)
    const receiptSeen = new Set()
    let readCursor = null
    for (;;) {
      const page = await R.queryTurnReceipts(db, { scope: sessionScope, limit: 17, cursor: readCursor })
      check(page.ok, 'receipt paging failed')
      for (const item of page.items) receiptSeen.add(item.receiptId)
      if (!page.nextCursor) break
      readCursor = page.nextCursor
      if (receiptSeen.size > 100) throw new Error('receipt paging did not terminate')
    }
    check(receiptSeen.size === 41, `receipt pages should total 41 (40 drained + 1 contract receipt), got ${receiptSeen.size}`)
    const sideBranch = await R.queryTurnReceipts(db, { scope: sessionScope, branchId: 'side', limit: 50 })
    check(sideBranch.ok && sideBranch.items.length === 0, 'other-branch receipts leaked')
    const anchored = await R.queryTurnReceipts(db, { scope: sessionScope, throughTurnId: 'xa-turn-42', limit: 100 })
    check(anchored.ok && anchored.items.length === 34 && anchored.items.every(item => item.archivedSeq <= anchored.items[0].archivedSeq), `throughTurnId anchor broken: ${anchored.items.length}`)
    const chain = await R.traceTurnChain(db, { scope: sessionScope, turnId: 'xa-turn-45', maxHops: 10 })
    check(chain.ok && chain.chain.length === 11 && chain.chain[0].turnId === 'xa-turn-45' && chain.chain[10].turnId === 'xa-turn-35' && chain.truncated === true, `chain walk broken: ${JSON.stringify(chain.chain.map(c => c.turnId))}`)

    stage("AX06")
    // ===== XA-G09 / AX06: projection semantics =====
    const gateEv = await F.appendEvidence(db, { scope, sourceKind: 'chapter-quote', sourceId: 'chapter:xa:gate', sourceRevision: 'xg', quote: '此门不对外来商队开放。' })
    const gateProp = await F.createProposal(db, { scope, subjectKey: '城门', subjectLabel: '城门', predicate: '开放对象', object: '不对外来商队开放', evidenceIds: [gateEv.evidence.id] })
    await F.adoptProposal(db, { scope, proposalId: gateProp.proposal.id, commandId: 'xa-adopt-gate' })
    const longObject = '货物'.repeat(150)
    const longProp = await F.createProposal(db, { scope, subjectKey: '货栈', subjectLabel: '货栈', predicate: '存货', object: longObject, evidenceIds: [gateEv.evidence.id] })
    await F.adoptProposal(db, { scope, proposalId: longProp.proposal.id, commandId: 'xa-adopt-long' })
    const projection = await (await import('/src/services/memory/ledger/ledgerProjection.js')).createLedgerFactProjection(db)({ scope, maxItemChars: 120 })
    check(projection.ok, 'projection failed')
    const gateBlock = projection.blocks.find(block => block.included && block.claim && block.claim.subjectKey === '城门')
    check(gateBlock && gateBlock.text === '城门 · 开放对象 · 不对外来商队开放', `negation fact mangled: ${gateBlock && gateBlock.text}`)
    check(gateBlock.sourceRevision === 'xg' && gateBlock.evidenceVerification === 'chapter-quote', 'evidence revision lost in projection')
    check(!projection.blocks.some(block => block.included && block.claim && block.claim.subjectKey === '货栈'), 'over-budget object was truncated into context instead of excluded')
    const auditBlock = projection.blocks.find(block => !block.included && block.recallAudit)
    check(auditBlock && auditBlock.recallAudit.omittedOverBudget >= 1 && auditBlock.text === '', 'over-budget exclusion not audited')
    // Story time: a fact with known bounds matching the moment is 'inside';
    // an OPEN-ended fact that started earlier stays 'unknown' (frozen
    // knowledgeReadModel semantics: never silently "still holding").
    const timeline = { id: 't-xa', eras: [{ id: 'era-xa', order: 1 }] }
    const storyFact = await seedFact('历官', '任期', '第三年起', { storyInterval: { timelineId: 't-xa', start: { eraId: 'era-xa', ordinal: 3 }, end: { eraId: 'era-xa', ordinal: 6 }, endSemantic: 'exclusive' } })
    void storyFact
    await seedFact('历官', '品级', '终身荣衔', { storyInterval: { timelineId: 't-xa', start: { eraId: 'era-xa', ordinal: 1 }, end: null, endSemantic: 'open' } })
    const storyProjection = await P.createLedgerFactProjection(db)({ scope, storyAt: { timelineId: 't-xa', eraId: 'era-xa', ordinal: 4, precision: 'year' }, timeline })
    const insideBlocks = storyProjection.blocks.filter(block => block.included)
    check(insideBlocks.some(block => block.claim && block.claim.subjectKey === '历官' && block.claim.predicate === '任期'), 'bounded fact missed its story moment')
    check(insideBlocks.every(block => block.timeMatch === 'inside'), 'included blocks must be decisive inside matches')
    check(!insideBlocks.some(block => block.claim && block.claim.predicate === '品级'), 'open-ended fact silently treated as holding (G-A09)')
    check(storyProjection.blocks.some(block => !block.included && block.recallAudit?.excludedByReason?.storyTimeUnknown >= 1), 'unknown-range facts not tallied in audit')

    stage("AX08")
    // ===== XA-G11/G12 / AX08: legacy migration verification classes =====
    const legacyPreview = M.previewLegacyMigration()
    void legacyPreview
    const migrated = await M.migrateLegacyCandidate(db, {
      candidate: { id: 'xa-migrate-1', scope: 'project', scopeId: 'xa-book', content: '沈青梧惯用左手剑。', kind: 'project-fact', sourceRefs: ['chapter:xa:m1'], sourceRevision: 'm1', metadata: {} },
      commandId: 'xa-migrate-1'
    })
    check(migrated.ok, `migrate failed: ${migrated.reason}`)
    const migratedProjection = await P.createLedgerFactProjection(db)({ scope, subjectKeys: ['legacy:xa-migrate-1'] })
    const migratedBlock = migratedProjection.blocks.find(block => block.included)
    check(migratedBlock && migratedBlock.evidenceVerification === 'unverifiable-legacy-source', `legacy source not flagged unverifiable: ${migratedBlock && migratedBlock.evidenceVerification}`)
    // Adapter: migrated candidate suppressed from legacy recall, fact offered.
    const adapter = A.createLedgerFactsMethod({ db })
    const adapted = await adapter({ context: { projectId: 'xa-book' }, query: '沈青梧' })
    check(adapted.suppressLegacyCandidateIds.has('xa-migrate-1'), 'migration map not surfaced for recall dedup')
    check(adapted.blocks.some(block => block.included && block.text.includes('沈青梧')), 'adapted fact block missing')
    const noBook = await adapter({ context: {}, query: '沈青梧' })
    check(noBook.blocks.length === 0, 'adapter guessed a scope without book identity')

    stage("AX14")
    // ===== XA-G15 / AX14: history tool scope isolation =====
    const tool = H.createLedgerHistoryTool(db)
    const searchOut = await tool({ action: 'search', scope, query: '城门', limit: 5 })
    check(searchOut.ok && searchOut.results.some(item => item.summary.includes('不对外来商队开放')), 'history search missed the fact')
    const otherBookFact = (await Q.queryFacts(db, { scope: scopeF, limit: 1 })).items[0]
    const crossGet = await tool({ action: 'get', scope, ids: [otherBookFact.factVersionId] })
    check(crossGet.ok && crossGet.results.length === 0 && crossGet.notFoundCount === 1, 'history get leaked another scope (XA-G15)')
    const traceOut = await tool({ action: 'trace', scope: sessionScope, turnId: 'xa-turn-45', maxHops: 5 })
    check(traceOut.ok && traceOut.results.length === 6 && traceOut.truncated === true, `bounded trace broken: ${traceOut.results.length}/${traceOut.truncated}`)

    return { g01Pages: pagesG01, frozenSize: freezeSeen.size, drainArchived: drain1.archived }
  }, 240000, 'part1')
  console.log('part1', JSON.stringify(result))

  // ===== part 2: decisions paged + scale (XA-G16/AX17) on a fresh scope =====
  const scaleResult = await evaluateWithWatchdog(pageA, async () => {
    const L = await import('/src/services/memory/ledger/ledgerDb.js')
    const F = await import('/src/services/memory/ledger/factLedger.js')
    const Q = await import('/src/services/memory/ledger/queryFacts.js')
    const R = await import('/src/services/memory/ledger/ledgerReceiptBridge.js')
    const K = await import('/src/services/memory/ledger/ledgerContract.js')
    const check = (condition, message) => { if (!condition) throw new Error(message) }
    const db = (await L.openLedgerDb()).db
    const scope = { domain: 'book', bookId: 'xa-scale' }
    const scopeKey = K.encodeScopeKey(scope)
    const meta = db.table('ledgerMeta')
    await meta.put({ id: `seq:${scopeKey}`, seq: 30000 })

    // 10k fact versions + 10k receipts via bulkPut (fixtures, not business writes).
    const factRows = []
    for (let i = 1; i <= 10000; i++) {
      factRows.push({
        id: `xa-fv-${i}`, schemaVersion: 2, factKey: `fact:批量人物${i % 50}:事迹`, scopeKey,
        scope, subjectKey: `批量人物${i % 50}`, subjectLabel: `批量人物${i % 50}`, predicate: '事迹',
        object: `第${i}条批量事迹`, evidenceIds: [], validInterval: null,
        recordedAt: Date.now(), recordedSeq: 100 + i, supersedes: null,
        authority: 'author-confirmed', origin: 'author', legacyRefs: null
      })
    }
    const t0 = performance.now()
    await db.transaction('rw', 'factVersions', () => db.table('factVersions').bulkPut(factRows))
    const factInsertMs = Math.round(performance.now() - t0)

    const receiptRows = []
    for (let i = 1; i <= 10000; i++) {
      receiptRows.push({
        receiptId: `xa-bulk-rc-${i}`, commandId: `xa-bulk-c-${i}`, turnId: `xa-bulk-t-${i}`,
        parentTurnId: i > 1 ? `xa-bulk-t-${i - 1}` : null, branchId: i % 2 ? 'main' : 'side',
        scope, scopeKey, rulesVersion: '2d6@1', resolutionRef: null, stateDeltaRefs: [],
        evidenceRefs: [`session:x:turn:${i}`], committedAt: Date.now(), payloadHash: `sha256-xa-${i}`,
        archivedAt: Date.now(), archivedSeq: 100 + i
      })
    }
    const t1 = performance.now()
    await db.transaction('rw', 'turnReceipts', () => db.table('turnReceipts').bulkPut(receiptRows))
    const receiptInsertMs = Math.round(performance.now() - t1)

    // Paged reads: latency samples across a fresh walk.
    const walk = async (limit, query) => {
      const samples = []
      const seen = new Set()
      let cursor = null
      let scanned = 0
      for (;;) {
        const q = await query({ cursor, limit })
        check(q.ok, `scale query failed: ${q.reason}`)
        samples.push(q.elapsedMs)
        scanned = Math.max(scanned, q.scanned)
        for (const item of q.items) seen.add(item.factVersionId || item.receiptId)
        if (!q.nextCursor) break
        cursor = q.nextCursor
        if (seen.size > 20000) throw new Error('scale walk did not terminate')
      }
      samples.sort((a, b) => a - b)
      return {
        unique: seen.size,
        scanned,
        p50: samples[Math.floor(samples.length / 2)],
        p95: samples[Math.floor(samples.length * 0.95)]
      }
    }
    const factWalk = await walk(50, args => Q.queryFacts(db, { scope, ...args }))
    check(factWalk.unique === 10000, `fact scale walk lost rows: ${factWalk.unique}`)
    const receiptWalk = await walk(50, args => R.queryTurnReceipts(db, { scope, ...args }))
    check(receiptWalk.unique === 10000, `receipt scale walk lost rows: ${receiptWalk.unique}`)
    const sideWalk = await walk(50, args => R.queryTurnReceipts(db, { scope, branchId: 'side', ...args }))
    check(sideWalk.unique === 5000, `branch-filtered walk broken: ${sideWalk.unique}`)

    // Extended volume: scale the batch by the measured 10k insert speed so a
    // slow environment degrades the EXTENSION, not the assertions. The
    // fixture keeps the invariant that archivedSeq never exceeds the counter.
    const extBatches = receiptInsertMs < 8000 ? 9 : receiptInsertMs < 20000 ? 3 : 0
    let extInsertMs = null
    let extReadMs = null
    if (extBatches > 0) {
      await meta.put({ id: `seq:${scopeKey}`, seq: 200000 })
      const t2 = performance.now()
      for (let batch = 0; batch < extBatches; batch++) {
      const rows = []
      for (let i = 1; i <= 10000; i++) {
        const n = 10000 + batch * 10000 + i
        rows.push({
          receiptId: `xa-bulk-rc-${n}`, commandId: `xa-bulk-c-${n}`, turnId: `xa-bulk-t-${n}`,
          parentTurnId: n > 1 ? `xa-bulk-t-${n - 1}` : null, branchId: 'ext',
          scope, scopeKey, rulesVersion: '2d6@1', resolutionRef: null, stateDeltaRefs: [],
          evidenceRefs: [`session:x:turn:${n}`], committedAt: Date.now(), payloadHash: `sha256-xa-${n}`,
          archivedAt: Date.now(), archivedSeq: 100 + n
        })
      }
        await db.transaction('rw', 'turnReceipts', () => db.table('turnReceipts').bulkPut(rows))
      }
      extInsertMs = Math.round(performance.now() - t2)
      const t3 = performance.now()
      const extFirst = await R.queryTurnReceipts(db, { scope, limit: 50 })
      extReadMs = Math.round(performance.now() - t3)
      check(extFirst.ok && extFirst.items.length === 50, 'extended read broken')
    }
    // bounded DOM guard: page size caps at 200 by contract
    const hugePage = await R.queryTurnReceipts(db, { scope, limit: 100000 })
    check(hugePage.items.length <= 200, `page cap broken: ${hugePage.items.length}`)

    // Decisions paged (AX15): 320 bulk decisions.
    const decisionRows = []
    for (let i = 1; i <= 320; i++) {
      decisionRows.push({
        id: `xa-dec-${i}`, commandId: `xa-dec-c-${i}`, scopeKey, scope, operation: 'adopt-proposal',
        actorKind: 'author', actorRef: 'scale', reason: '', beforeIds: [], afterIds: [`xa-fv-${i}`],
        recordedAt: Date.now(), recordedSeq: 20000 + i, payloadHash: `sha256-dec-${i}`, result: {}
      })
    }
    await db.transaction('rw', 'factDecisions', () => db.table('factDecisions').bulkPut(decisionRows))
    const decSeen = new Set()
    let decCursor = null
    let decScanned = 0
    for (;;) {
      const page = await F.listDecisionsPaged(db, { scope, limit: 100, cursor: decCursor })
      check(page.ok, 'decisions paging failed')
      decScanned = Math.max(decScanned, page.scanned)
      for (const row of page.items) decSeen.add(row.id)
      if (!page.nextCursor) break
      decCursor = page.nextCursor
    }
    check(decSeen.size === 320 && decScanned <= 1000, `decisions paging broken: ${decSeen.size}/${decScanned}`)

    await L.closeLedgerDb(db)
    return {
      factInsertMs, receiptInsertMs, extInsertMs, extReadMs,
      factWalk, receiptWalk, sideWalk, decisions: { unique: decSeen.size, scanned: decScanned }
    }
  }, 300000, 'scale')
  console.log('scale', JSON.stringify(scaleResult))

  // ===== part 3: two-page same-head race (XA-G08) =====
  const mark = async label => { await pageA.evaluate(l => { globalThis.__stage = l }, label).catch(() => {}) }
  part34Watchdog = setTimeout(() => {
    pageA.evaluate(() => globalThis.__stage || 'unknown')
      .then(value => console.error(`PART34_HUNG_AT_STAGE: ${value}`))
      .catch(() => console.error('PART34_HUNG: page-busy'))
      .finally(() => process.exit(3))
  }, 150000)
  await mark('part3-start')
  const pageB = await context.newPage()
  pageB.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(`B:${msg.text()}`) })
  pageB.on('pageerror', error => consoleErrors.push(`B:pageerror: ${error.message}`))
  await pageB.goto(BASE_URL)
  await pageB.waitForSelector('.authoring-welcome')
  await mark('part3-seed')
  const raceSetup = await pageA.evaluate(async () => {
    const L = await import('/src/services/memory/ledger/ledgerDb.js')
    const F = await import('/src/services/memory/ledger/factLedger.js')
    const db = (await L.openLedgerDb()).db
    const scope = { domain: 'book', bookId: 'xa-race' }
    const ev = await F.appendEvidence(db, { scope, sourceKind: 'manual-assertion', sourceId: 'author:race', quote: '竞速断言。' })
    const prop = await F.createProposal(db, { scope, subjectKey: '盟约', subjectLabel: '盟约', predicate: '效力', object: '有效', evidenceIds: [ev.evidence.id] })
    await F.adoptProposal(db, { scope, proposalId: prop.proposal.id, commandId: 'xa-race-adopt' })
    const head = await F.getFactHead(db, { scope, factKey: 'fact:盟约:效力' })
    await L.closeLedgerDb(db)
    return { factKey: head.factKey, headId: head.id }
  })
  const raceFn = async (page, object, commandId) => page.evaluate(async ({ factKey, headId, object, commandId }) => {
    const L = await import('/src/services/memory/ledger/ledgerDb.js')
    const F = await import('/src/services/memory/ledger/factLedger.js')
    const db = (await L.openLedgerDb()).db
    const result = await F.correctFact(db, {
      scope: { domain: 'book', bookId: 'xa-race' }, factKey, object,
      expectedHead: headId, commandId, actorRef: commandId
    })
    await L.closeLedgerDb(db)
    return { ok: result.ok, reason: result.reason || null }
  }, { ...raceSetup, object, commandId })
  await mark('part3-race')
  const [raceA, raceB] = await Promise.all([
    raceFn(pageA, '甲页更正', 'xa-race-correct-a'),
    raceFn(pageB, '乙页更正', 'xa-race-correct-b')
  ])
  const winners = [raceA, raceB].filter(r => r.ok)
  const conflicts = [raceA, raceB].filter(r => !r.ok && r.reason === 'head-conflict')
  assert.equal(winners.length, 1, `race should have exactly one winner: ${JSON.stringify([raceA, raceB])}`)
  assert.equal(conflicts.length, 1, `race loser should surface a recoverable conflict: ${JSON.stringify([raceA, raceB])}`)
  const raceTail = await pageA.evaluate(async () => {
    const L = await import('/src/services/memory/ledger/ledgerDb.js')
    const F = await import('/src/services/memory/ledger/factLedger.js')
    const db = (await L.openLedgerDb()).db
    const versions = await F.listFactVersions(db, { scope: { domain: 'book', bookId: 'xa-race' }, factKey: 'fact:盟约:效力' })
    await L.closeLedgerDb(db)
    return versions.length
  })
  assert.equal(raceTail, 2, 'race produced duplicate versions')

  await mark('part4-start')
  // ===== part 4: blocked upgrade lifecycle (XA-G05) via real two-connection =====
  const lifecycle = await pageA.evaluate(async () => {
    const probe = await import('/scripts/fixtures/ledger/upgrade-probe.mjs')
    const name = 'pinax-ledger-lifecycle-smoke'
    await probe.deleteDatabase(name)
    // Seed a v2 database through the production opener.
    const L = await import('/src/services/memory/ledger/ledgerDb.js')
    const seeded = await L.openLedgerDbNamed(name)
    if (!seeded.ok) throw new Error(`seed open failed: ${seeded.reason}`)
    await seeded.db.table('ledgerMeta').put({ id: 'marker', value: 1 })
    await L.closeLedgerDb(seeded.db)

    // Old tab holds the DB and ignores versionchange.
    const holder = await probe.holdOldConnection(name)
    const blockedDb = probe.openFutureVersion(name)
    let timer
    const notified = new Promise(resolve => {
      blockedDb.on('blocked', () => resolve(true))
      timer = setTimeout(() => resolve(false), 5000)
    })
    void blockedDb.open().catch(() => {}) // cancellation is an expected outcome
    // Observe the event BEFORE releasing the holder. An event at t=0 is valid;
    // a fixed 300ms sleep + elapsed>0 spuriously rejected immediate delivery.
    const blockedObserved = await notified
    clearTimeout(timer)
    // While the upgrade is blocked, data stays readable THROUGH the old
    // connection; new open requests would queue behind the upgrade.
    const revisionsWhileHeld = await probe.countViaConnection(holder, 'revisions')
    const markerWhileHeld = await probe.readViaConnection(holder, 'ledgerMeta', 'marker')
    // Cancel the blocked opener; the old tab never yielded.
    try { blockedDb.close() } catch { /* best-effort cancel */ }
    const markerStillThere = await probe.readViaConnection(holder, 'ledgerMeta', 'marker')
    // Release: old tab closes, upgrade proceeds.
    probe.closeConnection(holder)
    const upgradeResult = await new Promise((resolve) => {
      const retry = probe.openFutureVersion(name)
      retry.open().then(() => { retry.close(); resolve('upgraded') }, error => { try { retry.close() } catch { /* best-effort close */ } resolve(`failed:${error?.name}`) })
    })
    // Verify via a fresh production-style open that the marker survived
    // cancel + upgrade (cancel/delete path destroyed nothing).
    const reopened = await L.openLedgerDbNamed(name)
    const markerAfter = reopened.ok ? (await reopened.db.table('ledgerMeta').get('marker')) ? 'present' : 'missing' : `open-failed:${reopened.reason}`
    if (reopened.ok) await L.closeLedgerDb(reopened.db)
    await probe.deleteDatabase(name)
    return { blockedObserved, revisionsWhileHeld, markerWhileHeld: markerWhileHeld ? 'present' : 'missing', markerStillThere: markerStillThere ? 'present' : 'missing', upgradeResult, markerAfter }
  })

  assert.equal(lifecycle.blockedObserved, true, 'blocked event not observed immediately (XA-G05)')
  assert.ok(typeof lifecycle.revisionsWhileHeld === 'number', 'held db unreadable while blocked')
  assert.equal(lifecycle.markerWhileHeld, 'present', 'data unreadable through old connection while blocked')
  assert.equal(lifecycle.markerStillThere, 'present', 'cancel path destroyed data')
  assert.equal(lifecycle.upgradeResult, 'upgraded', `retry after release failed: ${lifecycle.upgradeResult}`)
  clearTimeout(part34Watchdog)
  await mark('done')
  assert.equal(lifecycle.markerAfter, 'present', 'cancel/delete path destroyed data')

  assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(' | ')}`)
  console.log(JSON.stringify({ ok: true, ...result, scale: scaleResult, race: { winners: winners.length, conflicts: conflicts.length }, lifecycle }))
} finally { clearTimeout(part34Watchdog); await browser.close() }
