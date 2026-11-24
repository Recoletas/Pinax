// Run from the Web repository with Playwright Chromium installed.
// PINAX_WORLD_MODEL_EVAL_URL can point at an already running local Vite server.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { checkCompanionKnowledge } from './fixtures/ledger/companion-knowledge-probe.mjs'
import { checkWorldModelBackup } from './fixtures/ledger/world-model-backup-probe.mjs'

let vite, browser, cacheDir
try {
  let origin = process.env.PINAX_WORLD_MODEL_EVAL_URL
  if (!origin) {
    cacheDir = await mkdtemp(join(tmpdir(), 'pinax-world-integration-'))
    vite = await createServer({
      cacheDir, server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error',
      optimizeDeps: { noDiscovery: true, include: ['dexie', 'vue', 'marked', 'jszip'] }
    })
    await vite.listen()
    origin = 'http://127.0.0.1:' + vite.httpServer.address().port
  }
  browser = await chromium.launch()
  const page = await browser.newPage()
  const url = new URL('/__world_model_probe', origin).href
  await page.route(url, route => route.fulfill({ contentType: 'text/html', body: '<title>World model integration</title>' }))
  await page.goto(url)
  const report = await page.evaluate(async () => {
    const ledger = await import('/src/services/memory/ledger/factLedger.js')
    const database = await import('/src/services/memory/ledger/ledgerDb.js')
    const contract = await import('/src/services/memory/ledger/ledgerContract.js')
    const world = await import('/src/services/memory/ledger/worldModelWorkspace.js')
    const { saveWritingBooks, loadWritingBooksSnapshot } = await import('/src/services/writing/writingBooksRepository.js')
    const { createWritingDocument } = await import('/src/services/writing/writingDocumentSchema.js')
    const { worldbookEntityKey } = await import('/src/services/project/knowledgeReadModel/identity.js')
    const check = (condition, message) => { if (!condition) throw new Error(message) }
    const equal = (actual, expected, message) => check(JSON.stringify(actual) === JSON.stringify(expected),
      message + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')')
    const ok = async pending => {
      const result = await pending
      if (!result?.ok) throw new Error('Ledger refused: ' + JSON.stringify(result))
      return result
    }
    const scope = { domain: 'book', bookId: 'novel' }
    const scopeKey = contract.encodeScopeKey(contract.normalizeScopeRef(scope).scope)
    const name = 'world-integration-' + crypto.randomUUID()

    // Seed actual v5 IndexedDB before any v6 connection. The old event has
    // only its factVersionId. The new reader and character must both find it.
    const skeleton = database.createLedgerDb(name).db
    const old = new skeleton.constructor(name)
    skeleton.close()
    old.version(5).stores({ ...database.LEDGER_V4_TABLES, revisions: 'id, candidateId, ' + database.HISTORY_ACTIVITY_INDEX })
    await old.transaction('rw', ['factVersions', 'ledgerMeta', 'knowledgeEvents'], async () => {
      await old.factVersions.add({ id: 'v5-setting', schemaVersion: 2, factKey: 'fact:界碑:颜色', scope, scopeKey,
        subjectKey: '界碑', subjectLabel: '界碑', predicate: '颜色', object: '朱红', evidenceIds: [],
        recordedSeq: 1, recordedAt: 1, authority: 'author-confirmed', origin: 'author', supersedes: null })
      await old.knowledgeEvents.add({ id: 'v5-reading', scope, scopeKey, actorKey: '老守卫', factVersionId: 'v5-setting',
        kind: 'known', channel: 'witnessed', storyAt: 0, recordedSeq: 2, recordedAt: 2 })
      await old.ledgerMeta.add({ id: 'seq:' + scopeKey, seq: 2 })
    })
    old.close()
    const { db } = await ok(database.openLedgerDbNamed(name))
    try {
      const legacy = (await ok(world.listWorldStatements(db, { scope }))).items.find(row => row.factVersionId === 'v5-setting')
      check(legacy && legacy.object === '朱红', 'v5 fact missing after physical upgrade')
      const guard = await ok(world.readWorldPerspective(db, { scope, actorKey: '老守卫', storyAt: 0, recordedSeq: 2 }))
      equal(guard.items.map(row => row.id), [legacy.id], 'old knowledge must resolve the same claim')

      const subjectKey = worldbookEntityKey('W', 'Lin')
      const bookPlace = worldbookEntityKey('W', 'east')
      const otherPlace = worldbookEntityKey('W', 'west')
      const shared = { scope, subjectKey, subjectLabel: '林昭' }
      const save = fields => ok(world.saveWorldStatement(db, { ...shared, authority: 'fact', ...fields }))
      const facts = async (storyAt, recordedSeq = null) => (await ok(world.readWorldFacts(db, { scope, storyAt, recordedSeq }))).items
      const objects = (rows, predicate) => rows.filter(row => row.predicate === predicate).map(row => row.object).sort()

      for (const object of ['白露', '青禾']) {
        const evidence = await ok(ledger.appendEvidence(db, { scope, sourceKind: 'chapter-quote', sourceId: 'p-' + object,
          sourceRevision: 'draft1', quote: '林昭与' + object + '盟誓。' }))
        const proposal = await ok(ledger.createProposal(db, { ...shared, predicate: '盟友', object,
          origin: 'ai', evidenceIds: [evidence.evidence.id] }))
        await ok(ledger.adoptProposal(db, { scope, commandId: 'adopt-' + object, proposalId: proposal.proposal.id }))
      }
      equal(objects(await facts(null), '盟友'), ['白露', '青禾'], 'second ordinary adoption replaced the first ally')

      const event = (commandId, storyAt, objectRef, authority = 'fact') => save({ commandId, kind: 'event', authority,
        predicate: '到访', object: '南楼', objectRef, storyAt })
      const visit1 = await event('visit-1', 0, bookPlace)
      const visit2 = await event('visit-2', 3, bookPlace)
      await event('other-same-name', 2, otherPlace)
      const rumor = await event('unconfirmed-visit', 1, bookPlace, 'rumor')
      check(!rumor.result.factVersionId && visit1.result.claimId !== visit2.result.claimId, 'rumor or occurrence identity')
      const places = await ok(world.listWorldPlaceEvents(db, { scope, placeRef: bookPlace }))
      equal(places.items.map(row => row.id), [visit1.result.claimId, visit2.result.claimId], 'map included another location or a rumor')
      equal((await facts(0)).filter(row => row.kind === 'event').map(row => row.claimId), [visit1.result.claimId], 'ordinal zero')
      equal((await facts(3, visit1.decision.recordedSeq)).filter(row => row.kind === 'event'), [], 'record cutoff leaked a later visit')

      const role = { scope, actorKey: '旅人', storyAt: 1 }
      await ok(world.saveWorldKnowledge(db, { ...role, commandId: 'traveler-hears', claimId: rumor.result.claimId, channel: 'heard' }))
      equal((await ok(world.readWorldPerspective(db, role))).items.map(row => row.id), [rumor.result.claimId], 'actor heard a versionless rumor')
      equal((await ok(world.readWorldPerspective(db, { ...role, storyAt: 0 }))).items, [], 'actor heard the rumor too early')

      // New awareness of a verified fact does not transfer the author's certainty.
      const official = { ...role, claimId: visit1.result.claimId, factVersionId: visit1.result.factVersionId }
      const observe = (commandId, fields) => world.saveWorldKnowledge(db, { ...official, commandId, ...fields })
      const firstReport = await ok(observe('courier-first', { channel: 'heard', storyAt: 3 }))
      const believed = await ok(observe('courier-belief', { kind: 'belief', belief: 'disputed', storyAt: 3 }))
      const secondReport = await ok(observe('courier-second', { channel: 'witnessed', storyAt: 5 }))
      const knowledgeAt = async (storyAt, recordedSeq) => (await ok(world.readWorldPerspective(db, { ...role, storyAt, recordedSeq })))
        .items.find(row => row.id === official.claimId)
      equal((await knowledgeAt(3, firstReport.decision.recordedSeq)).belief, null, 'formal truth conferred belief on the character')
      equal((await knowledgeAt(5)).history.map(row => row.kind), ['known', 'belief', 'known'], 'second observation was discarded')
      equal((await knowledgeAt(5)).channel, 'witnessed', 'latest observation lost its channel')
      const acquisitionChange = { supersedesEventId: firstReport.result.knowledgeEventId, channel: 'inferred', storyAt: 3 }
      const amended = await ok(observe('courier-correct', acquisitionChange))
      equal((await knowledgeAt(3)).belief, 'disputed', 'same-day acquisitionChange moved acquisition after belief')
      equal((await knowledgeAt(3, believed.decision.recordedSeq)).channel, 'heard', 'acquisitionChange rewrote earlier record axis')
      equal((await knowledgeAt(3)).channel, 'inferred', 'corrected channel missing')
      check((await ok(observe('courier-correct', acquisitionChange))).replay, 'acquisitionChange retry duplicated event')
      equal((await observe('courier-stale', acquisitionChange)).reason, 'knowledge-event-changed', 'stale edit overwrote new acquisitionChange')
      equal((await observe('courier-too-late', { ...acquisitionChange, supersedesEventId: amended.result.knowledgeEventId, storyAt: 4 })).reason,
        'knowledge-dependent-attitude', 'moving discovery after recorded belief should fail')
      equal((await observe('courier-cross', { ...acquisitionChange, actorKey: '陌生人', supersedesEventId: secondReport.result.knowledgeEventId })).reason,
        'knowledge-event-changed', 'acquisitionChange crossed actor identities')
      await ok(observe('courier-forgot', { kind: 'belief', belief: 'forgotten', storyAt: 6 }))
      equal((await observe('courier-cannot-recall', { kind: 'belief', belief: 'confirmed', storyAt: 7 })).reason,
        'knowledge-not-yet-acquired', 'belief resurrected a forgotten report without reacquisition')
      await ok(observe('courier-relearn', { channel: 'heard', storyAt: 7 }))
      equal((await knowledgeAt(7)).belief, null, 'reacquisition retained forgotten certainty')

      const delivery = await save({ commandId: 'deliver-seal', kind: 'event', predicate: '交印', object: '官印',
        storyAt: 4, eventContext: { placeRefs: [bookPlace], participants: [{ role: '收件人', entityRef: '青禾' }] } })
      await ok(world.saveWorldKnowledge(db, { ...role, commandId: 'hear-delivery', claimId: delivery.result.claimId, storyAt: 4, channel: 'heard' }))
      const moved = await ok(ledger.correctFact(db, { scope, commandId: 'move-seal', factKey: delivery.result.factKey,
        expectedHead: delivery.result.factVersionId, object: '官印', eventContext: { placeRefs: [otherPlace], participants: [{ role: '交付人', entityRef: '青禾' }] } }))
      check(moved.result.factKey === delivery.result.factKey && moved.result.claimId !== delivery.result.claimId, 'correcting event details lost occurrence identity')
      equal((await facts(4, delivery.decision.recordedSeq)).find(row => row.predicate === '交印').eventContext.placeRefs, [bookPlace], 'old author cut lost prior site')
      const amendedDelivery = (await facts(4)).find(row => row.predicate === '交印')
      equal(amendedDelivery.eventContext.placeRefs, [otherPlace], 'new author cut failed to move event')
      equal(amendedDelivery.eventContext.participants[0].role, '交付人', 'corrected role not reflected in event')
      const received = (await ok(world.readWorldPerspective(db, { ...role, storyAt: 4 }))).items.find(row => row.predicate === '交印')
      equal(received.eventContext, { placeRefs: [bookPlace], participants: [{ role: '收件人', entityRef: '青禾' }] }, 'author correction silently updated a past rumor')
      const post = { kind: 'state', predicate: '驻地' }
      const oldPost = await save({ ...post, commandId: 'post-1', object: '北岸', storyAt: 1 })
      await save({ ...post, commandId: 'post-7', object: '南岸', storyAt: 7 })
      equal(objects(await facts(null), '驻地'), ['南岸'], 'latest-state view included a closed historical state')
      equal(objects(await facts(5), '驻地'), ['北岸'], 'dated view lost the earlier state')
      equal(objects(await facts(null, oldPost.decision.recordedSeq), '驻地'), ['北岸'], 'old manuscript cutoff lost its then-current state')

      const currentPost = (await ok(world.listWorldStatements(db, { scope }))).items.find(row => row.predicate === '驻地' && row.authority === 'fact')
      const dateEdit = { ...shared, commandId: 'post-delayed', factKey: currentPost.factKey, expectedHead: currentPost.factVersionId,
        kind: 'state', object: '南岸', storyAt: 9 }
      const delayedPost = await ok(world.correctWorldDate(db, dateEdit))
      equal(objects(await facts(8), '驻地'), ['北岸'], 'delaying a move left a gap before arrival')
      equal(objects(await facts(9), '驻地'), ['南岸'], 'updated move did not take effect at its boundary')
      equal(objects(await facts(8, delayedPost.decision.recordedSeq - 1), '驻地'), ['南岸'], 'a historical cut saw half the date correction')
      check((await ok(world.correctWorldDate(db, dateEdit))).replay, 'date correction was not idempotent')
      const tooEarly = await world.correctWorldDate(db, { ...dateEdit, commandId: 'too-early', storyAt: 1, expectedHead: delayedPost.result.factVersionId })
      equal(tooEarly.reason, 'story-interval-conflict', 'moving before a recorded earlier state erased its start')
      const sooner = await ok(world.correctWorldDate(db, { ...dateEdit, commandId: 'post-earlier', storyAt: 5, expectedHead: delayedPost.result.factVersionId }))
      equal(objects(await facts(5), '驻地'), ['南岸'], 'advancing a move left overlapping states')
      equal(objects(await facts(5, sooner.decision.recordedSeq - 1), '驻地'), ['北岸'], 'historical prefix changed after advancing a move')

      const chapter = (id, content) => ({ id, title: id, content, editorDocument: createWritingDocument(content) })
      saveWritingBooks([{ id: scope.bookId, title: '南楼记', chapters: [
        chapter('first', '林昭进城。\n\n## 茶铺\n\n有人说林昭去过南楼。'), chapter('second', '守卫推开门。\n\n## 内城\n\n门是蓝色的。')
      ] }])
      const book = loadWritingBooksSnapshot()[0]
      const [first, second] = book.chapters
      const units = chapter => world.worldManuscriptUnits(chapter).map(unit => unit.unitId)
      const [entrance, gossip] = units(first)
      const [threshold, door] = units(second)
      check(entrance && gossip && threshold && door, 'expected two manuscript units in each chapter')
      const position = (chapterId, unitId, cursorBook = book) => ({ scope, book: cursorBook, chapterId, unitId })
      const link = (place, commandId, kind, result) => ok(world.saveWorldManuscriptLink(db,
        { ...place, commandId, kind, claimId: result.claimId, factVersionId: result.factVersionId }))
      const heard = await link(position(first.id, gossip), 'heard-in-paragraph', 'reported-speech', rumor.result)
      const state = await save({ commandId: 'door-color', subjectKey: 'door', subjectLabel: '城门', kind: 'state',
        predicate: '颜色', object: '蓝色', storyAt: 0 })
      await link(position(second.id, door), 'seen-in-paragraph', 'narrator-assertion', state.result)
      const read = (place, recordedSeq = null) => ok(world.readWorldReader(db, { ...place, recordedSeq }))
      equal((await read(position(first.id, entrance))).items, [], 'spoiler before first paragraph')
      equal((await read(position(second.id, threshold))).items.map(row => row.disclosureKind), ['reported-speech'], 'spoiler in later paragraph')
      equal((await read(position(second.id, door))).items.map(row => row.object), ['南楼', '蓝色'], 'reader omitted earlier chapter')
      equal((await read(position(second.id, door), heard.decision.recordedSeq)).items.map(row => row.object), ['南楼'], 'reader leaked future recorded disclosure')

      const passage = position(second.id, door)
      const assertion = await link(passage, 'chapter-asserts', 'assertion-use', state.result)
      await link(passage, 'chapter-believes', 'belief-use', state.result)
      await link(position(first.id, entrance), 'chapter-constrained', 'constraint-use', state.result)
      await link(position(first.id, entrance), 'other-assertion', 'assertion-use', visit1.result)
      const dbState = () => db.transaction('r', db.tables, () => Promise.all(db.tables.map(table => table.toArray())))
      const beforePreview = await dbState()
      const impact = await ok(world.previewWorldFactChange(db, { scope, book, factVersionId: state.result.factVersionId }))
      equal(impact.items.map(row => row.kind).sort(), ['assertion-use', 'constraint-use'], 'preview must identify only uses relying on this fact version')
      for (const [kind, chapterId, unitId, text] of [
        ['assertion-use', second.id, door, '门是蓝色的。'],
        ['constraint-use', first.id, entrance, '林昭进城。']
      ]) {
        const row = impact.items.find(item => item.kind === kind)
        check(row.chapterId === chapterId && row.unitId === unitId && row.quote.includes(text), 'preview lost the passage for ' + kind)
      }
      equal(await dbState(), beforePreview, 'preview mutated ledger rows or consumed a record sequence')
      const correction = await ok(ledger.correctFact(db, { scope, commandId: 'door-corrected', factKey: state.result.factKey,
        object: '赤色', expectedHead: state.result.factVersionId }))
      const uses = async recordedSeq => (await ok(world.listWorldUses(db, { ...passage, recordedSeq }))).items
      const review = rows => rows.filter(row => row.needsReview).map(row => row.kind)
      equal(review(await uses(null)), ['assertion-use'], 'correction should affect assertion only')
      equal(review(await uses(correction.decision.recordedSeq - 1)), [], 'historical uses should remain valid')
      await ok(world.reviewWorldUse(db, { ...passage, commandId: 'review-door', kind: 'assertion-use',
        useId: assertion.result.linkId, claimId: correction.result.claimId, factVersionId: correction.result.factVersionId }))
      const reviewed = await uses(null)
      equal(review(reviewed), [], 'explicit review did not resolve the outdated assertion')
      equal(objects(reviewed, '颜色'), ['蓝色', '赤色'], 'belief must retain its original proposition')

      const editions = await ok(world.listWorldEditions(db, { scope }))
      equal(editions.items.length, 1, 'same manuscript stored multiple editions for independent registrations')
      equal(await db.manuscriptChapterRevisions.count(), 2, 'identical chapter content must share its revision')
      const originalEdition = editions.items[0]
      equal(await world.readWorldEdition(db, { scope: { domain: 'book', bookId: 'other' }, editionId: originalEdition.id }), null,
        'manuscript edition leaked across novels')
      saveWritingBooks([{ ...book, chapters: [first] }])
      const untouched = await read(position(first.id, entrance))
      equal([untouched.status, untouched.items], ['ok', []], 'deleting a future chapter signalled unrevealed information to the reader')
      equal((await read(position(first.id, gossip))).items.map(row => row.object), ['南楼'], 'future deletion hid an earlier valid disclosure')
      const archived = await ok(world.readWorldReader(db, { ...passage, editionId: originalEdition.id, recordedSeq: originalEdition.recordedSeq }))
      equal(archived.items.map(row => row.object), ['南楼', '蓝色'], 'old edition lost a deleted chapter or disclosure')
      const secondEdition = await link(position(first.id, entrance, loadWritingBooksSnapshot()[0]), 'bind-short-draft', 'belief-use', rumor.result)
      check(secondEdition.result.manuscriptEditionId !== originalEdition.id, 'changed chapter sequence reused previous edition')
      equal(await db.manuscriptChapterRevisions.count(), 2, 'removing a chapter duplicated the unchanged chapter revision')
      const { validateLedgerDomain, collectLedgerDomain } = await import('/src/services/memory/ledger/ledgerBackup.js')
      const domain = await collectLedgerDomain(db)
      for (const damage of [tables => { tables.manuscriptEditions[0].chapters[0].title += '伪' },
        tables => { tables.disclosures[0].manuscriptEditionId = 'missing' },
        tables => { tables.manuscriptChapterRevisions[0].units[0].unitHash = '0'.repeat(64) }]) {
        const copy = structuredClone(domain)
        damage(copy.tables)
        let rejected = false
        try { validateLedgerDomain(copy, { counts: copy.counts }) } catch { rejected = true }
        check(rejected, 'damaged manuscript edition accepted during restore')
      }

      // Writing the next chapter must leave already-read passages usable.
      saveWritingBooks([{ ...book, chapters: [...book.chapters, chapter('third', '次日清晨。')] }])
      equal((await read(passage)).items.map(row => row.object), ['南楼', '蓝色'], 'appending a chapter lost earlier disclosures')
      equal(review(await uses(null)), [], 'appending a chapter marked earlier uses stale')
      equal((await ok(world.listWorldAnchorIssues(db, { scope, book }))).items, [], 'appending a chapter invalidated stored anchors')

      const extended = chapter(second.id, second.content + '\n\n## 夜路\n\n林昭回家。')
      saveWritingBooks([{ ...book, chapters: [first, extended] }])
      equal((await read(passage)).items.map(row => row.object), ['南楼', '蓝色'], 'adding a later unit changed the earlier reader view')
      const { buildManuscriptPositionIndex } = await import('/src/services/writing/manuscriptPositionIndex.js')
      const oldOrder = buildManuscriptPositionIndex(book).chapterOrderRevision
      const oldDisclosure = await db.disclosures.get(heard.result.linkId)
      await db.disclosures.update(oldDisclosure.id, { manuscriptEditionId: null, manuscriptAnchor: { ...oldDisclosure.manuscriptAnchor, orderRevision: oldOrder } })
      equal((await read(position(second.id, door, loadWritingBooksSnapshot()[0]))).status, 'unknown', 'legacy anchor silently accepted a different manuscript')
      saveWritingBooks([book])
      equal((await read(passage)).items.map(row => row.object), ['南楼', '蓝色'], 'unchanged legacy anchor should still resolve')

      const reordered = { ...book, chapters: [second, first] }
      saveWritingBooks([reordered])
      for (const place of [passage, position(second.id, door, loadWritingBooksSnapshot()[0])]) {
        const response = await read(place)
        equal([response.status, response.items], ['unknown', []], 'stale manuscript order must not expose old disclosures')
      }
      const { queryFacts } = await import('/src/services/memory/ledger/queryFacts.js')
      for (const recordedAsOf of [{}, { seq: 'tomorrow' }, { seq: null }, { seq: false }, { seq: 1, recordedAt: 0 }]) {
        equal((await queryFacts(db, { scope, recordedAsOf })).reason, 'recorded-as-of-invalid', 'malformed historical cutoff exposed the latest view')
      }
      const timeline = { id: '帝历', eras: [{ id: '旧纪', order: 1 }, { id: '新纪', order: 2 }] }
      const date = (eraId, ordinal) => ({ timelineId: timeline.id, start: { eraId, ordinal }, endSemantic: 'open' })
      const reign = (object, eraId, ordinal) => ledger.createProposal(db, { ...shared, subjectKey: '王都', kind: 'state',
        predicate: '城主', object, storyInterval: date(eraId, ordinal), timeline })
      const firstRuler = await ok(reign('先王', '旧纪', 2_000_000_000))
      const firstReign = await ok(ledger.adoptProposal(db, { scope, commandId: 'old-reign', manualAssertion: true, proposalId: firstRuler.proposal.id }))
      const secondRuler = await ok(reign('新王', '新纪', -2_000_000_000))
      const successor = secondRuler.proposal.temporalPlanV1?.closes.find(row => row.id === firstReign.result.factVersionId)
      equal(successor?.proposedEnd.at, { eraId: '新纪', ordinal: -2_000_000_000 }, 'later era sorted before its predecessor')
      await ok(ledger.adoptProposal(db, { scope, commandId: 'new-reign', manualAssertion: true, proposalId: secondRuler.proposal.id }))
      const rulerAt = async (eraId, ordinal) => (await ok(queryFacts(db, { scope, subjectKeys: ['王都'], timeline,
        storyAt: { timelineId: timeline.id, eraId, ordinal, precision: 'moment' } }))).items.map(row => row.object)
      equal(await rulerAt('旧纪', 2_000_000_001), ['先王'], 'earlier reign disappeared')
      equal(await rulerAt('新纪', -2_000_000_000), ['新王'], 'late era boundary leaked prior ruler')
      const invalidEra = await reign('错位', '未知纪元', 2)
      equal(invalidEra.reason, 'timeline-era-invalid', 'undeclared era silently entered a declared clock')
      const datedPage = await ok(queryFacts(db, { scope, timeline, limit: 1 }))
      check(datedPage.nextCursor, 'calendar replay fixture requires two pages')
      const reorderedCalendar = { ...timeline, eras: [{ id: '新纪', order: 1 }, { id: '旧纪', order: 2 }] }
      equal((await queryFacts(db, { scope, timeline: reorderedCalendar, cursor: datedPage.nextCursor })).reason, 'cursor-filter-conflict', 'cursor continued after the era order changed')
      const peer = (await ok(database.openLedgerDbNamed(name))).db
      try {
        const excerpt = { scope, sourceKind: 'chapter-quote', sourceId: 'window-race', sourceRevision: '1', quote: '夜里确曾有人来过。' }
        const copies = await Promise.all([db, peer].map(connection => ok(ledger.appendEvidence(connection, excerpt))))
        equal(copies[0].evidence.id, copies[1].evidence.id, 'concurrent evidence split the same source')
        equal(copies.map(row => row.replay).sort(), [false, true], 'both editors believed they created the same excerpt')
        const confirmation = { scope, claimId: rumor.result.claimId, storyAt: 1, commandId: 'confirm-visit' }
        const cross = await world.confirmWorldClaim(peer, { ...confirmation, scope: { domain: 'book', bookId: 'mirror' } })
        equal(cross.reason, 'claim-not-found', 'cross-book confirmation')
        const commands = [confirmation, { ...confirmation, commandId: 'other-editor-confirms' }]
        const attempts = await Promise.all([db, peer].map((connection, i) => world.confirmWorldClaim(connection, commands[i])))
        const win = attempts.findIndex(row => row.ok)
        check(win >= 0 && attempts[1 - win].reason === 'claim-already-adjudicated', 'two editors confirmed one rumor twice')
        const confirmed = attempts[win]
        equal(confirmed.result.claimId, confirmation.claimId, 'confirmation created another occurrence')
        const replay = await ok(world.confirmWorldClaim(peer, commands[win]))
        check(replay.replay && replay.result.factVersionId === confirmed.result.factVersionId, 'retry created a second fact')
        check(!(await facts(1, confirmed.decision.recordedSeq - 1)).some(row => row.claimId === confirmation.claimId), 'confirmation leaked into old record cut')
        check((await facts(1)).some(row => row.claimId === confirmation.claimId), 'confirmed visit missing on its story day')
        check((await ok(world.listWorldPlaceEvents(db, { scope, placeRef: bookPlace }))).items.some(row => row.id === confirmation.claimId), 'confirmed visit missing from map')
        const learned = (await ok(world.readWorldPerspective(db, role))).items.find(row => row.id === confirmation.claimId)
        equal([learned.channel, learned.belief], ['heard', null], 'author confirmation changed character belief')
        saveWritingBooks([book])
        const reader = (await read(passage)).items.find(row => row.id === heard.result.linkId)
        check(reader?.disclosureKind === 'reported-speech', 'confirmation changed earlier narrative disclosure')
      } finally { peer.close() }
      saveWritingBooks([book])
      const actorUse = { ...position(first.id, gossip), kind: 'belief-use', claimId: rumor.result.claimId }
      const action = (actorKey, storyAt) => ({ actorKey, storyAt })
      const primary = '驿使'
      const companion = '学徒'
      const observation = (actorKey, commandId, storyAt, extra = {}) => world.saveWorldKnowledge(db, {
        scope, actorKey, commandId, storyAt, claimId: rumor.result.claimId, channel: 'heard', ...extra
      })
      const heardByRider = await ok(observation(primary, 'dispatch-notice', 2))
      await ok(observation(companion, 'apprentice-notice', 0))
      const use = (actorKey, storyAt, commandId) => world.saveWorldManuscriptLink(db, { ...actorUse, beliefUse: action(actorKey, storyAt), commandId })
      equal((await use(primary, 1, 'premature-action')).reason, 'belief-use-unavailable', 'an actor acted on a future rumor')
      const used = await ok(use(primary, 3, 'rider-acts'))
      await ok(use(companion, 3, 'companion-acts'))
      const actionReviews = async recordedSeq => (await ok(world.listWorldUses(db, { ...actorUse, recordedSeq }))).items.filter(row => row.beliefUse)
      equal((await actionReviews(null)).map(row => row.beliefUse.actorKey).sort(), [primary, companion].sort(), 'linking the second actor replaced the first')
      await ok(observation(primary, 'dispatch-delay', 4, { supersedesEventId: heardByRider.result.knowledgeEventId }))
      equal((await actionReviews(used.decision.recordedSeq)).map(row => row.needsReview), [false], 'later correction changed an older manuscript decision')
      equal((await actionReviews(null)).filter(row => row.needsReview).map(row => row.beliefUse.actorKey), [primary], 'corrected knowledge should affect only one actor')
      const issues = await ok(world.listWorldBeliefUseIssues(db, { scope, book }))
      equal(issues.items.map(row => [row.id, row.knowledgeIssue, row.unitId]), [[used.result.linkId, 'unaware', gossip]], 'review omitted the specific affected paragraph')
      const removed = await ok(world.retireWorldBeliefUse(db, { scope, book, useId: used.result.linkId, commandId: 'retire-premature-action' }))
      equal((await actionReviews(null)).map(row => row.beliefUse.actorKey), [companion], 'retiring one basis removed the other actor')
      equal((await actionReviews(removed.decision.recordedSeq - 1)).length, 2, 'retiring a dependency rewrote the historical decision')
      const eras = [{ id: 'ebb', label: '退潮', order: 0 }, { id: 'flow', label: '涨潮', order: 1 }]
      const calendar = { id: 'tidal', label: '潮历', eras }
      const declared = await ok(world.defineWorldCalendar(db, { scope, calendar, commandId: 'write-tidal-calendar' }))
      const clock = eraId => ({ timelineId: calendar.id, eraId })
      const outpost = (name, eraId) => save({ kind: 'state', predicate: '镇守', object: name, storyAt: -2, storyClock: clock(eraId), commandId: 'tidal-' + name })
      await outpost('青台', 'ebb')
      await outpost('北哨', 'flow')
      const tidal = async (eraId, storyAt, recordedSeq = null) => objects((await ok(world.readWorldFacts(db, { scope, storyClock: clock(eraId), storyAt, recordedSeq }))).items, '镇守')
      equal(await tidal('ebb', -1), ['青台'], 'native earlier era lookup')
      equal(await tidal('flow', -2), ['北哨'], 'native later era lookup')
      equal(objects(await facts(-2), '镇守'), [], 'foreign era leaked into default clock')
      const rename = { ...calendar, label: '海潮历', eras: eras.map(row => ({ ...row, label: row.label + '纪' })) }
      const edit = fields => world.defineWorldCalendar(db, { scope, calendar: rename, expectedRevisionId: declared.decision.id, ...fields })
      equal((await edit({ calendar: { ...calendar, eras: [eras[1], eras[0]].map((era, order) => ({ ...era, order })) }, commandId: 'reverse-conflicting-eras' })).reason, 'calendar-fact-conflict', 'calendar change reversed an existing reign')
      const changed = await ok(edit({ commandId: 'rename-tidal' }))
      equal((await edit({ commandId: 'other-calendar-editor' })).reason, 'calendar-revision-changed', 'stale editor overwrote calendar')
      const catalog = async (at, inScope = scope) => (await ok(world.listWorldCalendars(db, { scope: inScope, recordedSeq: at }))).items.map(row => row.label)
      equal(await catalog(null), ['默认时间线', '海潮历'], 'calendar rename missing')
      equal(await catalog(changed.decision.recordedSeq - 1), ['默认时间线', '潮历'], 'new calendar label leaked into old records')
      equal(await catalog(null, { domain: 'book', bookId: 'other-book' }), ['默认时间线'], 'two authors shared calendars unintentionally')
      const localClaim = await save({ commandId: 'tidal-gossip', authority: 'rumor', kind: 'relation', predicate: '密约', object: '封桥' })
      const datedObservation = { scope, actorKey: '舟守', claimId: localClaim.result.claimId }
      const localView = (eraId, storyAt, extra = {}) => ok(world.readWorldPerspective(db, { ...datedObservation, storyAt, storyClock: clock(eraId), ...extra }))
      const firstNotice = await ok(world.saveWorldKnowledge(db, { ...datedObservation, channel: 'heard', storyClock: clock('ebb'), storyAt: 100, commandId: 'old-era-notice' }))
      await ok(world.saveWorldKnowledge(db, { ...datedObservation, kind: 'belief', belief: 'disputed', storyClock: clock('flow'), storyAt: -5, commandId: 'new-era-doubt' }))
      equal((await localView('ebb', 99)).items.length, 0, 'native knowledge arrived early')
      equal((await localView('ebb', 100)).items[0].belief, null, 'negative ordinal in later era changed an earlier viewpoint')
      equal((await localView('flow', -6)).items[0].belief, null, 'acquisition did not carry into a later era')
      equal((await localView('flow', -5)).items[0].belief, 'disputed', 'dated change of mind disappeared')
      const unrelatedClock = await ok(world.readWorldPerspective(db, { ...datedObservation, storyAt: 100 }))
      check(unrelatedClock.incomparable && !unrelatedClock.items.length, 'calendar numerals treated as a universal date')
      const fixedUse = await ok(world.saveWorldManuscriptLink(db, { ...actorUse, claimId: datedObservation.claimId, commandId: 'tidal-use',
        beliefUse: { actorKey: datedObservation.actorKey, storyAt: -6, storyClock: clock('flow') } }))
      equal((await actionReviews(null)).find(row => row.id === fixedUse.result.linkId).beliefUse.basis.observationId, firstNotice.result.knowledgeEventId, 'action used the wrong calendar')
      await ok(world.saveWorldKnowledge(db, { ...datedObservation, channel: 'witnessed', storyAt: 1, commandId: 'incomparable-notice' }))
      const ambiguous = await localView('flow', 0)
      check(ambiguous.incomparable && !ambiguous.items.length, 'mixed-clock history implied an unjustified latest stance')
      equal((await actionReviews(null)).find(row => row.id === fixedUse.result.linkId).knowledgeIssue, 'incomparable', 'cross-clock dependency mislabeled')
      equal((await actionReviews(fixedUse.decision.recordedSeq)).find(row => row.id === fixedUse.result.linkId).needsReview, false, 'new calendar knowledge changed historical action')
      const tags = { kind: 'relation', predicate: '标记' }
      await save({ ...tags, commandId: 'literal-text', object: '否' })
      const bool = await save({ ...tags, commandId: 'literal-false', literalValue: { type: 'boolean', value: false } })
      const zero = await save({ ...tags, commandId: 'literal-zero', literalValue: { type: 'number', value: 0, unit: '枚' } })
      const tagged = (await facts(null)).filter(row => row.predicate === '标记')
      equal(tagged.length, 3, 'typed and textual facts replaced each other')
      equal(tagged.find(row => row.claimId === bool.result.claimId).literalValue.value, false, 'false lost in author view')
      const zeroClaim = { scope, actorKey: '库管', claimId: zero.result.claimId }
      await ok(world.saveWorldKnowledge(db, { ...zeroClaim, commandId: 'learn-zero', channel: 'witnessed', storyAt: 0 }))
      equal((await ok(world.readWorldPerspective(db, { ...zeroClaim, storyAt: 0 }))).items[0].literalValue, { type: 'number', value: 0, unit: '枚' }, 'actor lost numeric evidence')
      const written = await link(passage, 'reveal-zero', 'narrator-assertion', zero.result)
      equal((await read(passage)).items.find(row => row.id === written.result.linkId)?.literalValue?.value, 0, 'reader lost zero as a typed value')
      const newCount = await ok(ledger.correctFact(db, { scope, commandId: 'count-correction', factKey: zero.result.factKey, expectedHead: zero.result.factVersionId, literalValue: { type: 'number', value: 0.5, unit: '枚' } }))
      check(newCount.result.claimId !== zero.result.claimId && newCount.result.factKey !== zero.result.factKey, 'typed relation correction rewrote its old identity')
      equal((await read(passage)).items.find(row => row.id === written.result.linkId)?.literalValue?.value, 0, 'an author correction changed an existing disclosure')
      const rebuttal = await ok(world.saveWorldOpposite(db, { scope, commandId: 'no-first-visit', claimId: visit1.result.claimId }))
      const denialId = rebuttal.result.claimId
      const confirmNo = await ok(world.confirmWorldClaim(db, { scope, commandId: 'confirm-no-first-visit', claimId: denialId, storyAt: 0 }))
      const firstDay = (await facts(0)).filter(row => row.claimId === denialId || row.claimId === visit1.result.claimId)
      check(firstDay.length === 2 && firstDay.every(row => row.oppositeClaimId && row.oppositeClaimId !== row.claimId), 'opposite dated testimony was hidden')
      check(!(await facts(0, confirmNo.decision.recordedSeq - 1)).some(row => row.oppositeClaimId), 'historical author view leaked the later denial')
      const visits = (await ok(world.listWorldPlaceEvents(db, { scope, placeRef: bookPlace }))).items
      check(!visits.some(row => row.id === denialId) && visits.find(row => row.id === visit1.result.claimId)?.oppositeClaimId === denialId &&
        !visits.find(row => row.id === visit2.result.claimId)?.oppositeClaimId, 'map treated a denial as a visit or disputed the wrong occurrence')
      await ok(world.saveWorldKnowledge(db, { scope, commandId: 'guard-denies', actorKey: '门卫', claimId: denialId, channel: 'heard', storyAt: 0 }))
      const guardView = (await ok(world.readWorldPerspective(db, { scope, actorKey: '门卫', storyAt: 0 }))).items
      equal(guardView.map(item => [item.id, item.polarity, item.oppositeClaimId ?? null]), [[denialId, 'negative', null]], 'actor learned the author’s opposing evidence')
      const denialLink = await link(passage, 'written-denial', 'reported-speech', { claimId: denialId })
      equal((await read(passage)).items.find(row => row.id === denialLink.result.linkId)?.polarity, 'negative', 'a reader saw the opposite of a denial')
      await save({ ...post, commandId: 'not-at-east', object: '东台', polarity: 'negative', storyAt: 1 })
      equal((await facts(5)).filter(row => row.predicate === '驻地' && !row.polarity).map(row => row.object), ['南岸'], 'a denial of a different place closed a positive state')
      const { createLedgerFactProjection } = await import('/src/services/memory/ledger/ledgerProjection.js')
      const blocks = await createLedgerFactProjection(db)({ scope, subjectKeys: [subjectKey], limit: 24 })
      check(blocks.blocks.some(row => row.claim?.polarity === 'negative' && row.text.startsWith('否定')), 'frozen AI fact lost its negation')
      const { createLedgerHistoryTool } = await import('/src/services/memory/ledger/ledgerHistoryTool.js')
      const historyResult = await createLedgerHistoryTool(db)({ scope, action: 'get', ids: [confirmNo.result.factVersionId] })
      check(historyResult.results?.some(row => row.summary.startsWith('否定')), 'history excerpt inverted a denial')
      const alliance = { kind: 'relation', predicate: '立约', object: '书院', commandId: 'first-alliance', storyAt: 1 }
      const firstAlliance = await save(alliance)
      await save({ ...alliance, commandId: 'parallel-alliance', object: '港务司' })
      const endAlliance = { scope, expectedHead: firstAlliance.result.factVersionId, factKey: firstAlliance.result.factKey, commandId: 'leave-academy', storyAt: 4 }
      const ended = await ok(world.closeWorldPeriod(db, endAlliance))
      equal(objects(await facts(3), '立约'), ['书院', '港务司'], 'closing a relationship erased its past')
      equal(objects(await facts(4), '立约'), ['港务司'], 'ending one alliance changed another or included its exclusive end')
      equal(objects(await facts(4, ended.decision.recordedSeq - 1), '立约'), ['书院', '港务司'], 'end date leaked into older records')
      await save({ ...alliance, commandId: 'rejoin-academy', storyAt: 8 })
      check((await ok(world.closeWorldPeriod(db, endAlliance))).replay, 'a later reunion prevented replay of the original end command')
      equal(objects(await facts(2), '立约'), ['书院', '港务司'], 'a reunion erased the first alliance')
      equal(objects(await facts(5), '立约'), ['港务司'], 'the gap between alliances disappeared')
      equal(objects(await facts(8), '立约'), ['书院', '港务司'], 'second alliance did not start on time')
      const conflict = await world.saveWorldStatement(db, { ...shared, ...post, commandId: 'retroactive-overlap', authority: 'fact', object: '天台', storyAt: 1 })
      equal(conflict.reason, 'story-interval-conflict', 'backfill over an existing historical start created two residences')
      const report = (person, commandId) => world.saveWorldManuscriptLink(db, { ...passage, ...zero.result,
        claimId: zero.result.claimId, factVersionId: null, kind: 'reported-speech', speaker: person, commandId })
      const clerk = { entityRef: 'clerk', label: '账房' }, runner = { entityRef: 'runner', label: '信使' }
      const told = await ok(report(clerk, 'clerk-speaks'))
      const toldAgain = await ok(report(clerk, 'clerk-speaks-again'))
      equal(toldAgain.result.linkId, told.result.linkId, 'same credited quote duplicated in the reader account')
      const secondTeller = await ok(report(runner, 'runner-speaks'))
      const retag = (speaker, commandId, disclosureId = told.result.linkId) => world.changeWorldDisclosureSpeaker(db,
        { scope, book, speaker, commandId, disclosureId })
      equal((await retag(runner, 'duplicate-speaker')).reason, 'disclosure-speaker-exists', 'colliding speakers merged two original testimonies')
      const correctedSpeaker = await ok(retag({ entityRef: 'master', label: '主事' }, 'real-speaker'))
      const quotes = async seq => (await read(passage, seq)).items.filter(row => row.claimId === zero.result.claimId && row.disclosureKind === 'reported-speech')
      equal((await quotes(null)).map(row => row.speaker.label).sort(), ['主事', '信使'], 'readers lost one witness to a speaker correction')
      equal((await quotes(correctedSpeaker.decision.recordedSeq - 1)).map(row => row.speaker.label).sort(), ['信使', '账房'], 'old reader view leaked the corrected credit')
      equal((await retag(null, 'stale-credit')).reason, 'disclosure-changed', 'stale speaker form changed a newer credit')
      check((await quotes(null)).some(row => row.id === secondTeller.result.linkId), 'unrelated quote identity changed')
      equal((await ok(world.readWorldPerspective(db, { scope, actorKey: 'master', storyAt: 0 }))).items, [], 'a quoted line implicitly granted knowledge to its speaker')
      const remove = { scope, book, disclosureId: secondTeller.result.linkId, commandId: 'withdraw-runner' }
      const retiredReport = await ok(world.withdrawWorldDisclosure(db, remove))
      check((await ok(world.withdrawWorldDisclosure(db, remove))).replay, 'withdrawal retry changed the ledger twice')
      equal((await world.withdrawWorldDisclosure(db, { ...remove, commandId: 'withdraw-stale' })).reason, 'disclosure-changed', 'stale withdrawal was accepted')
      equal((await quotes(null)).map(row => row.speaker?.label), ['主事'], 'withdrawing a single report affected the other speaker')
      equal((await quotes(retiredReport.decision.recordedSeq - 1)).map(row => row.speaker.label).sort(), ['主事', '信使'], 'retiring an exposure hid it from prior readers')
      const movedQuote = { ...position(first.id, gossip), disclosureId: correctedSpeaker.result.linkId, commandId: 'earlier-quote' }
      const duplicate = await ok(world.saveWorldManuscriptLink(db, { ...movedQuote, commandId: 'occupied-quote', kind: 'reported-speech', claimId: zero.result.claimId, speaker: { entityRef: 'master', label: '主事' } }))
      equal((await world.relocateWorldDisclosure(db, movedQuote)).reason, 'disclosure-position-exists', 'moving a disclosure overwrote another registration')
      await ok(world.withdrawWorldDisclosure(db, { scope, book, disclosureId: duplicate.result.linkId, commandId: 'free-position' }))
      const repositioned = await ok(world.relocateWorldDisclosure(db, movedQuote))
      check((await ok(world.relocateWorldDisclosure(db, movedQuote))).replay, 'relocation retry registered another disclosure')
      equal((await world.relocateWorldDisclosure(db, { ...movedQuote, commandId: 'stale-quote-location' })).reason, 'disclosure-changed', 'outdated position form relocated a newer row')
      const earlyQuotes = async seq => (await read(position(first.id, gossip), seq)).items.filter(row => row.claimId === zero.result.claimId)
      equal((await earlyQuotes(repositioned.decision.recordedSeq - 1)).length, 0, 'relocation changed reader exposure before its author decision')
      equal((await earlyQuotes(null))[0]?.speaker?.label, '主事', 'new passage lost the original speaker')
      const branchInput = { scope, label: '没有重结的盟约', branchId: 'experiment-a', commandId: 'fork-at-end', recordedSeq: ended.decision.recordedSeq }
      const fork = await ok(ledger.forkWorldFacts(db, branchInput))
      const branch = fork.decision.scope
      check((await ok(ledger.forkWorldFacts(db, branchInput))).replay, 'fork retry duplicated baseline facts')
      const atBranch = async (at, recordedSeq = null) => (await ok(world.readWorldFacts(db, { scope: branch, storyAt: at, recordedSeq }))).items
      equal(objects(await atBranch(2), '立约'), ['书院', '港务司'], 'branch lost the first alliance at its historical cut')
      equal(objects(await atBranch(8), '立约'), ['港务司'], 'branch inherited a reunion the author registered after its fork point')
      equal(await atBranch(2, fork.decision.recordedSeq - 1), [], 'partial branch baseline was visible')
      const branchClocks = await ok(world.listWorldCalendars(db, { scope: branch }))
      check(branchClocks.items.some(c => c.label === '海潮历'), 'branch lost the era declarations needed to read its facts')
      const childPlace = (await atBranch(8)).find(row => row.predicate === '驻地' && !row.polarity)
      const parentPlace = (await facts(8)).find(row => row.predicate === '驻地' && !row.polarity)
      check(childPlace.factVersionId !== parentPlace.factVersionId && childPlace.claimId !== parentPlace.claimId, 'copied facts shared writable identity across scopes')
      await ok(ledger.correctFact(db, { scope: branch, commandId: 'alternate-post', expectedHead: childPlace.factVersionId, factKey: childPlace.factKey, object: '海岛' }))
      equal((await atBranch(8)).find(row => row.predicate === '驻地' && !row.polarity).object, '海岛', 'branch correction failed')
      equal((await facts(8)).find(row => row.predicate === '驻地' && !row.polarity).object, parentPlace.object, 'branch correction leaked into book canon')
      equal((await ok(world.readWorldPerspective(db, { scope: branch, actorKey: '门卫', storyAt: 0 }))).items, [], 'character testimony crossed into branch without registration')
      equal((await ok(ledger.listWorldFactForks(db, { scope: { domain: 'book', bookId: 'other' } }))).items, [], 'book listed another novel’s scenario')
      equal((await ledger.forkWorldFacts(db, { ...branchInput, commandId: 'reuse-fork' })).reason, 'fork-target-used', 'fresh copy overwrote an existing branch')
      equal((await ledger.forkWorldFacts(db, { ...branchInput, commandId: 'future-fork', branchId: 'future', recordedSeq: Number.MAX_SAFE_INTEGER })).reason, 'fork-cutoff-future', 'future record accepted as a fork point')
      const uncertainActor = { scope, actorKey: '暗哨', claimId: rumor.result.claimId }
      await ok(world.saveWorldKnowledge(db, { ...uncertainActor, commandId: 'scout-heard', kind: 'known', channel: 'heard', storyAt: 2 }))
      const scoutUse = await ok(world.saveWorldManuscriptLink(db, { ...actorUse, claimId: uncertainActor.claimId, commandId: 'scout-action',
        beliefUse: { actorKey: uncertainActor.actorKey, storyAt: 4 } }))
      const forgotten = await ok(world.saveWorldKnowledge(db, { ...uncertainActor, commandId: 'scout-forgot', kind: 'belief', belief: 'forgotten' }))
      const uncertainView = await ok(world.readWorldPerspective(db, { ...uncertainActor, storyAt: 4 }))
      check(uncertainView.dateUnknown && !uncertainView.items.length, 'an undated forgetting yielded definite knowledge at day four')
      const currentUse = async () => (await ok(world.listWorldUses(db, actorUse))).items.find(row => row.id === scoutUse.result.linkId)
      equal((await currentUse()).knowledgeIssue, 'date-unknown', 'undated forgetting labeled the actor as certainly aware or definitely unaware')
      equal((await ok(world.readWorldPerspective(db, { ...uncertainActor, storyAt: 4, recordedSeq: scoutUse.decision.recordedSeq }))).items[0]?.id,
        uncertainActor.claimId, 'undated forgetting leaked into an earlier recording cut')
      equal((await world.saveWorldManuscriptLink(db, { ...actorUse, claimId: uncertainActor.claimId, commandId: 'uncertain-second-action',
        beliefUse: { actorKey: uncertainActor.actorKey, storyAt: 3 } })).reason, 'belief-use-date-unknown', 'undetermined attitude became a new action basis')
      await ok(world.saveWorldKnowledge(db, { ...uncertainActor, commandId: 'date-scout-forgetting', supersedesEventId: forgotten.result.knowledgeEventId,
        kind: 'belief', belief: 'forgotten', storyAt: 6 }))
      equal((await currentUse()).needsReview, false, 'dating the forgetting after the action did not resolve the paragraph')
      const selectedIsland = (await atBranch(8)).find(row => row.predicate === '驻地' && !row.polarity)
      const selectIsland = { scope: branch, commandId: 'accept-branch-post', factVersionId: selectedIsland.factVersionId }
      const acceptedIsland = await ok(ledger.adoptWorldForkFact(db, selectIsland))
      check((await ok(ledger.adoptWorldForkFact(db, selectIsland))).replay, 'canonical adoption retry wrote another version')
      equal(acceptedIsland.result.adoptedFromFork.factVersionId, selectedIsland.factVersionId, 'adoption did not preserve the reviewed branch version')
      equal((await facts(8)).find(row => row.predicate === '驻地' && !row.polarity).object, '海岛', 'canonical correction did not use the selected claim')
      equal((await facts(8, acceptedIsland.decision.recordedSeq - 1)).find(row => row.predicate === '驻地' && !row.polarity).object, '南岸', 'adoption rewrote the earlier canonical record')
      const cannon = await ok(world.saveWorldStatement(db, { scope: branch, kind: 'state', subjectKey, predicate: '信号颜色', object: '青', authority: 'fact', storyAt: 3, commandId: 'branch-signal' }))
      await save({ kind: 'state', predicate: '信号颜色', object: '黄', storyAt: 3, commandId: 'canonical-signal' })
      equal((await ledger.adoptWorldForkFact(db, { scope: branch, commandId: 'conflicting-signal', factVersionId: cannon.result.factVersionId })).reason,
        'fork-parent-changed', 'concurrent canon was overwritten by another branch')
      const newBranch = (await ok(ledger.forkWorldFacts(db, { scope, commandId: 'fork-tomorrow', branchId: 'tomorrow', label: '下一日' }))).decision.scope
      const futurePost = await ok(world.saveWorldStatement(db, { ...shared, scope: newBranch, ...post, kind: 'state', authority: 'fact', object: '边城', storyAt: 15, commandId: 'future-post' }))
      await ok(ledger.adoptWorldForkFact(db, { scope: newBranch, factVersionId: futurePost.result.factVersionId, commandId: 'canon-future-post' }))
      equal((await facts(14)).find(row => row.predicate === '驻地' && !row.polarity).object, '海岛', 'promoting a new succession erased the preceding canonical period')
      equal((await facts(15)).find(row => row.predicate === '驻地' && !row.polarity).object, '边城', 'promoted succession has the wrong boundary')
      const seed = { scope: { domain: 'book', bookId: 'viewpoint-fork' }, actorKey: '舟子' }
      const secret = await ok(world.saveWorldStatement(db, { scope: seed.scope, authority: 'rumor', kind: 'state',
        subjectKey: '桥', predicate: '桥下', object: '藏船', commandId: 'boat-secret' }))
      const seedEvent = { ...seed, claimId: secret.result.claimId }
      const learned = await ok(world.saveWorldKnowledge(db, { ...seedEvent, kind: 'known', channel: 'heard', storyAt: 1,
        speaker: { entityRef: 'porter', label: '脚夫' }, commandId: 'boat-heard' }))
      await ok(world.saveWorldKnowledge(db, { ...seedEvent, kind: 'belief', belief: 'disputed', storyAt: 4, commandId: 'boat-doubted' }))
      const side = (await ok(ledger.forkWorldFacts(db, { scope: seed.scope, label: '渡河', branchId: 'crossing', commandId: 'branch-crossing' }))).decision.scope
      await ok(world.saveWorldKnowledge(db, { ...seedEvent, kind: 'known', channel: 'witnessed', storyAt: 1,
        supersedesEventId: learned.result.knowledgeEventId, commandId: 'boat-seen' }))
      const carry = { scope: side, actorKey: seed.actorKey, commandId: 'carry-boat' }
      const copied = await ok(world.inheritWorldCharacter(db, carry))
      check((await ok(world.inheritWorldCharacter(db, carry))).replay, 'repeated inheritance duplicated history')
      equal((await world.inheritWorldCharacter(db, { ...carry, commandId: 'carry-again' })).reason, 'fork-actor-used', 'existing memories were overwritten')
      equal((await world.inheritWorldCharacter(db, { ...carry, actorKey: '过客', commandId: 'carry-missing' })).reason, 'fork-actor-empty', 'unknown character gained a history')
      const replay = async (storyAt, recordedSeq) => (await ok(world.readWorldPerspective(db, { ...carry, storyAt, recordedSeq }))).items
      equal(await replay(5, copied.decision.recordedSeq - 1), [], 'partial inherited stance escaped its author transaction')
      equal((await ok(world.listWorldStatements(db, { scope: side, recordedSeq: copied.decision.recordedSeq - 1 }))).items, [], 'private rumor leaked before inheritance')
      equal((await replay(2))[0]?.speaker?.label, '脚夫', 'parent correction after fork rewrote the remembered source')
      equal((await replay(5))[0]?.belief, 'disputed', 'inherited doubts were replaced by belief')
      await ok(world.saveWorldKnowledge(db, { ...carry, claimId: (await replay(5))[0].id, kind: 'belief', belief: 'forgotten', storyAt: 6, commandId: 'forget-in-branch' }))
      equal((await ok(world.readWorldPerspective(db, { ...seed, storyAt: 7 }))).items[0]?.belief, 'disputed', 'forgetting in a branch changed canon')
      const heardAgain = await ok(world.saveWorldKnowledge(db, { ...seedEvent, kind: 'known', channel: 'heard', storyAt: 8, commandId: 'boat-again' }))
      const removeHearing = (eventId, commandId) => world.withdrawWorldKnowledge(db, { ...seedEvent, eventId, commandId })
      equal((await removeHearing(learned.result.knowledgeEventId, 'remove-replaced')).reason, 'knowledge-event-changed', 'removed the old side of a correction')
      const currentActor = async seq => (await ok(world.readWorldPerspective(db, { ...seed, storyAt: 9, recordedSeq: seq }))).items
      const viewed = (await currentActor())[0]
      const witnessed = viewed.history.find(row => row.channel === 'witnessed' && row.kind === 'known')
      equal((await removeHearing(witnessed.id, 'remove-supporting-observation')).reason, 'knowledge-dependent-attitude', 'removal orphaned an earlier dated doubt')
      const removedHearing = await ok(removeHearing(heardAgain.result.knowledgeEventId, 'remove-boat-repeat'))
      check((await ok(removeHearing(heardAgain.result.knowledgeEventId, 'remove-boat-repeat'))).replay, 'removal retry produced a second decision')
      equal((await currentActor())[0].channel, 'witnessed', 'withdrawing a repeated hearing erased the earlier observation')
      equal((await currentActor(removedHearing.decision.recordedSeq - 1))[0].channel, 'heard', 'withdrawing a repeated hearing changed an earlier cut')
      const siege = await save({ kind: 'event', predicate: '围城', object: '北门', storyAt: 8, storyClock: clock('ebb'),
        eventEnd: { eraId: 'flow', ordinal: -2 }, commandId: 'long-siege' })
      const inSiege = async (era, day, seq = null) => (await ok(world.readWorldFacts(db, { scope, storyClock: clock(era), storyAt: day, recordedSeq: seq }))).items.some(row => row.predicate === '围城')
      equal([await inSiege('ebb', 7), await inSiege('ebb', 8), await inSiege('flow', -3), await inSiege('flow', -2)], [false, true, true, false], 'cross-era event duration or exclusive end changed')
      const siegeHead = { scope, subjectKey, factKey: siege.result.factKey, expectedHead: siege.result.factVersionId }
      const postponed = await ok(world.correctWorldDate(db, { ...siegeHead, storyClock: clock('ebb'), storyAt: 10, commandId: 'postpone-siege' }))
      equal([await inSiege('ebb', 8), await inSiege('ebb', 8, siege.decision.recordedSeq), await inSiege('flow', -2)], [false, true, false], 'moving a siege start moved its independent end or rewrote history')
      const oneDay = await ok(world.closeWorldPeriod(db, { ...siegeHead, expectedHead: postponed.result.factVersionId, storyClock: clock('ebb'), storyAt: 11, commandId: 'end-siege' }))
      const early = await ok(world.correctWorldDate(db, { ...siegeHead, expectedHead: oneDay.result.factVersionId, storyClock: clock('ebb'), storyAt: 9, commandId: 'early-siege' }))
      equal([await inSiege('ebb', 9), await inSiege('ebb', 10), await inSiege('ebb', 11)], [true, true, false], 'an explicitly single-day period was converted into a moving instant')
      equal((await world.closeWorldPeriod(db, { ...siegeHead, expectedHead: early.result.factVersionId, storyClock: clock('ebb'), storyAt: 8, commandId: 'reverse-siege' })).reason, 'story-interval-invalid', 'event could end before it began')
      const privateClue = await ok(world.saveWorldStatement(db, { ...shared, kind: 'event', authority: 'rumor', predicate: '暗渡', object: '船灯', commandId: 'secret-crossing' }))
      const corroboration = { scope, book, factPosition: { chapterId: second.id, unitId: door }, claimId: privateClue.result.claimId, storyAt: 9, commandId: 'attest-crossing' }
      const grounded = await ok(world.confirmWorldClaim(db, corroboration))
      check((await ok(world.confirmWorldClaim(db, corroboration))).replay, 'attesting with the same passage repeated confirmation')
      const version = await db.factVersions.get(grounded.result.factVersionId)
      equal((await db.evidenceSnapshots.get(version.evidenceIds[0])).sourceKind, 'chapter-quote', 'chapter evidence replaced by a generic author assertion')
      check(!(await read(passage)).items.some(row => row.claimId === grounded.result.claimId), 'author evidence explicitly revealed a secret to readers')
      equal((await world.confirmWorldClaim(db, { ...corroboration, commandId: 'missing-evidence-cursor', factPosition: { chapterId: 'missing', unitId: door } })).reason, 'manuscript-changed', 'accepted an unavailable author source')
      const coastGuard = await save({ kind: 'state', predicate: '巡防', object: '东堤', storyAt: 0, storyClock: clock('ebb'),
        periodEnd: { kind: 'unknown', by: { eraId: 'flow', ordinal: -2 } }, commandId: 'guard-estimate' })
      const guardScope = { scope, entityRef: subjectKey }
      const patrol = async (era, day, seq) => {
        const found = await ok(world.readWorldFacts(db, { ...guardScope, storyClock: clock(era), storyAt: day, recordedSeq: seq }))
        return found.items.some(row => row.predicate === '巡防')
      }
      equal([await patrol('ebb', 0), await patrol('ebb', 1), await patrol('flow', -3), await patrol('flow', -2)], [true, false, false, false], 'an uncertain end invented a period of definite patrol')
      const guardInput = { scope, expectedHead: coastGuard.result.factVersionId, factKey: coastGuard.result.factKey }
      const activePatrol = await ok(world.reviseWorldPeriodEnd(db, { ...guardInput, periodEnd: { kind: 'open' }, commandId: 'patrol-confirmed' }))
      check(await patrol('flow', -1), 'author-confirmed ongoing state did not extend past the former bound')
      check(!await patrol('flow', -1, activePatrol.decision.recordedSeq - 1), 'revised confidence leaked back into earlier cut')
      equal((await world.reviseWorldPeriodEnd(db, { ...guardInput, expectedHead: activePatrol.result.factVersionId, periodEnd: { kind: 'unknown', by: { eraId: 'ebb', ordinal: -1 } }, commandId: 'bad-patrol-bound' })).reason, 'story-interval-invalid', 'accepted an impossible latest end')
      const holder = { ...shared, authority: 'fact', kind: 'state', predicate: '持印人', book }
      const holderA = await ok(world.saveWorldStatement(db, { ...holder, commandId: 'holder-a', storyAt: 1, object: '前任', factPosition: { chapterId: first.id, unitId: gossip } }))
      const holderB = await ok(world.saveWorldStatement(db, { ...holder, commandId: 'holder-b', storyAt: 4, object: '继任', factPosition: { chapterId: second.id, unitId: door } }))
      const holderSources = factVersionId => world.listWorldFactPassages(db, { scope, book, worldbookId: book.worldbookId, factVersionId })
      const oldHolder = (await facts(2)).find(item => item.claimId === holderA.result.claimId)
      check(oldHolder?.supersedesKind && (await ok(holderSources(oldHolder.factVersionId))).items.some(row => row.manuscriptAnchor.unitId === gossip), 'historical state could not trace its manuscript evidence')
      equal((await ok(holderSources(holderB.result.factVersionId))).items.map(row => row.manuscriptAnchor.unitId), [door], 'successor was credited with an unrelated predecessor source')
      const startCursor = position(first.id, gossip), middleCursor = position(second.id, threshold)
      const rangeInput = { ...startCursor, kind: 'constraint-use', rangeEndPosition: { chapterId: second.id, unitId: door },
        claimId: holderB.result.claimId, factVersionId: holderB.result.factVersionId, commandId: 'chapter-range' }
      const spanRule = await ok(world.saveWorldManuscriptLink(db, rangeInput))
      const inRange = async cursor => (await ok(world.listWorldUses(db, cursor))).items.find(row => row.id === spanRule.result.linkId)
      check(!await inRange(position(first.id, entrance)) && await inRange(startCursor) && await inRange(middleCursor) && await inRange(passage), 'chapter constraint failed its inclusive start/end or earlier exclusion')
      equal((await inRange(middleCursor)).needsReview, false, 'unchanged interior paragraph marked stale')
      equal((await world.saveWorldManuscriptLink(db, { ...rangeInput, commandId: 'backward-range', rangeEndPosition: { chapterId: first.id, unitId: entrance } })).reason, 'manuscript-range-invalid', 'accepted reversed range')
      const changedHolder = await ok(ledger.correctFact(db, { scope, commandId: 'revise-holder', factKey: holderB.result.factKey, expectedHead: holderB.result.factVersionId, object: '副手' }))
      check((await inRange(middleCursor)).needsReview, 'correction did not mark the whole range')
      const reviewedRange = await ok(world.reviewWorldUse(db, { ...rangeInput, commandId: 'review-full-range', useId: spanRule.result.linkId,
        claimId: changedHolder.result.claimId, factVersionId: changedHolder.result.factVersionId }))
      check((await ok(world.listWorldUses(db, middleCursor))).items.some(row => row.id === reviewedRange.result.linkId && !row.needsReview && row.rangeEnd.unitId === door), 'review collapsed a multi-chapter constraint to one paragraph')
      saveWritingBooks([reordered])
      const currentBook = loadWritingBooksSnapshot()[0]
      check((await ok(world.listWorldAnchorIssues(db, { scope, book: currentBook }))).items.some(row => row.id === reviewedRange.result.linkId && row.rangeEnd.unitId === door), 'reversed chapters silently continued applying the original rule')
      const reversedRules = await ok(world.listWorldUses(db, position(first.id, gossip, currentBook)))
      check(reversedRules.items.find(row => row.id === reviewedRange.result.linkId)?.needsReview, 'reversed range endpoint was shown as confirmed')
      saveWritingBooks([{ ...book, chapters: [first] }])
      const shortened = loadWritingBooksSnapshot()[0]
      const historical = await ok(world.listWorldUses(db, { ...middleCursor, book: shortened,
        editionId: spanRule.result.manuscriptEditionId, recordedSeq: spanRule.decision.recordedSeq }))
      check(historical.items.some(row => row.id === spanRule.result.linkId && !row.needsReview), 'old edition lost its cross-chapter constraint after a live rewrite')
      const missingEdition = await ok(world.listWorldUses(db, { ...middleCursor, editionId: 'missing-edition' }))
      check(missingEdition.status === 'unknown', 'unavailable historical manuscript silently used the live text')
      const affected = await ok(world.previewWorldFactChange(db, { scope, book: shortened, factVersionId: changedHolder.result.factVersionId }))
      check(affected.items.find(row => row.id === reviewedRange.result.linkId)?.needsReview, 'deleting only the end of a range did not mark its manuscript impact')
      await ok(world.archiveWorldAnchor(db, { scope, book: shortened, commandId: 'retire-broken-range', kind: 'constraint-use', linkId: reviewedRange.result.linkId }))
      saveWritingBooks([book])
      return 'v5 upgrade, relations, map occurrences, character rumors, story/record cutoffs, manuscript disclosures and reviewed uses passed'
    } finally { await db.delete() }
  })
  await page.evaluate(async () => {
    const { checkWorldPlaceEventsPanel } = await import('/scripts/fixtures/ledger/map-place-events-probe.mjs')
    await checkWorldPlaceEventsPanel()
    const { checkWorldbookEntityPanel } = await import('/scripts/fixtures/ledger/worldbook-entity-model-probe.mjs')
    await checkWorldbookEntityPanel()
  })
  await page.evaluate(checkCompanionKnowledge)
  await checkWorldModelBackup(browser, origin)
  process.stdout.write(report + '; map and worldbook inspector, companion isolation, workspace ZIP restore passed\n')
} finally {
  try { await browser?.close() } finally {
    await vite?.close()
    if (cacheDir) await rm(cacheDir, { recursive: true, force: true })
  }
}
