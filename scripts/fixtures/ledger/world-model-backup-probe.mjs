import assert from 'node:assert/strict'

// Export on the source browser, restore on a new origin storage profile,
// then reopen the restored book through the manuscript and character views.
export async function checkWorldModelBackup(browser, origin) {
  async function blankPage() {
    const page = await browser.newPage()
    const path = new URL('/__world_zip_probe', origin).href
    await page.route(path, route => route.fulfill({ contentType: 'text/html', body: '<title>Workspace ZIP</title>' }))
    await page.goto(path)
    return page
  }
  const source = await blankPage()
  const packed = await source.evaluate(async () => {
    const W = await import('/src/services/memory/ledger/worldModelWorkspace.js')
    const { withLedgerDb } = await import('/src/services/memory/ledger/ledgerDb.js')
    const { buildWorkspaceBackupBundle } = await import('/src/services/storage/workspaceBackupBundle.js')
    const { loadWritingBooksSnapshot, saveWritingBooks } = await import('/src/services/writing/writingBooksRepository.js')
    saveWritingBooks([{ id: 'zip-novel', title: '临川记', chapters: [{ id: 'chapter', content: '城北有人说桥已断。' }, { id: 'after', content: '使官在渡口重述断桥传闻。' }] }])
    const [book] = loadWritingBooksSnapshot()
    const scope = { domain: 'book', bookId: book.id }
    const unitId = W.worldManuscriptUnits(book.chapters[0])[0].unitId
    await withLedgerDb(async db => {
      const statement = await W.saveWorldStatement(db, { scope, commandId: 'rumor', authority: 'rumor', kind: 'state',
        subjectKey: 'book:' + book.id, subjectLabel: '北桥', predicate: '通行', object: '已断' })
      const claimId = statement.result.claimId
      const calendar = { id: 'tidal', label: '潮历', eras: [{ id: 'first', label: '初潮', order: 1 }] }
      const declared = await W.defineWorldCalendar(db, { scope, calendar, commandId: 'declare-calendar' })
      if (!declared.ok) throw Error(declared.reason)
      const knowledge = await W.saveWorldKnowledge(db, { scope, claimId, commandId: 'learn', storyClock: { timelineId: 'tidal', eraId: 'first' }, actorKey: '信使', kind: 'known', channel: 'heard', speaker: { entityRef: '北岸守卫', label: '阿成' }, book, originPosition: { chapterId: 'chapter', unitId }, storyAt: 0 })
      if (!knowledge.ok) throw Error(knowledge.reason)
      const correction = await W.saveWorldKnowledge(db, { scope, claimId, commandId: 'amend', actorKey: '信使', kind: 'known',
        supersedesEventId: knowledge.result.knowledgeEventId, channel: 'inferred', storyAt: -1 })
      if (!correction.ok) throw Error(correction.reason)
      const mistaken = await W.saveWorldKnowledge(db, { scope, claimId, commandId: 'mistaken-actor', actorKey: '樵夫', kind: 'known', channel: 'heard', storyAt: 0 })
      if (!mistaken.ok) throw Error(mistaken.reason)
      const removed = await W.withdrawWorldKnowledge(db, { scope, actorKey: '樵夫', claimId, eventId: mistaken.result.knowledgeEventId, commandId: 'remove-mistaken-actor' })
      if (!removed.ok) throw Error(removed.reason)
      const event = await W.saveWorldStatement(db, { scope, book, factPosition: { chapterId: 'chapter', unitId }, commandId: 'ferry', authority: 'fact', kind: 'event', storyAt: -2, eventEnd: { eraId: 'first', ordinal: 1 }, storyClock: { timelineId: 'tidal', eraId: 'first' },
        subjectKey: '信使', predicate: '交信', object: '口信', eventContext: { placeRefs: ['北桥'], participants: [{ role: '交付人', entityRef: '信使' }] },
        eventLabels: [{ entityRef: '信使', label: '阿九' }] })
      if (!event.ok) throw Error(event.reason)
      for (const kind of ['reported-speech', 'belief-use']) {
        const row = await W.saveWorldManuscriptLink(db, { scope, claimId, book, chapterId: 'chapter', unitId, kind, ...(kind === 'reported-speech' ? { speaker: { entityRef: 'guard', label: '守卫' } } : {}), ...(kind === 'belief-use' ? { beliefUse: { actorKey: '信使', storyAt: 0, storyClock: { timelineId: 'tidal', eraId: 'first' } } } : {}), commandId: kind })
        if (!row.ok) throw Error(row.reason)
        if (kind === 'reported-speech') {
          const changed = await W.changeWorldDisclosureSpeaker(db, { scope, book, disclosureId: row.result.linkId,
            speaker: { entityRef: 'herald', label: '使官' }, commandId: 'real-herald' })
          if (!changed.ok) throw Error(changed.reason)
        }
      }
      const extra = await W.saveWorldManuscriptLink(db, { scope, claimId, book, chapterId: 'chapter', unitId,
        kind: 'reported-speech', speaker: { entityRef: 'runner', label: '小厮' }, commandId: 'mistaken-disclosure' })
      if (!extra.ok) throw Error(extra.reason)
      const withdrawn = await W.withdrawWorldDisclosure(db, { scope, book, disclosureId: extra.result.linkId, commandId: 'remove-mistake' })
      if (!withdrawn.ok) throw Error(withdrawn.reason)
      const old = await db.factDecisions.where('commandId').equals('real-herald').first()
      const moved = await W.relocateWorldDisclosure(db, { scope, book, commandId: 'move-herald', disclosureId: old.result.linkId,
        chapterId: 'after', unitId: W.worldManuscriptUnits(book.chapters[1])[0].unitId })
      if (!moved.ok) throw Error(moved.reason)
      const toll = await W.saveWorldStatement(db, { scope, commandId: 'toll', authority: 'fact', kind: 'state', subjectKey: '北桥',
        predicate: '过桥费', storyAt: 0, periodEnd: { kind: 'unknown', by: { eraId: 'default', ordinal: 3 } }, literalValue: { type: 'number', value: 0, unit: '文' } })
      if (!toll.ok) throw Error(toll.reason)
      const span = await W.saveWorldManuscriptLink(db, { scope, book, chapterId: 'chapter', unitId, kind: 'constraint-use', commandId: 'range-toll',
        claimId: toll.result.claimId, factVersionId: toll.result.factVersionId, rangeEndPosition: { chapterId: 'after', unitId: W.worldManuscriptUnits(book.chapters[1])[0].unitId } })
      if (!span.ok) throw Error(span.reason)
      const no = await W.saveWorldOpposite(db, { scope, commandId: 'no-toll', claimId: toll.result.claimId })
      if (!no.ok) throw Error(no.reason)
      const { forkWorldFacts, adoptWorldForkFact } = await import('/src/services/memory/ledger/factLedger.js')
      const fork = await forkWorldFacts(db, { scope, commandId: 'fork-zip', branchId: 'route', label: '走北路' })
      if (!fork.ok) throw Error(fork.reason)
      const memory = await W.inheritWorldCharacter(db, { scope: fork.decision.scope, commandId: 'inherit-messenger', actorKey: '信使' })
      if (!memory.ok) throw Error(memory.reason + ' ' + (memory.detail || ''))
      const amended = await W.saveWorldStatement(db, { scope: fork.decision.scope, commandId: 'fork-boat', book, factPosition: { chapterId: 'after', unitId: W.worldManuscriptUnits(book.chapters[1])[0].unitId }, authority: 'fact', kind: 'relation',
        subjectKey: '北岸', predicate: '渡船', object: '白鹭' })
      if (!amended.ok) throw Error(amended.reason)
      const adopted = await adoptWorldForkFact(db, { scope: fork.decision.scope, commandId: 'adopt-boat', factVersionId: amended.result.factVersionId })
      if (!adopted.ok) throw Error(adopted.reason)
    })
    const { bytes, manifest } = await buildWorkspaceBackupBundle()
    return { bytes: [...bytes], domain: manifest.domains.factLedger }
  })
  await source.close()
  assert.equal(packed.domain.schemaVersion, 24)
  assert.equal(packed.domain.counts.disclosures, 4)
  assert.equal(packed.domain.counts.claimUses, 2)
  assert.equal(packed.domain.counts.manuscriptEditions, 1)

  assert.equal(packed.domain.counts.manuscriptChapterRevisions, 2)
  assert.equal(packed.domain.counts.knowledgeEvents, 4)
  assert.equal(packed.domain.counts.worldClaims, 9)
  const destination = await blankPage()
  const result = await destination.evaluate(async bytes => {
    const backup = await import('/src/services/storage/workspaceBackupBundle.js')
    const W = await import('/src/services/memory/ledger/worldModelWorkspace.js')
    const { withLedgerDb } = await import('/src/services/memory/ledger/ledgerDb.js')
    const { loadWritingBooksSnapshot } = await import('/src/services/writing/writingBooksRepository.js')
    const archive = Uint8Array.from(bytes)
    for (let attempt = 0; attempt < 2; attempt++) {
      const inspection = await backup.inspectWorkspaceBackup(archive)
      if (!inspection.valid) throw Error(JSON.stringify(inspection.errors))
      const restored = await backup.restoreWorkspaceBackupBundle(archive, { acceptRestoreRisk: true, expectedReviewRevision: inspection.reviewRevision })
      if (!restored.success) throw Error(JSON.stringify(restored))
      if (attempt && restored.domains.factLedger.written) throw Error('Second restore duplicated ledger rows')
    }
    const [book] = loadWritingBooksSnapshot()
    const scope = { domain: 'book', bookId: book.id }
    const cursor = { scope, book, chapterId: 'chapter', unitId: W.worldManuscriptUnits(book.chapters[0])[0].unitId }
    return withLedgerDb(async db => {
      const later = { ...cursor, chapterId: 'after', unitId: W.worldManuscriptUnits(book.chapters[1])[0].unitId }
      if ((await W.readWorldReader(db, cursor)).items.length) throw Error('Moved disclosure leaked into first chapter on restore')
      const [reader, uses, actor, author] = await Promise.all([W.readWorldReader(db, later), W.listWorldUses(db, cursor),
        W.readWorldPerspective(db, { scope, actorKey: '信使', storyAt: 0, storyClock: { timelineId: 'tidal', eraId: 'first' } }), W.readWorldFacts(db, { scope })])
      if (uses.items[0]?.beliefUse?.basis.channel !== 'inferred' || uses.items[0].needsReview) throw Error('Restored paragraph lost its character basis')
      const correction = await db.factDecisions.where('commandId').equals('remove-mistaken-actor').first()
      const woodsman = extra => W.readWorldPerspective(db, { scope, actorKey: '樵夫', storyAt: 1, ...extra })
      if ((await woodsman({})).items.length || (await woodsman({ recordedSeq: correction.recordedSeq - 1 })).items[0]?.channel !== 'heard') throw Error('ZIP lost the actor withdrawal or its earlier cut')
      const endRules = await W.listWorldUses(db, later)
      if (!endRules.items.some(row => row.kind === 'constraint-use' && row.rangeStart.chapterId === 'chapter' && row.rangeEnd.chapterId === 'after' && !row.needsReview)) throw Error('Restored constraint lost its manuscript range')
      const removal = await db.factDecisions.where('commandId').equals('remove-mistake').first()
      const beforeRemoval = await W.readWorldReader(db, { ...cursor, recordedSeq: removal.recordedSeq - 1 })
      if (!beforeRemoval.items.some(row => row.speaker?.label === '小厮' && row.quote === '城北有人说桥已断。') ||
          reader.items.some(row => row.speaker?.label === '小厮')) throw Error('Reader withdrawal lost the old or current reading boundary')
      const [saved] = (await W.listWorldEditions(db, { scope })).items
      const edition = await W.readWorldEdition(db, { scope, editionId: saved.id })
      const beforeEdition = await W.readWorldReader(db, { ...cursor, editionId: saved.id, recordedSeq: edition.recordedSeq - 1 })
      if (beforeEdition.status !== 'unknown') throw Error('A later manuscript edition was available before its registration')
      const frozenReader = await W.readWorldReader(db, { ...cursor, editionId: saved.id, recordedSeq: edition.recordedSeq })
      if (frozenReader.items[0]?.speaker?.label !== '守卫' || reader.items[0]?.speaker?.label !== '使官' || reader.items[0]?.quote !== '使官在渡口重述断桥传闻。') throw Error('Restored edition cannot reproduce the original and corrected speaker')
      const { readCharacterKnowledge } = await import('/src/services/memory/ledger/knowledgeLedger.js')
      const perspective = await readCharacterKnowledge(db, { scope, actorKeys: ['信使'], storyAt: 0, storyClock: { timelineId: 'tidal', eraId: 'first' } })
      if (perspective.actors['信使'].facts[0].history.some(row => row.passage)) throw Error('Author source excerpt was given to the character')
      const calendar = (await W.listWorldCalendars(db, { scope })).items.find(row => row.id === 'tidal')
      if (!calendar || calendar.eras[0]?.label !== '初潮') throw Error('Restored calendar lost its era')
      const tidal = await W.readWorldFacts(db, { scope, storyAt: -2, storyClock: { timelineId: 'tidal', eraId: 'first' } })
      if (tidal.items[0]?.predicate !== '交信' || !tidal.items[0].validInterval.eventSpan || tidal.items[0].validInterval.end.ordinal !== 1) throw Error('Restored native story date did not resolve')
      const sources = await W.listWorldEventPassages(db, { scope, book, worldbookId: book.worldbookId, factVersionId: tidal.items[0].factVersionId })
      if (!sources.items.some(row => row.kind === 'fact-source' && row.quote === '城北有人说桥已断。' && row.target)) throw Error('Restored event lost its author evidence and live manuscript locator')
      const oldActor = await W.readWorldPerspective(db, { scope, actorKey: '信使', recordedSeq: 3, storyAt: 0, storyClock: { timelineId: 'tidal', eraId: 'first' } })
      if (oldActor.items[0]?.speaker?.label !== '阿成' || actor.items[0]?.speaker || actor.items[0].history[0].passage?.quote !== '城北有人说桥已断。') throw Error('Restored hearsay source or correction history changed')
      const { listWorldFactForks } = await import('/src/services/memory/ledger/factLedger.js')
      const [fork] = (await listWorldFactForks(db, { scope })).items
      if (fork?.label !== '走北路' || fork.count !== 2) throw Error('Restored fork lost its parent cutoff')
      const inherited = (await W.readWorldFacts(db, { scope: fork.scope })).items
      if (!inherited.some(row => row.literalValue?.value === 0)) throw Error('Restored fork lost its typed baseline')
      const child = await W.readWorldPerspective(db, { scope: fork.scope, actorKey: '信使', storyAt: 0, storyClock: { timelineId: 'tidal', eraId: 'first' } })
      if (child.items[0]?.channel !== 'inferred' || child.items[0].history[0].passage?.quote !== '城北有人说桥已断。') throw Error('Restored branch lost the corrected experience or manuscript source')
      const boat = author.items.find(item => item.object === '白鹭')
      const origin = boat && await db.evidenceSnapshots.get(boat.evidenceIds[0])
      if (origin?.sourceKind !== 'fork-fact' || !inherited.some(row => row.factVersionId === origin.sourceRevision)) throw Error('Restored branch adoption lost its source version')
      const ferryEvidence = await db.evidenceSnapshots.bulkGet(boat.evidenceIds)
      if (!ferryEvidence.some(row => row.sourceKind === 'chapter-quote' && row.quote === '使官在渡口重述断桥传闻。')) throw Error('Canonical adoption lost its selected manuscript evidence')
      const denials = (await W.listWorldStatements(db, { scope })).items.filter(row => row.polarity === 'negative')
      if (denials.length !== 1 || denials[0].authority !== 'rumor' || denials[0].literalValue?.value !== 0) throw Error('Restored counterclaim changed meaning or authority')
      const toll = author.items.find(row => row.predicate === '过桥费')
      if (toll?.validInterval?.endBy?.ordinal !== 3 || toll.validInterval.endSemantic !== 'unknown' || toll?.literalValue?.value !== 0 || toll.literalValue.unit !== '文') throw Error('Restored zero toll lost its unit or numeric type')
      return [reader.items[0].disclosureKind, uses.items[0].kind, actor.items[0].object, actor.items[0].belief, actor.items[0].channel, actor.items[0].history[0].storyAt, author.items.filter(row => row.kind === 'event').map(row => [row.eventContext, row.eventLabels])]
    })
  }, packed.bytes)
  await destination.close()
  assert.deepEqual(result, ['reported-speech', 'belief-use', '已断', null, 'inferred', -1, [
    [{ placeRefs: ['北桥'], participants: [{ role: '交付人', entityRef: '信使' }] }, [{ entityRef: '信使', label: '阿九' }]]
  ] ])
}
