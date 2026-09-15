import { STORAGE_KEYS } from '../../composables/useStorage'
import { serializeCanvasCards } from '../media/canvasImageAssetBridge'
import { mutationFailure, mutationSuccess } from '../storage/durableMutationResult.js'

export const PROSE_CANVAS_KEYS = Object.freeze({
  cards: STORAGE_KEYS.PROSE_CARDS_V1,
  edges: STORAGE_KEYS.PROSE_EDGES_V1,
  outline: STORAGE_KEYS.PROSE_OUTLINE_V1,
  timeline: STORAGE_KEYS.PROSE_TIMELINE_V1,
  piles: STORAGE_KEYS.PROSE_PILES_V1,
  commits: STORAGE_KEYS.PROSE_COMMITS_V1,
  branches: STORAGE_KEYS.PROSE_BRANCHES_V1
})

const DEFAULT_BRANCHES = Object.freeze({
  current: 'main',
  list: [{ name: 'main', headCommitId: null }]
})

function storageOwner(storage) {
  const resolved = storage || globalThis.localStorage
  if (!resolved?.getItem || !resolved?.setItem) throw new Error('当前环境不支持画布存储')
  return resolved
}

function readJson(storage, key, fallback) {
  try {
    const value = JSON.parse(storage.getItem(key) || 'null')
    return value ?? fallback
  } catch {
    return fallback
  }
}

export function readProseCanvasWorkspace(options = {}) {
  const storage = storageOwner(options.storage)
  return {
    cards: readJson(storage, PROSE_CANVAS_KEYS.cards, []),
    edges: readJson(storage, PROSE_CANVAS_KEYS.edges, []),
    outline: readJson(storage, PROSE_CANVAS_KEYS.outline, []),
    timeline: readJson(storage, PROSE_CANVAS_KEYS.timeline, []),
    piles: readJson(storage, PROSE_CANVAS_KEYS.piles, []),
    commits: readJson(storage, PROSE_CANVAS_KEYS.commits, []),
    branches: readJson(storage, PROSE_CANVAS_KEYS.branches, DEFAULT_BRANCHES)
  }
}

export function saveProseCanvasWorkspace(workspace = {}, options = {}) {
  let storage
  try {
    storage = storageOwner(options.storage)
  } catch (error) {
    return mutationFailure('storage-unavailable', { message: error.message, retryable: false })
  }

  const payloads = {
    [PROSE_CANVAS_KEYS.cards]: serializeCanvasCards(workspace.cards),
    [PROSE_CANVAS_KEYS.edges]: Array.isArray(workspace.edges) ? workspace.edges : [],
    [PROSE_CANVAS_KEYS.outline]: Array.isArray(workspace.outline) ? workspace.outline : [],
    [PROSE_CANVAS_KEYS.timeline]: Array.isArray(workspace.timeline) ? workspace.timeline : [],
    [PROSE_CANVAS_KEYS.piles]: Array.isArray(workspace.piles) ? workspace.piles : [],
    [PROSE_CANVAS_KEYS.commits]: Array.isArray(workspace.commits) ? workspace.commits.slice(0, 50) : [],
    [PROSE_CANVAS_KEYS.branches]: workspace.branches || DEFAULT_BRANCHES
  }
  const previous = new Map(Object.keys(payloads).map((key) => [key, storage.getItem(key)]))

  try {
    for (const [key, value] of Object.entries(payloads)) storage.setItem(key, JSON.stringify(value))
    return mutationSuccess({ workspace: readProseCanvasWorkspace({ storage }) })
  } catch (error) {
    let rollbackOk = true
    for (const [key, value] of previous.entries()) {
      try {
        if (value == null) storage.removeItem(key)
        else storage.setItem(key, value)
      } catch {
        rollbackOk = false
      }
    }
    return mutationFailure('storage-write-failed', {
      message: String(error?.message || '画布写入失败'),
      retryable: true,
      rollbackOk
    })
  }
}
