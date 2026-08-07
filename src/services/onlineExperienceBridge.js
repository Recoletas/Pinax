const RUNTIME_PATHS = [
  'writingCharacter',
  'writingTime',
  'placeStates',
  'characterStates',
  'characterRelations',
  'canonicalFacts',
  'worldMapState',
  'goals',
  'encounteredCharacters',
  'factionRelations',
  'keyChoices',
  'plotJournal',
  'activities'
]

export function buildOnlineRuntimePatch(snapshot = {}) {
  const state = {}
  const paths = []
  for (const path of RUNTIME_PATHS) {
    if (!Object.prototype.hasOwnProperty.call(snapshot, path)) continue
    state[path] = clone(snapshot[path])
    paths.push(path)
  }
  return { version: 1, paths, state }
}

export function applyOnlineNarrativeCompletion(gameStore, payload = {}) {
  const requestId = String(payload.requestId || '').trim()
  const requestEventId = String(payload.requestEventId || '').trim()
  const completionKey = requestId || requestEventId
  if (!completionKey || !gameStore || !Array.isArray(gameStore.messages)) return false
  if (gameStore.messages.some((message) => (
    message?.onlineRequestId === completionKey
    || message?.onlineRequestEventId === requestEventId
  ))) return false

  const actionText = String(payload.actionText || '').trim()
  const assistantContent = String(payload.assistantMessage?.content || payload.text || '').trim()
  if (!assistantContent) return false
  if (actionText) {
    gameStore.messages.push({
      role: 'user',
      content: actionText,
      timestamp: payload.createdAt || Date.now(),
      onlineRequestId: completionKey,
      onlineRequestEventId: requestEventId
    })
  }
  if (assistantContent) {
    gameStore.messages.push({
      ...payload.assistantMessage,
      role: 'assistant',
      content: assistantContent,
      timestamp: payload.assistantMessage?.timestamp || payload.createdAt || Date.now(),
      isStreaming: false,
      onlineRequestId: completionKey,
      onlineRequestEventId: requestEventId
    })
  }
  gameStore.rebuildChatHistory?.()
  gameStore.saveCurrentSession?.()
  return true
}

export function applyOnlineRuntimePatch(gameStore, patch = {}) {
  if (!gameStore || patch.version !== 1 || !patch.state || !Array.isArray(patch.paths)) return false
  const paths = patch.paths.filter((path) => RUNTIME_PATHS.includes(path))
  if (!paths.length) return false

  if (paths.includes('writingCharacter')) gameStore.saveWritingCharacter?.(patch.state.writingCharacter)
  if (paths.includes('writingTime')) gameStore.saveWritingTime?.(patch.state.writingTime)
  if (paths.includes('worldMapState')) gameStore.saveWorldMapState?.(patch.state.worldMapState)

  const rootPaths = paths.filter((path) => !['writingCharacter', 'writingTime', 'worldMapState'].includes(path))
  gameStore.applyEmergenceRuntimeRoots?.(patch.state, rootPaths)
  gameStore.saveCurrentSession?.()
  return true
}

function clone(value) {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value))
}
