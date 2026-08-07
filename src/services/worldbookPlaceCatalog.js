import {
  createPlaceEntryPatch,
  getPlacePayloadFromEntry,
  hashPlaceSource,
  isPlaceOverviewEntry,
  normalizePlacePayload,
  normalizePlaceReference,
  placeFingerprint,
  validatePlacePayload
} from '../../shared/placeEntryContract.js'

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function key(value) {
  return text(value).toLocaleLowerCase('zh-Hans-CN').replace(/[\s·・_-]+/g, '')
}

export function listPlaceEntries(worldbook, { includeOverview = false } = {}) {
  return (Array.isArray(worldbook?.entries) ? worldbook.entries : [])
    .filter((entry) => entry && entry.type === 'location')
    .filter((entry) => includeOverview || !isPlaceOverviewEntry(entry))
    .map((entry) => ({
      entry,
      ...getPlacePayloadFromEntry(entry),
      entryId: text(entry.id),
      entryFingerprint: placeFingerprint(entry),
      updatedAt: entry.metadata?.updatedAt || worldbook?.updatedAt || 0
    }))
}

export function getPlaceOverview(worldbook) {
  const geography = text(worldbook?.structuredSettings?.world?.geography)
  if (geography) return geography
  return listPlaceEntries(worldbook, { includeOverview: true })
    .find((place) => isPlaceOverviewEntry(place.entry))?.description || ''
}

export function getPlaceSourceRevision(worldbook) {
  return hashPlaceSource(getPlaceOverview(worldbook))
}

function allPlaceNames(worldbook) {
  return listPlaceEntries(worldbook).flatMap((place) => [
    { id: place.entryId, name: place.name },
    ...place.aliases.map((name) => ({ id: place.entryId, name }))
  ])
}

function resolveReference(reference, worldbook) {
  const normalized = normalizePlaceReference(reference)
  if (!normalized.targetName && !normalized.targetId) return normalized
  const target = allPlaceNames(worldbook).find((candidate) => (
    (normalized.targetId && candidate.id === normalized.targetId)
    || (normalized.targetName && key(candidate.name) === key(normalized.targetName))
  ))
  return target
    ? { ...normalized, targetId: target.id, targetName: target.name, status: 'resolved' }
    : { ...normalized, status: normalized.targetName ? 'unresolved' : 'invalid' }
}

export function resolvePlaceRelations(payload, worldbook) {
  const place = normalizePlacePayload(payload, { draft: payload?.reviewState === 'draft' })
  return {
    ...place,
    parentRef: resolveReference(place.parentRef, worldbook),
    factionRef: resolveReference(place.factionRef, worldbook),
    relations: place.relations.map((relation) => ({
      ...relation,
      ...resolveReference(relation, worldbook),
      type: relation.type
    }))
  }
}

export function preparePlaceForWrite(payload, worldbook, { entryId = '', allowUnresolved = true } = {}) {
  const resolved = resolvePlaceRelations(payload, worldbook)
  const validation = validatePlacePayload(resolved, {
    entries: worldbook?.entries || [],
    entryId,
    allowUnresolved
  })
  if (!validation.valid) {
    const error = new Error(validation.errors.map((item) => item.message).join('；'))
    error.code = 'PLACE_VALIDATION_FAILED'
    error.validation = validation
    throw error
  }
  return { payload: resolved, validation }
}

export function getPlaceDeleteImpact(worldbook, entryId) {
  const places = listPlaceEntries(worldbook)
  const target = places.find((place) => place.entryId === text(entryId))
  if (!target) return { entryId: text(entryId), name: '', mapBinding: false, historyRefs: 0, relationRefs: 0, total: 0 }
  const targetKeys = new Set([key(target.entryId), key(target.name), ...target.aliases.map(key)].filter(Boolean))
  const matches = (reference) => {
    const rawId = text(reference?.targetId || reference?.entryId || reference?.placeId || reference?.id)
    const rawName = text(reference?.targetName || reference?.name || reference?.title)
    return targetKeys.has(key(rawId)) || targetKeys.has(key(rawName))
  }
  let historyRefs = 0
  const geoHistory = worldbook?.geoHistory || {}
  for (const reference of Array.isArray(geoHistory.placeRefs) ? geoHistory.placeRefs : []) {
    if (matches(reference)) historyRefs += 1
  }
  for (const node of Array.isArray(geoHistory.nodes) ? geoHistory.nodes : []) {
    if (matches(node?.placeRef || node?.mapBinding || node)) historyRefs += 1
  }
  let relationRefs = 0
  for (const entry of Array.isArray(worldbook?.entries) ? worldbook.entries : []) {
    if (entry.id === entryId) continue
    const refs = [
      ...(Array.isArray(entry?.relations?.locations) ? entry.relations.locations : []),
      entry.parentRef,
      entry.factionRef,
      entry.metadata?.place?.parentRef,
      entry.metadata?.place?.factionRef
    ]
    relationRefs += refs.filter(matches).length
  }
  const mapBinding = Boolean(target.mapBinding && target.mapBinding.status !== 'unbound')
  return {
    entryId: target.entryId,
    name: target.name,
    mapBinding,
    historyRefs,
    relationRefs,
    total: Number(mapBinding) + historyRefs + relationRefs
  }
}

export function buildPlaceEntryPayload(payload, existing = {}) {
  return createPlaceEntryPatch(payload, existing)
}

export function getPlaceRevisionGuard(worldbook, entryId = '') {
  const entry = listPlaceEntries(worldbook).find((place) => place.entryId === text(entryId))
  return {
    overviewRevision: getPlaceSourceRevision(worldbook),
    entryId: entry?.entryId || '',
    entryFingerprint: entry ? placeFingerprint(entry) : ''
  }
}

export function isPlaceRevisionGuardCurrent(worldbook, draft = {}) {
  if (draft.sourceOverviewRevision && draft.sourceOverviewRevision !== getPlaceSourceRevision(worldbook)) return false
  if (!draft.targetEntryId) return true
  const entry = listPlaceEntries(worldbook).find((place) => place.entryId === draft.targetEntryId)
  return Boolean(entry && (!draft.targetFingerprint || placeFingerprint(entry) === draft.targetFingerprint))
}

export async function adoptPlaceDraft({ worldStore, worldbook, draft } = {}) {
  if (!worldStore || !worldbook?.id || !draft) throw new Error('地点草稿缺少写入上下文')
  if (!isPlaceRevisionGuardCurrent(worldbook, draft)) {
    const error = new Error('地点草稿依赖的概述或目标条目已更新，请只重新整理这一项。')
    error.code = 'PLACE_DRAFT_STALE'
    throw error
  }
  const target = draft.targetEntryId
    ? listPlaceEntries(worldbook).find((place) => place.entryId === draft.targetEntryId)
    : null
  const prepared = preparePlaceForWrite(draft, worldbook, {
    entryId: target?.entryId || '',
    allowUnresolved: true
  })
  const payload = {
    ...prepared.payload,
    reviewState: 'accepted',
    sourceEvidence: prepared.payload.sourceEvidence.map((item) => ({ ...item, confidence: draft.evidenceStatus === 'low' ? 'low' : 'high' }))
  }
  if (target) {
    return worldStore.updatePlace(worldbook.id, target.entryId, payload, {
      expectedFingerprint: draft.targetFingerprint,
      sourceOverviewRevision: draft.sourceOverviewRevision
    })
  }
  return worldStore.createPlace(worldbook.id, payload, {
    sourceOverviewRevision: draft.sourceOverviewRevision
  })
}
