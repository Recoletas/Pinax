import { getChapterDocument, getNodePlainText } from '../writing/writingDocumentSchema.js'
import { normalizeSceneAnchors, resolveActiveSceneAnchor } from '../agents/authoring/authoringSceneAnchors.js'
import { buildAuthoringSceneLocationProjection } from '../agents/authoring/authoringSceneLocationProjection.js'

const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
const list = value => Array.isArray(value) ? value : []

// Read existing owners; narrative order is not a global story clock. Neither
// literal mentions nor the last appearance establishes someone's current place.
export function settingContext({ book, worldbook, entry, chapterId = '' } = {}) {
  const empty = { scenes: [], history: [], chapter: null, chapterScene: null, location: null }
  if (!book || !worldbook?.id || !entry?.id || text(book.worldbookId) !== text(worldbook.id)
    || !list(worldbook.entries).some(item => text(item?.id) === text(entry.id))) return empty
  const id = text(entry.id)
  const byId = new Map(list(worldbook.entries).filter(item => item?.id).map(item => [text(item.id), item]))
  const scenes = []
  let chapterScene = null, selectedChapter = null
  for (const chapter of list(book.chapters).filter(item => item?.id)) {
    const document = getChapterDocument(chapter)
    const units = list(document?.content)
    const order = units.map(unit => text(unit.attrs?.unitId)).filter(Boolean)
    const anchors = normalizeSceneAnchors(chapter.sceneAnchors).filter(anchor =>
      !anchor.status && anchor.worldbookId === text(worldbook.id) && order.includes(anchor.unitId)).sort((a, b) => order.indexOf(a.unitId) - order.indexOf(b.unitId))
    const toScene = anchor => {
      if (!anchor) return null
      const location = byId.get(anchor.locationId)
      const node = units.find(unit => text(unit.attrs?.unitId) === anchor.unitId)?.content?.find(item => getNodePlainText(item).trim())
      const term = getNodePlainText(node).slice(0, 120)
      return {
        id: `${chapter.id}:${anchor.id}`, chapterId: text(chapter.id), chapterTitle: chapter.title || '未命名章节',
        unitId: anchor.unitId, nodeId: node?.attrs?.nodeId || '', start: 0, end: term.length, term,
        time: anchor.time.label, location: location?.type === 'location' ? location : null,
        people: anchor.presentCharacterIds.map(personId => byId.get(personId)).filter(person => person?.type === 'character'),
        planned: anchor.plannedCharacterIds.map(personId => byId.get(personId)).filter(person => person?.type === 'character')
      }
    }
    for (const anchor of anchors) {
      if (entry.type === 'character' ? anchor.presentCharacterIds.includes(id) : entry.type === 'location' && anchor.locationId === id) scenes.push(toScene(anchor))
    }
    if (text(chapter.id) === text(chapterId)) {
      selectedChapter = { id: text(chapter.id), title: chapter.title || '未命名章节' }
      // Preserve the resolver's stale/mismatched-anchor rules. Do not filter
      // invalid anchors before resolving, which could revive an earlier scene.
      chapterScene = toScene(resolveActiveSceneAnchor({ anchors: chapter.sceneAnchors, unitOrder: order,
        activeUnitId: order.at(-1), worldbookId: text(worldbook.id) }).anchor)
    }
  }
  const placeId = text(entry.mapBinding?.identity?.placeId || entry.mapBinding?.placeId || entry.metadata?.place?.placeId)
  const history = list(worldbook.geoHistory?.nodes).filter(node => node?.id).filter(node => {
    const scopedWorld = text(node.placeRef?.worldbookId || node.mapBinding?.worldbookId)
    if (scopedWorld && scopedWorld !== text(worldbook.id)) return false
    return list(node.entryIds).map(text).includes(id) || entry.type === 'location' && placeId
      && text(node.placeRef?.placeId || node.placeId || node.mapBinding?.placeId) === placeId
  }).map(node => ({ id: text(node.id), title: text(node.title || node.name || node.summary || node.description).slice(0, 100),
    summary: text(node.summary || node.description || node.openingHook), time: text(node.yearLabel || node.timeLabel || node.era),
    placeId: text(node.placeRef?.placeId || node.placeId || node.mapBinding?.placeId) })).filter(node => node.id)
  const location = entry.type === 'location' ? buildAuthoringSceneLocationProjection({ projectId: text(book.id),
    chapterId: text(chapterId), worldbook, location: { id, name: entry.name } }) : null
  return { scenes, history, chapter: selectedChapter, chapterScene, location }
}
