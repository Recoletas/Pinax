/**
 * 故事生成质量第二阶段（Q2）—— SceneThread 软状态契约。
 *
 * SceneThread 是跨回合的"本场景正在完成什么"写作协调软状态：
 * 服务于正文生成与审计，不是世界事实真源，不写入世界书 / confirmed facts。
 * 随 turn pre/post 快照、分支切换、撤销、刷新与备份恢复。
 */

export const NARRATIVE_SCENE_THREAD_SCHEMA_VERSION = 1
export const SCENE_THREAD_MODES = Object.freeze([
  'dialogue', 'action', 'investigation', 'transition', 'mixed'
])
export const SCENE_THREAD_LIMITS = Object.freeze({
  maxCast: 8,
  maxEstablishedProgress: 3,
  maxRecentRepetitions: 6,
  maxExitConditions: 4,
  maxSourceRefs: 24,
  maxFieldChars: 200
})

function text(value, limit = SCENE_THREAD_LIMITS.maxFieldChars) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function stringArray(value, limit) {
  if (!Array.isArray(value)) return []
  const output = []
  for (const item of value) {
    const cleaned = text(item)
    if (!cleaned || output.includes(cleaned)) continue
    output.push(cleaned)
    if (output.length >= limit) break
  }
  return output
}

function castArray(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, SCENE_THREAD_LIMITS.maxCast).map((member) => ({
    characterId: text(member?.characterId, 120),
    name: text(member?.name, 80),
    immediateIntent: text(member?.immediateIntent),
    lastMeaningfulMove: text(member?.lastMeaningfulMove)
  })).filter((member) => member.characterId || member.name)
}

export function normalizeNarrativeSceneThread(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  return {
    schemaVersion: NARRATIVE_SCENE_THREAD_SCHEMA_VERSION,
    id: text(input.id, 120),
    revision: text(input.revision, 120),
    sourceRefs: stringArray(input.sourceRefs, SCENE_THREAD_LIMITS.maxSourceRefs),
    sceneRef: text(input.sceneRef, 120),
    place: {
      placeId: text(input.place?.placeId, 120),
      scene: text(input.place?.scene)
    },
    time: {
      eraName: text(input.time?.eraName, 80),
      year: text(input.time?.year, 40),
      month: text(input.time?.month, 40),
      day: text(input.time?.day, 40)
    },
    mode: SCENE_THREAD_MODES.includes(input.mode) ? input.mode : 'mixed',
    purpose: text(input.purpose),
    currentObjective: text(input.currentObjective),
    immediateObstacle: text(input.immediateObstacle) || null,
    activeQuestion: text(input.activeQuestion) || null,
    cast: castArray(input.cast),
    establishedProgress: stringArray(input.establishedProgress, SCENE_THREAD_LIMITS.maxEstablishedProgress),
    recentRepetitions: stringArray(input.recentRepetitions, SCENE_THREAD_LIMITS.maxRecentRepetitions),
    exitConditions: stringArray(input.exitConditions, SCENE_THREAD_LIMITS.maxExitConditions),
    createdAt: Number(input.createdAt) || Date.now(),
    updatedAt: Number(input.updatedAt) || Date.now()
  }
}

export function sceneThreadRevision(thread) {
  const normalized = normalizeNarrativeSceneThread(thread) || {}
  const serialized = JSON.stringify({
    place: normalized.place,
    time: normalized.time,
    mode: normalized.mode,
    purpose: normalized.purpose,
    currentObjective: normalized.currentObjective,
    immediateObstacle: normalized.immediateObstacle,
    activeQuestion: normalized.activeQuestion,
    cast: (normalized.cast || []).map((member) => `${member.characterId}|${member.immediateIntent}`),
    establishedProgress: normalized.establishedProgress,
    recentRepetitions: normalized.recentRepetitions,
    exitConditions: normalized.exitConditions
  })
  let hash = 2166136261
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `st_${(hash >>> 0).toString(36)}`
}

function timeChanged(thread, runtimeState) {
  const t = runtimeState?.writingTime || {}
  const current = `${t.eraName || ''}|${t.year || ''}|${t.month || ''}|${t.day || ''}`
  const before = `${thread.time?.eraName || ''}|${thread.time?.year || ''}|${thread.time?.month || ''}|${thread.time?.day || ''}`
  return Boolean(current && before && current !== before)
}

/**
 * 场景切换条件：地点显著变化、时间跳跃、当前目标完成、或尚无线程。
 */
export function shouldStartNewSceneThread(thread, runtimeState = {}) {
  if (!thread) return true
  const place = runtimeState?.worldMapState || {}
  if (thread.place?.placeId && place.placeId && thread.place.placeId !== place.placeId) return true
  if (timeChanged(thread, runtimeState)) return true
  // 当前目标已标记完成 → 换线程（上层写回 status，这里兜底）
  const objectiveStatus = text(runtimeState?.activeGoal?.status).toLowerCase()
  if (objectiveStatus === 'completed' || objectiveStatus === '完成') return true
  return false
}

export default {
  NARRATIVE_SCENE_THREAD_SCHEMA_VERSION,
  SCENE_THREAD_LIMITS,
  normalizeNarrativeSceneThread,
  sceneThreadRevision,
  shouldStartNewSceneThread
}
