export const PLACE_ENTRY_SCHEMA_VERSION = 1

export const PLACE_KINDS = Object.freeze([
  'continent', 'region', 'city', 'town', 'village', 'port', 'fortress',
  'academy', 'site', 'river', 'route'
])

export const PLACE_SCALES = Object.freeze(['macro', 'regional', 'local', 'unknown'])

export const PLACE_RELATION_TYPES = Object.freeze([
  'parent', 'state', 'adjacent', 'river', 'route', 'same-state', 'different-state'
])

// Narrow set used by the flesh-out (setting-place.v1) schema and prompt.
// Flesh-out is a content-fill pass; it does not invent containment / affiliation,
// so the relations it may produce are limited to physical / geographic connections.
export const PLACE_FLESH_OUT_RELATION_TYPES = Object.freeze(['adjacent', 'river', 'route'])

export const PLACE_REVIEW_STATES = Object.freeze([
  'draft', 'needs-review', 'accepted', 'ignored', 'stale'
])

export const PLACE_MAP_BINDING_STATUSES = Object.freeze([
  'unbound', 'auto-matched', 'confirmed', 'stale'
])

const PLACE_OVERVIEW_NAMES = new Set([
  '地理环境', '地理概述', '地理总述', '地理', '地形与区域', 'geography', 'geography overview'
])

const RELATION_ALIASES = new Map([
  ['parent', 'parent'], ['inside', 'parent'], ['within', 'parent'], ['belongs-to-region', 'parent'],
  ['state', 'state'], ['country', 'state'], ['belongs-to-state', 'state'],
  ['adjacent', 'adjacent'], ['neighbor', 'adjacent'], ['neighbour', 'adjacent'],
  ['river', 'river'], ['on-river', 'river'], ['river-through', 'river'],
  ['route', 'route'], ['road', 'route'], ['connected', 'route'], ['connects', 'route'],
  ['same-state', 'same-state'], ['same-country', 'same-state'],
  ['different-state', 'different-state'], ['different-country', 'different-state'],
  ['位于', 'parent'], ['隶属', 'parent'], ['包含于', 'parent'], ['所属国家', 'state'],
  ['相邻', 'adjacent'], ['沿河', 'river'], ['流经', 'river'], ['通往', 'route'], ['连接', 'route'],
  ['同国', 'same-state'], ['同属', 'same-state'], ['异国', 'different-state']
])

const TERRAIN_ALIASES = new Map([
  ['海岸', 'coast'], ['沿海', 'coast'], ['港口', 'coast'], ['coast', 'coast'],
  ['内陆', 'inland'], ['inland', 'inland'], ['陆地', 'land'], ['land', 'land'],
  ['水域', 'water'], ['水上', 'water'], ['河流', 'water'], ['lake', 'water'], ['water', 'water'],
  ['森林', 'forest'], ['林地', 'forest'], ['forest', 'forest'],
  ['沙漠', 'desert'], ['荒漠', 'desert'], ['desert', 'desert'],
  ['山地', 'mountain'], ['高山', 'mountain'], ['mountain', 'mountain'],
  ['岛屿', 'island'], ['岛上', 'island'], ['island', 'island']
])

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function uniqueStrings(values, limit = 24) {
  const seen = new Set()
  const output = []
  for (const value of Array.isArray(values) ? values : [values]) {
    const item = text(value)
    if (!item || seen.has(item)) continue
    seen.add(item)
    output.push(item)
    if (output.length >= limit) break
  }
  return output
}

function normalizeKey(value) {
  return text(value).toLocaleLowerCase('zh-Hans-CN').replace(/[\s·・_-]+/g, '')
}

function normalizeKind(value) {
  const raw = text(value).toLowerCase()
  const aliases = {
    place: 'site', landmark: 'site', ruin: 'site', dungeon: 'site', cave: 'site',
    state: 'region', country: 'region', basin: 'region', plain: 'region',
    mountain: 'site', stream: 'river', lake: 'river', waterway: 'river',
    road: 'route', trail: 'route', passage: 'route', settlement: 'town'
  }
  return PLACE_KINDS.includes(raw) ? raw : (aliases[raw] || 'site')
}

function normalizeScale(value) {
  const raw = text(value).toLowerCase()
  if (PLACE_SCALES.includes(raw)) return raw
  if (['continent', 'macro', '大陆'].includes(raw)) return 'macro'
  if (['region', 'regional', '地区', '区域'].includes(raw)) return 'regional'
  if (['local', 'settlement', 'city', 'town', 'village', '地点'].includes(raw)) return 'local'
  return 'unknown'
}

function normalizeRelationType(value) {
  const key = text(value).toLocaleLowerCase('zh-Hans-CN').replace(/[\s_]+/g, '-')
  return RELATION_ALIASES.get(key) || (PLACE_RELATION_TYPES.includes(key) ? key : '')
}

function normalizeTerrainHint(value) {
  const item = text(value)
  return TERRAIN_ALIASES.get(item.toLocaleLowerCase('zh-Hans-CN')) || item
}

export function normalizePlaceReference(raw) {
  if (typeof raw === 'string' || typeof raw === 'number') {
    const targetName = text(raw)
    return { targetId: '', targetName, status: targetName ? 'unresolved' : 'invalid' }
  }
  if (!raw || typeof raw !== 'object') return { targetId: '', targetName: '', status: 'invalid' }
  const targetId = text(raw.targetId || raw.entryId || raw.placeId || raw.locationId || raw.id)
  const targetName = text(raw.targetName || raw.name || raw.title || raw.locationName)
  return {
    targetId,
    targetName,
    status: raw.status === 'resolved' || targetId ? 'resolved' : targetName ? 'unresolved' : 'invalid'
  }
}

export function normalizePlaceRelation(raw) {
  const relation = normalizeRelationType(raw?.type || raw?.relationType || raw?.relation || raw?.linkType || raw?.edgeType || raw?.kind)
  const reference = normalizePlaceReference(raw?.target || raw)
  return {
    type: relation,
    targetId: reference.targetId,
    targetName: reference.targetName,
    status: relation && reference.status !== 'invalid' ? reference.status : 'invalid'
  }
}

function normalizeSourceEvidence(raw) {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : []
  return values.map((item) => {
    if (typeof item === 'string') return { excerpt: text(item), source: '', confidence: 'unknown' }
    return {
      excerpt: text(item?.excerpt || item?.quote || item?.text),
      source: text(item?.source || item?.sourceLabel || item?.documentId),
      sourceId: text(item?.sourceId || item?.documentId),
      confidence: ['high', 'medium', 'low', 'unknown'].includes(text(item?.confidence))
        ? text(item.confidence)
        : 'unknown'
    }
  }).filter((item) => item.excerpt).slice(0, 12)
}

function normalizeMapBinding(raw) {
  if (!raw || typeof raw !== 'object') return null
  const output = { ...raw }
  const status = text(raw.status)
  output.status = PLACE_MAP_BINDING_STATUSES.includes(status) ? status : 'unbound'
  for (const key of ['x', 'y']) {
    if (raw[key] !== undefined && Number.isFinite(Number(raw[key]))) output[key] = Number(raw[key])
  }
  if (raw.cellId !== undefined && Number.isInteger(Number(raw.cellId))) output.cellId = Number(raw.cellId)
  if (raw.mapObjectId) output.mapObjectId = text(raw.mapObjectId)
  return output
}

function placeMetadata(raw) {
  return raw?.metadata?.place || raw?.metadata?.location || raw?.place || {}
}

export function normalizePlacePayload(raw = {}, { draft = false } = {}) {
  const source = placeMetadata(raw)
  const rawRelations = Array.isArray(raw?.relations)
    ? raw.relations
    : Array.isArray(raw?.relations?.locations)
      ? raw.relations.locations
      : Array.isArray(source?.relations)
        ? source.relations
        : []
  const name = text(raw?.name || source?.name)
  const explicitAliases = [
    ...(Array.isArray(raw?.aliases) ? raw.aliases : []),
    ...(Array.isArray(source?.aliases) ? source.aliases : [])
  ]
  const aliases = uniqueStrings(
    explicitAliases.length ? explicitAliases : (Array.isArray(raw?.keys) ? raw.keys : [])
  ).filter((item) => normalizeKey(item) !== normalizeKey(name))
  const parentRef = normalizePlaceReference(raw?.parentRef ?? source?.parentRef ?? raw?.parentRegion ?? raw?.region)
  const factionRef = normalizePlaceReference(raw?.factionRef ?? source?.factionRef ?? raw?.faction ?? raw?.country ?? raw?.state)
  const relations = rawRelations.map(normalizePlaceRelation).filter((item) => item.type || item.targetName).slice(0, 24)
  const description = text(raw?.description || source?.description || raw?.content)
  const terrainHints = uniqueStrings([
    ...(Array.isArray(raw?.terrainHints) ? raw.terrainHints : []),
    ...(Array.isArray(source?.terrainHints) ? source.terrainHints : [])
  ].map(normalizeTerrainHint))
  const sourceEvidence = normalizeSourceEvidence(raw?.sourceEvidence ?? source?.sourceEvidence ?? raw?.metadata?.sourceEvidence)
  const reviewState = text(raw?.reviewState || source?.reviewState || raw?.metadata?.reviewState)
  const output = {
    schemaVersion: PLACE_ENTRY_SCHEMA_VERSION,
    name,
    aliases,
    kind: normalizeKind(raw?.kind || source?.kind || raw?.type),
    scale: normalizeScale(raw?.scale || source?.scale),
    parentRef,
    factionRef,
    terrainHints,
    relations,
    description,
    sourceEvidence,
    reviewState: PLACE_REVIEW_STATES.includes(reviewState)
      ? reviewState
      : draft ? 'draft' : 'accepted',
    keywords: uniqueStrings([
      ...(Array.isArray(raw?.keywords) ? raw.keywords : []),
      ...(Array.isArray(source?.keywords) ? source.keywords : [])
    ]),
    mapBinding: normalizeMapBinding(raw?.mapBinding ?? source?.mapBinding ?? raw?.metadata?.mapBinding)
  }
  return output
}

export function getPlacePayloadFromEntry(entry = {}) {
  return normalizePlacePayload({ ...entry, ...placeMetadata(entry), content: entry.content })
}

export function createPlaceEntryPatch(payload = {}, existing = {}) {
  const place = normalizePlacePayload(payload)
  const existingRelations = existing?.relations && typeof existing.relations === 'object' ? existing.relations : {}
  const metadata = existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}
  return {
    ...existing,
    type: 'location',
    name: place.name,
    keys: uniqueStrings([place.name, ...place.aliases, ...place.keywords]),
    keysSecondary: uniqueStrings(existing.keysSecondary || []),
    content: place.description,
    aliases: place.aliases,
    scale: place.scale,
    parentRef: place.parentRef,
    factionRef: place.factionRef,
    terrainHints: place.terrainHints,
    sourceEvidence: place.sourceEvidence,
    reviewState: place.reviewState,
    mapBinding: place.mapBinding,
    relations: {
      ...existingRelations,
      locations: place.relations,
      tags: Array.isArray(existingRelations.tags) ? existingRelations.tags : [],
      characters: Array.isArray(existingRelations.characters) ? existingRelations.characters : [],
      events: Array.isArray(existingRelations.events) ? existingRelations.events : []
    },
    metadata: {
      ...metadata,
      reviewState: place.reviewState,
      place: {
        schemaVersion: PLACE_ENTRY_SCHEMA_VERSION,
        aliases: place.aliases,
        kind: place.kind,
        scale: place.scale,
        parentRef: place.parentRef,
        factionRef: place.factionRef,
        terrainHints: place.terrainHints,
        relations: place.relations,
        description: place.description,
        sourceEvidence: place.sourceEvidence,
        keywords: place.keywords,
        mapBinding: place.mapBinding
      }
    }
  }
}

export function isPlaceOverviewEntry(entry = {}) {
  const name = normalizeKey(entry.name || entry.keys?.[0])
  return name === '地理环境'
    || PLACE_OVERVIEW_NAMES.has(text(entry.name || '').toLocaleLowerCase('zh-Hans-CN'))
    || entry.metadata?.structuredSettingRef === 'world.geography'
    || entry.metadata?.placeRole === 'overview'
}

export function getPlaceOverviewText(worldbook = {}) {
  const structured = text(worldbook?.structuredSettings?.world?.geography)
  if (structured) return structured
  const entry = (Array.isArray(worldbook?.entries) ? worldbook.entries : [])
    .find(isPlaceOverviewEntry)
  return text(entry?.content)
}

export function hashPlaceSource(value) {
  let hash = 2166136261
  for (const character of String(value || '')) {
    hash ^= character.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function terrainConflict(hints) {
  const set = new Set(hints.map((item) => normalizeTerrainHint(item)))
  const pairs = [['water', 'land'], ['desert', 'forest'], ['coast', 'inland'], ['island', 'inland']]
  return pairs.find(([left, right]) => set.has(left) && set.has(right)) || null
}

function relationTargetKey(reference) {
  return normalizeKey(reference?.targetId || reference?.targetName)
}

function buildParentLookup(entries, current) {
  const lookup = new Map()
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (isPlaceOverviewEntry(entry)) continue
    const payload = getPlacePayloadFromEntry(entry)
    const key = normalizeKey(entry.id || payload.name)
    if (key) lookup.set(key, { id: text(entry.id), name: payload.name, parent: payload.parentRef })
  }
  if (current?.name) {
    const key = normalizeKey(current.id || current.name)
    lookup.set(key, { id: text(current.id), name: current.name, parent: current.parentRef })
  }
  return lookup
}

export function validatePlacePayload(payload, { entries = [], entryId = '', allowUnresolved = true } = {}) {
  const place = normalizePlacePayload(payload)
  const errors = []
  const warnings = []
  if (!place.name) errors.push({ code: 'name-required', message: '地点名称不能为空' })
  if (!PLACE_KINDS.includes(place.kind)) errors.push({ code: 'kind-invalid', message: '地点类型无效' })
  const currentKey = normalizeKey(entryId)
  const allEntries = (Array.isArray(entries) ? entries : []).filter((entry) => !isPlaceOverviewEntry(entry))
  const currentNames = new Set([place.name, ...place.aliases].map(normalizeKey).filter(Boolean))
  for (const entry of allEntries) {
    if (currentKey && normalizeKey(entry.id) === currentKey) continue
    const other = getPlacePayloadFromEntry(entry)
    const overlap = [other.name, ...other.aliases].map(normalizeKey).find((value) => currentNames.has(value))
    if (overlap) errors.push({ code: 'duplicate-name', message: `地点名称或别名已被「${other.name}」使用` })
  }
  const terrainPair = terrainConflict(place.terrainHints)
  if (terrainPair) errors.push({ code: 'terrain-conflict', message: `地理条件「${terrainPair[0]}」与「${terrainPair[1]}」互斥` })
  const refs = [
    ...(place.parentRef.targetName || place.parentRef.targetId ? [{ type: 'parent', ...place.parentRef }] : []),
    ...(place.factionRef.targetName || place.factionRef.targetId ? [{ type: 'state', ...place.factionRef }] : []),
    ...place.relations
  ]
  for (const reference of refs) {
    if (!reference.type || !relationTargetKey(reference)) {
      errors.push({ code: 'relation-invalid', message: '关系必须包含类型和目标名称' })
      continue
    }
    if (currentKey && (reference.targetId === entryId || normalizeKey(reference.targetName) === normalizeKey(place.name))) {
      errors.push({ code: 'self-reference', message: '地点不能引用自己' })
    } else if (!reference.targetId && !allEntries.some((entry) => {
      const other = getPlacePayloadFromEntry(entry)
      return normalizeKey(entry.id) === normalizeKey(reference.targetName) || [other.name, ...other.aliases].map(normalizeKey).includes(normalizeKey(reference.targetName))
    })) {
      if (allowUnresolved) warnings.push({ code: 'unresolved-relation', message: `关系目标「${reference.targetName}」尚未建立地点条目` })
      else errors.push({ code: 'unresolved-relation', message: `关系目标「${reference.targetName}」不存在` })
    }
  }
  const parent = place.parentRef
  if (parent.targetId || parent.targetName) {
    const lookup = buildParentLookup(entries, { ...place, id: entryId })
    const start = parent.targetId || parent.targetName
    const visited = new Set()
    let cursor = start
    while (cursor) {
      const key = normalizeKey(cursor)
      if (visited.has(key)) break
      visited.add(key)
      if (currentKey && (key === currentKey || key === normalizeKey(place.name))) {
        errors.push({ code: 'parent-cycle', message: '父级关系会形成循环' })
        break
      }
      const node = lookup.get(key) || [...lookup.values()].find((item) => normalizeKey(item.id) === key || normalizeKey(item.name) === key)
      cursor = node?.parent?.targetId || node?.parent?.targetName || ''
    }
  }
  return { valid: errors.length === 0, value: place, errors, warnings }
}

export function placeFingerprint(payload) {
  const place = normalizePlacePayload(payload)
  return hashPlaceSource(JSON.stringify({
    name: place.name,
    aliases: place.aliases,
    kind: place.kind,
    scale: place.scale,
    parentRef: place.parentRef,
    factionRef: place.factionRef,
    terrainHints: place.terrainHints,
    relations: place.relations,
    description: place.description,
    sourceEvidence: place.sourceEvidence
  }))
}
