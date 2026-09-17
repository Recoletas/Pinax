// Unified ABC acceptance: actual reader host, real IndexedDB/ZIP compensation,
// and the real turn coordinator with a deterministic network-mocked provider.
// Isolated browser contexts only; never touches the author's profile or port.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { installDeterministicProviderMock } from './authoring-ui/provider-mock.mjs'

const BASE = process.env.PINAX_ABC_SMOKE_URL || 'http://127.0.0.1:5307'
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext()
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin !== new URL(BASE).origin || (url.pathname.startsWith('/api/') && route.request().method() !== 'GET')) return route.abort()
    return route.continue()
  })
  const page = await context.newPage()
  await page.goto(BASE)
  await page.waitForSelector('.authoring-welcome')
  const seeded = await page.evaluate(async () => {
    const L = await import('/src/services/memory/ledger/ledgerDb.js')
    const F = await import('/src/services/memory/ledger/factLedger.js')
    const B = await import('/src/services/storage/workspaceBackupBundle.js')
    const H = await import('/src/services/agents/authoring/authoringKnowledgeReaderHost.js')
    const M = await import('/src/services/media/mediaAssetStore.js')
    const S = await import('/src/services/worldbook/worldbookSourceArchive.js')
    const { db } = await L.openLedgerDb()
    const check = (ok, label) => { if (!ok) throw new Error(label) }
    for (const [bookId, object, adopted] of [['abc-A', 'A_PUBLIC_SENTINEL', true], ['abc-B', 'B_SECRET_SENTINEL', true], ['abc-A', 'PENDING_SECRET_SENTINEL', false]]) {
      const scope = { domain: 'book', bookId }
      const ev = await F.appendEvidence(db, { scope, sourceKind: 'chapter-quote', sourceId: object, sourceRevision: 'r1', quote: object })
      const proposal = await F.createProposal(db, { scope, subjectKey: object, predicate: '状态', object, evidenceIds: [ev.evidence.id], origin: 'ai' })
      if (adopted) check((await F.adoptProposal(db, { scope, proposalId: proposal.proposal.id, commandId: object })).ok, 'seed adoption')
    }
    const host = H.createAuthoringKnowledgeReaderHost({
      readLiveDocument: () => ({ projectId: 'abc-A', chapterId: 'chapter-A', text: '', revision: 'r1' }),
      findChapter: () => ({}), sessionId: () => ''
    })
    const result = await host.getFacade().resolve(['memory'])
    const contents = result.blocks.filter(block => block.included).map(block => block.text).join('\n')
    check(contents.includes('A_PUBLIC_SENTINEL'), `actual authoring host did not read accepted facts: ${JSON.stringify(result)}`)
    check(!contents.includes('B_SECRET_SENTINEL') && !contents.includes('PENDING_SECRET_SENTINEL'), 'scope/pending leaked into production reader')
    const other = await host.getFacade().resolve(['memory'], { intent: { invocationTarget: { projectId: 'abc-B', chapterId: 'chapter-B' } } })
    check(other.blocks.some(block => block.text.includes('B_SECRET_SENTINEL')) && !other.blocks.some(block => block.text.includes('A_PUBLIC_SENTINEL')), 'frozen request target ignored')
    await L.closeLedgerDb(db)
    await M.putMediaBinaryById('abc-image', new Blob(['BACKUP_IMAGE']))
    localStorage.setItem('media_assets_v1', JSON.stringify([{ id: 'abc-image', schemaVersion: 1, mimeType: 'image/png', storageRef: 'pinax-media://abc-image' }]))
    await S.restoreSourceArchiveRecords({ artifacts: [], chunks: [], workspaces: [{ id: 'abc-source', schemaVersion: 1, title: 'BACKUP_SOURCE' }] })
    const bundle = await B.buildWorkspaceBackupBundle()
    const inspection = await B.inspectWorkspaceBackup(bundle.bytes)
    check(inspection.valid && inspection.factLedgerCount > 0, 'ledger absent from inspected ZIP')
    const saved = globalThis.indexedDB
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined })
    let rejected = false
    try { await B.buildWorkspaceBackupBundle() } catch { rejected = true }
    finally { Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: saved }) }
    check(rejected, 'unavailable ledger exported as complete backup')
    return { bytes: [...bundle.bytes], readerChecks: 4, backupRows: inspection.factLedgerCount }
  })
  console.log('production-reader', JSON.stringify({ readerChecks: seeded.readerChecks, backupRows: seeded.backupRows }))

  const fresh = await browser.newContext()
  const restorePage = await fresh.newPage()
  await restorePage.goto(BASE)
  await restorePage.waitForSelector('.authoring-welcome')
  const restored = await restorePage.evaluate(async bytes => {
    const B = await import('/src/services/storage/workspaceBackupBundle.js')
    const L = await import('/src/services/memory/ledger/ledgerDb.js')
    const F = await import('/src/services/memory/ledger/factLedger.js')
    const Q = await import('/src/services/memory/ledger/queryFacts.js')
    const V = await import('/src/services/memory/ledger/ledgerBackup.js')
    const M = await import('/src/services/media/mediaAssetStore.js')
    const S = await import('/src/services/worldbook/worldbookSourceArchive.js')
    const check = (ok, label) => { if (!ok) throw new Error(label) }
    const zip = new Uint8Array(bytes)
    const first = await B.restoreWorkspaceBackupBundle(zip, { acceptRestoreRisk: true })
    check(first.success && first.domains.factLedger.written > 0, 'fresh ZIP restore failed')
    const again = await B.restoreWorkspaceBackupBundle(zip, { acceptRestoreRisk: true })
    check(again.success && again.domains.factLedger.written === 0, 'ZIP restore not idempotent')
    const { db } = await L.openLedgerDb()
    const scope = { domain: 'book', bookId: 'abc-A' }
    const facts = await Q.queryFacts(db, { scope })
    check(facts.ok && facts.items.length === 1 && facts.items[0].object === 'A_PUBLIC_SENTINEL', 'restored projection differs')
    const domain = await V.collectLedgerDomain(db)
    const bad = structuredClone(domain)
    bad.tables.factVersions[0].evidenceIds = ['missing-evidence']
    check(!(await V.importLedgerDomain(db, bad)).ok, 'dangling evidence accepted')
    const head = await F.getFactHead(db, { scope, factKey: facts.items[0].factKey })
    check((await F.correctFact(db, { scope, factKey: head.factKey, expectedHead: head.id, commandId: 'abc-correct', object: 'CURRENT_FACT' })).ok, 'correction failed')
    await M.putMediaBinaryById('abc-image', new Blob(['CURRENT_IMAGE']))
    await S.restoreSourceArchiveRecords({ artifacts: [], chunks: [], workspaces: [{ id: 'abc-source', schemaVersion: 1, title: 'CURRENT_SOURCE' }] })
    const before = JSON.stringify(await S.loadAllSourceArchiveRecords())
    const refused = await B.restoreWorkspaceBackupBundle(zip, { acceptRestoreRisk: true })
    check(!refused.success && refused.reason === 'fact-ledger-restore-failed', 'conflicting ledger restore not refused')
    check(await (await M.getMediaBinaryById('abc-image')).text() === 'CURRENT_IMAGE', 'ledger failure did not actually compensate media')
    check(JSON.stringify(await S.loadAllSourceArchiveRecords()) === before, 'ledger failure did not actually compensate sources')
    check((await Q.queryFacts(db, { scope })).items[0].object === 'CURRENT_FACT', 'restore overwrote author correction')
    await L.closeLedgerDb(db)
    return { freshRestore: true, idempotent: true, danglingEvidenceRejected: true, realMediaAndSourceRollback: true }
  }, seeded.bytes)
  console.log('zip-restore', JSON.stringify(restored))
  await fresh.close()

  // The actual Experience coordinator, not a synthetic call to commit helpers.
  const rpg = await browser.newContext()
  await rpg.route('**/*', route => {
    if (new URL(route.request().url()).origin !== new URL(BASE).origin) return route.abort()
    if (route.request().url().includes('/api/') && route.request().method() !== 'GET') return route.abort()
    return route.continue()
  })
  const rpgPage = await rpg.newPage()
  const provider = await installDeterministicProviderMock(rpgPage, { passiveInline: false, primaryRequestPrefixes: ['authoring:', 'narrative_'] })
  await rpgPage.goto(`${BASE}/experience`)
  await rpgPage.waitForSelector('.input-area')
  const turn = await rpgPage.evaluate(async () => {
    const W = await import('/src/services/experience/roleplay/roleplayWorkflow.js')
    const A = await import('/src/services/experience/roleplay/roleplayHistoryAdapter.js')
    const C = await import('/src/services/experience/roleplay/roleplayCompanion.js')
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    const store = pinia._s.get('game')
    const world = pinia._s.get('world')
    await world.ensureActiveWorldbook()
    store.createSession({ worldbookId: world.activeWorldbookId, inheritRuntimeState: false })
    W.setRoleplaySessionSetup(store, { mode: 'rules' })
    const check = (ok, label) => { if (!ok) throw new Error(`${label}: ${store.lastError || ''}`) }
    let archived = 0
    A.installRoleplayHistoryPort(A.createRoleplayHistoryPort({ read: async () => ({ ok: true, records: [] }), record: async () => { archived++; return { ok: true } } }))
    const realCommit = store.commitCurrentSessionNow
    let commitReached = false
    store.commitCurrentSessionNow = () => {
      if (!commitReached && store.roleplaySession.receipts.length > 0) { commitReached = true; throw Object.assign(new Error('injected-durable-failure'), { code: 'TEST_DURABLE_FAILURE' }) }
      return realCommit()
    }
    await W.confirmRoleplayAction(store, { rawInput: '检查灯塔的门锁', attribute: 'agility', nextUint32: () => 5 })
    check(commitReached, 'test did not reach the final durable commit')
    check(archived === 0, 'uncommitted turn reached archive')
    const pending = store.roleplaySession.pendingByBranch.main
    check(pending?.status === 'resolved' && store.roleplaySession.receipts.length === 0 && store.roleplaySession.archiveOutbox.length === 0, 'failed commit poisoned pending or audit state')
    const dice = JSON.stringify(pending.resolution)
    store.commitCurrentSessionNow = realCommit
    await W.resumeRoleplayPending(store, { actionId: pending.actionId })
    check(!store.roleplaySession.pendingByBranch.main && store.roleplaySession.receipts.length === 1, 'same-dice retry did not commit')
    check(archived === 1, 'durable retry did not archive exactly once')
    const receipt = store.roleplaySession.receipts[0]
    const original = JSON.stringify(receipt)
    W.commitRoleplayRenarration(store, { binding: { actionId: receipt.receiptId, checkRow: { sessionId: store.currentSessionId } }, turnRecord: { id: 'alternate-narration' } })
    check(JSON.stringify(receipt) === original, 'renarration mutated archived identity')
    check(JSON.stringify(pending.resolution) === dice, 'retry changed dice')
    store.roleplaySession.actor = { marker: 'branch-A' }
    const snapshot = store.getRuntimeSnapshot({ forSession: false })
    store.roleplaySession.actor = { marker: 'branch-B' }
    const audit = store.roleplaySession.receipts
    store.applyRuntimeSnapshot(snapshot)
    check(store.roleplaySession.actor.marker === 'branch-A' && store.roleplaySession.receipts === audit, 'branch gameplay/audit separation failed')
    let hiddenRead = false
    const knowledge = await C.buildCompanionKnowledgeContext({ projection: { public: 'visible' }, queryFactsFn: async () => { hiddenRead = true; return { ok: true, items: [{ object: 'HIDDEN' }] } }, db: {} })
    check(!hiddenRead && knowledge.facts.length === 0, 'author truth passed as character knowledge')
    return { durableFailureRollback: true, sameDiceRetry: true, archiveAfterCommit: true, immutableReceipt: true, branchProjection: true, failClosedKnowledge: true }
  })
  assert.ok(provider.summary().narrativeCount > 0, 'real coordinator did not use mocked provider')
  console.log('coordinator', JSON.stringify(turn), 'provider', JSON.stringify(provider.summary()))
  console.log('abc-integration-smoke: PASS')
} finally {
  await browser.close()
}
