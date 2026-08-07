import {
  NARRATIVE_TOOL_LIMITS,
  createNarrativeRevision
} from '../../../shared/narrativeAgentContract'
import { buildPlaceEntityIndex } from '../worldHistory/placeEntity'

const CACHE_LIMIT = 4
const indexCache = new Map()

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))]
}

function clip(value, limit = NARRATIVE_TOOL_LIMITS.maxItemChars) {
  const normalized = text(value)
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized
}

function relation(type, targetId) {
  const normalized = text(targetId)
  return normalized ? { type: text(type) || 'related', targetId: normalized } : null
}

function normalizeRelations(values = []) {
  const seen = new Set()
  return values.filter(Boolean).filter((item) => {
    const key = `${item.type}:${item.targetId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 32)
}

function tokenize(value) {
  const normalized = text(value).toLowerCase()
  const tokens = normalized.match(/[a-z0-9_-]+|[\u3400-\u9fff]+/g) || []
  const result = new Set(tokens)
  for (const token of tokens) {
    if (!/^[\u3400-\u9fff]+$/.test(token)) continue
    if (token.length <= 2) continue
    for (let index = 0; index < token.length - 1; index += 1) {
      result.add(token.slice(index, index + 2))
    }
  }
  return [...result]
}

function resource(input) {
  const aliases = unique(input.aliases || [])
  const summary = clip(input.summary, NARRATIVE_TOOL_LIMITS.maxGetItemChars)
  const searchableText = [
    input.id,
    input.title,
    input.type,
    summary,
    ...aliases,
    ...(input.placeIds || []),
    ...(input.characterIds || [])
  ].map(text).filter(Boolean).join(' ').toLowerCase()
  return {
    id: text(input.id),
    domain: text(input.domain),
    type: text(input.type) || 'general',
    title: text(input.title) || text(input.id),
    summary,
    aliases,
    placeIds: unique(input.placeIds || []),
    characterIds: unique(input.characterIds || []),
    scope: text(input.scope),
    scopeId: text(input.scopeId),
    time: input.time || null,
    relations: normalizeRelations(input.relations || []),
    sourceRefs: unique(input.sourceRefs || []),
    updatedAt: Number(input.updatedAt || 0),
    searchableText,
    tokens: tokenize(searchableText)
  }
}

function worldResources(worldbook) {
  const worldbookId = text(worldbook?.id)
  const overviewSummary = [
    text(worldbook?.worldDescription || worldbook?.description),
    text(worldbook?.openingHook) ? `开场线索：${text(worldbook.openingHook)}` : ''
  ].filter(Boolean).join('\n')
  const overview = worldbookId && overviewSummary
    ? [resource({
        id: `worldbook:${worldbookId}:overview`,
        domain: 'world',
        type: 'overview',
        title: text(worldbook?.name) || '世界概览',
        summary: overviewSummary,
        aliases: [worldbook?.name, '世界设定', '世界背景', '开场线索'],
        relations: (worldbook?.entries || [])
          .slice(0, 24)
          .map((entry) => relation('worldbook-entry', entry?.id)),
        sourceRefs: [`worldbook:${worldbookId}:overview`],
        updatedAt: worldbook?.updatedAt
      })]
    : []
  const entries = (Array.isArray(worldbook?.entries) ? worldbook.entries : [])
    .map((entry) => {
      const relations = entry?.relations || {}
      return resource({
        id: entry?.id,
        domain: 'world',
        type: entry?.type,
        title: entry?.name || entry?.keys?.[0],
        summary: entry?.content,
        aliases: [...(entry?.keys || []), ...(entry?.keysSecondary || [])],
        placeIds: relations.locations || [],
        characterIds: relations.characters || [],
        relations: [
          ...(relations.locations || []).map((id) => relation('location', id)),
          ...(relations.characters || []).map((id) => relation('character', id)),
          ...(relations.events || []).map((id) => relation('event', id)),
          ...(relations.tags || []).map((id) => relation('tag', id))
        ],
        sourceRefs: [`worldbook-entry:${text(entry?.id)}`],
        updatedAt: entry?.metadata?.updatedAt || worldbook?.updatedAt
      })
    })
    .filter((item) => item.id && item.summary)
  return [...overview, ...entries]
}

function geoResources(worldbook) {
  const placeIndex = buildPlaceEntityIndex(worldbook || {})
  return placeIndex.entities.map((entity) => resource({
    id: entity.placeId,
    domain: 'geo',
    type: entity.semanticType || 'place',
    title: entity.name || entity.aliases?.[0] || entity.placeId,
    summary: [
      entity.semanticType ? `类型：${entity.semanticType}` : '',
      entity.aliases?.length ? `别名：${entity.aliases.join('、')}` : '',
      entity.historyNodes?.length ? `关联历史：${entity.historyNodes.map((node) => text(node.title || node.summary)).filter(Boolean).slice(0, 4).join('；')}` : ''
    ].filter(Boolean).join('。'),
    aliases: [entity.ref?.siteId, ...(entity.aliases || [])],
    placeIds: [entity.placeId],
    relations: [
      ...(entity.entryIds || []).map((id) => relation('worldbook-entry', id)),
      ...(entity.historyNodeIds || []).map((id) => relation('history', id)),
      ...(entity.ref?.routeIds || []).map((id) => relation('route', id))
    ],
    sourceRefs: [`place:${entity.placeId}`],
    updatedAt: worldbook?.updatedAt
  }))
}

function historyNodeResource(node, kind, worldbook) {
  const placeId = text(node?.placeId || node?.placeRef?.placeId || node?.mapBinding?.placeId)
  const participants = unique(node?.participants || [])
  const sourceNodeId = text(node?.sourceNodeId)
  const links = [
    ...(node?.entryIds || node?.sourceEntryIds || []).map((id) => relation('worldbook-entry', id)),
    ...(node?.causes || node?.causeIds || []).map((id) => relation('cause', typeof id === 'object' ? id.id : id)),
    ...(node?.consequences || node?.consequenceIds || []).map((id) => relation('consequence', typeof id === 'object' ? id.id : id)),
    ...(sourceNodeId ? [relation('source-history', sourceNodeId)] : [])
  ]
  if (placeId) links.push(relation('place', placeId))
  return resource({
    id: node?.id,
    domain: 'history',
    type: kind,
    title: node?.title || node?.name || (kind === 'player-history' ? '玩家历史' : '历史节点'),
    summary: node?.summary || node?.description || node?.content,
    aliases: [node?.locationHint, node?.locationName, ...(node?.unresolvedHooks || [])],
    placeIds: [placeId],
    characterIds: participants,
    relations: links,
    time: {
      from: text(node?.windowStart || node?.timeRange?.from || node?.date || node?.year),
      to: text(node?.windowEnd || node?.timeRange?.to || node?.date || node?.year)
    },
    sourceRefs: [`history:${text(node?.id)}`],
    updatedAt: node?.capturedAt || node?.updatedAt || worldbook?.updatedAt
  })
}

function historyResources(worldbook) {
  const geoHistory = worldbook?.geoHistory || {}
  return [
    ...(Array.isArray(geoHistory?.nodes) ? geoHistory.nodes : [])
      .map((node) => historyNodeResource(node, text(node?.kind) || 'world-history', worldbook)),
    ...(Array.isArray(geoHistory?.playerNodes) ? geoHistory.playerNodes : [])
      .map((node) => historyNodeResource(node, 'player-history', worldbook))
  ].filter((item) => item.id && item.summary)
}

function memoryResources(memories = []) {
  return (Array.isArray(memories) ? memories : [])
    .filter((memory) => memory?.status === 'active')
    .map((memory) => resource({
      id: memory?.id,
      domain: 'memory',
      type: memory?.kind || memory?.metadata?.sourceType || 'memory',
      title: memory?.metadata?.title || memory?.kind || '已确认记忆',
      summary: memory?.content,
      aliases: memory?.metadata?.keywords || [],
      placeIds: memory?.metadata?.placeIds || [],
      characterIds: memory?.metadata?.characterIds || [],
      scope: memory?.scope,
      scopeId: memory?.scopeId,
      relations: [
        relation('source', memory?.sourceRef),
        ...(memory?.metadata?.sourceRefs || []).map((id) => relation('source', id))
      ],
      sourceRefs: [`memory:${text(memory?.id)}`],
      updatedAt: memory?.updatedAt || memory?.createdAt
    }))
    .filter((item) => item.id && item.summary)
}

export function createNarrativeResourceSnapshotRevision(snapshot = {}) {
  const worldbook = snapshot?.worldbook || {}
  return createNarrativeRevision('res', {
    projectId: text(snapshot?.projectId || worldbook?.id),
    sessionId: text(snapshot?.sessionId),
    worldbookUpdatedAt: Number(worldbook?.updatedAt || 0),
    overview: [
      text(worldbook?.name),
      text(worldbook?.worldDescription || worldbook?.description),
      text(worldbook?.openingHook)
    ],
    entries: (worldbook?.entries || []).map((entry) => [
      text(entry?.id),
      Number(entry?.metadata?.updatedAt || 0),
      text(entry?.content)
    ]),
    history: [
      ...(worldbook?.geoHistory?.nodes || []),
      ...(worldbook?.geoHistory?.playerNodes || [])
    ].map((node) => [text(node?.id), text(node?.summary), Number(node?.updatedAt || node?.capturedAt || 0)]),
    memories: (snapshot?.memories || []).map((memory) => [
      text(memory?.id),
      text(memory?.status),
      Number(memory?.updatedAt || memory?.createdAt || 0),
      text(memory?.content)
    ])
  })
}

export function createNarrativeResourceIndex(snapshot = {}) {
  const resources = [
    ...worldResources(snapshot?.worldbook),
    ...geoResources(snapshot?.worldbook),
    ...historyResources(snapshot?.worldbook),
    ...memoryResources(snapshot?.memories)
  ]
  const byId = new Map()
  const byDomain = new Map()
  for (const item of resources) {
    if (!byId.has(item.id)) byId.set(item.id, item)
    if (!byDomain.has(item.domain)) byDomain.set(item.domain, [])
    byDomain.get(item.domain).push(item)
  }
  return {
    schemaVersion: 1,
    projectId: text(snapshot?.projectId || snapshot?.worldbook?.id),
    sessionId: text(snapshot?.sessionId),
    revision: createNarrativeResourceSnapshotRevision(snapshot),
    resources,
    byId,
    byDomain,
    counts: Object.fromEntries(['world', 'geo', 'history', 'memory'].map((domain) => [
      domain,
      byDomain.get(domain)?.length || 0
    ]))
  }
}

export function getNarrativeResourceIndex(snapshot = {}) {
  const revision = createNarrativeResourceSnapshotRevision(snapshot)
  const key = `${text(snapshot?.projectId || snapshot?.worldbook?.id)}:${text(snapshot?.sessionId)}:${revision}`
  if (indexCache.has(key)) return indexCache.get(key)
  const index = createNarrativeResourceIndex(snapshot)
  indexCache.set(key, index)
  while (indexCache.size > CACHE_LIMIT) {
    indexCache.delete(indexCache.keys().next().value)
  }
  return index
}

function intersects(left = [], right = []) {
  if (right.length === 0) return true
  const expected = new Set(right.map((value) => text(value).toLowerCase()))
  return left.some((value) => expected.has(text(value).toLowerCase()))
}

function timeMatches(resourceTime, filterTime) {
  if (!filterTime?.from && !filterTime?.to) return true
  if (!resourceTime) return false
  const from = text(resourceTime.from)
  const to = text(resourceTime.to || resourceTime.from)
  if (filterTime.from && to && to < filterTime.from) return false
  if (filterTime.to && from && from > filterTime.to) return false
  return true
}

function matchesFilters(item, filters = {}) {
  if (!intersects([item.type], filters.entityTypes || [])) return false
  if (!intersects(item.placeIds, filters.placeIds || [])) return false
  if (!intersects(item.characterIds, filters.characterIds || [])) return false
  if ((filters.scopes || []).length > 0 && !filters.scopes.includes(item.scope)) return false
  return timeMatches(item.time, filters.timeRange)
}

function scoreResource(item, query, currentPlaceId = '') {
  const normalizedQuery = text(query).toLowerCase()
  if (!normalizedQuery) return { score: 0, reasons: ['structured-filter'] }
  const reasons = []
  let score = 0
  if (item.id.toLowerCase() === normalizedQuery) {
    score += 120
    reasons.push('exact-id')
  }
  const names = [item.title, ...item.aliases].map((value) => text(value).toLowerCase())
  if (names.includes(normalizedQuery)) {
    score += 90
    reasons.push('exact-name')
  } else if (names.some((value) => value.includes(normalizedQuery))) {
    score += 55
    reasons.push('name-contains')
  }
  if (item.searchableText.includes(normalizedQuery)) {
    score += 40
    reasons.push('text-contains')
  }
  const queryTokens = tokenize(normalizedQuery)
  const tokenSet = new Set(item.tokens)
  const matchedTokens = queryTokens.filter((token) => tokenSet.has(token))
  if (matchedTokens.length > 0) {
    score += matchedTokens.length * 8
    reasons.push(`token-match:${matchedTokens.slice(0, 4).join(',')}`)
  }
  if (currentPlaceId && item.placeIds.includes(currentPlaceId)) {
    score += 6
    reasons.push('current-place')
  }
  return { score, reasons }
}

export function searchNarrativeResources(index, domain, input = {}, options = {}) {
  const candidates = index?.byDomain?.get(domain) || []
  return candidates
    .filter((item) => matchesFilters(item, input.filters))
    .map((item) => ({ item, match: scoreResource(item, input.query, options.currentPlaceId) }))
    .filter((entry) => !input.query || entry.match.score > 0)
    .sort((left, right) => (
      right.match.score - left.match.score
      || right.item.updatedAt - left.item.updatedAt
      || left.item.id.localeCompare(right.item.id)
    ))
    .slice(0, input.limit || NARRATIVE_TOOL_LIMITS.maxItems)
    .map((entry) => ({ ...entry.item, matchReasons: entry.match.reasons }))
}

export function getNarrativeResources(index, domain, ids = [], filters = {}) {
  return ids
    .map((id) => index?.byId?.get(id))
    .filter((item) => item?.domain === domain && matchesFilters(item, filters))
    .map((item) => ({ ...item, matchReasons: ['exact-id'] }))
}

export function getRelatedNarrativeResources(index, domain, ids = [], filters = {}, limit = NARRATIVE_TOOL_LIMITS.maxItems) {
  const sourceIds = new Set(ids)
  const targetIds = new Set()
  for (const id of ids) {
    const source = index?.byId?.get(id)
    for (const item of source?.relations || []) targetIds.add(item.targetId)
  }
  return (index?.byDomain?.get(domain) || [])
    .filter((item) => !sourceIds.has(item.id))
    .filter((item) => targetIds.has(item.id) || item.relations.some((relationItem) => sourceIds.has(relationItem.targetId)))
    .filter((item) => matchesFilters(item, filters))
    .slice(0, limit)
    .map((item) => ({ ...item, matchReasons: ['relation-hop'] }))
}

export function traceNarrativeHistory(index, ids = [], filters = {}, limit = NARRATIVE_TOOL_LIMITS.maxItems) {
  const queue = [...ids]
  const seen = new Set()
  const result = []
  while (queue.length > 0 && result.length < limit) {
    const id = queue.shift()
    if (seen.has(id)) continue
    seen.add(id)
    const item = index?.byId?.get(id)
    if (item?.domain === 'history') {
      if (matchesFilters(item, filters)) {
        result.push({ ...item, matchReasons: result.length === 0 ? ['trace-root'] : ['history-link'] })
      }
      for (const relationItem of item.relations) {
        if (index?.byId?.get(relationItem.targetId)?.domain === 'history') queue.push(relationItem.targetId)
      }
    }
    for (const candidate of index?.byDomain?.get('history') || []) {
      if (candidate.relations.some((relationItem) => relationItem.targetId === id)) queue.push(candidate.id)
    }
  }
  return result
}

export function toNarrativeToolItems(resources = [], action = 'search') {
  const perItemLimit = action === 'get'
    ? NARRATIVE_TOOL_LIMITS.maxGetItemChars
    : NARRATIVE_TOOL_LIMITS.maxItemChars
  let usedChars = 0
  let truncated = false
  const items = []
  for (const item of resources) {
    const summary = clip(item.summary, perItemLimit)
    const output = {
      id: item.id,
      type: item.type,
      title: item.title,
      summary,
      relations: item.relations.slice(0, 12),
      sourceRefs: item.sourceRefs.slice(0, 12),
      matchReasons: (item.matchReasons || []).slice(0, 6)
    }
    const chars = JSON.stringify(output).length
    if (usedChars + chars > NARRATIVE_TOOL_LIMITS.maxResultChars) {
      truncated = true
      break
    }
    usedChars += chars
    items.push(output)
  }
  return { items, truncated, chars: usedChars }
}
