import { buildPlaceRef } from './placeRefs'

const PLACE_REF_FIELDS = ['worldbookId', 'mapId', 'siteId', 'name', 'semanticType', 'cellIds', 'markerIds', 'routeIds']

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeIdList(value) {
  return Array.isArray(value)
    ? value.filter((item) => item !== null && item !== undefined)
    : []
}

function readGeoHistory(source = {}) {
  if (source?.geoHistory != null) return source.geoHistory
  if (source?.worldbook?.geoHistory != null) return source.worldbook.geoHistory
  return source?.nodes || source?.placeRefs ? source : null
}

function readWorldbook(source = {}) {
  if (source?.worldbook && typeof source.worldbook === 'object') return source.worldbook
  if (Array.isArray(source?.entries)) return source
  return null
}

function normalizePlaceRef(raw, { worldbookId = '', mapId = '' } = {}) {
  if (!raw || typeof raw !== 'object') return null
  const directPlaceId = normalizeText(raw.placeId)
  if (directPlaceId) {
    const ref = { placeId: directPlaceId }
    for (const field of PLACE_REF_FIELDS) {
      if (field === 'placeId') continue
      const value = Array.isArray(raw[field])
        ? normalizeIdList(raw[field])
        : normalizeText(raw[field])
      if (Array.isArray(value) ? value.length : value) ref[field] = value
    }
    return ref
  }

  const siteId = normalizeText(raw.siteId || raw.mapBinding?.siteId || raw.id)
  if (!siteId) return null
  return buildPlaceRef({
    worldbookId,
    mapId,
    site: {
      ...raw,
      id: siteId,
      title: raw.name || raw.title || raw.mapBinding?.scene || raw.mapBinding?.city,
      type: raw.semanticType || raw.type || raw.mapBinding?.semanticType,
      cellIds: raw.cellIds || raw.mapBinding?.cellIds,
      markerIds: raw.markerIds || raw.mapBinding?.markerIds,
      routeIds: raw.routeIds || raw.mapBinding?.routeIds
    }
  })
}

function addUnique(list, seen, value) {
  const normalized = normalizeText(value)
  if (!normalized || seen.has(normalized.toLowerCase())) return
  seen.add(normalized.toLowerCase())
  list.push(normalized)
}

function addRefToEntity(entity, ref) {
  if (!ref) return
  for (const field of ['worldbookId', 'mapId', 'siteId', 'name', 'semanticType']) {
    if (!entity.ref[field] && ref[field]) entity.ref[field] = ref[field]
  }
  for (const field of ['cellIds', 'markerIds', 'routeIds']) {
    const values = normalizeIdList(ref[field])
    const seen = new Set(entity.ref[field] || [])
    entity.ref[field] = [...(entity.ref[field] || []), ...values.filter((value) => !seen.has(value))]
  }
  addUnique(entity.aliases, entity.aliasesSeen, ref.name)
  addUnique(entity.aliases, entity.aliasesSeen, ref.siteId)
}

function createEntity(ref) {
  return {
    placeId: ref.placeId,
    ref: { ...ref },
    name: normalizeText(ref.name),
    semanticType: normalizeText(ref.semanticType),
    aliases: [],
    aliasesSeen: new Set(),
    historyNodes: [],
    historyNodeIds: [],
    entryIds: [],
    entryIdsSeen: new Set()
  }
}

function finalizeEntity(entity, entriesById) {
  const { aliasesSeen, entryIdsSeen, ...publicEntity } = entity
  publicEntity.entries = publicEntity.entryIds
    .map((entryId) => entriesById.get(entryId))
    .filter(Boolean)
  publicEntity.latestHistoryNode = publicEntity.historyNodes[publicEntity.historyNodes.length - 1] || null
  return publicEntity
}

/**
 * Build the canonical PlaceEntity index for a worldbook.
 * A place is keyed by placeId, while history nodes and worldbook entries keep
 * their own storage ownership and are only referenced here.
 */
export function buildPlaceEntityIndex(source = {}) {
  const worldbook = readWorldbook(source)
  const geoHistory = readGeoHistory(source)
  const worldbookId = normalizeText(source?.worldbookId || worldbook?.id)
  const mapId = normalizeText(source?.mapId || geoHistory?.mapId)
  const entriesById = new Map(
    (Array.isArray(worldbook?.entries) ? worldbook.entries : [])
      .filter((entry) => entry?.id)
      .map((entry) => [String(entry.id), entry])
  )
  const entitiesById = new Map()

  function ensureEntity(ref) {
    if (!ref?.placeId) return null
    if (!entitiesById.has(ref.placeId)) entitiesById.set(ref.placeId, createEntity(ref))
    const entity = entitiesById.get(ref.placeId)
    addRefToEntity(entity, ref)
    if (!entity.name && ref.name) entity.name = ref.name
    if (!entity.semanticType && ref.semanticType) entity.semanticType = ref.semanticType
    return entity
  }

  for (const rawRef of Array.isArray(geoHistory?.placeRefs) ? geoHistory.placeRefs : []) {
    ensureEntity(normalizePlaceRef(rawRef, { worldbookId, mapId }))
  }

  for (const node of Array.isArray(geoHistory?.nodes) ? geoHistory.nodes : []) {
    if (!node || typeof node !== 'object') continue
    const ref = normalizePlaceRef(node.placeRef || node.mapBinding, { worldbookId, mapId })
    const entity = ensureEntity(ref)
    if (!entity) continue

    const nodeId = normalizeText(node.id)
    if (nodeId && !entity.historyNodeIds.includes(nodeId)) {
      entity.historyNodeIds.push(nodeId)
      entity.historyNodes.push(node)
    }
    const nodeAliases = [
      node.locationHint,
      node.locationName,
      node.mapBinding?.country,
      node.mapBinding?.city,
      node.mapBinding?.scene
    ]
    for (const alias of nodeAliases) addUnique(entity.aliases, entity.aliasesSeen, alias)
    for (const entryId of Array.isArray(node.entryIds) ? node.entryIds : []) {
      const normalizedEntryId = normalizeText(entryId)
      if (!normalizedEntryId || entity.entryIdsSeen.has(normalizedEntryId)) continue
      entity.entryIdsSeen.add(normalizedEntryId)
      entity.entryIds.push(normalizedEntryId)
    }
  }

  const entities = [...entitiesById.values()].map((entity) => finalizeEntity(entity, entriesById))
  const byId = new Map(entities.map((entity) => [entity.placeId, entity]))
  return { version: 1, entities, byId }
}

export function resolvePlaceEntity(source, target) {
  const index = source?.entities && source?.byId instanceof Map
    ? source
    : buildPlaceEntityIndex(source)
  const placeId = normalizeText(typeof target === 'object' ? target?.placeId : target)
  if (placeId && index.byId.has(placeId)) return index.byId.get(placeId)

  const label = normalizeText(typeof target === 'object' ? target?.name : target).toLowerCase()
  if (!label) return null
  return index.entities.find((entity) => [entity.name, ...(entity.aliases || [])]
    .some((value) => normalizeText(value).toLowerCase() === label)) || null
}

export function buildPlaceRuntimePatch(entity) {
  if (!entity?.placeId) return null
  const node = entity.latestHistoryNode || entity.historyNodes?.[entity.historyNodes.length - 1] || null
  const mapBinding = node?.mapBinding || {}
  return {
    placeId: entity.placeId,
    currentCountry: normalizeText(mapBinding.country || mapBinding.currentCountry),
    currentCity: normalizeText(mapBinding.city || mapBinding.currentCity),
    currentScene: normalizeText(
      mapBinding.scene
        || mapBinding.currentScene
        || entity.name
    )
  }
}

export default {
  buildPlaceEntityIndex,
  buildPlaceRuntimePatch,
  resolvePlaceEntity
}
