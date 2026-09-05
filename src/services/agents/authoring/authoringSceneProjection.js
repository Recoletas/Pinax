// 共享现场投影（spec §10 / plan Task 1.1 / worldbook scene closure Task 5）：
// 纯函数、稳定 ID、无 DOM、无持久化。左栏现场条、右侧临时详情与 NarrativeKernel
// 上下文都从这里读取。投影 v2：以当前 writingUnit + 显式场景锚点 + 绑定世界书 +
// 真实观察器结果为现场依据；旧 v1 输入（runtimeState.sceneThread）仅作为兼容路径保留。
import {
  MAX_AUTHORING_PRESENT_CHARACTERS,
  resolveActiveSceneAnchor,
  normalizeSceneAnchors,
  fingerprintSceneAnchors
} from './authoringSceneAnchors.js'
import {
  buildWorldbookSceneIndex,
  resolveSceneCharacter,
  resolveSceneLocation,
  selectActiveRelations
} from './authoringWorldbookSceneAdapter.js'

export const AUTHORING_SCENE_PROJECTION_SCHEMA_VERSION = 2

const MAX_RELATIONS = 6
const MAX_EVENTS = 6

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function stableId(prefix, ...parts) {
  const token = parts
    .map((part) => cleanText(part))
    .filter(Boolean)
    .join('-')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .slice(0, 48)
  return token ? `${prefix}_${token}` : `${prefix}_${parts.filter(Boolean).length || 'unknown'}`
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function observerObservations(observerState) {
  if (!observerState) return []
  if (Array.isArray(observerState)) return observerState
  if (Array.isArray(observerState.derivedState)) return observerState.derivedState
  if (Array.isArray(observerState.observations)) return observerState.observations
  return []
}

function buildCharacterSummary(id, name, evidenceSourceRefs = [], lastAction = '') {
  const cleanedName = cleanText(name)
  if (!id && !cleanedName) return null
  return {
    id: cleanText(id) || stableId('char', cleanedName),
    name: cleanedName,
    evidenceSourceRefs: evidenceSourceRefs.map(cleanText).filter(Boolean),
    lastAction: cleanText(lastAction)
  }
}

function explicitCharacter(value) {
  const id = cleanText(value?.id)
  const name = cleanText(value?.name)
  if (!id && !name) return null
  return { id: id || stableId('char', name), name, evidenceSourceRefs: [], lastAction: '' }
}

function resolveTimeSummary(writingTime = {}, threadTime = {}) {
  const eraName = cleanText(writingTime.eraName || writingTime.era)
  const year = cleanText(writingTime.year ?? threadTime.year)
  const month = cleanText(writingTime.month ?? threadTime.month)
  const day = cleanText(writingTime.day ?? threadTime.day)
  const threadEra = cleanText(threadTime.eraName)
  const resolvedEra = eraName || threadEra
  if (!resolvedEra && !year && !month && !day) return null
  const label = [resolvedEra, year && `${year}年`, month && `${month}月`, day && `${day}日`]
    .filter(Boolean)
    .join(' ')
  return {
    id: stableId('time', resolvedEra, year, month, day),
    label,
    sourceRefs: ['time:writing']
  }
}

function unreadCount(runtimeState, key, fallback = 0) {
  const explicit = Number(runtimeState?.unreadChanges?.[key])
  return Number.isFinite(explicit) && explicit >= 0 ? explicit : fallback
}

// 投影指纹（Task 5 Step 7）：项目/章节/单元/文档 revision/世界书 ID/锚点 ID +
// 锚点内容的确定性哈希。绑定或锚点任何变化即过期，即使正文 revision 未变。
export function computeSceneProjectionFingerprint({
  projectId = '',
  chapterId = '',
  activeUnitId = '',
  documentRevision = '',
  worldbookId = '',
  anchorId = '',
  anchorFingerprint = ''
} = {}) {
  const source = [projectId, chapterId, activeUnitId, documentRevision, worldbookId, anchorId, anchorFingerprint]
    .map((part) => String(part ?? ''))
    .join('\u0000')
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `projfp-${(hash >>> 0).toString(36)}`
}

// 锚点内容的确定性指纹：锚点任何字段编辑都会改变投影指纹。
function fingerprintAnchor(anchor) {
  if (!anchor) return ''
  return fingerprintSceneAnchors([anchor])
}

// v2 锚点路径：以显式锚点 + 绑定世界书 + 已采纳观察为现场依据。
function buildV2Scene({
  projectId,
  chapterId,
  documentRevision,
  activeUnitId,
  expectedWorldbookId,
  worldbook,
  sceneAnchors,
  acceptedObservations,
  activeUnitRevision,
  previousChapterProjection,
  unitOrder
}) {
  const sourceRefs = new Set()
  const worldbookId = cleanText(expectedWorldbookId || worldbook?.id)
  const anchors = normalizeSceneAnchors(sceneAnchors)
  const order = (Array.isArray(unitOrder) && unitOrder.length ? unitOrder : [activeUnitId]).filter(Boolean)

  const resolution = resolveActiveSceneAnchor({
    anchors,
    unitOrder: order.length ? order : [activeUnitId],
    activeUnitId,
    worldbookId
  })

  const loadedWorldbookMatches = Boolean(worldbook && cleanText(worldbook.id) === worldbookId)
  const worldbookStatus = !worldbookId ? 'unbound' : (loadedWorldbookMatches ? 'bound' : 'missing')
  const index = buildWorldbookSceneIndex(worldbookStatus === 'bound' ? worldbook : null)

  let location = null
  let time = null
  const presentCharacters = []
  const plannedCharacters = []
  const missingRefs = []

  if (resolution.anchor) {
    const anchor = resolution.anchor
    const timeLabel = cleanText(anchor.time?.label)
    const timePeriod = cleanText(anchor.time?.period)
    if (timeLabel || timePeriod) {
      time = {
        id: stableId('time', timeLabel, timePeriod),
        label: timeLabel || timePeriod,
        period: timePeriod,
        sourceRefs: [`scene-anchor:${anchor.id}`]
      }
    }
    if (anchor.locationId) {
      const resolvedLocation = resolveSceneLocation(index, anchor.locationId)
      if (resolvedLocation) location = resolvedLocation
      else missingRefs.push(anchor.locationId)
    }
    for (const characterId of anchor.presentCharacterIds.slice(0, MAX_AUTHORING_PRESENT_CHARACTERS)) {
      const character = resolveSceneCharacter(index, characterId)
      if (character) presentCharacters.push(character)
      else missingRefs.push(characterId)
    }
    for (const characterId of (anchor.plannedCharacterIds || []).slice(0, MAX_AUTHORING_PRESENT_CHARACTERS)) {
      const character = resolveSceneCharacter(index, characterId)
      if (character) plannedCharacters.push(character)
    }
  }
  if (missingRefs.length) sourceRefs.add('worldbook:missing-refs')

  // 观察器结果：只有 status=applied 且绑定当前单元的观察才进入关系/事件。
  const currentObservations = asArray(acceptedObservations).filter((observation) => (
    cleanText(observation?.status || 'applied') === 'applied'
    && cleanText(observation?.unitId) === cleanText(activeUnitId)
    && (activeUnitRevision == null || observation?.unitRevision == null
      || Number(observation.unitRevision) === Number(activeUnitRevision))
  ))

  const activeRelations = selectActiveRelations({
    index,
    presentCharacterIds: presentCharacters.map((character) => character.id),
    plannedCharacters,
    plannedCharacterIds: plannedCharacters.map((character) => character.id),
    acceptedRelations: currentObservations
      .filter((observation) => cleanText(observation?.kind) === 'relation')
      .map((observation) => ({
        id: observation.id,
        subjectId: observation.subjectId,
        objectId: observation.objectId,
        relation: observation.relation,
        label: observation.text,
        sourceRefs: observation.sourceRefs
      })),
    limit: MAX_RELATIONS
  })

  const unresolvedEvents = []
  for (const observation of currentObservations) {
    if (unresolvedEvents.length >= MAX_EVENTS) break
    if (cleanText(observation?.kind) !== 'event') continue
    const text = cleanText(observation?.text)
    if (!text) continue
    unresolvedEvents.push({
      id: cleanText(observation?.id) || stableId('event', text),
      label: text,
      sourceRefs: asArray(observation?.sourceRefs).map(cleanText).filter(Boolean)
    })
  }

  // 上一章状态只作为 inherited 建议，绝不直接变成现场事实。
  let inheritedSuggestion = null
  if (!resolution.anchor && previousChapterProjection && typeof previousChapterProjection === 'object') {
    inheritedSuggestion = {
      fromChapterId: cleanText(previousChapterProjection.chapterId) || null,
      location: previousChapterProjection.location || null,
      presentCharacterIds: asArray(previousChapterProjection.presentCharacters)
        .map((character) => cleanText(character?.id))
        .filter(Boolean)
        .slice(0, MAX_AUTHORING_PRESENT_CHARACTERS)
    }
  }

  const viewpointCharacter = resolution.anchor?.viewpointCharacterId
    ? (resolveSceneCharacter(index, resolution.anchor.viewpointCharacterId)
      || { id: resolution.anchor.viewpointCharacterId, name: '', sourceRefs: [] })
    : null

  if (worldbookStatus === 'bound') sourceRefs.add(`worldbook:${worldbookId}`)

  return {
    activeUnitId: cleanText(activeUnitId) || null,
    worldbookId: worldbookId || null,
    worldbookStatus,
    anchorStatus: resolution.status,
    conflictingAnchor: resolution.conflictingAnchor,
    anchorId: resolution.anchor?.id || null,
    inheritedSuggestion,
    missingRefs,
    viewpointCharacter,
    activeActor: null,
    dialogueTarget: null,
    location,
    time,
    presentCharacters,
    plannedCharacters,
    plannedCharacterIds: plannedCharacters.map((character) => character.id),
    activeRelations,
    unresolvedEvents,
    projectionFingerprint: computeSceneProjectionFingerprint({
      projectId,
      chapterId,
      activeUnitId,
      documentRevision,
      worldbookId,
      anchorId: resolution.anchor?.id || '',
      anchorFingerprint: fingerprintAnchor(resolution.anchor)
    }),
    extraSourceRefs: [...sourceRefs]
  }
}

export function buildAuthoringSceneProjection({
  chapter = null,
  documentRevision = null,
  projectId = null,
  runtimeState = null,
  worldbook = null,
  expectedWorldbookId = null,
  observerState = null,
  outlineItems = [],
  // v2 输入（worldbook scene closure Task 5）：
  document = null,
  activeUnitId = null,
  sceneAnchors = null,
  acceptedObservations = null,
  projectMemories = [],
  previousChapterProjection = null,
  uiSelection = null
} = {}) {
  const state = runtimeState && typeof runtimeState === 'object' ? runtimeState : {}
  const chapterId = cleanText(chapter?.id) || null
  const resolvedProjectId = cleanText(projectId || chapter?.projectId || chapter?.bookId) || null
  // 复验修复 2：v2（锚点路径）绝不读取 Experience sceneThread——
  // 正常投影的现场依据只有锚点 + 绑定世界书 + 已采纳观察。
  const isV2 = Array.isArray(sceneAnchors)
  const sceneThread = !isV2 && state.sceneThread && typeof state.sceneThread === 'object' ? state.sceneThread : null
  const sourceRefs = new Set()

  if (chapterId) sourceRefs.add(`chapter:${chapterId}`)
  if (sceneThread?.id) sourceRefs.add(`scene-thread:${cleanText(sceneThread.id)}`)

  // v2 路径：调用方提供锚点数据时，现场以锚点 + 绑定世界书 + 已采纳观察为唯一依据，
  // 不再读取 Experience sceneThread。
  let v2Scene = null
  if (Array.isArray(sceneAnchors)) {
    const documentUnits = Array.isArray(document?.unitOrder)
      ? document.unitOrder
      : (document?.content || [])
        .map((unit) => unit?.attrs?.unitId || unit?.unitId)
        .filter(Boolean)
    const activeDocumentUnit = (document?.content || []).find((unit) => (
      cleanText(unit?.attrs?.unitId || unit?.unitId) === cleanText(activeUnitId)
    ))
    v2Scene = buildV2Scene({
      projectId: resolvedProjectId,
      chapterId,
      documentRevision,
      activeUnitId,
      expectedWorldbookId,
      unitOrder: documentUnits.length ? documentUnits : [activeUnitId].filter(Boolean),
      worldbook,
      sceneAnchors,
      acceptedObservations: acceptedObservations || [],
      activeUnitRevision: activeDocumentUnit?.attrs?.unitRevision ?? activeDocumentUnit?.unitRevision ?? null,
      previousChapterProjection
    })
    for (const ref of v2Scene.extraSourceRefs || []) sourceRefs.add(ref)
  }

  // 视角/行动者只接受调用方显式提供的身份，投影本身绝不猜测。
  const viewpointCharacter = explicitCharacter(state.viewpointCharacter)
  const activeActor = explicitCharacter(state.activeActor)

  // 对话对象：优先接受调用方显式选择（如左栏现场条）；
  // 否则仅当对话模式显式开启且存在可识别角色时成立。
  let dialogueTarget = explicitCharacter(state.dialogueTarget)
  if (!dialogueTarget && state.dialogueMode === true) {
    dialogueTarget = explicitCharacter(state.dialogueCharacter)
  }

  // 地点：地图运行时快照优先，场景线程地点补位；两者皆缺则为 null。
  const mapState = state.worldMapState && typeof state.worldMapState === 'object' ? state.worldMapState : {}
  const sceneName = cleanText(mapState.currentScene) || cleanText(sceneThread?.place?.scene)
  const placeId = cleanText(mapState.placeId) || cleanText(sceneThread?.place?.placeId)
  let location = null
  if (sceneName || placeId) {
    const region = [mapState.currentCountry, mapState.currentCity]
      .map(cleanText)
      .filter(Boolean)
      .join(' · ')
    location = {
      id: placeId || stableId('place', sceneName),
      name: sceneName || '',
      region
    }
    sourceRefs.add('map:current-scene')
  }

  // 时间：写作时间设定 + 场景线程时间锚点。
  const time = resolveTimeSummary(state.writingTime || {}, sceneThread?.time || {})
  if (time) sourceRefs.add('time:writing')

  // 在场人物：只有场景线程 cast 携带“本场参与”证据；
  // encounteredCharacters 只说明曾经遇到，没有本场依据，不得进入 presentCharacters。
  const presentCharacters = []
  for (const member of asArray(sceneThread?.cast).slice(0, MAX_AUTHORING_PRESENT_CHARACTERS)) {
    const summary = buildCharacterSummary(
      member?.characterId,
      member?.name,
      sceneThread?.id ? [`scene-thread:${cleanText(sceneThread.id)}`] : [],
      member?.lastMeaningfulMove
    )
    if (!summary) continue
    if (presentCharacters.some((existing) => existing.id === summary.id)) continue
    presentCharacters.push(summary)
  }

  // 关系/事件：来自观察器派生结果，按 kind 过滤，不做文本猜测。
  const activeRelations = []
  const observerEvents = []
  for (const observation of observerObservations(observerState)) {
    const kind = cleanText(observation?.kind)
    const text = cleanText(observation?.text)
    if (!text) continue
    const refs = asArray(observation?.sourceRefs).map(cleanText)
    if (kind === 'relation' && activeRelations.length < MAX_RELATIONS) {
      activeRelations.push({
        id: cleanText(observation?.id) || stableId('rel', text),
        subject: cleanText(observation?.subject),
        relation: cleanText(observation?.relation),
        object: cleanText(observation?.object),
        label: text,
        sourceRefs: refs
      })
    } else if (kind === 'event' && observerEvents.length < MAX_EVENTS) {
      observerEvents.push({
        id: cleanText(observation?.id) || stableId('event', text),
        label: text,
        sourceRefs: refs
      })
    }
  }

  // 未决事件：本章纲要日志的未决钩子（有章节级证据）排在观察器事件之前。
  const unresolvedEvents = []
  for (const entry of asArray(state.plotJournal)) {
    if (unresolvedEvents.length >= MAX_EVENTS) break
    if (chapterId && cleanText(entry?.chapterId) !== chapterId) continue
    for (const hook of asArray(entry?.unresolvedHooks)) {
      if (unresolvedEvents.length >= MAX_EVENTS) break
      const label = cleanText(hook)
      if (!label) continue
      unresolvedEvents.push({
        id: stableId('event', entry?.id || '', label),
        label,
        sourceRefs: [`plot-journal:${cleanText(entry?.id)}`]
      })
    }
  }
  for (const event of observerEvents) {
    if (unresolvedEvents.length >= MAX_EVENTS) break
    if (unresolvedEvents.some((existing) => existing.label === event.label)) continue
    unresolvedEvents.push(event)
  }
  if (unresolvedEvents.length) sourceRefs.add('events:derived')

  // 涌现候选：来自现有 emergence 运行时，仍是候选而非事实。
  const emergenceCandidates = asArray(state.emergenceCandidates)
    .map((candidate) => {
      const id = cleanText(candidate?.id)
      const summary = cleanText(candidate?.summary)
      if (!id || !summary) return null
      return {
        id,
        title: cleanText(candidate?.title) || '待确认的剧情候选',
        summary,
        type: cleanText(candidate?.type) || 'history-hook',
        sourceRefs: asArray(candidate?.sourceRefs)
          .map((ref) => (typeof ref === 'object' ? cleanText(ref?.id) : cleanText(ref)))
          .filter(Boolean)
      }
    })
    .filter(Boolean)

  if (resolvedProjectId === null && worldbook?.id) sourceRefs.add(`worldbook:${cleanText(worldbook.id)}`)
  void outlineItems
  void projectMemories
  void uiSelection

  // 未读变化：涌现候选天然等待用户审阅；其余计数只接受调用方显式给出的数值，
  // Phase 1 不发明“未读”判定。
  const unreadChanges = Object.freeze({
    characters: unreadCount(state, 'characters'),
    location: unreadCount(state, 'location'),
    time: unreadCount(state, 'time'),
    events: unreadCount(state, 'events'),
    emergence: unreadCount(state, 'emergence', emergenceCandidates.length)
  })

  // v2 字段优先；v1 兼容路径提供缺省值。
  return Object.freeze({
    schemaVersion: AUTHORING_SCENE_PROJECTION_SCHEMA_VERSION,
    projectId: resolvedProjectId,
    chapterId,
    sceneId: cleanText(sceneThread?.id) || null,
    revision: documentRevision == null ? null : String(documentRevision),
    activeUnitId: v2Scene?.activeUnitId || null,
    worldbookId: v2Scene?.worldbookId ?? (worldbook?.id ? cleanText(worldbook.id) : null),
    worldbookStatus: v2Scene?.worldbookStatus || (worldbook ? 'bound' : 'unbound'),
    anchorStatus: v2Scene?.anchorStatus || 'no-anchor',
    conflictingAnchor: v2Scene?.conflictingAnchor || null,
    anchorId: v2Scene?.anchorId || null,
    inheritedSuggestion: v2Scene?.inheritedSuggestion || null,
    missingRefs: v2Scene?.missingRefs || [],
    projectionFingerprint: v2Scene?.projectionFingerprint || computeSceneProjectionFingerprint({
      projectId: resolvedProjectId || '',
      chapterId: chapterId || '',
      activeUnitId: cleanText(activeUnitId),
      documentRevision: documentRevision == null ? '' : String(documentRevision),
      worldbookId: cleanText(expectedWorldbookId || worldbook?.id)
    }),
    viewpointCharacter: isV2 ? v2Scene.viewpointCharacter : viewpointCharacter,
    // v2 的锚点仍是真源；行动者/对象是本次推演的 run-only UI 选择，
    // 可以叠加显示，但不会被持久化成场景事实。
    activeActor: isV2 ? (v2Scene.activeActor || activeActor) : activeActor,
    dialogueTarget: isV2 ? (v2Scene.dialogueTarget || dialogueTarget) : dialogueTarget,
    location: isV2 ? v2Scene.location : location,
    time: isV2 ? v2Scene.time : time,
    presentCharacters: isV2 ? v2Scene.presentCharacters : presentCharacters,
    plannedCharacters: isV2 ? (v2Scene.plannedCharacters || []) : [],
    plannedCharacterIds: isV2 ? (v2Scene.plannedCharacterIds || []) : [],
    activeRelations: isV2 ? v2Scene.activeRelations : activeRelations,
    unresolvedEvents: isV2 ? v2Scene.unresolvedEvents : unresolvedEvents,
    emergenceCandidates,
    unreadChanges,
    sourceRefs: [...sourceRefs].filter(Boolean)
  })
}

// 涌现候选详情模型（plan Phase 3 任务 5 / spec §8.3）：
// 候选是状态提议而非事实——模型始终带出"待确认"状态与 typed 来源，
// 供右侧临时详情展示；确认/忽略等动作由页面走对应 canonical/派生路径。
export function resolveAuthoringEmergenceDetailModel(projection, candidateId) {
  const id = String(candidateId || '').trim()
  if (!id || !projection) return null
  const candidate = (projection.emergenceCandidates || []).find((item) => item?.id === id)
  if (!candidate) return null
  const sources = (Array.isArray(candidate.sourceRefs) ? candidate.sourceRefs : [])
    .map((ref) => (typeof ref === 'object' ? `${ref.type || 'runtime'}:${ref.id || ''}` : String(ref || '')))
    .filter((ref) => ref && ref !== ':')
  return {
    kind: 'emergence',
    id: candidate.id,
    name: candidate.title || '待确认的剧情候选',
    sections: [
      { label: '候选内容', value: candidate.summary || '' },
      { label: '候选类型', value: candidate.type || 'history-hook' },
      { label: '来源', value: sources.join('；') },
      { label: '状态', value: '待确认（候选，尚未成为设定）' }
    ]
  }
}
