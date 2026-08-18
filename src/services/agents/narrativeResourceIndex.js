import {
  NARRATIVE_TOOL_LIMITS,
  createNarrativeRevision,
  createNarrativeCursor,
  parseNarrativeCursor
} from '../../../shared/narrativeAgentContract'
import { buildPlaceEntityIndex } from '../worldHistory/placeEntity'
// P1-5：与 worldbookContextBuilder 共用同一关键词匹配原语
import { keyMatches } from '../worldbookContextBuilder'

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

function resolveTrust(input, domain, sourceRefs) {
  const explicit = text(input.trust)
  if (['canonical', 'confirmed-memory', 'runtime-confirmed', 'draft'].includes(explicit)) return explicit
  if (domain === 'memory') return 'confirmed-memory'
  if (sourceRefs.some((ref) => ref.startsWith('runtime-event:'))) return 'runtime-confirmed'
  if (sourceRefs.some((ref) => ref.startsWith('worldbook-entry:'))) return 'canonical'
  return domain === 'world' || domain === 'geo' ? 'draft' : 'runtime-confirmed'
}

function resolveConflictState(input) {
  if (input.stale === true || text(input.conflictState).toLowerCase() === 'stale') return 'stale'
  if (text(input.conflictState).toLowerCase() === 'active-conflict' || input.conflicted === true) {
    return 'active-conflict'
  }
  return 'clean'
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
  const sourceRefs = unique(input.sourceRefs || [])
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
    sourceRefs,
    trust: resolveTrust(input, text(input.domain), sourceRefs),
    conflictState: resolveConflictState(input),
    conflictRefs: unique(input.conflictRefs || []),
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
        trust: 'canonical',
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
        trust: 'canonical',
        conflictState: entry?.conflictState || entry?.metadata?.conflictState,
        conflictRefs: entry?.conflictRefs || entry?.metadata?.conflictRefs,
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
    trust: entity.entryIds?.length ? 'canonical' : 'draft',
    conflictState: entity.ref?.bindingStatus === 'stale'
      ? 'stale'
      : entity.ref?.bindingStatus === 'conflict'
        ? 'active-conflict'
        : 'clean',
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
    trust: kind === 'player-history' ? 'runtime-confirmed' : 'canonical',
    conflictState: node?.stale === true || node?.status === 'stale'
      ? 'stale'
      : node?.conflicts?.length || node?.conflictState === 'active-conflict'
        ? 'active-conflict'
        : 'clean',
    conflictRefs: node?.conflictIds || node?.conflictRefs || [],
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
      // R5：记忆 provenance —— 候选的结构化上下文（谁/在哪/何时/哪个回合），供追溯
      provenance: {
        source: 'memory-candidate',
        candidateId: memory?.id,
        speaker: memory?.metadata?.speaker || null,
        place: memory?.metadata?.place || null,
        time: memory?.metadata?.time || null,
        turnId: memory?.metadata?.turnId || null,
        sourceRef: memory?.sourceRef || null,
      },
      trust: 'confirmed-memory',
      conflictState: memory?.metadata?.conflictState || (memory?.status === 'stale' ? 'stale' : 'clean'),
      conflictRefs: memory?.metadata?.conflictRefs || [],
      updatedAt: memory?.updatedAt || memory?.createdAt
    }))
    .filter((item) => item.id && item.summary)
}

function politicsId(prefix, value, legacyPrefixes = []) {
  const normalized = text(value)
  if (!normalized) return ''
  const matchedPrefix = [prefix, ...legacyPrefixes]
    .map((item) => `${item}:`)
    .find((item) => normalized.startsWith(item))
  const suffix = matchedPrefix ? normalized.slice(matchedPrefix.length) : normalized
  return suffix ? `${prefix}:${suffix}` : ''
}

function politicsResources(runtimeState = {}) {
  const resources = []
  const factionRelations = runtimeState?.factionRelations
  const characterRelations = runtimeState?.characterRelations
  const canonicalFacts = runtimeState?.canonicalFacts
  const placeStates = runtimeState?.placeStates
  const factionEntries = factionRelations && typeof factionRelations === 'object' && !Array.isArray(factionRelations)
    ? Object.entries(factionRelations).slice(0, 32)
    : []
  const factEntries = canonicalFacts && typeof canonicalFacts === 'object' && !Array.isArray(canonicalFacts)
    ? Object.entries(canonicalFacts).slice(0, 32)
    : []
  const placeEntries = placeStates && typeof placeStates === 'object' && !Array.isArray(placeStates)
    ? Object.entries(placeStates).slice(0, 32)
    : []
  if (factionRelations && typeof factionRelations === 'object' && !Array.isArray(factionRelations)) {
    for (const [name, rawScore] of factionEntries) {
      const faction = text(name)
      const score = Number(rawScore)
      if (!faction || !Number.isFinite(score)) continue
      resources.push(resource({
        id: politicsId('faction', faction),
        domain: 'politics',
        type: 'faction-relation',
        title: faction,
        summary: `当前关系值：${Math.max(-100, Math.min(100, Math.round(score)))}`,
        aliases: [faction],
        relations: [
          ...placeEntries
            .filter(([, state]) => text(state?.controllerId) === faction)
            .map(([placeId]) => relation('controls', politicsId('place-control', placeId))),
          ...factEntries
            .filter(([, fact]) => text(fact?.subjectId) === faction || text(fact?.value) === faction)
            .map(([factId]) => relation('canonical-fact', politicsId('fact', factId)))
        ],
        sourceRefs: [`runtime-state:factionRelations:${faction}`],
        trust: 'runtime-confirmed'
      }))
    }
  }

  if (characterRelations && typeof characterRelations === 'object' && !Array.isArray(characterRelations)) {
    for (const [relationId, relationState] of Object.entries(characterRelations).slice(0, 32)) {
      const id = text(relationId)
      const subjectId = text(relationState?.subjectId)
      const objectId = text(relationState?.objectId)
      const kind = text(relationState?.kind)
      if (!id || !subjectId || !objectId || !kind) continue
      const status = text(relationState?.status || 'confirmed')
      const sourceRefs = unique(relationState?.sourceRefs || [])
      resources.push(resource({
        id: politicsId('character-relation', id, ['relation']),
        domain: 'politics',
        type: 'character-relation',
        title: `${subjectId} / ${objectId}`,
        summary: `${subjectId} 与 ${objectId} 的关系：${kind}（${status}）`,
        aliases: [subjectId, objectId, kind],
        characterIds: [subjectId, objectId],
        relations: [relation('character', subjectId), relation('character', objectId)],
        sourceRefs,
        trust: 'runtime-confirmed',
        conflictState: ['ended', 'terminated', 'stale'].includes(status)
          ? 'stale'
          : status === 'disputed' ? 'active-conflict' : 'clean'
      }))
    }
  }

  if (canonicalFacts && typeof canonicalFacts === 'object' && !Array.isArray(canonicalFacts)) {
    for (const [factId, fact] of factEntries) {
      const id = text(factId)
      const subjectId = text(fact?.subjectId)
      const predicate = text(fact?.predicate)
      const status = text(fact?.status || 'confirmed')
      if (!id || !subjectId || !predicate || !['confirmed', 'disputed'].includes(status)) continue
      const value = fact?.value == null ? '' : text(fact.value)
      const sourceRefs = unique(fact?.sourceRefs || [])
      const politicalTarget = (value) => {
        const normalized = text(value)
        if (factionEntries.some(([name]) => text(name) === normalized)) return politicsId('faction', normalized)
        if (placeEntries.some(([placeId]) => text(placeId) === normalized)) return politicsId('place-control', normalized)
        return normalized
      }
      resources.push(resource({
        id: politicsId('fact', id),
        domain: 'politics',
        type: 'canonical-fact',
        title: `${subjectId}：${predicate}`,
        summary: `${subjectId} ${predicate}${value ? `：${value}` : ''}（${status}）`,
        aliases: [subjectId, predicate, value],
        relations: [relation('subject', politicalTarget(subjectId)), relation('object', politicalTarget(value))],
        sourceRefs,
        trust: 'runtime-confirmed',
        conflictState: status === 'disputed' ? 'active-conflict' : 'clean',
        conflictRefs: fact?.conflictRefs || []
      }))
    }
  }

  if (placeStates && typeof placeStates === 'object' && !Array.isArray(placeStates)) {
    for (const [placeId, placeState] of placeEntries) {
      const place = text(placeId)
      const status = text(placeState?.status)
      const controllerId = text(placeState?.controllerId)
      const danger = Number(placeState?.danger)
      if (!place || (!status && !controllerId && !Number.isFinite(danger))) continue
      resources.push(resource({
        id: politicsId('place-control', place),
        domain: 'politics',
        type: 'place-control',
        title: place,
        summary: [
          controllerId ? `当前控制：${controllerId}` : '',
          status ? `状态：${status}` : '',
          Number.isFinite(danger) ? `危险度：${Math.max(0, Math.min(100, danger))}` : ''
        ].filter(Boolean).join('；'),
        aliases: [place, controllerId, status],
        placeIds: [place],
        relations: [
          relation('controller', politicsId('faction', controllerId)),
          ...factEntries
            .filter(([, fact]) => text(fact?.subjectId) === place || text(fact?.value) === place)
            .map(([factId]) => relation('canonical-fact', politicsId('fact', factId)))
        ],
        sourceRefs: [`runtime-state:placeStates:${place}`],
        trust: 'runtime-confirmed'
      }))
    }
  }

  return resources.filter((item) => item.id && item.summary)
}

export function createNarrativeResourceSnapshotRevision(snapshot = {}) {
  const worldbook = snapshot?.worldbook || {}
  const runtimeState = snapshot?.runtimeState || {}
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
      text(entry?.content),
      text(entry?.name),
      entry?.keys || [],
      entry?.relations || {},
      text(entry?.conflictState || entry?.metadata?.conflictState)
    ]),
    history: [
      ...(worldbook?.geoHistory?.nodes || []),
      ...(worldbook?.geoHistory?.playerNodes || [])
    ].map((node) => [
      text(node?.id),
      text(node?.summary),
      Number(node?.updatedAt || node?.capturedAt || 0),
      text(node?.placeId || node?.placeRef?.placeId),
      node?.relations || [],
      node?.conflicts || [],
      node?.stale === true
    ]),
    memories: (snapshot?.memories || []).map((memory) => [
      text(memory?.id),
      text(memory?.status),
      Number(memory?.updatedAt || memory?.createdAt || 0),
      text(memory?.content)
    ]),
    politics: {
      factionRelations: runtimeState?.factionRelations || {},
      characterRelations: runtimeState?.characterRelations || {},
      canonicalFacts: runtimeState?.canonicalFacts || {},
      placeStates: runtimeState?.placeStates || {},
      worldMapState: runtimeState?.worldMapState || {}
    }
  })
}

export function createNarrativeResourceIndex(snapshot = {}) {
  const resources = [
    ...worldResources(snapshot?.worldbook),
    ...geoResources(snapshot?.worldbook),
    ...historyResources(snapshot?.worldbook),
    ...memoryResources(snapshot?.memories),
    ...politicsResources(snapshot?.runtimeState)
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
    counts: Object.fromEntries(['world', 'geo', 'history', 'memory', 'politics'].map((domain) => [
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
  // P1-5：名称/别名匹配与 worldbookContextBuilder 共用同一 keyMatches 原语
  // （默认小写子串；条目可声明 caseSensitive/wholeWord 时按需生效）。
  const names = [item.title, ...item.aliases].filter(Boolean)
  const exactName = names.find((value) => keyMatches(query, value))
  if (exactName) {
    score += 90
    reasons.push('exact-name')
  } else if (names.some((value) => text(value).toLowerCase().includes(normalizedQuery))) {
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

function sortKey(score, updatedAt = 0) {
  return `${String(Math.max(0, Math.round(score))).padStart(6, '0')}:${String(Math.max(0, Number(updatedAt) || 0)).padStart(20, '0')}`
}

function cursorFailure(parsed) {
  const error = new Error(parsed?.error?.message || '叙事 cursor 无效')
  error.code = parsed?.error?.code || 'NARRATIVE_CURSOR_INVALID'
  return error
}

function pageResources(resources, {
  revision,
  domain,
  input = {},
  ranked = false
} = {}) {
  const source = Array.isArray(resources) ? resources : []
  const cursorResult = input.cursor
    ? parseNarrativeCursor(input.cursor, { revision, domain })
    : { valid: true, cursor: null }
  if (!cursorResult.valid) throw cursorFailure(cursorResult)
  const cursor = cursorResult.cursor
  const rankedResources = source.map((item, index) => ({
    item,
    sortKey: ranked
      ? (item._searchSortKey || sortKey(item._searchScore, item.updatedAt))
      : String(index).padStart(8, '0')
  }))
  let startIndex = 0
  if (cursor) {
    startIndex = rankedResources.findIndex((entry) => (
      entry.sortKey > cursor.sortKey
      || (entry.sortKey === cursor.sortKey && entry.item.id > cursor.itemId)
    ))
    if (startIndex < 0) startIndex = rankedResources.length
  }
  const limit = Math.max(1, Number(input.limit) || NARRATIVE_TOOL_LIMITS.maxItems)
  const selected = rankedResources.slice(startIndex, startIndex + limit)
  const output = selected.map((entry) => entry.item)
  const hasMore = startIndex + limit < rankedResources.length
  const nextCursor = hasMore && selected.length > 0
    ? createNarrativeCursor({
        revision,
        domain,
        sortKey: selected[selected.length - 1].sortKey,
        itemId: selected[selected.length - 1].item.id
      })
    : ''
  Object.defineProperty(output, 'nextCursor', { value: nextCursor, enumerable: false })
  return output
}

export function searchNarrativeResources(index, domain, input = {}, options = {}) {
  const candidates = index?.byDomain?.get(domain) || []
  const ranked = candidates
    .filter((item) => matchesFilters(item, input.filters))
    .map((item) => ({ item, match: scoreResource(item, input.query, options.currentPlaceId) }))
    .filter((entry) => !input.query || entry.match.score > 0)
    .sort((left, right) => (
      right.match.score - left.match.score
      || right.item.updatedAt - left.item.updatedAt
      || left.item.id.localeCompare(right.item.id)
    ))
    .map((entry) => ({
      ...entry.item,
      matchReasons: entry.match.reasons,
      _searchSortKey: sortKey(entry.match.score, entry.item.updatedAt),
      _searchScore: entry.match.score
    }))
  const paged = pageResources(ranked, {
    revision: index?.revision,
    domain,
    input,
    ranked: true
  })
  const output = paged.map(({ _searchSortKey, _searchScore, ...item }) => item)
  Object.defineProperty(output, 'nextCursor', {
    value: paged.nextCursor || '',
    enumerable: false
  })
  return output
}

export function getNarrativeResources(index, domain, ids = [], filters = {}, options = {}) {
  const resources = ids
    .map((id) => index?.byId?.get(id))
    .filter((item) => item?.domain === domain && matchesFilters(item, filters))
    .map((item) => ({ ...item, matchReasons: ['exact-id'] }))
  return pageResources(resources, {
    revision: index?.revision,
    domain,
    input: { ...filters, cursor: options.cursor, limit: options.limit }
  })
}

export function getRelatedNarrativeResources(index, domain, ids = [], filters = {}, limit = NARRATIVE_TOOL_LIMITS.maxItems, options = {}) {
  const sourceIds = new Set(ids)
  const targetIds = new Set()
  const sourcePaths = []
  for (const id of ids) {
    const source = index?.byId?.get(id)
    for (const item of source?.relations || []) {
      targetIds.add(item.targetId)
      sourcePaths.push({ from: id, to: item.targetId, edgeType: item.type, depth: 1 })
    }
  }
  const resources = (index?.byDomain?.get(domain) || [])
    .filter((item) => !sourceIds.has(item.id))
    .filter((item) => targetIds.has(item.id) || item.relations.some((relationItem) => sourceIds.has(relationItem.targetId)))
    .filter((item) => matchesFilters(item, filters))
    .map((item) => ({
      ...item,
      matchReasons: ['relation-hop'],
      relationPath: sourcePaths.filter((path) => path.to === item.id).slice(0, 4)
    }))
  return pageResources(resources, {
    revision: index?.revision,
    domain,
    input: { ...filters, limit, cursor: options.cursor }
  })
}

function politicsScore(item) {
  const match = text(item?.summary).match(/-?\d+/)
  return match ? Math.abs(Number(match[0])) : 0
}

export function getCurrentNarrativePolitics(index, filters = {}, options = {}, context = {}) {
  const resources = index?.byDomain?.get('politics') || []
  const currentPlaceId = text(context?.currentPlaceId || options?.currentPlaceId)
  const place = resources
    .filter((item) => item.type === 'place-control')
    .filter((item) => !currentPlaceId || item.placeIds.includes(currentPlaceId))
  const factions = resources
    .filter((item) => item.type === 'faction-relation')
    .sort((left, right) => politicsScore(right) - politicsScore(left) || left.id.localeCompare(right.id))
  const conflicts = resources.filter((item) => item.conflictState === 'active-conflict')
  const selected = [...place, ...factions, ...conflicts]
    .filter((item, position, values) => values.findIndex((candidate) => candidate.id === item.id) === position)
    .filter((item) => matchesFilters(item, filters))
    .slice(0, NARRATIVE_TOOL_LIMITS.maxItems)
  Object.defineProperty(selected, 'nextCursor', { value: '', enumerable: false })
  return selected
}

export function traceNarrativePolitics(index, ids = [], filters = {}, limit = NARRATIVE_TOOL_LIMITS.maxItems, options = {}) {
  const queue = ids.map((id) => ({ id, depth: 0 }))
  const seen = new Set()
  const result = []
  const resources = index?.byDomain?.get('politics') || []
  while (queue.length > 0 && result.length < limit) {
    const current = queue.shift()
    if (!current || seen.has(current.id)) continue
    seen.add(current.id)
    const item = index?.byId?.get(current.id)
    if (item?.domain !== 'politics') continue
    if (matchesFilters(item, filters)) {
      result.push({
        ...item,
        matchReasons: current.depth === 0 ? ['trace-root'] : ['politics-link'],
        depth: current.depth,
        relationPath: item.relations.slice(0, 4).map((relationItem) => ({
          from: item.id,
          to: relationItem.targetId,
          edgeType: relationItem.type,
          depth: current.depth
        }))
      })
    }
    for (const relationItem of item.relations) {
      if (index?.byId?.get(relationItem.targetId)?.domain === 'politics') {
        queue.push({ id: relationItem.targetId, depth: current.depth + 1 })
      }
    }
    for (const candidate of resources) {
      if (candidate.relations.some((relationItem) => relationItem.targetId === current.id)) {
        queue.push({ id: candidate.id, depth: current.depth + 1 })
      }
    }
  }
  Object.defineProperty(result, 'nextCursor', { value: '', enumerable: false })
  return result
}

export function traceNarrativeHistory(index, ids = [], filters = {}, limit = NARRATIVE_TOOL_LIMITS.maxItems, options = {}) {
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
  const output = pageResources(result, {
    revision: index?.revision,
    domain: 'history',
    input: { ...filters, limit, cursor: options.cursor }
  })
  return output.map((item, index) => ({
    ...item,
    depth: index === 0 ? 0 : 1,
    relationPath: item.relations
      .filter((relationItem) => ids.includes(relationItem.targetId) || relationItem.type.includes('history'))
      .slice(0, 4)
      .map((relationItem) => ({
        from: item.id,
        to: relationItem.targetId,
        edgeType: relationItem.type,
        depth: index === 0 ? 0 : 1
      }))
  }))
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
      aliases: item.aliases.slice(0, 8),
      summary,
      relations: item.relations.slice(0, 12),
      relationPath: (item.relationPath || []).slice(0, 8),
      depth: Number.isFinite(Number(item.depth)) ? Number(item.depth) : 0,
      sourceRefs: item.sourceRefs.slice(0, 12),
      matchReasons: (item.matchReasons || []).slice(0, 6),
      trust: item.trust || 'draft',
      conflictState: item.conflictState || 'clean',
      conflictRefs: (item.conflictRefs || []).slice(0, 8),
      eligibleEvidence: item.trust !== 'draft' && item.conflictState === 'clean'
    }
    const chars = JSON.stringify(output).length
    if (usedChars + chars > NARRATIVE_TOOL_LIMITS.maxResultChars) {
      truncated = true
      break
    }
    usedChars += chars
    items.push(output)
  }
  return {
    items,
    truncated,
    chars: usedChars,
    nextCursor: resources.nextCursor || ''
  }
}
