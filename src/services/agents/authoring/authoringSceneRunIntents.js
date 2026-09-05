// C1-2：当前场临时意图只属于一次 AuthoringRunSession。
// 页面只保存实体 ID；正文、名称与 revision 仍从当前绑定世界书重读。

import { worldbookRunRevision } from '../context/authoringRunContextReaders.js'
import { MAX_AUTHORING_PRESENT_CHARACTERS } from './authoringSceneAnchors.js'

export const AUTHORING_SCENE_RUN_INTENT_MODES = Object.freeze([
  'correct-current',
  'next-passage',
  'run-only'
])

export const AUTHORING_SCENE_RUN_ENTITY_KINDS = Object.freeze(['character', 'location'])

function text(value) {
  return String(value ?? '').trim()
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function unique(values = []) {
  return [...new Set(list(values).map(text).filter(Boolean))]
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
}

function fingerprintValue(prefix, value) {
  const source = JSON.stringify(stableValue(value))
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`
}

function targetSnapshot(target = {}) {
  return {
    projectId: text(target.projectId),
    chapterId: text(target.chapterId),
    unitId: text(target.unitId)
  }
}

function intentCopy({ mode, entityKind, name }) {
  if (mode === 'correct-current') {
    return entityKind === 'location'
      ? { label: `纠正当前 · ${name}`, content: `当前场就在${name}；这是作者对当前现场的纠正。` }
      : { label: `纠正当前 · ${name}`, content: `${name}当前就在场；这是作者对当前现场的纠正。` }
  }
  if (mode === 'next-passage') {
    return entityKind === 'location'
      ? { label: `安排下一段 · ${name}`, content: `安排下一段转到${name}；只有采纳推演草稿后才更新后续现场。` }
      : { label: `安排下一段 · ${name}`, content: `安排${name}在下一段进入当前场；只有采纳推演草稿后才更新后续现场。` }
  }
  return entityKind === 'location'
    ? { label: `带入本次 · ${name}`, content: `本次推演可以参考${name}的设定，但不要求剧情转到这里，也不改变当前场。` }
    : { label: `带入本次 · ${name}`, content: `本次推演可以参考${name}的设定与关系，但不要求其入场，也不改变当前场。` }
}

export function createAuthoringSceneRunIntent({
  mode,
  entityKind,
  entry,
  target,
  worldbookId = '',
  presentCharacterIds = null
} = {}) {
  const normalizedMode = AUTHORING_SCENE_RUN_INTENT_MODES.includes(mode) ? mode : ''
  const normalizedKind = AUTHORING_SCENE_RUN_ENTITY_KINDS.includes(entityKind) ? entityKind : ''
  const entityId = text(entry?.id)
  const name = text(entry?.name)
  const scope = targetSnapshot(target)
  const entryRevision = worldbookRunRevision(entry)
  const boundWorldbookId = text(worldbookId)
  const currentPresentCharacterIds = Array.isArray(presentCharacterIds)
    ? unique(presentCharacterIds)
    : null
  if (!normalizedMode || !normalizedKind || text(entry?.type) !== normalizedKind
    || !entityId || !name || !entryRevision || !boundWorldbookId
    || !scope.projectId || !scope.chapterId || !scope.unitId) return null
  if (normalizedMode === 'next-passage' && normalizedKind === 'character') {
    if (!currentPresentCharacterIds) return null
    if (!currentPresentCharacterIds.includes(entityId)
      && currentPresentCharacterIds.length >= MAX_AUTHORING_PRESENT_CHARACTERS) return null
  }

  const copy = intentCopy({ mode: normalizedMode, entityKind: normalizedKind, name })
  const scopeId = fingerprintValue('scope', scope).slice('scope-'.length)
  const id = `${normalizedMode}-${scopeId}-${normalizedKind}-${entityId}`
  const sourceRefs = Object.freeze([`worldbook-entry:${entityId}`])
  const payload = Object.freeze({
    entityKind: normalizedKind,
    entryId: entityId,
    adoption: normalizedMode === 'next-passage'
      ? (normalizedKind === 'location' ? 'set-location' : 'add-present-character')
      : 'none'
  })
  const revision = fingerprintValue('scene-intent', {
    id,
    mode: normalizedMode,
    entityKind: normalizedKind,
    entityId,
    entityName: name,
    worldbookId: boundWorldbookId,
    entryRevision,
    payload,
    ...scope
  })

  return Object.freeze({
    id,
    mode: normalizedMode,
    entityKind: normalizedKind,
    entityId,
    worldbookId: boundWorldbookId,
    entryRevision,
    ...scope,
    label: copy.label,
    content: copy.content,
    revision,
    sourceRefs,
    payload,
    claimKey: normalizedKind === 'location' ? 'scene-location' : `scene-presence:${entityId}`,
    claimType: 'scene-state'
  })
}

export function readAuthoringSceneRunIntentsForTarget(intents = [], target = {}) {
  const expected = targetSnapshot(target)
  return list(intents).filter((intent) => (
    text(intent?.projectId) === expected.projectId
    && text(intent?.chapterId) === expected.chapterId
    && text(intent?.unitId) === expected.unitId
  ))
}

function intentReachedProvider(intent, receipts = []) {
  const calls = list(receipts).filter((receipt) => receipt && typeof receipt === 'object')
  if (!calls.length) return true
  const candidateId = `scene-intent:${text(intent?.id)}`
  return calls.some((receipt) => list(receipt.entries).some((entry) => (
    text(entry?.candidateId) === candidateId
    && entry?.included === true
    && entry?.cut !== true
  )))
}

export function collectAuthoringSceneRunIntentEffects(sessionOrIntents = {}, { receipts = [] } = {}) {
  const intents = Array.isArray(sessionOrIntents)
    ? sessionOrIntents
    : list(sessionOrIntents?.sceneIntents)
  const characterIds = []
  let locationId = ''
  const sourceRefs = []
  const intentIds = []
  for (const intent of intents) {
    if (intent?.mode !== 'next-passage') continue
    if (!intentReachedProvider(intent, receipts)) continue
    const entityKind = text(intent.payload?.entityKind || intent.entityKind)
    const entityId = text(intent.payload?.entryId || intent.entityId)
    const adoption = text(intent.payload?.adoption)
    if (!entityId) continue
    if (entityKind === 'character' && adoption === 'add-present-character') characterIds.push(entityId)
    if (entityKind === 'location' && adoption === 'set-location' && !locationId) locationId = entityId
    intentIds.push(text(intent.id))
    sourceRefs.push(`scene-intent:${text(intent.id)}`, ...list(intent.sourceRefs))
  }
  return Object.freeze({
    characterIds: Object.freeze(unique(characterIds)),
    locationId,
    intentIds: Object.freeze(unique(intentIds)),
    sourceRefs: Object.freeze(unique(sourceRefs))
  })
}
