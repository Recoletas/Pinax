/**
 * playerHistory - V1 player-history writeback helper.
 *
 * Pure functions only; no game store mutation, no localStorage side effects.
 * The runtime store uses these helpers to turn a session's latest plotJournal
 * chunk into a bounded playerHistoryNode and merge it into world history.
 */

const PLAYER_HISTORY_SCHEMA_VERSION = 1

const DEFAULT_LOOKBACK = 4
const MAX_PARTICIPANTS = 6
const MAX_LOCATIONS = 4
const MAX_KEY_CHOICES = 4
const MAX_UNRESOLVED_HOOKS = 6
const MAX_SUMMARY_CHARS = 280
const MAX_PLAYER_HISTORY_NODES = 100
const PLAYER_HISTORY_CONTEXT_LIMIT = 3
const MAX_CONTEXT_SUMMARIES = 3

function clampInt(value, fallback) {
  const num = Math.floor(Number(value))
  if (!Number.isFinite(num) || num <= 0) return fallback
  return num
}

function normalizeTextValue(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function uniquePush(list, seen, value) {
  const text = normalizeTextValue(value)
  if (!text) return
  const key = text.toLowerCase()
  if (seen.has(key)) return
  seen.add(key)
  list.push(text)
}

function pickField(entry, field) {
  if (!entry || typeof entry !== 'object') return null
  const raw = entry[field]
  return Array.isArray(raw) ? raw : null
}

function stableHash(value) {
  let hash = 2166136261
  for (const character of String(value || '')) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function buildStableId(ts, fingerprint) {
  const safeTs = Number.isFinite(ts) && ts > 0 ? Math.floor(ts) : 0
  return `phn_${safeTs.toString(36)}_${stableHash(fingerprint)}`
}

function clampSummary(summary) {
  const text = normalizeTextValue(summary)
  if (text.length <= MAX_SUMMARY_CHARS) return text
  return `${text.slice(0, MAX_SUMMARY_CHARS - 1)}…`
}

function normalizePlaceRef(raw) {
  if (!raw || typeof raw !== 'object') return null
  const placeId = normalizeTextValue(raw.placeId || raw.id)
  if (!placeId) return null
  const placeRef = { placeId }
  for (const field of ['worldbookId', 'mapId', 'siteId', 'cellId']) {
    const value = normalizeTextValue(raw[field])
    if (value) placeRef[field] = value
  }
  return placeRef
}

function getSourceEntryId(entry, index) {
  return normalizeTextValue(entry?.id || entry?.chapterId || entry?.sourceId)
    || `window-entry-${index + 1}`
}

function normalizePlayerHistoryNode(raw) {
  if (!raw || typeof raw !== 'object') return null
  const summary = normalizeTextValue(raw.summary)
  const id = normalizeTextValue(raw.id)
  if (!id || !summary) return null
  return { ...raw, id, summary }
}

function normalizeContextNode(raw) {
  if (!raw || typeof raw !== 'object') return null
  const summary = normalizeTextValue(raw.summary)
  return summary ? { ...raw, summary } : null
}

function normalizeWorldStateSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null
  const map = raw.worldMapState && typeof raw.worldMapState === 'object'
    ? raw.worldMapState
    : (raw.place && typeof raw.place === 'object' ? raw.place : {})
  const time = raw.writingTime && typeof raw.writingTime === 'object'
    ? raw.writingTime
    : (raw.time && typeof raw.time === 'object' ? raw.time : {})
  const factions = raw.factionRelations && typeof raw.factionRelations === 'object'
    ? raw.factionRelations
    : (raw.factions && typeof raw.factions === 'object' ? raw.factions : {})
  const normalizedFactions = Object.entries(factions)
    .map(([name, score]) => [normalizeTextValue(name), Number(score)])
    .filter(([name, score]) => name && Number.isFinite(score))
    .slice(0, 16)
    .reduce((result, [name, score]) => {
      result[name] = Math.max(-100, Math.min(100, Math.round(score)))
      return result
    }, {})
  const activeThreads = (Array.isArray(raw.goals) ? raw.goals : Array.isArray(raw.activeThreads) ? raw.activeThreads : [])
    .map((item) => normalizeTextValue(item?.title || item?.label || item))
    .filter(Boolean)
    .slice(0, 8)
  const characters = (Array.isArray(raw.encounteredCharacters) ? raw.encounteredCharacters : [])
    .map((item) => normalizeTextValue(item?.name || item))
    .filter(Boolean)
    .slice(-8)

  return {
    turn: Math.max(0, Math.floor(Number(raw.turn) || 0)),
    time: {
      eraId: normalizeTextValue(time.eraId),
      eraName: normalizeTextValue(time.eraName),
      year: normalizeTextValue(time.year),
      month: normalizeTextValue(time.month),
      day: normalizeTextValue(time.day)
    },
    place: {
      placeId: normalizeTextValue(map.placeId),
      country: normalizeTextValue(map.currentCountry || map.country),
      city: normalizeTextValue(map.currentCity || map.city),
      scene: normalizeTextValue(map.currentScene || map.scene)
    },
    factions: normalizedFactions,
    characters,
    activeThreads
  }
}

export function getPlayerHistoryNodeKey(node) {
  if (!node || typeof node !== 'object') return ''
  const id = normalizeTextValue(node.id)
  if (id) return id
  return [
    normalizeTextValue(node.sourceNodeId),
    normalizeTextValue(node.windowStart),
    normalizeTextValue(node.windowEnd),
    ...(Array.isArray(node.sourceEntryIds) ? node.sourceEntryIds.map(normalizeTextValue) : [])
  ].join('|')
}

/**
 * buildPlayerHistoryNodeFromPlotJournal(latestPlotJournal, currentHistoryNode, options)
 *
 * Aggregates the most recent plotJournal entries into a single player
 * history node, anchored to `currentHistoryNode.id` when present so that
 * consecutive runs of the same parent form a thread.
 *
 * Pure function; safe to call repeatedly. Returns null when the input is
 * unusable (empty journal, missing timestamps).
 *
 * @param {Array} latestPlotJournal  ordered plotJournal entries (oldest → newest)
 * @param {object|null} currentHistoryNode  the active parent history node (or null)
 * @param {object} [options]
 * @param {number} [options.lookback=4]   number of recent entries to aggregate
 * @param {number} [options.now]         override "now" timestamp (for tests)
 * @returns {object|null} playerHistoryNode
 */
export function buildPlayerHistoryNodeFromPlotJournal(
  latestPlotJournal = [],
  currentHistoryNode = null,
  options = {}
) {
  if (!Array.isArray(latestPlotJournal) || latestPlotJournal.length === 0) return null

  const lookback = clampInt(options?.lookback, DEFAULT_LOOKBACK)
  const now = Number.isFinite(Number(options?.now)) ? Math.floor(Number(options.now)) : Date.now()
  const window = latestPlotJournal.slice(-lookback)

  const firstEntry = window[0]
  const lastEntry = window[window.length - 1]
  const earliestTs = Number(firstEntry?.createdAt || firstEntry?.ts) || null
  const latestTs = Number(lastEntry?.createdAt || lastEntry?.ts) || now
  if (!Number.isFinite(earliestTs) && !Number.isFinite(latestTs)) return null

  const participants = []
  const participantSeen = new Set()
  const locations = []
  const locationSeen = new Set()
  const keyChoices = []
  const keyChoiceSeen = new Set()
  const unresolvedHooks = []
  const hookSeen = new Set()

  for (const entry of window) {
    for (const name of pickField(entry, 'participants') || []) uniquePush(participants, participantSeen, name)
    for (const name of pickField(entry, 'locations') || []) uniquePush(locations, locationSeen, name)
    for (const choice of pickField(entry, 'keyChoices') || []) uniquePush(keyChoices, keyChoiceSeen, choice)
    for (const hook of pickField(entry, 'unresolvedHooks') || []) uniquePush(unresolvedHooks, hookSeen, hook)
  }

  const summaryParts = []
  for (const entry of window) {
    const summary = normalizeTextValue(entry?.summary)
    if (summary) summaryParts.push(summary)
  }
  const summary = clampSummary(summaryParts.join(' / '))

  const sourceNodeId = currentHistoryNode && typeof currentHistoryNode === 'object'
    ? normalizeTextValue(currentHistoryNode.id)
    : ''

  const sourceEntryIds = window.map(getSourceEntryId)
  const placeRef = normalizePlaceRef(
    options?.placeRef
      || currentHistoryNode?.placeRef
      || currentHistoryNode?.place
  )
  const placeId = normalizeTextValue(
    options?.placeId
      || placeRef?.placeId
      || currentHistoryNode?.placeId
      || currentHistoryNode?.mapBinding?.placeId
  )
  const fingerprint = [
    sourceNodeId,
    earliestTs || latestTs,
    latestTs,
    ...sourceEntryIds,
    summary
  ].join('|')

  const node = {
    v: PLAYER_HISTORY_SCHEMA_VERSION,
    id: buildStableId(latestTs, fingerprint),
    sourceNodeId,
    kind: 'player-history-v1',
    summary,
    entryCount: window.length,
    participants: participants.slice(0, MAX_PARTICIPANTS),
    locations: locations.slice(0, MAX_LOCATIONS),
    keyChoices: keyChoices.slice(0, MAX_KEY_CHOICES),
    unresolvedHooks: unresolvedHooks.slice(0, MAX_UNRESOLVED_HOOKS),
    sourceEntryIds,
    windowStart: earliestTs || latestTs,
    windowEnd: latestTs,
    capturedAt: now
  }

  if (placeId) node.placeId = placeId
  if (placeRef) node.placeRef = placeRef
  const worldStateSnapshot = normalizeWorldStateSnapshot(options?.worldStateSnapshot)
  if (worldStateSnapshot) node.worldStateSnapshot = worldStateSnapshot
  return node
}

/**
 * Append a player-history node without mutating the input container.
 * The same source window replaces the older copy, so retries are idempotent.
 */
export function appendPlayerHistoryNode(geoHistory, node, options = {}) {
  const normalizedNode = normalizePlayerHistoryNode(node)
  if (!normalizedNode) return geoHistory || null

  const source = Array.isArray(geoHistory)
    ? { nodes: geoHistory.filter((item) => item && typeof item === 'object') }
    : (geoHistory && typeof geoHistory === 'object' ? geoHistory : { nodes: [] })
  const nodes = Array.isArray(source.nodes)
    ? source.nodes.filter((item) => item && typeof item === 'object')
    : []
  const playerNodes = Array.isArray(source.playerNodes)
    ? source.playerNodes.map(normalizePlayerHistoryNode).filter(Boolean)
    : []
  const key = getPlayerHistoryNodeKey(normalizedNode)
  const existingIndex = playerNodes.findIndex((item) => getPlayerHistoryNodeKey(item) === key)
  const nextPlayerNodes = [...playerNodes]

  if (existingIndex >= 0) nextPlayerNodes[existingIndex] = normalizedNode
  else nextPlayerNodes.push(normalizedNode)

  const maxNodes = clampInt(options?.maxNodes, MAX_PLAYER_HISTORY_NODES)
  return {
    ...source,
    version: Number.isFinite(Number(source.version)) ? Number(source.version) : 1,
    nodes,
    playerNodes: nextPlayerNodes.slice(-maxNodes)
  }
}

function appendUnique(list, seen, value, limit) {
  const normalized = normalizeTextValue(value)
  if (!normalized || seen.has(normalized.toLowerCase()) || list.length >= limit) return
  seen.add(normalized.toLowerCase())
  list.push(normalized)
}

/**
 * Build a small runtime context from recent player history.
 * Full playerNodes stay in worldbook storage; only bounded signals enter the prompt.
 */
export function buildPlayerHistoryContext(geoHistory, options = {}) {
  const rawNodes = Array.isArray(geoHistory?.playerNodes) ? geoHistory.playerNodes : []
  const nodes = rawNodes
    .map(normalizeContextNode)
    .filter(Boolean)
    .slice(-clampInt(options?.limit, PLAYER_HISTORY_CONTEXT_LIMIT))
  if (nodes.length === 0) return null

  const summaries = []
  const participants = []
  const locations = []
  const keyChoices = []
  const unresolvedHooks = []
  const placeIds = []
  const entryIds = []
  const seen = {
    participants: new Set(),
    locations: new Set(),
    keyChoices: new Set(),
    unresolvedHooks: new Set(),
    placeIds: new Set(),
    entryIds: new Set()
  }

  for (const node of nodes) {
    if (summaries.length < MAX_CONTEXT_SUMMARIES) {
      const summary = clampSummary(node.summary)
      if (summary) summaries.push(summary)
    }
    for (const value of Array.isArray(node.participants) ? node.participants : []) {
      appendUnique(participants, seen.participants, value, MAX_PARTICIPANTS)
    }
    for (const value of Array.isArray(node.locations) ? node.locations : []) {
      appendUnique(locations, seen.locations, value, MAX_LOCATIONS)
    }
    for (const value of Array.isArray(node.keyChoices) ? node.keyChoices : []) {
      appendUnique(keyChoices, seen.keyChoices, value, MAX_KEY_CHOICES)
    }
    for (const value of Array.isArray(node.unresolvedHooks) ? node.unresolvedHooks : []) {
      appendUnique(unresolvedHooks, seen.unresolvedHooks, value, MAX_UNRESOLVED_HOOKS)
    }
    for (const value of [node.placeId, node.placeRef?.placeId]) {
      appendUnique(placeIds, seen.placeIds, value, 6)
    }
    for (const value of Array.isArray(node.entryIds) ? node.entryIds : []) {
      appendUnique(entryIds, seen.entryIds, value, 12)
    }
  }

  return { summaries, participants, locations, keyChoices, unresolvedHooks, placeIds, entryIds }
}

export const PLAYER_HISTORY_LIMITS = {
  DEFAULT_LOOKBACK,
  MAX_PARTICIPANTS,
  MAX_LOCATIONS,
  MAX_KEY_CHOICES,
  MAX_UNRESOLVED_HOOKS,
  MAX_SUMMARY_CHARS,
  MAX_PLAYER_HISTORY_NODES,
  PLAYER_HISTORY_CONTEXT_LIMIT,
  PLAYER_HISTORY_SCHEMA_VERSION
}

export default {
  PLAYER_HISTORY_LIMITS,
  appendPlayerHistoryNode,
  buildPlayerHistoryContext,
  buildPlayerHistoryNodeFromPlotJournal,
  getPlayerHistoryNodeKey
}
