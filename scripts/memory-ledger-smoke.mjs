import { chromium } from 'playwright'
import assert from 'node:assert/strict'

// A-line fact ledger smoke (nightly 20260916). Real IndexedDB/Dexie in an
// isolated browser profile; never touches the author's data. Covers the A0
// acceptance gates that must not live inside the 20-file vitest budget.
const BASE_URL = process.env.PINAX_LEDGER_SMOKE_URL || 'http://127.0.0.1:5179'
const browser = await chromium.launch({ headless: true })
const consoleErrors = []
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  page.on('pageerror', error => consoleErrors.push(`pageerror: ${error.message}`))
  await page.goto(BASE_URL)
  await page.waitForSelector('.authoring-welcome')

  const result = await page.evaluate(async () => {
    const c = await import('/src/services/memory/memoryCandidates.js')
    const h = await import('/src/services/memory/memoryHistoryStore.js')
    const L = await import('/src/services/memory/ledger/ledgerDb.js')
    const F = await import('/src/services/memory/ledger/factLedger.js')
    const Q = await import('/src/services/memory/ledger/queryFacts.js')
    const M = await import('/src/services/memory/ledger/legacyMigration.js')
    const P = await import('/src/services/memory/ledger/ledgerProjection.js')
    const B = await import('/src/services/memory/ledger/ledgerBackup.js')
    const check = (condition, message) => { if (!condition) throw new Error(message) }

    // G-A16 (partial): IndexedDB unavailable must be typed, not thrown, and
    // must not touch any data. indexedDB is an accessor on the global, so the
    // override needs defineProperty (plain assignment is silently ignored).
    const savedIdb = globalThis.indexedDB
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true, writable: true })
    try {
      const unavailable = await L.openLedgerDb()
      check(!unavailable.ok && unavailable.reason === 'indexeddb-unavailable' && unavailable.retryable === false, 'typed unavailability missing')
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { value: savedIdb, configurable: true, writable: true })
    }

    // G-A01: seed a real v1 profile through the legacy owner, then upgrade.
    const base = { id: 'ledger-smoke-legacy', content: '钟楼尚未开放。', scope: 'project', scopeId: 'book-ledger', sourceRefs: ['chapter:ledger:unit:1'], sourceRevision: 'r1' }
    c.queueMemoryCandidate(base)
    c.confirmMemoryCandidate(base.id)
    c.updateMemoryCandidate(base.id, { content: '钟楼在冬至开放。', status: 'pending', authority: 'derived' })
    await h.flushMemoryHistory()
    const v1rows = await h.readMemoryHistory({ candidateId: base.id })
    check(v1rows.length === 3, 'v1 seed revisions missing')
    // Migration fixtures: one claimable active, one missing source, one session.
    c.queueMemoryCandidate({ id: 'ledger-migrate-a', content: '沈青梧左手有旧疤。', scope: 'project', scopeId: 'book-ledger', sourceRefs: ['chapter:ledger:unit:2'], sourceRevision: 'r9' })
    c.confirmMemoryCandidate('ledger-migrate-a')
    c.queueMemoryCandidate({ id: 'ledger-migrate-nosrc', content: '没有来源的记忆。', scope: 'project', scopeId: 'book-ledger' })
    c.queueMemoryCandidate({ id: 'ledger-migrate-sess', content: '会话记忆。', scope: 'session', scopeId: 'sess-1' })
    // Fixtures add their own revisions (2+1+1); drain before counting the table.
    await h.flushMemoryHistory()

    const opened = await L.openLedgerDb()
    check(opened.ok, `ledger open failed: ${opened.detail || opened.reason}`)
    const db = opened.db
    const health1 = await L.readLedgerHealth(db)
    check(health1.schemaVersion === 2, 'schema meta missing after upgrade')
    check(health1.v1RevisionCount === 7, `v1 revisions unexpected after upgrade: ${health1.v1RevisionCount}`)
    const v1after = await h.readMemoryHistory({ candidateId: base.id })
    check(v1after.length === 3 && v1after.every(row => row.candidateId === base.id), 'v1 content changed by upgrade')

    const scopeBook = { domain: 'book', bookId: 'book-ledger' }
    const scopeBook2 = { domain: 'book', bookId: 'book-other' }

    // A05: evidence freeze + idempotency.
    const ev1 = await F.appendEvidence(db, { scope: scopeBook, sourceKind: 'chapter-quote', sourceId: 'chapter:ledger:unit:1', sourceRevision: 'r2', quote: '钟楼在冬至向行人开放。' })
    check(ev1.ok, 'evidence add failed')
    const ev1again = await F.appendEvidence(db, { scope: scopeBook, sourceKind: 'chapter-quote', sourceId: 'chapter:ledger:unit:1', sourceRevision: 'r2', quote: '钟楼在冬至向行人开放。' })
    check(ev1again.ok && ev1again.replay && ev1again.evidence.id === ev1.evidence.id, 'evidence not idempotent')

    // A06: pending proposals are invisible to the facts reader (G-A05).
    const storyInterval = { timelineId: 't-main', start: { eraId: 'qingli', ordinal: 3 }, end: { eraId: 'qingli', ordinal: 5 }, endSemantic: 'exclusive' }
    const prop1 = await F.createProposal(db, { scope: scopeBook, subjectKey: '钟楼', subjectLabel: '钟楼', predicate: '开放时间', object: '冬至日向行人开放', evidenceIds: [ev1.evidence.id], storyInterval, origin: 'ai' })
    check(prop1.ok && !prop1.replay, `proposal create failed: ${prop1.reason || ''}`)
    const prop1b = await F.createProposal(db, { scope: scopeBook, subjectKey: '钟楼', subjectLabel: '钟楼', predicate: '开放时间', object: '冬至日向行人开放', evidenceIds: [ev1.evidence.id], storyInterval, origin: 'ai' })
    check(prop1b.ok && prop1b.replay && prop1b.proposal.id === prop1.proposal.id, 'proposal not idempotent')
    const qEmpty = await Q.queryFacts(db, { scope: scopeBook })
    check(qEmpty.ok && qEmpty.items.length === 0, 'pending proposal leaked into facts reader')

    // A07: adopt with commandId envelope; replay/conflict/double-adopt (G-A14/A15).
    const adopt1 = await F.adoptProposal(db, { scope: scopeBook, proposalId: prop1.proposal.id, commandId: 'cmd-adopt-1', actorRef: 'smoke' })
    check(adopt1.ok, `adopt failed: ${adopt1.reason || ''}`)
    const seqT1 = adopt1.decision.recordedSeq
    const qFirst = await Q.queryFacts(db, { scope: scopeBook })
    check(qFirst.ok && qFirst.items.length === 1 && qFirst.items[0].object === '冬至日向行人开放', 'adopted fact not visible')
    const factKeyOfBell = qFirst.items[0].factKey
    const adoptReplay = await F.adoptProposal(db, { scope: scopeBook, proposalId: prop1.proposal.id, commandId: 'cmd-adopt-1', actorRef: 'smoke' })
    check(adoptReplay.ok && adoptReplay.replay, 'same commandId not replayed')
    const adoptTamper = await F.adoptProposal(db, { scope: scopeBook, proposalId: prop1.proposal.id, commandId: 'cmd-adopt-1', actorRef: 'smoke', object: '篡改' })
    check(!adoptTamper.ok && adoptTamper.reason === 'command-payload-conflict', 'same commandId different payload accepted (G-A15)')
    const adopt2 = await F.adoptProposal(db, { scope: scopeBook, proposalId: prop1.proposal.id, commandId: 'cmd-adopt-2', actorRef: 'smoke' })
    check(!adopt2.ok && adopt2.reason === 'proposal-already-adopted', 'double adopt accepted (G-A14)')
    check((await F.listFactVersions(db, { scope: scopeBook })).length === 1, 'duplicate version after double adopt')

    // G-A11: AI proposal without evidence may never be promoted.
    const propAi = await F.createProposal(db, { scope: scopeBook, subjectKey: '沈青梧', subjectLabel: '沈青梧', predicate: '佩剑', object: '玄铁剑', origin: 'ai', evidenceIds: [] })
    const adoptAi = await F.adoptProposal(db, { scope: scopeBook, proposalId: propAi.proposal.id, commandId: 'cmd-adopt-ai' })
    check(!adoptAi.ok && adoptAi.reason === 'evidence-missing', 'AI proposal without evidence adopted (G-A11)')

    // §6.2 mandatory dual-time example (G-A07): record → correct interval →
    // same story moment answered differently per recordedAsOf.
    const snapshotT1 = (await Q.queryFacts(db, { scope: scopeBook })).snapshotVersion
    check(snapshotT1 >= seqT1, 'snapshot version behind decisions')
    const head1 = await F.getFactHead(db, { scope: scopeBook, factKey: factKeyOfBell })
    const corr = await F.correctFact(db, {
      scope: scopeBook, factKey: factKeyOfBell, object: head1.object,
      storyInterval: { timelineId: 't-main', start: { eraId: 'qingli', ordinal: 4 }, end: { eraId: 'qingli', ordinal: 5 }, endSemantic: 'exclusive' },
      expectedHead: head1.id, commandId: 'cmd-correct-1', reason: '补录：实际自第四年开放'
    })
    check(corr.ok, `correction failed: ${corr.reason || ''}`)
    const seqT2 = corr.decision.recordedSeq
    check(seqT2 > seqT1, 'recordedSeq not monotonic (G-A08)')
    const corrNoChange = await F.correctFact(db, { scope: scopeBook, factKey: factKeyOfBell, object: head1.object, storyInterval: null, expectedHead: null, commandId: 'cmd-correct-nochange' })
    check(!corrNoChange.ok && corrNoChange.reason === 'no-change', 'meaningless correction accepted')
    const corrStale = await F.correctFact(db, { scope: scopeBook, factKey: factKeyOfBell, object: '迟到写入', expectedHead: head1.id, commandId: 'cmd-correct-stale' })
    check(!corrStale.ok && corrStale.reason === 'head-conflict', 'stale expectedHead accepted (G-A13 shape)')

    const ev2 = await F.appendEvidence(db, { scope: scopeBook, sourceKind: 'chapter-quote', sourceId: 'chapter:ledger:unit:3', sourceRevision: 'r3', quote: '第三年之前，守塔的是乙。' })
    const propYi = await F.createProposal(db, { scope: scopeBook, subjectKey: '钟楼', subjectLabel: '钟楼', predicate: '看守人', object: '乙', evidenceIds: [ev2.evidence.id], storyInterval: { timelineId: 't-main', start: { eraId: 'qingli', ordinal: 2 }, end: { eraId: 'qingli', ordinal: 4 }, endSemantic: 'exclusive' } })
    const adoptYi = await F.adoptProposal(db, { scope: scopeBook, proposalId: propYi.proposal.id, commandId: 'cmd-adopt-yi' })
    check(adoptYi.ok, `adopt yi failed: ${adoptYi.reason || ''}`)
    const seqT3 = adoptYi.decision.recordedSeq

    const timeline = { id: 't-main', eras: [{ id: 'qingli', order: 1 }] }
    const storyAt3 = { timelineId: 't-main', eraId: 'qingli', ordinal: 3, precision: 'year' }
    const qT1 = await Q.queryFacts(db, { scope: scopeBook, storyAt: storyAt3, timeline, recordedAsOf: { seq: seqT1 } })
    check(qT1.ok && qT1.items.length === 1 && qT1.items[0].predicate === '开放时间', `story year 3 @T1 should see old interval only, got ${JSON.stringify(qT1.items.map(i => i.predicate))}`)
    const qT3 = await Q.queryFacts(db, { scope: scopeBook, storyAt: storyAt3, timeline, recordedAsOf: { seq: seqT3 } })
    check(qT3.ok && qT3.items.length === 1 && qT3.items[0].object === '乙', `story year 3 @T3 should return 乙 only, got ${JSON.stringify(qT3.items.map(i => i.object))} excluded=${JSON.stringify(qT3.excludedReasonCounts)}`)
    const qNow = await Q.queryFacts(db, { scope: scopeBook })
    check(qNow.ok && qNow.items.length === 2, `current view should hold 2 facts, got ${qNow.items.length}`)
    const chain = await F.listFactVersions(db, { scope: scopeBook, factKey: factKeyOfBell })
    const chainRoot = chain.find(row => row.supersedes === null)
    const chainNext = chain.find(row => row.supersedes === chainRoot?.id)
    check(chain.length === 2 && chainRoot && chainNext, 'supersedes chain broken')
    // Wall-clock resolution: recordedAsOf by recordedAt maps to a seq cutoff.
    const qWall = await Q.queryFacts(db, { scope: scopeBook, storyAt: storyAt3, timeline, recordedAsOf: { recordedAt: adoptYi.decision.recordedAt } })
    check(qWall.ok && qWall.items.some(item => item.object === '乙'), 'wall-clock recordedAsOf resolution failed')

    // A09: rejection fingerprint suppression + source-change review + reopen.
    const propRej = await F.createProposal(db, { scope: scopeBook, subjectKey: '钟楼', subjectLabel: '钟楼', predicate: '颜色', object: '猩红', evidenceIds: [ev2.evidence.id] })
    const rej = await F.rejectProposal(db, { scope: scopeBook, proposalId: propRej.proposal.id, commandId: 'cmd-reject-1' })
    check(rej.ok, `reject failed: ${rej.reason || ''}`)
    const propRej2 = await F.createProposal(db, { scope: scopeBook, subjectKey: '钟楼', subjectLabel: '钟楼', predicate: '颜色', object: '猩红', evidenceIds: [ev2.evidence.id] })
    check(propRej2.ok && propRej2.suppressed, 'identical rejected claim resurfaced (A09)')
    const pendingNow = await F.listProposals(db, { scope: scopeBook, status: 'pending' })
    check(!pendingNow.some(row => row.predicate === '颜色'), 'suppressed claim created a pending row')
    const ev4 = await F.appendEvidence(db, { scope: scopeBook, sourceKind: 'chapter-quote', sourceId: 'chapter:ledger:unit:4', sourceRevision: 'r4', quote: '重修后，钟楼漆成猩红。' })
    const propRej3 = await F.createProposal(db, { scope: scopeBook, subjectKey: '钟楼', subjectLabel: '钟楼', predicate: '颜色', object: '猩红', evidenceIds: [ev4.evidence.id] })
    check(propRej3.ok && !propRej3.suppressed && propRej3.proposal, 'changed source still suppressed (A09)')
    const marks = await F.listRejectionMarks(db, { scope: scopeBook })
    const reopened = await F.reopenRejection(db, { scope: scopeBook, rejectionMarkId: marks[0].id, commandId: 'cmd-reopen-1' })
    check(reopened.ok, 'reopen failed')
    const propRej4 = await F.createProposal(db, { scope: scopeBook, subjectKey: '钟楼', subjectLabel: '钟楼', predicate: '颜色', object: '猩红', evidenceIds: [ev2.evidence.id] })
    check(propRej4.ok && propRej4.proposal, 'reopen did not lift suppression')

    // G-A03: same name, same claim shape, different book — no cross-book leak.
    const evB = await F.appendEvidence(db, { scope: scopeBook2, sourceKind: 'chapter-quote', sourceId: 'chapter:other:unit:1', sourceRevision: 'rB', quote: '另一本书的钟楼在除夕开放。' })
    const propB = await F.createProposal(db, { scope: scopeBook2, subjectKey: '钟楼', subjectLabel: '钟楼', predicate: '开放时间', object: '除夕日向行人开放', evidenceIds: [evB.evidence.id] })
    const adoptB = await F.adoptProposal(db, { scope: scopeBook2, proposalId: propB.proposal.id, commandId: 'cmd-adopt-B' })
    check(adoptB.ok, 'book B adopt failed')
    const qA = await Q.queryFacts(db, { scope: scopeBook })
    check(!qA.items.some(item => item.object === '除夕日向行人开放'), 'cross-book leak (G-A03)')

    // G-A04: worldbook-domain facts live in their own scope.
    const scopeWb = { domain: 'worldbook', worldbookId: 'wb-shared' }
    const evWb = await F.appendEvidence(db, { scope: scopeWb, sourceKind: 'chapter-quote', sourceId: 'wb:shared:1', sourceRevision: 'w1', quote: '大陆历第三年大旱。' })
    const propWb = await F.createProposal(db, { scope: scopeWb, subjectKey: '大陆', subjectLabel: '大陆', predicate: '灾害', object: '第三年大旱', evidenceIds: [evWb.evidence.id] })
    const adoptWb = await F.adoptProposal(db, { scope: scopeWb, proposalId: propWb.proposal.id, commandId: 'cmd-adopt-wb' })
    check(adoptWb.ok, 'worldbook adopt failed')
    const qWb = await Q.queryFacts(db, { scope: scopeWb })
    check(qWb.ok && qWb.items.length === 1, 'worldbook fact missing')
    check(!qA.items.some(item => item.scopeKey === qWb.items[0].scopeKey), 'worldbook fact leaked into book scope (G-A04)')

    // G-A09: unknown/undeclared story time is counted, never "inside".
    const propNoTime = await F.createProposal(db, { scope: scopeBook, subjectKey: '老周', subjectLabel: '老周', predicate: '职业', object: '更夫', evidenceIds: [ev1.evidence.id] })
    const adoptNoTime = await F.adoptProposal(db, { scope: scopeBook, proposalId: propNoTime.proposal.id, commandId: 'cmd-adopt-notime' })
    check(adoptNoTime.ok, 'no-time adopt failed')
    const qUnknown = await Q.queryFacts(db, { scope: scopeBook, storyAt: storyAt3, timeline })
    check((qUnknown.excludedReasonCounts.storyTimeUnknown || 0) >= 1, 'unknown-range fact counted inside (G-A09)')
    // Cross-timeline never compares by name order (G-A09).
    const qOtherTimeline = await Q.queryFacts(db, { scope: scopeBook, storyAt: { timelineId: 't-other', eraId: 'qingli', ordinal: 3, precision: 'year' }, timeline: { id: 't-other', eras: [{ id: 'qingli', order: 1 }] } })
    check((qOtherTimeline.excludedReasonCounts.storyTimeUnknown || 0) >= qNow.items.length, 'cross-timeline facts silently matched')

    // A12: stable cursor pagination.
    for (let i = 0; i < 7; i++) {
      const prop = await F.createProposal(db, { scope: scopeBook, subjectKey: `分页人物${i}`, subjectLabel: `分页人物${i}`, predicate: '籍贯', object: `青州${i}`, evidenceIds: [ev1.evidence.id] })
      const adopted = await F.adoptProposal(db, { scope: scopeBook, proposalId: prop.proposal.id, commandId: `cmd-page-${i}` })
      check(adopted.ok, 'pagination seed failed')
    }
    const qTotal = await Q.queryFacts(db, { scope: scopeBook, limit: 200 })
    let cursor = null
    const seen = new Set()
    let pages = 0
    for (;;) {
      const qPage = await Q.queryFacts(db, { scope: scopeBook, limit: 3, cursor })
      check(qPage.ok, 'paged query failed')
      for (const item of qPage.items) seen.add(item.factVersionId)
      pages += 1
      if (!qPage.nextCursor) break
      cursor = qPage.nextCursor
      if (pages > 50) throw new Error('pagination did not terminate')
    }
    check(seen.size === qTotal.items.length, `pagination lost items (${seen.size}/${qTotal.items.length})`)
    check(pages === Math.ceil(qTotal.items.length / 3), `pagination page count unexpected: ${pages}`)

    // A19: committed turn receipts — idempotent, conflict-typed, not capped.
    const receipt = { receiptId: 'rcpt-1', commandId: 'turn-cmd-1', turnId: 'turn-1', parentTurnId: null, branchId: 'b-main', rulesVersion: '2d6-v0', resolutionRef: null, stateDeltaRefs: [], evidenceRefs: [], committedAt: Date.now() }
    const r1 = await F.appendCommittedTurnReceipt(db, { scope: scopeBook, receipt })
    const r2 = await F.appendCommittedTurnReceipt(db, { scope: scopeBook, receipt })
    check(r1.ok && r2.ok && r2.replay, 'receipt not idempotent')
    const r3 = await F.appendCommittedTurnReceipt(db, { scope: scopeBook, receipt: { ...receipt, turnId: 'turn-X' } })
    check(!r3.ok && r3.reason === 'receipt-conflict', 'same receiptId with different payload accepted')
    for (let i = 0; i < 1000; i++) {
      const bulk = await F.appendCommittedTurnReceipt(db, { scope: scopeBook, receipt: { receiptId: `rcpt-bulk-${i}`, commandId: `c-${i}`, turnId: `t-${i}`, committedAt: Date.now() } })
      if (!bulk.ok) throw new Error(`bulk receipt failed at ${i}: ${bulk.reason}`)
    }
    const receipts = await F.listTurnReceipts(db, { scope: scopeBook, limit: 5000 })
    check(receipts.length === 1001, `receipt volume truncated: ${receipts.length}`)

    // A13: legacy migration preview, explicit adopt, idempotency, no mutation.
    const preview = M.previewLegacyMigration()
    check(preview.ok && preview.claimable.some(item => item.id === 'ledger-migrate-a'), 'migration preview missing claimable')
    check(preview.missingSource.some(item => item.id === 'ledger-migrate-nosrc'), 'missing-source not flagged (G-A11/G-A13)')
    check(preview.unattributable.some(item => item.id === 'ledger-migrate-sess' && item.identityKind === 'legacy-session'), 'session candidate attributed without branch')
    const target = preview.claimable.find(item => item.id === 'ledger-migrate-a')
    const migration = await M.migrateLegacyCandidate(db, {
      candidate: { id: target.id, scope: 'project', scopeId: 'book-ledger', content: target.content, kind: target.kind, sourceRefs: target.sourceRefs, sourceRevision: target.sourceRevision, metadata: { storyTime: target.storyTime } },
      commandId: 'cmd-migrate-1', actorRef: 'smoke'
    })
    check(migration.ok, `migrate failed: ${migration.reason || ''}`)
    const map = await M.listLegacyMigrationMap(db, { scope: scopeBook })
    check(map.map['ledger-migrate-a'] === migration.result.factVersionId, 'migration map missing')
    const migrationReplay = await M.migrateLegacyCandidate(db, {
      candidate: { id: target.id, scope: 'project', scopeId: 'book-ledger', content: target.content, kind: target.kind, sourceRefs: target.sourceRefs, sourceRevision: target.sourceRevision, metadata: { storyTime: target.storyTime } },
      commandId: 'cmd-migrate-1', actorRef: 'smoke'
    })
    check(migrationReplay.ok && migrationReplay.replay, 'migration not idempotent')
    check((await F.listFactVersions(db, { scope: scopeBook })).filter(row => row.origin === 'legacy-migration').length === 1, 'double migration duplicated fact')
    check(c.listMemoryCandidates().some(item => item.id === 'ledger-migrate-a' && item.status === 'active'), 'migration mutated legacy owner')

    // A15: frozen projection + manifest reference validator.
    const project = P.createLedgerFactProjection(db)
    const projection = await project({ scope: scopeBook })
    check(projection.ok && projection.blocks.some(block => block.included && block.text.includes('青州')), 'projection missing facts')
    check(projection.manifestFactVersionIds.length === projection.blocks.filter(block => block.included).length, 'projection manifest mismatch')
    const validator = P.createFactReferenceValidator(projection.manifestFactVersionIds)
    check(validator(projection.manifestFactVersionIds[0]).ok, 'validator rejects its own manifest')
    check(!validator('fv_forged-id').ok, 'validator accepted forged reference (G-A25)')
    const projStory = await project({ scope: scopeBook, storyAt: storyAt3, timeline })
    check(projStory.ok && projStory.blocks.filter(block => block.included).every(block => !block.text.includes('更夫')), 'unknown-time fact entered story-filtered projection')
    const auditBlock = projStory.blocks.find(block => !block.included)
    check(auditBlock && auditBlock.text === '' && auditBlock.recallAudit, 'audit block leaks content (G-A26)')

    // A16/G-A18: backup domain — validate, idempotent re-import, tamper refuse.
    const domain = await B.collectLedgerDomain(db)
    const inspected = B.validateLedgerDomain(domain, { counts: domain.counts })
    check(inspected.total > 0, 'ledger domain export empty')
    const reimport = await B.importLedgerDomain(db, domain)
    check(reimport.ok && Object.values(reimport.written).every(ids => ids.length === 0), 'domain re-import not idempotent')
    const tampered = structuredClone(domain)
    tampered.tables.factVersions[0].object = '篡改后的内容'
    const refused = await B.importLedgerDomain(db, tampered)
    check(!refused.ok, 'same-id different-content import accepted (G-A18)')
    const headAfter = await F.getFactHead(db, { scope: scopeBook, factKey: domain.tables.factVersions[0].factKey })
    check(!headAfter || headAfter.object !== '篡改后的内容', 'refused import mutated data')
    // G-A17: fresh-database restore + compensation restricted to inserted ids.
    const restoreDb = await L.openLedgerDbNamed('pinax-ledger-restore-smoke')
    check(restoreDb.ok, 'restore db open failed')
    const restoreImport = await B.importLedgerDomain(restoreDb.db, domain)
    check(restoreImport.ok, `fresh restore failed: ${restoreImport.reason || ''}`)
    const restoredCount = Object.values(restoreImport.written).reduce((n, ids) => n + ids.length, 0)
    const skippedCount = Object.values(restoreImport.skipped).reduce((n, ids) => n + ids.length, 0)
    check(restoredCount + skippedCount === inspected.total, `fresh restore accounting mismatch: ${restoredCount}+${skippedCount}/${inspected.total}`)
    // The only legitimately skipped row is the locally regenerated schema meta.
    check(restoredCount === inspected.total - 1 && restoreImport.skipped.ledgerMeta.includes('schema'), 'unexpected restore skips')
    await B.rollbackImportedLedgerDomain(restoreDb.db, restoreImport.written)
    const afterRollback = await B.collectLedgerDomain(restoreDb.db)
    check(Object.entries(afterRollback.tables).every(([key, rows]) => key === 'ledgerMeta' || rows.length === 0), 'compensation left new rows behind')
    check(afterRollback.tables.ledgerMeta.every(row => row.id === 'schema'), 'compensation deleted non-restore rows')
    await L.closeLedgerDb(restoreDb.db)
    await new Promise((resolve) => { const req = indexedDB.deleteDatabase('pinax-ledger-restore-smoke'); req.onsuccess = req.onerror = req.onblocked = () => resolve() })

    await L.closeLedgerDb(db)
    return {
      v1Revisions: health1.v1RevisionCount,
      factsBookA: qTotal.items.length,
      receipts: receipts.length,
      domainRows: inspected.total,
      dualTimeExample: true
    }
  })
  console.log('data-layer', JSON.stringify(result))

  // ---- UI journey: review → adopt → correct → decisions, then responsive. ----
  await page.evaluate(async () => {
    const c = await import('/src/services/memory/memoryCandidates.js')
    const L = await import('/src/services/memory/ledger/ledgerDb.js')
    const F = await import('/src/services/memory/ledger/factLedger.js')
    c.queueMemoryCandidate({ id: 'ledger-ui-anchor', content: '界面验证锚点记忆。', scope: 'project', scopeId: 'book-ledger', sourceRefs: ['chapter:ui:1'], sourceRevision: 'u1' })
    const opened = await L.openLedgerDb()
    const ev = await F.appendEvidence(opened.db, { scope: { domain: 'book', bookId: 'book-ledger' }, sourceKind: 'chapter-quote', sourceId: 'chapter:ui:2', sourceRevision: 'u2', quote: '原句：城主下令点亮灯塔。' })
    const prop = await F.createProposal(opened.db, { scope: { domain: 'book', bookId: 'book-ledger' }, subjectKey: '灯塔', subjectLabel: '灯塔', predicate: '状态', object: '城主下令点亮', evidenceIds: [ev.evidence.id], origin: 'ai' })
    await L.closeLedgerDb(opened.db)
    if (!prop.ok) throw new Error('UI seed proposal failed')
  })
  await page.reload()
  await page.waitForSelector('.authoring-welcome')
  await page.getByRole('button', { name: '备份与恢复 为作品留一份副本', exact: true }).click()
  await page.getByRole('tab', { name: '记忆与历史' }).click()
  const workspace = page.locator('.memory-workspace')
  await workspace.getByLabel('归属').selectOption({ value: JSON.stringify(['project', 'book-ledger']) })
  const ledgerSection = workspace.getByRole('region', { name: '事实账本' })
  await ledgerSection.getByText('数据库正常').waitFor()
  await ledgerSection.locator('p strong', { hasText: '灯塔' }).first().waitFor()
  // The earlier negative fixture intentionally has no evidence and is disabled.
  const lighthouseProposal = ledgerSection.locator('article').filter({ has: page.locator('p strong', { hasText: '灯塔' }) })
  await lighthouseProposal.getByRole('button', { name: '接受为事实', exact: true }).click()
  await page.getByText('已接受为正式事实').waitFor()
  await workspace.getByLabel('视图').selectOption('facts')
  await ledgerSection.getByText('城主下令点亮').first().waitFor()
  await ledgerSection.getByRole('button', { name: '更正', exact: true }).first().click()
  await ledgerSection.locator('textarea').last().fill('灯塔在第七夜点亮')
  await ledgerSection.getByRole('button', { name: '提交更正' }).click()
  await page.getByText('已更正；旧版本保留').waitFor()
  await workspace.getByLabel('视图').selectOption('decisions')
  await ledgerSection.getByText('接受为事实').first().waitFor()
  await ledgerSection.getByText('更正', { exact: true }).first().waitFor()
  await page.screenshot({ path: '/tmp/pinax-memory-ledger-desktop.png' })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '/tmp/pinax-memory-ledger-mobile.png' })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(' | ')}`)

  console.log(JSON.stringify({
    ok: true, ...result, ui: true, responsive: true, consoleClean: true
  }))
} finally { await browser.close() }
