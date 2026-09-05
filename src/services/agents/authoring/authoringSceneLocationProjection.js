import { buildPlaceEntityIndex, resolvePlaceEntity } from '../../worldHistory/placeEntity.js'

const MAP_STATUSES = new Set(['unbound', 'candidate', 'confirmed', 'conflict', 'stale'])

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function normalizeSourceEntryId(location = {}) {
  const ref = (Array.isArray(location.sourceRefs) ? location.sourceRefs : [])
    .map(text)
    .find((item) => item.startsWith('worldbook-entry:'))
  if (ref) return text(ref.slice('worldbook-entry:'.length))
  return text(location.entryId || location.id)
}

function normalizeMapStatus(binding = {}) {
  const status = text(binding.status).toLowerCase()
  return MAP_STATUSES.has(status) ? status : 'unbound'
}

function collectAdjacentNames(entry = {}) {
  const place = entry?.metadata?.place || {}
  const relations = [
    ...(Array.isArray(place.relations) ? place.relations : []),
    ...(Array.isArray(entry.relations) ? entry.relations : []),
    ...(Array.isArray(entry.placeRelations) ? entry.placeRelations : [])
  ]
  const result = []
  const seen = new Set()
  for (const relation of relations) {
    const kind = text(relation?.type || relation?.kind).toLowerCase()
    if (!['adjacent', 'neighbor', 'route', 'connected'].includes(kind)) continue
    const name = firstText(relation?.targetName, relation?.name, relation?.label)
    const key = name.toLocaleLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    result.push(name)
    if (result.length >= 2) break
  }
  return result
}

function resolvePlaceEntityForEntry(worldbook, entry, binding) {
  const index = buildPlaceEntityIndex(worldbook || {})
  const targets = [
    binding?.identity?.placeId,
    binding?.placeId,
    entry?.metadata?.place?.placeId,
    entry?.name
  ]
  for (const target of targets) {
    const entity = resolvePlaceEntity(index, target)
    if (entity) return entity
  }
  return null
}

/**
 * F1-0 read-only bridge. It projects an Authoring scene location into a
 * canonical worldbook source and an existing map route. It never creates or
 * repairs bindings and intentionally exposes no coordinates.
 */
export function buildAuthoringSceneLocationProjection({
  projectId = '',
  chapterId = '',
  writingUnitId = '',
  worldbook = null,
  location = null
} = {}) {
  const entryId = normalizeSourceEntryId(location || {})
  const worldbookId = text(worldbook?.id)
  const base = {
    kind: 'authoring-scene-location-projection',
    version: 1,
    projectId: text(projectId),
    chapterId: text(chapterId),
    writingUnitId: text(writingUnitId),
    worldbookId,
    entryId,
    sourceRef: entryId ? `worldbook-entry:${entryId}` : '',
    availability: 'missing',
    name: text(location?.name),
    worldbookName: text(worldbook?.name),
    mapStatus: 'unbound',
    mapStatusLabel: '未落图',
    mapName: '',
    region: text(location?.region),
    adjacentNames: [],
    placeId: '',
    mapAssetId: '',
    canOpenWorldbook: false,
    canOpenMap: false,
    worldbookRoute: null,
    mapRoute: null
  }
  if (!worldbookId || !entryId) return Object.freeze(base)

  const entry = (Array.isArray(worldbook?.entries) ? worldbook.entries : [])
    .find((candidate) => text(candidate?.id) === entryId && text(candidate?.type) === 'location')
  if (!entry) return Object.freeze({ ...base, availability: 'entry-missing' })

  const place = entry?.metadata?.place || {}
  const binding = entry?.mapBinding || place?.mapBinding || {}
  const mapStatus = normalizeMapStatus(binding)
  const entity = resolvePlaceEntityForEntry(worldbook, entry, binding)
  const latestNode = entity?.latestHistoryNode || null
  const placeId = firstText(
    binding?.identity?.placeId,
    binding?.placeId,
    place?.placeId,
    entity?.placeId
  )
  const mapAssetId = firstText(binding?.object?.mapAssetId, binding?.mapAssetId)
  const mapName = firstText(
    binding?.mapName,
    binding?.object?.mapName,
    worldbook?.geoHistory?.mapName,
    worldbook?.geoHistory?.name
  )
  const region = firstText(
    location?.region,
    place?.parentRef?.targetName,
    entry?.parentRef?.targetName,
    entry?.parentName,
    entry?.region,
    binding?.region,
    binding?.city,
    binding?.country,
    latestNode?.mapBinding?.city,
    latestNode?.mapBinding?.country
  )
  const statusLabels = {
    confirmed: '已落图',
    candidate: '待确认落点',
    conflict: '地图绑定需核对',
    stale: '地图绑定已过期',
    unbound: '未落图'
  }
  const routeQuery = {
    bookId: text(projectId),
    worldbookId,
    entryId,
    ...(placeId ? { placeId } : {}),
    ...(mapAssetId ? { mapAssetId } : {})
  }

  return Object.freeze({
    ...base,
    availability: 'ready',
    name: firstText(entry.name, location?.name, entryId),
    mapStatus,
    mapStatusLabel: statusLabels[mapStatus],
    mapName,
    region,
    adjacentNames: Object.freeze(collectAdjacentNames(entry)),
    placeId,
    mapAssetId,
    canOpenWorldbook: true,
    canOpenMap: true,
    worldbookRoute: Object.freeze({
      name: 'settings-worldbook-advanced',
      query: Object.freeze({ worldbookId, entryId })
    }),
    mapRoute: Object.freeze({
      name: 'settings-world-map',
      query: Object.freeze(routeQuery)
    })
  })
}

export default buildAuthoringSceneLocationProjection
