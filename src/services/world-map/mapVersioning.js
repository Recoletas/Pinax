const REVIEWABLE_BINDING_STATUSES = new Set(['confirmed'])
const VALID_CHOICES = new Set(['remap', 'keep', 'unbound'])

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('zh-Hans-CN').replace(/[\s·・_-]+/g, '')
}

function clone(value, fallback = null) {
  if (value == null) return fallback
  return JSON.parse(JSON.stringify(value))
}

function entryName(entry) {
  return String(entry?.name || entry?.keys?.[0] || '').trim()
}

function entryAliases(entry) {
  return [entryName(entry), ...(entry?.aliases || []), ...(entry?.keys || []), ...(entry?.keysSecondary || [])]
    .map(normalize)
    .filter(Boolean)
}

function entryFingerprint(entry) {
  return JSON.stringify({
    id: String(entry?.id || ''),
    name: entryName(entry),
    type: entry?.type || '',
    aliases: entryAliases(entry),
    content: String(entry?.content || ''),
    relations: entry?.relations || null,
    mapBinding: entry?.mapBinding || null,
  })
}

function findMatchingBurg(entry, mapData) {
  const aliases = new Set(entryAliases(entry))
  if (!aliases.size) return null
  return (Array.isArray(mapData?.burgs) ? mapData.burgs : [])
    .find((burg) => burg?.i > 0 && aliases.has(normalize(burg.name))) || null
}

function findConstraintIssue(entry, mapData) {
  const report = mapData?.constraintReport || {}
  const entryId = String(entry?.id || '')
  const names = entryAliases(entry)
  for (const level of ['impossible', 'relaxed']) {
    const item = (Array.isArray(report[level]) ? report[level] : []).find((candidate) => {
      if (entryId && String(candidate?.id || '') === entryId) return true
      const candidateName = normalize(candidate?.name)
      return candidateName && names.some((name) => candidateName.startsWith(name))
    })
    if (item) return { level, reason: String(item.reason || '地图约束未完全满足') }
  }
  return null
}

function summarize(items) {
  return items.reduce((summary, item) => {
    summary[item.status] = (summary[item.status] || 0) + 1
    return summary
  }, { kept: 0, moved: 0, conflict: 0, unmatched: 0 })
}

function scaleManualMarkers(markers, previousMap, nextMap) {
  const oldWidth = Number(previousMap?.width) || 1200
  const oldHeight = Number(previousMap?.height) || 800
  const nextWidth = Number(nextMap?.width) || oldWidth
  const nextHeight = Number(nextMap?.height) || oldHeight
  return (Array.isArray(markers) ? markers : [])
    .filter((marker) => marker?.userAdded || (!marker?.sourceEntryId && !marker?.worldbookEntryId))
    .map((marker) => ({
      ...clone(marker, {}),
      x: Math.max(0, Math.min(nextWidth, Number(marker.x) / oldWidth * nextWidth)),
      y: Math.max(0, Math.min(nextHeight, Number(marker.y) / oldHeight * nextHeight)),
    }))
}

export function captureWorldbookBindings(worldbook) {
  return (Array.isArray(worldbook?.entries) ? worldbook.entries : [])
    .filter((entry) => entry?.id && entry?.mapBinding)
    .map((entry) => ({ entryId: String(entry.id), mapBinding: clone(entry.mapBinding, {}) }))
}

export function buildMapReplacementReview({
  worldbook,
  previousMap,
  nextMap,
  markers = [],
  sourceMapRevision = '',
  now = Date.now(),
} = {}) {
  const entries = (Array.isArray(worldbook?.entries) ? worldbook.entries : [])
    .filter((entry) => entry?.id && REVIEWABLE_BINDING_STATUSES.has(String(entry?.mapBinding?.status || '')))
  const diagonal = Math.hypot(Number(nextMap?.width) || 1200, Number(nextMap?.height) || 800) || 1
  const items = entries.map((entry) => {
    const binding = entry.mapBinding || {}
    const matched = findMatchingBurg(entry, nextMap)
    const issue = findConstraintIssue(entry, nextMap)
    const suggested = matched
      ? { x: Number(matched.x), y: Number(matched.y), burgId: Number(matched.i), name: String(matched.name || '') }
      : null
    const movedDistance = suggested
      ? Math.hypot(Number(binding.x) - suggested.x, Number(binding.y) - suggested.y)
      : Infinity
    let status = suggested && movedDistance <= diagonal * 0.015 ? 'kept' : (suggested ? 'moved' : 'unmatched')
    if (issue) status = 'conflict'
    return {
      entryId: String(entry.id),
      name: entryName(entry) || String(entry.id),
      status,
      reason: issue?.reason || (suggested
        ? (status === 'kept' ? '同名或别名地点保持在原位置附近' : '找到同名或别名地图地点，位置将发生变化')
        : '新地图没有同名或别名地点，不会随机分配位置'),
      previous: {
        x: Number(binding.x),
        y: Number(binding.y),
        mapId: String(binding.mapId || ''),
        mapRevision: String(binding.mapRevision || sourceMapRevision || ''),
      },
      suggested,
      defaultChoice: suggested ? 'remap' : 'keep',
      sourceFingerprint: entryFingerprint(entry),
    }
  })

  return {
    id: `mapreview_${String(nextMap?.seed || 'candidate')}_${now}`,
    createdAt: now,
    sourceMapRevision: String(sourceMapRevision || ''),
    sourceWorldbookRevision: String(worldbook?.updatedAt || worldbook?.id || ''),
    nextSeed: String(nextMap?.seed || ''),
    nextWidth: Number(nextMap?.width) || 1200,
    nextHeight: Number(nextMap?.height) || 800,
    items,
    summary: summarize(items),
    manualMarkers: scaleManualMarkers(markers, previousMap, nextMap),
  }
}

export function applyMapReplacementChoices(worldbook, review, choices = {}, { mapId = '', mapRevision = '' } = {}) {
  const entries = Array.isArray(worldbook?.entries) ? worldbook.entries : []
  const byId = new Map(entries.map((entry) => [String(entry?.id || ''), entry]))
  const staleEntryIds = (review?.items || [])
    .filter((item) => entryFingerprint(byId.get(item.entryId)) !== item.sourceFingerprint)
    .map((item) => item.entryId)
  if (staleEntryIds.length) return { ok: false, staleEntryIds }

  const reviewById = new Map((review?.items || []).map((item) => [item.entryId, item]))
  const nextEntries = entries.map((entry) => {
    const item = reviewById.get(String(entry?.id || ''))
    if (!item) return entry
    const requested = choices[item.entryId] || item.defaultChoice
    const choice = VALID_CHOICES.has(requested) ? requested : item.defaultChoice
    const previousBinding = clone(entry.mapBinding, {})
    if (choice === 'remap' && item.suggested) {
      return {
        ...entry,
        mapBinding: {
          ...previousBinding,
          status: 'confirmed',
          mapId,
          mapRevision,
          burgId: item.suggested.burgId,
          x: item.suggested.x,
          y: item.suggested.y,
          previous: previousBinding,
          remappedAt: Date.now(),
          staleReason: '',
        },
      }
    }
    if (choice === 'unbound') {
      return {
        ...entry,
        mapBinding: {
          status: 'unbound',
          mapId,
          mapRevision,
          previous: previousBinding,
          staleReason: '新地图未绑定',
        },
      }
    }
    return {
      ...entry,
      mapBinding: {
        ...previousBinding,
        status: 'stale',
        pendingMapId: mapId,
        pendingMapRevision: mapRevision,
        staleReason: '保留上一地图版本的位置，等待重新确认',
      },
    }
  })

  return {
    ok: true,
    entries: nextEntries,
    markers: clone(review?.manualMarkers, []),
    bindingSnapshot: captureWorldbookBindings({ entries: nextEntries }),
  }
}

export function createMapRevision({
  worldId = 'world',
  config,
  mapData,
  meta = null,
  markers = [],
  worldbook = null,
  review = null,
  now = Date.now(),
} = {}) {
  const seed = String(mapData?.seed || config?.seed || 'map')
  return {
    id: `maprev_${String(worldId || 'world')}_${seed}_${now}`,
    createdAt: now,
    seed,
    config: clone(config, {}),
    markers: clone(markers, []),
    generationMeta: clone(meta, null),
    worldbookId: String(worldbook?.id || ''),
    worldbookRevision: String(worldbook?.updatedAt || worldbook?.id || ''),
    bindings: captureWorldbookBindings(worldbook),
    reviewSummary: review ? clone(review.summary, null) : null,
  }
}
