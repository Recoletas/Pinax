// Executable examples for the proposed world model. This isolated schema is
// never installed by Pinax. The record and story interval predicates are the
// installed Core's except for the explicit open-end case documented below.
// The fixture uses one era; ordinals denote its story beats.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { encodeScopeKey, normalizeScopeRef } from '@pinax/core/memory/ledger/ledgerContract'
import { LEDGER_V4_TABLES } from '@pinax/core/memory/ledgerSchema'

const require = createRequire(import.meta.url)
const origin = 'https://world-model-design.test'
const moduleRoutes = new Map([
  ['/ledger/recordAxis.js', require.resolve('@pinax/core/memory/ledger/recordAxis')],
  ['/ledger/storyInterval.js', require.resolve('@pinax/core/memory/ledger/storyInterval')],
  ['/knowledgeTime.js', require.resolve('@pinax/core/memory/knowledgeTime')],
  ['/positionIndex.js', require.resolve('../src/services/writing/manuscriptPositionIndex.js')],
  ['/contentHash.js', require.resolve('@pinax/core/domain/contentHash')]
])
const scopeKey = (branchId, bookId = '临川记') => encodeScopeKey(normalizeScopeRef({
  domain: 'session', bookId, sessionId: '推演一', branchId
}).scope)
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) return route.abort()
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<title>World model design</title>' })
    const path = moduleRoutes.get(url.pathname)
    return path ? route.fulfill({ contentType: 'text/javascript', path }) : route.abort()
  })
  await page.goto(origin)
  await page.addScriptTag({ path: require.resolve('dexie') })
  const actual = await page.evaluate(async ({ main, alternative, otherBook, factVersions }) => {
    const { isVisibleAt } = await import('/ledger/recordAxis.js')
    const { storyTimeMatch } = await import('/ledger/storyInterval.js')
    const { toTimePoint, comparePoints } = await import('/knowledgeTime.js')
    const db = new window.Dexie('world-model-design-example')
    db.version(1).stores({
      factVersions, worldClaims: 'id,scopeKey',
      knowledgeEvents: 'id,[scopeKey+actorKey+recordedSeq]', disclosures: 'id,scopeKey'
    })
    const timeline = { id: '临川历', eras: [{ id: '开元', order: 1 }] }
    const boundary = ordinal => ({ eraId: '开元', ordinal })
    const point = ordinal => ({ timelineId: timeline.id, ...boundary(ordinal), precision: 'year' })
    const interval = (start, end) => ({
      timelineId: timeline.id, start: boundary(start), end: end == null ? null : boundary(end),
      endSemantic: end == null ? 'open' : 'exclusive'
    })
    function atBeat(span, at) {
      // The proposed distinction: a declared ongoing state stays in force;
      // a missing end whose date is unknown stays uncertain after its start.
      if (!span || !at || span.timelineId !== timeline.id || at.timelineId !== timeline.id) return 'unknown'
      if (span.endSemantic === 'open' && span.end === null) {
        if (!span.start) return 'unknown'
        const start = toTimePoint({ ...span.start, timelineId: span.timelineId }, timeline)
        const order = comparePoints(start.point, toTimePoint(at, timeline).point)
        if (order === null) return 'unknown'
        return order <= 0 ? 'inside' : 'outside'
      }
      return storyTimeMatch(span, at, timeline).match
    }
    const linZhao = 'wbentry:wb-linchuan:person-01'
    const bystander = 'wbentry:wb-linchuan:person-02'
    const listener = 'wbentry:wb-linchuan:person-03'
    const undatedWitness = 'wbentry:wb-linchuan:person-04'
    const city = 'wbentry:wb-linchuan:place-01'
    const academy = 'wbentry:wb-linchuan:org-01'
    const garrison = 'wbentry:wb-linchuan:org-02'
    const names = new Map([[linZhao, '林昭'], [city, '临川'], [academy, '白鹿书院'], [garrison, '临川守军']])
    const claim = (id, subjectRef, predicate, value, scopeKey = main) => ({
      id, scopeKey, subjectRef, predicate, ...value
    })
    async function appendClaim(row) {
      if (Boolean(row.objectRef) === Object.hasOwn(row, 'literal')) throw new Error('invalid-claim-object')
      return db.worldClaims.add(row)
    }
    async function appendKnowledge(scopeKey, actorKey, claimId, beat, seq, { kind, channel = null, belief = null }) {
      await db.transaction('rw', db.worldClaims, db.knowledgeEvents, async () => {
        const target = await db.worldClaims.get(claimId)
        if (target?.scopeKey !== scopeKey) throw new Error('claim-scope-mismatch')
        await db.knowledgeEvents.add({
          id: scopeKey + '/' + seq, scopeKey, actorKey, claimId, storyAt: beat === null ? null : point(beat),
          recordedSeq: seq, kind, channel, belief
        })
      })
    }
    function characterAt(scopeKey, actorKey, beat, cut) {
      return db.transaction('r', db.knowledgeEvents, db.worldClaims, async () => {
        const events = await db.knowledgeEvents.where('[scopeKey+actorKey+recordedSeq]')
          .between([scopeKey, actorKey, 0], [scopeKey, actorKey, cut], true, true).toArray()
        const visible = events.filter(({ storyAt }) => storyAt?.timelineId === timeline.id
          && storyAt.eraId === '开元' && storyAt.ordinal <= beat)
        visible.sort((a, b) => a.storyAt.ordinal - b.storyAt.ordinal || a.recordedSeq - b.recordedSeq)
        const known = new Map()
        for (const event of visible) {
          if (event.kind === 'known') {
            known.set(event.claimId, { channel: event.channel, belief: event.belief ?? known.get(event.claimId)?.belief ?? null })
          } else if (known.has(event.claimId)) {
            known.get(event.claimId).belief = event.belief
          }
        }
        const claims = await db.worldClaims.bulkGet([...known.keys()])
        return claims.map(row => ({ claim: row.literal, ...known.get(row.id) }))
      })
    }
    async function objectiveAt(beat, cut) {
      return db.transaction('r', db.factVersions, db.worldClaims, async () => {
        const versions = await db.factVersions.where('scopeKey').equals(main).toArray()
        const visible = versions.filter(row => isVisibleAt(row, cut)
          && atBeat(row.validInterval, point(beat)) === 'inside')
        const claims = await db.worldClaims.bulkGet(visible.map(row => row.claimId))
        return claims.map(row => [row.predicate, row.objectRef ? names.get(row.objectRef) : row.literal, row.occurrenceId ?? null])
      })
    }
    async function disclosureExamples() {
      const { buildManuscriptPositionIndex, resolveTemporalRelation, resolveUnitRelation } = await import('/positionIndex.js')
      const { sha256HexOfText } = await import('/contentHash.js')
      const chapter = (id, lines) => ({ id, editorDocument: {
        content: lines.map(([unitId, text]) => ({ attrs: { unitId }, content: [{ type: 'text', text }] }))
      } })
      const fifth = chapter('ch5', [['road', '林昭绕道。']])
      const sixth = chapter('ch6', [['before', '守卫来到城楼。'], ['reveal', '临川北门仍开。'], ['after', '守卫收起灯。']])
      const eighth = chapter('ch8', [['flashback', '回到第五日，林昭在路口犹豫。']])
      function capture(chapters, id = '临川记') {
        const book = { id, chapters }
        return { ...buildManuscriptPositionIndex(book), chapters, revision: sha256HexOfText(JSON.stringify(book)) }
      }
      function unitRevision(index, { chapterId, unitId }) {
        const unit = index.chapters.find(ch => ch.id === chapterId)?.editorDocument.content.find(node => node.attrs.unitId === unitId)
        return unit ? sha256HexOfText(JSON.stringify(unit)) : null
      }
      const manuscript = capture([fifth, sixth, eighth])
      const anchor = {
        bookId: manuscript.bookId, chapterId: 'ch6', unitId: 'reveal', chapterOrderRevision: manuscript.chapterOrderRevision
      }
      await db.disclosures.add({
        id: 'narrated-open', scopeKey: main, claimId: 'north-truth', manuscriptAnchor: { ...anchor, unitRevision: unitRevision(manuscript, anchor) },
        disclosureKind: 'narrator-assertion', evidenceIds: ['excerpt:ch6:reveal'], recordedSeq: 12, invalidatedSeq: null
      })
      // The cursor denotes a completed unit. Compare both unit anchors, even
      // across chapters: chapter order alone cannot prove that a passage exists.
      function located(index, { chapterId, unitId }) {
        const chapters = index.entries.filter(entry => entry.chapterId === chapterId)
        return chapters.length === 1 && chapters[0].unitIds.filter(id => id === unitId).length === 1
      }
      const cursor = (chapterId, unitId, scopeKey = main, cut = 12, snapshot = manuscript) => ({
        chapterId, unitId, scopeKey, cut, bookId: snapshot.bookId, revision: snapshot.revision
      })
      function readerAt(index, through) {
        const unknown = { status: 'unknown', items: [] }
        if (!index || through.bookId !== index.bookId || through.revision !== index.revision || !located(index, through)) return unknown
        return db.transaction('r', db.disclosures, db.worldClaims, async () => {
          const rows = await db.disclosures.where('scopeKey').equals(through.scopeKey).toArray()
          const items = []
          for (const row of rows.filter(value => isVisibleAt(value, through.cut))) {
            const source = row.manuscriptAnchor
            if (source.bookId !== index.bookId || source.chapterOrderRevision !== index.chapterOrderRevision || !located(index, source)) return unknown
            if (source.unitRevision !== unitRevision(index, source)) return unknown
            let position = resolveTemporalRelation(index, through.chapterId, source.chapterId)
            if (position === 'at-target') position = resolveUnitRelation(index, through.chapterId, through.unitId, source.unitId)
            if (position === 'unknown') return unknown
            if (position === 'after-target') continue
            const item = await db.worldClaims.get(row.claimId)
            if (item?.scopeKey !== through.scopeKey) return unknown
            items.push([item.literal, row.disclosureKind])
          }
          return { status: 'ok', items }
        })
      }
      const flashback = cursor('ch8', 'flashback')
      const reordered = capture([fifth, eighth, sixth])
      const rewritten = capture([fifth, chapter('ch6', [['before', '守卫来到城楼。'], ['reveal', '他没有开口。'], ['after', '守卫收起灯。']]), eighth])
      const foreign = capture([fifth, sixth, eighth], '另一部书')
      return {
        beforeChapter: await readerAt(manuscript, cursor('ch5', 'road')), beforeUnit: await readerAt(manuscript, cursor('ch6', 'before')),
        endOfReveal: await readerAt(manuscript, cursor('ch6', 'reveal')), laterUnit: await readerAt(manuscript, cursor('ch6', 'after')),
        flashback: { reader: await readerAt(manuscript, flashback), linZhao: await characterAt(main, linZhao, 5, 12) },
        oldRecordCut: await readerAt(manuscript, cursor('ch8', 'flashback', main, 11)),
        staleText: await readerAt(rewritten, flashback), staleCursor: await readerAt(reordered, flashback),
        rewrittenReveal: await readerAt(rewritten, cursor('ch8', 'flashback', main, 12, rewritten)),
        staleAnchor: await readerAt(reordered, cursor('ch8', 'flashback', main, 12, reordered)),
        missingUnit: await readerAt(manuscript, cursor('ch6', 'deleted')),
        wrongBook: await readerAt(foreign, flashback), isolatedBook: await readerAt(foreign, cursor('ch8', 'flashback', otherBook, 12, foreign)),
        isolatedBranch: await readerAt(manuscript, cursor('ch8', 'flashback', alternative))
      }
    }
    async function failure(action) {
      try { await action(); return null } catch (error) { return [error.name, error.message] }
    }
    try {
      for (const row of [
        claim('ally-academy', linZhao, '结盟', { objectRef: academy }),
        claim('ally-garrison', linZhao, '结盟', { objectRef: garrison }),
        claim('north-rumor', city, '北门状态', { literal: '北门已封' }),
        claim('north-truth', city, '北门状态', { literal: '北门仍开' }),
        claim('branch-rumor', city, '北门状态', { literal: '北门只准商队通行' }, alternative),
        claim('visit-a', linZhao, '到访', { objectRef: academy, occurrenceId: 'visit-morning' }),
        claim('visit-b', linZhao, '到访', { objectRef: academy, occurrenceId: 'visit-evening' })
      ]) await appendClaim(row)
      const version = (id, key, claimId, seq, span) => ({
        id, scopeKey: main, factKey: key, claimId, recordedSeq: seq, validInterval: span, invalidatedSeq: null
      })
      await db.factVersions.bulkAdd([
        version('a1', 'alliance-1', 'ally-academy', 1, interval(1)),
        version('g1', 'alliance-2', 'ally-garrison', 2, interval(1)),
        version('truth', 'gate-state', 'north-truth', 3, interval(0)),
        version('v1', 'morning-visit', 'visit-a', 4, interval(5, 6)),
        version('v2', 'evening-visit', 'visit-b', 5, interval(5, 6))
      ])
      const heard = { kind: 'known', channel: 'heard' }
      await appendKnowledge(main, linZhao, 'north-rumor', 3, 6, { ...heard, belief: 'active' })
      await appendKnowledge(main, linZhao, 'north-rumor', 7, 7, { kind: 'belief', belief: 'disproved' })
      await appendKnowledge(main, linZhao, 'north-rumor', 5, 8, { kind: 'belief', belief: 'disputed' })
      await appendKnowledge(alternative, linZhao, 'branch-rumor', 3, 1, { ...heard, belief: 'active' })
      // At revision 9 the author dates only the academy alliance one beat later.
      await db.transaction('rw', db.factVersions, async () => {
        await db.factVersions.update('a1', { invalidatedSeq: 9 })
        await db.factVersions.add({ ...version('a2', 'alliance-1', 'ally-academy', 9, interval(2)), supersedes: 'a1' })
      })
      const duplicate = await failure(() => appendClaim(claim('north-rumor', city, '北门状态', { literal: '改写谣言' })))
      const wrongType = await failure(() => appendClaim(claim('two-values', linZhao, '结盟', { objectRef: academy, literal: '甲' })))
      const cross = await failure(() => appendKnowledge(main, bystander, 'branch-rumor', 3, 10, heard))
      await appendKnowledge(main, undatedWitness, 'north-truth', null, 11, heard)
      await appendKnowledge(main, listener, 'north-rumor', 3, 13, heard)
      const facts = await objectiveAt(5, 9)
      const allies = rows => rows.filter(([p]) => p === '结盟').map(([, target]) => target).sort()
      return {
        alliesAtOneBefore: allies(await objectiveAt(1, 8)), alliesAtOneAfter: allies(await objectiveAt(1, 9)),
        alliesAtFive: allies(facts), visits: facts.filter(([p]) => p === '到访').map(([, , id]) => id).sort(),
        visitsAtSix: (await objectiveAt(6, 9)).filter(([p]) => p === '到访'),
        unknownEnd: atBeat({ ...interval(1), endSemantic: 'unknown' }, point(5)),
        zeroStart: atBeat(interval(0), point(0)), missingStart: atBeat({ ...interval(0), start: null }, point(5)),
        otherTimeline: atBeat(interval(0), { ...point(0), timelineId: '另一历法' }), reader: await disclosureExamples(),
        trueGate: facts.filter(([p]) => p === '北门状态'), unknownBeforeHearing: await characterAt(main, linZhao, 2, 9),
        beforeBackfill: await characterAt(main, linZhao, 5, 7), afterBackfill: await characterAt(main, linZhao, 5, 9),
        earlyReplay: await characterAt(main, linZhao, 4, 9), afterRebuttal: await characterAt(main, linZhao, 7, 9),
        stranger: await characterAt(main, bystander, 5, 13), listener: await characterAt(main, listener, 5, 13),
        undated: await characterAt(main, undatedWitness, 5, 13),
        otherBranch: await characterAt(alternative, linZhao, 5, 1),
        duplicate: duplicate?.[0], wrongType: wrongType?.[1], cross: cross?.[1],
        crossWasStored: Boolean(await db.knowledgeEvents.get(main + '/10'))
      }
    } finally { await db.delete() }
  }, { main: scopeKey('正线'), alternative: scopeKey('假设线'), otherBook: scopeKey('正线', '另一部书'), factVersions: LEDGER_V4_TABLES.factVersions })
  const bothAllies = ['临川守军', '白鹿书院'].sort()
  const unrevealed = { status: 'ok', items: [] }
  const revealed = { status: 'ok', items: [['北门仍开', 'narrator-assertion']] }
  const unknown = { status: 'unknown', items: [] }
  const heardRumor = belief => [{ claim: '北门已封', channel: 'heard', belief }]
  assert.deepEqual(actual, {
    alliesAtOneBefore: bothAllies, alliesAtOneAfter: ['临川守军'], alliesAtFive: bothAllies,
    visits: ['visit-evening', 'visit-morning'], visitsAtSix: [], unknownEnd: 'unknown', trueGate: [['北门状态', '北门仍开', null]],
    zeroStart: 'inside', missingStart: 'unknown', otherTimeline: 'unknown',
    reader: {
      beforeChapter: unrevealed, beforeUnit: unrevealed, endOfReveal: revealed, laterUnit: revealed,
      flashback: { reader: revealed, linZhao: heardRumor('disputed') }, oldRecordCut: unrevealed,
      staleText: unknown, rewrittenReveal: unknown, staleCursor: unknown, staleAnchor: unknown, missingUnit: unknown,
      wrongBook: unknown, isolatedBook: unrevealed, isolatedBranch: unrevealed
    },
    unknownBeforeHearing: [], beforeBackfill: heardRumor('active'), afterBackfill: heardRumor('disputed'),
    earlyReplay: heardRumor('active'), afterRebuttal: heardRumor('disproved'),
    stranger: [], listener: heardRumor(null), undated: [],
    otherBranch: [{ claim: '北门只准商队通行', channel: 'heard', belief: 'active' }], duplicate: 'ConstraintError',
    wrongType: 'invalid-claim-object', cross: 'claim-scope-mismatch', crossWasStored: false
  })
  process.stdout.write('PASS world-model design examples: allies, visits, author revisions, backfilled beliefs, reader disclosures in a flashback, branch and perspective isolation\n')
} finally { await browser.close() }
