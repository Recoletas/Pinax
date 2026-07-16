import { buildPlayerHistoryContext } from '../playerHistory'
import { buildPlaceEntityIndex, resolvePlaceEntity } from './placeEntity'

const MAX_HISTORY_NODES = 4
const MAX_SUMMARIES = 6
const MAX_PARTICIPANTS = 12
const MAX_LOCATIONS = 8
const MAX_HOOKS = 12
const MAX_ENTRY_IDS = 24

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function addUnique(list, seen, value, limit) {
  const normalized = normalizeText(value)
  if (!normalized || seen.has(normalized.toLowerCase()) || list.length >= limit) return
  seen.add(normalized.toLowerCase())
  list.push(normalized)
}

function nodePlaceId(node) {
  return normalizeText(
    node?.placeRef?.placeId
      || node?.placeId
      || node?.mapBinding?.placeId
  )
}

function nodeLocation(node) {
  return normalizeText(
    node?.locationHint
      || node?.placeRef?.name
      || node?.mapBinding?.scene
      || node?.mapBinding?.currentScene
      || node?.mapBinding?.city
      || node?.mapBinding?.currentCity
      || node?.mapBinding?.country
      || node?.mapBinding?.currentCountry
  )
}

function currentPlaceId({ worldMapState, historyNode } = {}) {
  return normalizeText(
    worldMapState?.placeId
      || historyNode?.placeRef?.placeId
      || historyNode?.placeId
      || historyNode?.mapBinding?.placeId
  )
}

function mergeContext(target, source) {
  if (!source) return
  for (const summary of source.summaries || []) addUnique(target.summaries, target.seen.summaries, summary, MAX_SUMMARIES)
  for (const participant of source.participants || []) addUnique(target.participants, target.seen.participants, participant, MAX_PARTICIPANTS)
  for (const location of source.locations || []) addUnique(target.locations, target.seen.locations, location, MAX_LOCATIONS)
  for (const hook of source.unresolvedHooks || []) addUnique(target.unresolvedHooks, target.seen.unresolvedHooks, hook, MAX_HOOKS)
  for (const entryId of source.entryIds || []) addUnique(target.entryIds, target.seen.entryIds, entryId, MAX_ENTRY_IDS)
  for (const placeId of source.placeIds || []) addUnique(target.placeIds, target.seen.placeIds, placeId, MAX_ENTRY_IDS)
}

/**
 * Select the small geo-history slice relevant to the current runtime place.
 * The full geoHistory remains persisted, but only matching nodes and recent
 * player history are exposed to prompt matching.
 */
export function buildGeoHistoryRuntimeContext({
  worldbook = null,
  geoHistory = null,
  worldMapState = null,
  historyNode = null,
  playerHistoryContext = null
} = {}) {
  const placeId = currentPlaceId({ worldMapState, historyNode })
  const rawNodes = Array.isArray(geoHistory?.nodes) ? geoHistory.nodes : []
  const placeIndex = buildPlaceEntityIndex({ worldbook, geoHistory })
  const placeEntity = placeId ? resolvePlaceEntity(placeIndex, placeId) : null
  const matchingNodes = (placeEntity?.historyNodes || rawNodes.filter((node) => {
    if (!placeId) return false
    return nodePlaceId(node) === placeId
  })).slice(-MAX_HISTORY_NODES)

  const result = {
    summaries: [],
    participants: [],
    locations: [],
    unresolvedHooks: [],
    placeIds: [],
    entryIds: [],
    historyNodeIds: [],
    seen: {
      summaries: new Set(),
      participants: new Set(),
      locations: new Set(),
      unresolvedHooks: new Set(),
      placeIds: new Set(),
      entryIds: new Set()
    }
  }

  for (const node of matchingNodes) {
    const nodeId = normalizeText(node?.id)
    const summary = normalizeText(node?.summary || node?.openingHook || node?.description)
    const location = nodeLocation(node)
    if (nodeId) result.historyNodeIds.push(nodeId)
    addUnique(result.summaries, result.seen.summaries, summary, MAX_SUMMARIES)
    addUnique(result.locations, result.seen.locations, location, MAX_LOCATIONS)
    addUnique(result.placeIds, result.seen.placeIds, nodePlaceId(node) || placeId, MAX_ENTRY_IDS)
    for (const participant of Array.isArray(node?.participants) ? node.participants : []) {
      addUnique(result.participants, result.seen.participants, participant, MAX_PARTICIPANTS)
    }
    for (const hook of Array.isArray(node?.unresolvedHooks) ? node.unresolvedHooks : []) {
      addUnique(result.unresolvedHooks, result.seen.unresolvedHooks, hook, MAX_HOOKS)
    }
    for (const entryId of Array.isArray(node?.entryIds) ? node.entryIds : []) {
      addUnique(result.entryIds, result.seen.entryIds, entryId, MAX_ENTRY_IDS)
    }
  }

  mergeContext(result, playerHistoryContext || buildPlayerHistoryContext(geoHistory))

  delete result.seen
  const hasSignals = Object.values(result).some((value) => Array.isArray(value) && value.length > 0)
  return hasSignals ? result : null
}

export default { buildGeoHistoryRuntimeContext }
