import { findWorldOppositions } from '@pinax/core/memory/ledger/worldClaims'
import { loadCalendarAt, normalizeStoryClock } from '@pinax/core/memory/ledger/worldCalendars'
import { indexEdition, loadEdition, editionScope } from '@pinax/core/memory/ledger/manuscriptEdition'
import { createWorldManuscriptModule } from '@pinax/core/memory/ledger/worldManuscript'
import { sha256HexOfText } from '../../contentHash'
import { withWritingBooksLock } from '../../storage/writingBooksLock'
import { loadWritingBooksSnapshot } from '../../writing/writingBooksRepository'
import { getChapterDocument, createWritingDocument, getNodePlainText } from '../../writing/writingDocumentSchema'
import { buildManuscriptPositionIndex } from '../../writing/manuscriptPositionIndex'
import { ledgerId } from './ledgerContract'
import { setWorldPeriodEnd, withdrawKnowledgeEvent, inheritWorldForkActor, listWorldStatements, saveWorldStatement as recordStatement, correctFact, recordOppositeClaim, moveWorldStart, endWorldPeriod, confirmWorldClaim as confirmClaim, defineWorldCalendar as recordCalendar, listWorldCalendars, runWorldCommand } from './factLedger'
import { worldbookEntityKey } from '../../project/knowledgeReadModel/identity'
import { readWorldbookSnapshot } from '../../../stores/worldStore'
import { readCharacterKnowledge, recordKnowledgeEvent } from './knowledgeLedger'
import { queryFacts } from './queryFacts'
import { storyTimeMatch } from '@pinax/core/memory/ledger/storyInterval'

export { listWorldStatements, listWorldCalendars }
export function defineWorldCalendar(db, input) {
  if (input.scope?.domain !== 'book') return recordCalendar(db, input)
  return withWritingBooksLock(() => {
    const book = loadWritingBooksSnapshot().find(row => row.id === input.scope.bookId)
    const calendar = input.calendar
    if (book && Array.isArray(calendar?.eras)) {
      const eras = new Set(calendar.eras.map(era => era?.id))
      const usedByScene = book.chapters.some(chapter => chapter.sceneAnchors?.some(anchor => {
        const clock = anchor?.time?.storyClock
        return !anchor?.status && clock?.timelineId === calendar.id && !eras.has(clock.eraId)
      }))
      if (usedByScene) return { ok: false, reason: 'calendar-scene-conflict' }
    }
    return recordCalendar(db, input)
  })
}
export { listWorldEditions, readWorldEdition } from '@pinax/core/memory/ledger/manuscriptEdition'

const manuscript = createWorldManuscriptModule({ ledgerId, runWorldCommand })
const unknown = () => ({ ok: true, status: 'unknown', items: [] })
const documentFor = chapter => getChapterDocument(chapter) || createWritingDocument(String(chapter?.content ?? ''))

function documentUnits(document) {
  return document.content.map(unit => ({
    unitId: unit.attrs.unitId, text: unit.content.map(getNodePlainText).join('\n')
  })).filter(unit => unit.text.trim())
}

export function worldManuscriptUnits(chapter) {
  return documentUnits(documentFor(chapter))
}

function captureChapters(bookId, chapters) {
  const find = indexEdition(chapters)
  const index = buildManuscriptPositionIndex({ id: bookId, chapters: chapters.map(ch => ({
    id: ch.chapterId, editorDocument: { content: ch.units.map(unit => ({ attrs: { unitId: unit.unitId } })) }
  })) })
  function locate(chapterId, unitId) {
    const match = find(chapterId, unitId)
    if (!match) return null
    return { quote: match.unit.text, manuscriptAnchor: { bookId, chapterId, unitId,
      unitHash: match.unit.unitHash, orderRevision: match.orderRevision } }
  }
  function sameOrder(source, current) {
    return current && (source.orderRevision === current.orderRevision || source.orderRevision === index.chapterOrderRevision)
  }
  function relation(cursor, source) {
    if (source.bookId !== bookId) return 'unknown'
    const target = find(cursor.chapterId, cursor.unitId)
    const origin = find(source.chapterId, source.unitId)
    if (!target || !origin) return 'unknown'
    return origin.position === target.position ? 'at-target' : origin.position < target.position ? 'before-target' : 'after-target'
  }
  function position(cursor, source) {
    const order = relation(cursor, source)
    const current = locate(source.chapterId, source.unitId)?.manuscriptAnchor
    if (!sameOrder(source, current)) return 'unknown'
    return order === 'after-target' || source.unitHash === current.unitHash ? order : 'unknown'
  }
  function matches(source) {
    const current = locate(source.chapterId, source.unitId)?.manuscriptAnchor
    return current?.bookId === source.bookId && sameOrder(source, current) && current.unitHash === source.unitHash
  }
  return { chapters, locate, relation, position, matches }
}

function captureBook(book) {
  return captureChapters(book.id, book.chapters.map(chapter => ({
    chapterId: chapter.id, title: chapter.title || '', units: documentUnits(documentFor(chapter)).map(unit => ({
      ...unit, get unitHash() { return sha256HexOfText(unit.text) }
    }))
  })))
}

function resolveCursor({ scope, book, chapterId, unitId }) {
  if (!book?.id || scope?.bookId !== book.id) return null
  const current = loadWritingBooksSnapshot().find(row => row.id === book.id)
  if (!current) return null
  const snapshot = captureBook(current)
  const cursor = snapshot.locate(chapterId, unitId)
  if (!cursor) return null
  if (current !== book) {
    const prior = captureBook(book).locate(chapterId, unitId)?.manuscriptAnchor
    if (prior?.orderRevision !== cursor.manuscriptAnchor.orderRevision || prior?.unitHash !== cursor.manuscriptAnchor.unitHash) return null
  }
  return { snapshot, cursor }
}

// Resolve a displayed character against the owning book at write time. Freeze
// their name in the disclosure so a later rename preserves the original credit.
function resolveDisclosureSpeaker(input) {
  if (!Object.hasOwn(input, 'disclosureSpeakerKey')) return { input }
  const current = loadWritingBooksSnapshot().find(row => row.id === input.scope?.bookId)
  if (!current || (current.worldbookId || null) !== input.expectedWorldbookId) return { error: 'worldbook-binding-changed' }
  const key = input.disclosureSpeakerKey
  if (!key) return { input: { ...input, speaker: null } }
  const person = readWorldbookSnapshot(current.worldbookId)?.entries?.find(row => row.type === 'character' && worldbookEntityKey(current.worldbookId, row.id) === key)
  return person ? { input: { ...input, speaker: { entityRef: key, label: person.name || person.id } } } : { error: 'worldbook-entity-changed' }
}

function writeLink(db, input) {
  return withWritingBooksLock(() => {
    const speaker = resolveDisclosureSpeaker(input)
    if (speaker.error) return { ok: false, reason: speaker.error }
    input = speaker.input
    const context = resolveCursor(input)
    if (!context) return { ok: false, reason: 'manuscript-changed' }
    if (input.beliefUse && Object.hasOwn(input, 'expectedWorldbookId')) {
      const book = loadWritingBooksSnapshot().find(item => item.id === input.scope.bookId)
      if (!book?.worldbookId || book.worldbookId !== input.expectedWorldbookId) return { ok: false, reason: 'worldbook-binding-changed' }
      const person = readWorldbookSnapshot(book.worldbookId)?.entries?.find(row => row.type === 'character' &&
        worldbookEntityKey(book.worldbookId, row.id) === input.beliefUse.actorKey)
      if (!person) return { ok: false, reason: 'worldbook-entity-changed' }
      input = { ...input, beliefUse: { ...input.beliefUse, actorLabel: person.name || person.id } }
    }
    const end = input.rangeEndPosition && resolveCursor({ scope: input.scope, book: input.book,
      chapterId: input.rangeEndPosition.chapterId, unitId: input.rangeEndPosition.unitId })
    if (input.rangeEndPosition && !end) return { ok: false, reason: 'manuscript-changed' }
    return manuscript.recordManuscriptLink(db, { ...input, ...context.cursor, ...(end ? { rangeEnd: end.cursor } : {}), editionChapters: context.snapshot.chapters })
  })
}

export const saveWorldManuscriptLink = (db, input) => writeLink(db, { ...input, useId: null })
export const reviewWorldUse = (db, input) => input.useId ? writeLink(db, input) : { ok: false, reason: 'manuscript-use-invalid' }

function readManuscript(db, input, method) {
  async function query(snapshot) {
    const current = snapshot?.locate(input.chapterId, input.unitId)?.manuscriptAnchor
    if (!current) return unknown()
    const bookId = input.scope.bookId
    const sources = new Map()
    async function positionOf(source, sourceEditionId) {
      const position = snapshot.position(input, source)
      if (position !== 'unknown' || !sourceEditionId || source.bookId !== bookId) return position
      const relation = snapshot.relation(input, source)
      if (relation === 'before-target' || relation === 'at-target') return 'unknown'
      if (!sources.has(sourceEditionId)) {
        const edition = await loadEdition(db, editionScope(input.scope), sourceEditionId)
        sources.set(sourceEditionId, edition && captureChapters(bookId, edition.chapters))
      }
      const original = sources.get(sourceEditionId)
      const prior = original?.locate(input.chapterId, input.unitId)?.manuscriptAnchor
      return prior?.orderRevision === current.orderRevision && original.position(input, source) === 'after-target' ? 'after-target' : 'unknown'
    }
    function rangePosition(start, end) {
      const from = snapshot.relation(input, start), to = snapshot.relation(input, end)
      const inside = ['before-target', 'at-target'].includes(from) && ['after-target', 'at-target'].includes(to)
      if (!inside && from !== 'at-target' && to !== 'at-target') return 'outside'
      return inside && snapshot.matches(start) && snapshot.matches(end) ? 'at-target' : 'unknown'
    }
    return method(db, { ...input, bookId, positionOf, rangePosition })
  }
  if (input.editionId) {
    const stores = method === manuscript.readReader ? ['disclosures', 'evidenceSnapshots'] : ['claimUses', 'knowledgeEvents', 'factDecisions']
    return db.transaction('r', ['manuscriptEditions', 'manuscriptChapterRevisions', 'worldClaims', 'factVersions', ...stores], async () => {
      const scopeKey = editionScope(input.scope)
      if (!scopeKey || input.book?.id !== input.scope.bookId) return unknown()
      const edition = await loadEdition(db, scopeKey, input.editionId)
      if (!edition || (input.recordedSeq != null && input.recordedSeq < edition.recordedSeq)) return unknown()
      return query(captureChapters(input.scope.bookId, edition.chapters))
    })
  }
  return withWritingBooksLock(() => query(resolveCursor(input)?.snapshot))
}

export const readWorldReader = (db, input) => readManuscript(db, input, manuscript.readReader)
export const listWorldUses = (db, input) => readManuscript(db, input, manuscript.readUses)
// The picker supplies the binding it actually displayed. Imported historical
// claims can still use the ledger's original opaque identifiers.
function writeForBinding(db, input, actor, write) {
  const checkBinding = Object.hasOwn(input, 'expectedWorldbookId')
  if (!checkBinding && !(actor && (input.originPosition || input.speakerKey))) {
    return input.factPosition ? withWritingBooksLock(() => withFactPassage(db, input, write)) : write(db, input)
  }
  return withWritingBooksLock(() => {
    const book = loadWritingBooksSnapshot().find(item => item.id === input.scope?.bookId)
    if (!book || (checkBinding && (book.worldbookId || null) !== (input.expectedWorldbookId || null))) return { ok: false, reason: 'worldbook-binding-changed' }
    const library = book.worldbookId && readWorldbookSnapshot(book.worldbookId)
    const entries = (library?.entries || []).filter(row => !actor || row.type === 'character')
    const keys = new Set(entries.map(row => worldbookEntityKey(book.worldbookId, row.id)))
    const valid = actor ? (!checkBinding || keys.has(input.actorKey)) : (input.subjectKey === 'book:' + book.id || keys.has(input.subjectKey)) && (!input.objectRef || keys.has(input.objectRef))
    let payload = input
    if (actor && Object.hasOwn(input, 'speakerKey')) {
      const speaker = entries.find(row => worldbookEntityKey(book.worldbookId, row.id) === input.speakerKey)
      if (input.speakerKey && !speaker) return { ok: false, reason: 'worldbook-entity-changed' }
      payload = { ...payload, speaker: speaker ? { entityRef: input.speakerKey, label: speaker.name || speaker.id } : null }
    }
    if (actor && Object.hasOwn(input, 'originPosition')) {
      const context = input.originPosition && resolveCursor({ scope: input.scope, book: input.book, chapterId: input.originPosition.chapterId, unitId: input.originPosition.unitId })
      if (input.originPosition && !context) return { ok: false, reason: 'manuscript-changed' }
      payload = { ...payload, passage: context?.cursor ?? null }
    }
    if (input.eventContext) {
      const locations = new Set(entries.filter(entry => entry.type === 'location').map(entry => worldbookEntityKey(book.worldbookId, entry.id)))
      const { participants = [], placeRefs = [] } = input.eventContext
      if (!Array.isArray(participants) || !Array.isArray(placeRefs) ||
          !participants.every(row => keys.has(row?.entityRef)) || !placeRefs.every(key => locations.has(key))) {
        return { ok: false, reason: 'worldbook-entity-changed' }
      }
      const names = new Map(entries.map(entry => [worldbookEntityKey(book.worldbookId, entry.id), entry.name || entry.id]))
      const refs = new Set([...placeRefs, ...participants.map(row => row.entityRef)])
      payload = { ...payload, eventLabels: [...refs].sort().map(entityRef => ({ entityRef, label: names.get(entityRef) })) }
    }
    if (valid && input.factPosition) return withFactPassage(db, payload, write)
    return valid ? write(db, payload) : { ok: false, reason: 'worldbook-entity-changed' }
  })
}
export const withdrawWorldKnowledge = (db, input) => writeForBinding(db, input, true, withdrawKnowledgeEvent)
export const inheritWorldCharacter = (db, input) => writeForBinding(db, input, true, inheritWorldForkActor)
export const saveWorldKnowledge = (db, input) => writeForBinding(db, input, true, recordKnowledgeEvent)
export const saveWorldStatement = (db, input) => writeForBinding(db, input, false, recordStatement)

function withFactPassage(db, input, command) {
  const context = resolveCursor({ scope: input.scope, book: input.book, chapterId: input.factPosition.chapterId, unitId: input.factPosition.unitId })
  return context ? command(db, { ...input, factPassage: context.cursor }) : { ok: false, reason: 'manuscript-changed' }
}

function writeForBook(db, input, command) {
  const checkBinding = Object.hasOwn(input, 'expectedWorldbookId')
  if (!checkBinding && !input.factPosition) return command(db, input)
  return withWritingBooksLock(() => {
    const book = loadWritingBooksSnapshot().find(row => row.id === input.scope?.bookId)
    if (!book || (checkBinding && (book.worldbookId || null) !== input.expectedWorldbookId)) return { ok: false, reason: 'worldbook-binding-changed' }
    return input.factPosition ? withFactPassage(db, input, command) : command(db, input)
  })
}

export const confirmWorldClaim = (db, input) => writeForBook(db, input, confirmClaim)
export const reviseWorldPeriodEnd = (db, input) => writeForBook(db, input, setWorldPeriodEnd)
export const closeWorldPeriod = (db, input) => writeForBook(db, input, endWorldPeriod)
export const saveWorldOpposite = (db, input) => writeForBook(db, input, recordOppositeClaim)

export const correctWorldEvent = (db, input) => {
  if (!input.expectedHead || !Object.hasOwn(input, 'eventContext')) return { ok: false, reason: 'fact-version-changed' }
  return writeForBinding(db, input, false, correctFact)
}

export const correctWorldDate = (db, input) => writeForBook(db, input, moveWorldStart)

function withAnchorSnapshot(db, input, method) {
  return withWritingBooksLock(() => {
    const book = input.scope?.bookId === input.book?.id && loadWritingBooksSnapshot().find(row => row.id === input.book.id)
    if (!book) return { ok: false, reason: 'manuscript-scope-mismatch' }
    const speaker = resolveDisclosureSpeaker(input)
    if (speaker.error) return { ok: false, reason: speaker.error }
    return method(db, { ...speaker.input, bookId: book.id, matches: captureBook(book).matches })
  })
}

export const relocateWorldDisclosure = (db, input) => withWritingBooksLock(() => {
  const current = loadWritingBooksSnapshot().find(row => row.id === input.scope?.bookId)
  if (!current || (Object.hasOwn(input, 'expectedWorldbookId') && (current.worldbookId || null) !== input.expectedWorldbookId)) return { ok: false, reason: 'worldbook-binding-changed' }
  const context = resolveCursor(input)
  return context ? manuscript.relocateDisclosure(db, { ...input, ...context.cursor, editionChapters: context.snapshot.chapters }) : { ok: false, reason: 'manuscript-changed' }
})
export const withdrawWorldDisclosure = (db, input) => withAnchorSnapshot(db, input, manuscript.withdrawDisclosure)
export const changeWorldDisclosureSpeaker = (db, input) => withAnchorSnapshot(db, input, manuscript.changeDisclosureSpeaker)

export const listWorldBeliefUseIssues = (db, input) => manuscript.listBeliefUseIssues(db, { scope: input.scope, bookId: input.book?.id })
export const retireWorldBeliefUse = (db, input) => manuscript.retireBeliefUse(db, { ...input, bookId: input.book?.id })

export const listWorldAnchorIssues = (db, input) => withAnchorSnapshot(db, input, manuscript.listAnchorIssues)
export const archiveWorldAnchor = (db, input) => withAnchorSnapshot(db, input, manuscript.archiveAnchor)
export const previewWorldFactChange = (db, input) => withAnchorSnapshot(db, input, manuscript.previewFactChange)

export async function readWorldFacts(db, { scope, storyAt = null, storyClock = null, recordedSeq = null, entityRef = null }) {
  if (storyAt !== null && !Number.isSafeInteger(storyAt)) return { ok: false, reason: 'story-time-invalid' }
  if (recordedSeq !== null && (!Number.isSafeInteger(recordedSeq) || recordedSeq < 0)) return { ok: false, reason: 'recorded-as-of-invalid' }
  const clock = normalizeStoryClock(storyClock)
  if (!clock) return { ok: false, reason: 'story-clock-invalid' }
  let timeline
  const point = storyAt === null ? null : { ...clock, ordinal: storyAt, precision: 'moment' }
  const items = []
  let cursor = null
  let unknownTimeCount = 0
  do {
    const page = await queryFacts(db, { scope, recordedAsOf: recordedSeq === null ? null : { seq: recordedSeq }, cursor, limit: 200 })
    if (!page.ok) return page
    if (page.completeness === 'partial-scan-limit') return { ok: false, reason: 'world-query-scan-limit' }
    if (point && !timeline) {
      const scopeKey = editionScope(scope)
      if (!scopeKey) return { ok: false, reason: 'scope-invalid' }
      timeline = await loadCalendarAt(db, scopeKey, clock.timelineId, Math.min(recordedSeq ?? page.snapshotVersion, page.snapshotVersion))
      // Historical proposals may name an era without a separately registered calendar.
      timeline ??= { id: clock.timelineId, eras: [{ id: clock.eraId, order: 0 }] }
    }
    // Count each visible version once. The query's page lookahead can visit
    // excluded intervals again at the start of the following page.
    for (const item of page.items) {
      if (entityRef !== null && item.subjectKey !== entityRef && item.objectRef !== entityRef &&
          !item.eventContext?.placeRefs.includes(entityRef) && !item.eventContext?.participants.some(person => person.entityRef === entityRef)) continue
      // Closed and backfilled intervals remain visible to dated queries.
      if (point === null && item.supersedesKind) continue
      const { match } = storyTimeMatch(item.validInterval, point, timeline)
      if (match === 'unknown') unknownTimeCount++
      if (match === null || match === 'inside') items.push({ ...item, id: item.factVersionId })
    }
    cursor = page.nextCursor
  } while (cursor)
  if (point) {
    const oppositions = findWorldOppositions(items)
    for (const row of items) if (oppositions.has(row.claimId)) row.oppositeClaimId = oppositions.get(row.claimId)
  }
  return { ok: true, items, unknownTimeCount }
}

export async function listWorldPlaceEvents(db, { scope, placeRef, recordedSeq = null, storyAt = null, storyClock = null }) {
  if (!placeRef) return { ok: true, items: [] }
  if (storyAt !== null && !Number.isSafeInteger(storyAt)) return { ok: false, reason: 'story-time-invalid' }
  const selectedClock = normalizeStoryClock(storyClock)
  if (!selectedClock) return { ok: false, reason: 'story-clock-invalid' }
  const [result, calendars] = await db.transaction('r', ['worldClaims', 'factVersions', 'factDecisions'], () => Promise.all([
    listWorldStatements(db, { scope, placeRef, recordedSeq }), listWorldCalendars(db, { scope, recordedSeq })
  ]))
  if (!calendars.ok) return calendars
  const clocks = new Map(calendars.items.map(calendar => [calendar.id, calendar]))
  if (!result.ok) return result
  const groups = new Map()
  const undated = []
  const point = storyAt === null ? null : { ...selectedClock, ordinal: storyAt, precision: 'moment' }
  const calendar = clocks.get(selectedClock.timelineId)
  if (point && !calendar?.eras.some(era => era.id === selectedClock.eraId)) return { ok: false, reason: 'timeline-era-invalid', calendars: calendars.items }
  let unknownTimeCount = 0
  const facts = result.items.filter(item => {
    if (item.authority !== 'fact' || item.kind !== 'event') return false
    if (!point) return true
    const { match } = storyTimeMatch(item.validInterval, point, calendar)
    if (match === 'unknown' && item.polarity !== 'negative') unknownTimeCount++
    return match === 'inside'
  })
  const oppositions = findWorldOppositions(facts)
  for (const item of facts) {
    if (item.polarity === 'negative') continue
    const row = oppositions.has(item.id) ? { ...item, oppositeClaimId: oppositions.get(item.id) } : item
    const interval = row.validInterval
    if (!interval?.start) { undated.push(row); continue }
    const calendar = clocks.get(interval.timelineId)
    const era = calendar?.eras.find(row => row.id === interval.start.eraId)
    const clock = JSON.stringify([interval.timelineId, interval.start.eraId])
    if (!groups.has(clock)) groups.set(clock, [])
    groups.get(clock).push({ ...row, calendarLabel: calendar?.label, eraLabel: era?.label, endEraLabel: calendar?.eras.find(era => era.id === interval.end?.eraId)?.label, eraOrder: era?.order })
  }
  // Undeclared calendars keep separate era groups without assigning them a chronological order.
  const items = []
  const ordered = [...groups.values()].sort(([a], [b]) => {
    const left = a.validInterval, right = b.validInterval
    if (left.timelineId !== right.timelineId) return left.timelineId < right.timelineId ? -1 : 1
    return (a.eraOrder ?? Infinity) - (b.eraOrder ?? Infinity) || left.start.eraId.localeCompare(right.start.eraId)
  })
  for (const rows of ordered) {
    rows.sort((a, b) => (a.validInterval.start.ordinal ?? Infinity) - (b.validInterval.start.ordinal ?? Infinity) || a.recordedSeq - b.recordedSeq)
    items.push(...rows)
  }
  return { ok: true, calendars: calendars.items, unknownTimeCount, items: items.concat(undated.sort((a, b) => a.recordedSeq - b.recordedSeq)) }
}

export const listWorldEventPassages = (db, input) => listPassages(db, input, manuscript.listEventPassages)
export const listWorldFactPassages = (db, input) => listPassages(db, input, manuscript.listFactPassages)

function passageTarget(book, chapter, snapshot, row) {
  const unit = chapter && documentFor(chapter).content.find(unit => unit.attrs.unitId === row.manuscriptAnchor.unitId)
  const node = unit?.content.find(item => getNodePlainText(item).trim())
  const matchText = node && getNodePlainText(node).slice(0, 120)
  const matches = row.kind === 'fact-source' ? snapshot.locate(row.chapterId, row.manuscriptAnchor.unitId)?.manuscriptAnchor.unitHash === row.manuscriptAnchor.unitHash : snapshot.matches(row.manuscriptAnchor)
  return node && row.quote && matches ? {
    type: 'chapter', bookId: book.id, id: row.chapterId, nodeId: node.attrs.nodeId, start: 0, end: matchText.length, matchText
  } : null
}

export function currentWorldPassageTarget({ bookId, worldbookId }, row) {
  if (!row) return null
  const book = loadWritingBooksSnapshot().find(item => item.id === bookId)
  if (!book || book.worldbookId !== worldbookId) return null
  const chapter = book.chapters.find(item => item.id === row.chapterId)
  return passageTarget(book, chapter, captureBook(book), row)
}

async function listPassages(db, { scope, book, factVersionId, worldbookId, recordedSeq = null }, method) {
  if (!book?.id || scope?.bookId !== book.id || book.worldbookId !== worldbookId) return { ok: false, reason: 'worldbook-binding-changed' }
  const result = await method(db, { scope, bookId: book.id, factVersionId, recordedSeq })
  if (!result.ok) return result
  const snapshot = captureBook(book)
  const chapterOrder = new Map(book.chapters.map((ch, index) => [ch.id, index]))
  const items = result.items.map(row => {
    const chapter = book.chapters[chapterOrder.get(row.chapterId)]
    const target = passageTarget(book, chapter, snapshot, row)
    return { ...row, chapterTitle: chapter?.title || '', target }
  })
  items.sort((a, b) => {
    const order = (chapterOrder.get(a.chapterId) ?? Infinity) - (chapterOrder.get(b.chapterId) ?? Infinity)
    if (order) return order
    const relation = snapshot.relation(a.manuscriptAnchor, b.manuscriptAnchor)
    return relation === 'after-target' ? -1 : relation === 'before-target' ? 1 : a.id.localeCompare(b.id)
  })
  return { ok: true, items }
}

export async function readWorldPerspective(db, { scope, actorKey, storyAt, recordedSeq, storyClock }) {
  const result = await readCharacterKnowledge(db, { scope, actorKeys: [actorKey], storyAt, storyClock,
    recordedAsOf: recordedSeq == null ? null : { seq: recordedSeq }, includeInactive: true, includePassages: true })
  if (!result.ok) return result
  if (result.incomplete) return unknown()
  const rows = result.actors[actorKey]?.facts || []
  return { ok: true, dateUnknown: Boolean(result.actors[actorKey]?.excluded?.['knowledge-date-unknown']), incomparable: Boolean(result.actors[actorKey]?.excluded?.['calendar-incomparable']), items: rows.map(row => ({ ...row.claim, id: row.claimId || row.factVersionId, channel: row.lastKnownVia ?? row.knownVia, belief: row.belief, speaker: row.lastSpeaker, history: row.history })) }
}
