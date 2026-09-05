// C1-1B production adapter: turn request 只携带稳定 target；正文、现场、世界书、
// 作者参考、记忆与大纲都在提交瞬间经 repository 重读并冻结进一个 session。
// provider 返回后再走同一组 reader 收集 live revision，禁止页面把 frozen 值
// 回填成“当前值”掩盖 stale。

import { matchWorldbookEntries } from '../../worldbookContextBuilder.js'
import {
  authoringRunReferenceRevision,
  captureAuthoringRunTarget,
  memoryPrimarySourceRef,
  readAuthoringSceneIntentCandidates,
  readManuscriptRunCandidates,
  worldbookRunRevision
} from '../context/authoringRunContextReaders.js'
import { collectAuthoringRunDependencyRevisions } from '../context/authoringRunContextDependencies.js'
import { createAuthoringRunSession } from './authoringRunSession.js'

function text(value) {
  return String(value ?? '').trim()
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function failure(reason, details = {}) {
  return Object.freeze({ ok: false, reason: text(reason) || 'authoring-run-adapter-failed', ...details })
}

const RUN_PROJECTION_FIELDS = Object.freeze([
  'schemaVersion', 'projectId', 'chapterId', 'sceneId', 'revision', 'activeUnitId',
  'worldbookId', 'worldbookStatus', 'anchorStatus', 'anchorId',
  'viewpointCharacter', 'activeActor', 'dialogueTarget', 'location', 'time',
  'presentCharacters', 'plannedCharacters', 'plannedCharacterIds', 'activeRelations',
  'unresolvedEvents', 'missingRefs', 'sourceRefs'
])

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

// 页面 sceneProjection 的历史 fingerprint 只覆盖锚点身份，不覆盖观察器文本、
// 世界书派生名称等实际序列化现场。运行边界对 SAFE 字段再做一次内容指纹，
// 使 provider 后的 live 对账能捕获“现场内容变了但锚点没变”。
function snapshotRunProjection(projection) {
  if (!projection || typeof projection !== 'object') return null
  const snapshot = stableValue(Object.fromEntries(RUN_PROJECTION_FIELDS
    .filter((key) => projection[key] !== undefined)
    .map((key) => [key, projection[key]])))
  return {
    ...snapshot,
    projectionFingerprint: fingerprintValue('run-scene', snapshot)
  }
}

async function readValue(reader, input, fallback) {
  if (typeof reader !== 'function') return fallback
  try {
    const value = await reader(input)
    return value == null ? fallback : value
  } catch {
    return fallback
  }
}

function targetFromRequest(request = {}) {
  const source = request?.intent?.invocationTarget
  if (!source || typeof source !== 'object') return null
  const role = text(source.documentRole || source.role)
  if (!['manuscript', 'exploration'].includes(role)) return null
  const target = {
    projectId: text(source.projectId),
    role,
    documentRole: role,
    documentId: text(source.documentId),
    chapterId: role === 'manuscript' ? text(source.chapterId) : '',
    unitId: text(source.unitId),
    nodeId: text(source.nodeId),
    caret: Number(source.caret),
    caretOffset: Number(source.cursorLocalOffset),
    cursorLocalOffset: Number(source.cursorLocalOffset),
    documentRevision: text(source.documentRevision),
    documentSchemaRevision: text(source.documentSchemaRevision),
    unitRevision: text(source.unitRevision),
    nodeRevision: text(source.nodeRevision)
  }
  target.contextMode = (request?.intent?.operation || request?.intent?.turn?.operation) === 'rewrite-unit'
    ? 'rewrite-unit'
    : 'caret-prefix'
  if (!target.projectId || !target.documentId || !target.unitId || !target.nodeId) return null
  if (role === 'manuscript' && !target.chapterId) return null
  if (!Number.isInteger(target.caretOffset) || target.caretOffset < 0) return null
  if (!target.documentRevision || !target.unitRevision || !target.nodeRevision) return null
  return target
}

function liveTargetMatches(expected, live) {
  if (!live || typeof live !== 'object' || !live.document || !live.sceneProjection) return false
  const liveRole = text(live.role || live.documentRole)
  if (!['manuscript', 'exploration'].includes(liveRole)) return false
  if (live.role && live.documentRole && text(live.role) !== text(live.documentRole)) return false
  if (liveRole !== expected.role
    || text(live.projectId) !== expected.projectId
    || text(live.documentId) !== expected.documentId
    || (expected.role === 'manuscript' && text(live.chapterId) !== expected.chapterId)
    || text(live.unitId) !== expected.unitId
    || text(live.nodeId) !== expected.nodeId) return false
  if (text(live.documentRevision) !== expected.documentRevision) return false
  const schemaRevision = text(live.documentSchemaRevision || live.document?.revision)
  if (!schemaRevision || (expected.documentSchemaRevision && schemaRevision !== expected.documentSchemaRevision)) return false
  return true
}

function sceneWorldbookSelections({ target, document, projection, worldbook, sceneIntents = [], instruction = '' }) {
  if (!worldbook || !Array.isArray(worldbook.entries)) return []
  const capture = captureAuthoringRunTarget({
    target: {
      ...target,
      documentRevision: text(target.documentSchemaRevision || document?.revision)
    },
    document,
    sceneProjection: projection
  })
  if (!capture?.ok) return []
  const manuscript = readManuscriptRunCandidates({ targetCapture: capture, document })
  const scanText = [
    text(instruction),
    ...list(manuscript.candidates).map((candidate) => text(candidate?.representations?.full))
  ]
    .filter(Boolean)
    .join('\n\n')
  const boundCharacterIds = [
    projection?.viewpointCharacter?.id,
    projection?.activeActor?.id,
    projection?.dialogueTarget?.id,
    ...list(projection?.presentCharacters).map((person) => person?.id),
    ...list(projection?.plannedCharacters).map((person) => person?.id)
  ].map(text).filter(Boolean)
  const acceptedSceneIntents = readAuthoringSceneIntentCandidates({
    sceneIntents,
    projectId: target.projectId,
    chapterId: target.chapterId,
    unitId: target.unitId
  }).candidates
  const intentEntryIds = list(acceptedSceneIntents).flatMap((intent) => list(intent?.sourceRefs))
    .map(text)
    .filter((sourceRef) => sourceRef.startsWith('worldbook-entry:'))
    .map((sourceRef) => sourceRef.slice('worldbook-entry:'.length))
    .filter(Boolean)
  const matched = matchWorldbookEntries({
    worldbook,
    chatHistory: scanText ? [{ role: 'user', content: scanText }] : [],
    runtimeState: {
      worldMapState: {
        placeId: text(projection?.location?.id),
        currentScene: text(projection?.location?.name)
      }
    },
    boundContext: {
      placeIds: [projection?.location?.id].map(text).filter(Boolean),
      characterIds: boundCharacterIds,
      sourceRefs: list(projection?.sourceRefs).map(text).filter(Boolean)
    },
    scanDepth: 1,
    scanSeed: 0,
    // Authoring 是可复验的生产运行；体验页的概率注入不能让同一落笔处随机漏设定。
    respectProbability: false
  })
  const byId = new Map(list(matched).map((entry) => [text(entry?.id), {
    entryId: text(entry?.id),
    matchReason: text(entry?.matchReason || 'keyword')
  }]))
  const exactSceneIds = new Set([
    projection?.location?.id,
    ...boundCharacterIds,
    ...intentEntryIds
  ].map(text).filter(Boolean))
  for (const entry of worldbook.entries) {
    const entryId = text(entry?.id)
    if (exactSceneIds.has(entryId)) {
      byId.set(entryId, {
        entryId,
        matchReason: intentEntryIds.includes(entryId) ? 'scene-intent' : 'current-scene'
      })
    }
  }
  return [...byId.values()]
}

function sceneIntentBindingsAreCurrent({ target, worldbook, sceneIntents = [] } = {}) {
  const intents = list(sceneIntents)
  if (!intents.length) return true
  const read = readAuthoringSceneIntentCandidates({
    sceneIntents: intents,
    projectId: target?.projectId,
    chapterId: target?.chapterId,
    unitId: target?.unitId
  })
  if (read.exclusions.length || read.candidates.length !== intents.length) return false
  const expectedWorldbookId = text(worldbook?.id)
  if (!expectedWorldbookId) return false
  const entriesById = new Map(list(worldbook?.entries).map((entry) => [text(entry?.id), entry]))
  return intents.every((intent) => {
    const entry = entriesById.get(text(intent?.payload?.entryId))
    return Boolean(
      entry
      && text(intent?.worldbookId) === expectedWorldbookId
      && text(entry?.type) === text(intent?.payload?.entityKind)
      && text(intent?.entryRevision) === worldbookRunRevision(entry)
    )
  })
}

async function resolveReferences(selections, projectId, repositories) {
  const references = []
  const explorationById = new Map()
  const assetById = new Map()
  const sourceCache = new Map()
  for (const raw of list(selections)) {
    const sourceKind = text(raw?.sourceKind)
    const sourceId = text(raw?.sourceId || raw?.id)
    const referenceProjectId = text(raw?.projectId) || projectId
    const validKind = ['exploration-doc', 'narrative-asset'].includes(sourceKind)
    const key = `${referenceProjectId}:${sourceKind}:${sourceId}`
    let resolved = null
    if (validKind && sourceId && referenceProjectId === projectId) {
      if (!sourceCache.has(key)) {
        try {
          sourceCache.set(key, sourceKind === 'exploration-doc'
            ? await repositories?.getExplorationDocument?.(projectId, sourceId)
            : await repositories?.getNarrativeAsset?.(sourceId, projectId))
        } catch {
          sourceCache.set(key, null)
        }
      }
      resolved = sourceCache.get(key)
    }
    // 选择器会携带作者最后确认的 revision。来源在选择后发生变化时保留旧
    // revision 交给 reader 明确排除，不能悄悄把新版内容冒充原选择。
    const selectedRevision = text(raw?.revision)
    const revision = validKind && resolved
      ? selectedRevision || authoringRunReferenceRevision(sourceKind, resolved)
      : validKind ? 'source-missing' : ''
    references.push({
      id: text(raw?.id) || `${sourceKind || 'invalid'}:${sourceId || 'missing'}`,
      sourceKind,
      sourceId,
      projectId: referenceProjectId,
      usageRole: ['intent', 'fact', 'inspiration'].includes(raw?.usageRole)
        ? raw.usageRole
        : 'inspiration',
      revision,
      scope: 'run-only'
    })
    if (resolved) {
      if (sourceKind === 'exploration-doc') explorationById.set(sourceId, resolved)
      else assetById.set(sourceId, resolved)
    }
  }
  return {
    references,
    explorationDocuments: [...explorationById.values()],
    referenceAssets: [...assetById.values()]
  }
}

async function resolveMemoryProvenanceSources({
  memories, projectId, repositories, explorationDocuments, referenceAssets
}) {
  const explorationById = new Map(list(explorationDocuments).map((item) => [text(item?.id), item]))
  const assetById = new Map(list(referenceAssets).map((item) => [text(item?.id), item]))
  const manuscriptSourceRevisions = {}
  const requests = []
  const pending = new Set()
  for (const memory of list(memories)) {
    const sourceRef = text(memoryPrimarySourceRef(memory))
    if (sourceRef.startsWith('exploration:')) {
      const sourceId = sourceRef.slice('exploration:'.length)
      if (sourceId && !explorationById.has(sourceId) && !pending.has(sourceRef)) requests.push((async () => {
        pending.add(sourceRef)
        try {
          const source = await repositories?.getExplorationDocument?.(projectId, sourceId)
          if (source) explorationById.set(sourceId, source)
        } catch { /* 缺失会由 memory reader 记录为 source-revision-unavailable */ }
      })())
    } else if (sourceRef.startsWith('narrative-asset:')) {
      const sourceId = sourceRef.slice('narrative-asset:'.length)
      if (sourceId && !assetById.has(sourceId) && !pending.has(sourceRef)) requests.push((async () => {
        pending.add(sourceRef)
        try {
          const source = await repositories?.getNarrativeAsset?.(sourceId, projectId)
          if (source) assetById.set(sourceId, source)
        } catch { /* 同上，保守排除而不是回退 frozen revision */ }
      })())
    } else if (sourceRef.startsWith('chapter:') || sourceRef.startsWith('unit:')) {
      if (!pending.has(sourceRef)) requests.push((async () => {
        pending.add(sourceRef)
        try {
          const revision = await repositories?.getManuscriptSourceRevision?.(projectId, sourceRef)
          if (text(revision)) manuscriptSourceRevisions[sourceRef] = text(revision)
        } catch { /* 其他章节不可读时保守排除该记忆 */ }
      })())
    }
  }
  await Promise.all(requests)
  return {
    explorationDocuments: [...explorationById.values()],
    referenceAssets: [...assetById.values()],
    manuscriptSourceRevisions
  }
}

function authoringRunInstruction(request = {}) {
  const turn = request?.intent?.turn || {}
  const instruction = text(turn.instruction) || text(request?.intent?.instruction)
  const directorNote = text(turn.directorNote)
  return [instruction, directorNote].filter(Boolean).join('\n')
}

function createSessionRepositories(bundle, target) {
  const worldbook = bundle.worldbook
  const explorationById = new Map(list(bundle.explorationDocuments)
    .map((item) => [text(item?.id), item]))
  const assetById = new Map(list(bundle.referenceAssets)
    .map((item) => [text(item?.id), item]))
  return {
    worldbookRepository: Object.freeze({
      getBoundWorldbook(projectId, worldbookId) {
        if (!worldbook
          || text(projectId) !== target.projectId
          || text(worldbookId) !== text(bundle.projection?.worldbookId)
          || text(worldbook.id) !== text(worldbookId)) return null
        return { projectId: target.projectId, worldbookId: text(worldbookId), worldbook }
      }
    }),
    referenceRepositories: Object.freeze({
      getExplorationDocument(projectId, sourceId) {
        return text(projectId) === target.projectId ? explorationById.get(text(sourceId)) || null : null
      },
      getNarrativeAsset(sourceId, projectId) {
        return text(projectId) === target.projectId ? assetById.get(text(sourceId)) || null : null
      }
    }),
    memoryRepository: Object.freeze({
      list() { return bundle.memories }
    })
  }
}

// Callback readers in this adapter use one object argument; repository readers
// use positional arguments. Keep the latter explicit so browser adapters remain
// tiny and do not need to understand orchestration shapes.
async function readRepositoryList(repository) {
  try {
    return list(await repository?.list?.({ status: null }))
  } catch {
    return []
  }
}

function buildMemorySourceRevisions({
  live, projection, worldbook, explorationDocuments, referenceAssets,
  outlineNodes, sceneIntents, memories, manuscriptSourceRevisions = {}
}) {
  const revisions = {}
  const assign = (ref, revision) => {
    const key = text(ref)
    const value = text(revision)
    if (key && value) revisions[key] = value
  }
  for (const [sourceRef, revision] of Object.entries(manuscriptSourceRevisions)) assign(sourceRef, revision)
  if (live.role === 'manuscript') assign(`chapter:${live.chapterId}`, live.documentRevision)
  else assign(`exploration:${live.documentId}`, live.documentRevision)
  for (const unit of list(live.document?.content)) {
    assign(`unit:${text(unit?.attrs?.unitId || unit?.unitId)}`, live.documentRevision)
  }
  assign('scene-projection:current', projection?.projectionFingerprint)
  for (const entry of list(worldbook?.entries)) {
    assign(`worldbook-entry:${text(entry?.id)}`, worldbookRunRevision(entry))
  }
  for (const document of list(explorationDocuments)) {
    assign(`exploration:${text(document?.id)}`, authoringRunReferenceRevision('exploration-doc', document))
  }
  for (const asset of list(referenceAssets)) {
    assign(`narrative-asset:${text(asset?.id)}`, authoringRunReferenceRevision('narrative-asset', asset))
  }
  for (const node of list(outlineNodes)) {
    if (node?.id != null && node?.revision != null) assign(`outline-node:${text(node.id)}`, `node-r${String(node.revision)}`)
  }
  for (const intent of list(sceneIntents)) assign(`scene-intent:${text(intent?.id)}`, intent?.revision)
  // Only expose revisions for sources that a live memory actually references.
  const referenced = new Set(list(memories).map(memoryPrimarySourceRef).map(text).filter(Boolean))
  return Object.fromEntries([...referenced].flatMap((ref) => revisions[ref] ? [[ref, revisions[ref]]] : []))
}

async function readLiveBundle({
  expectedTarget,
  repositoryAdapters,
  readOutlineNodes,
  readSceneIntents,
  readReferenceSelections,
  readSourceRevisions
}) {
  const live = await readValue(repositoryAdapters?.liveTargetReader, expectedTarget, null)
  if (!liveTargetMatches(expectedTarget, live)) return null
  const projection = snapshotRunProjection(live.sceneProjection)
  let binding = null
  try {
    binding = await repositoryAdapters?.worldbookRepository?.getBoundWorldbook?.(
      expectedTarget.projectId,
      text(projection?.worldbookId)
    )
  } catch {
    binding = null
  }
  const requestedWorldbookId = text(projection?.worldbookId)
  const worldbook = binding
    && text(binding.projectId) === expectedTarget.projectId
    && text(binding.worldbookId) === requestedWorldbookId
    && text(binding.worldbook?.id) === requestedWorldbookId
    ? binding.worldbook
    : null
  const outlineNodes = list(await readValue(readOutlineNodes, expectedTarget, []))
  const sceneIntents = list(await readValue(readSceneIntents, expectedTarget, []))
  const selections = list(await readValue(readReferenceSelections, expectedTarget, []))
  const resolvedReferences = await resolveReferences(
    selections,
    expectedTarget.projectId,
    repositoryAdapters?.referenceRepositories
  )
  const memories = await readRepositoryList(repositoryAdapters?.memoryRepository)
  const memorySources = await resolveMemoryProvenanceSources({
    memories,
    projectId: expectedTarget.projectId,
    repositories: repositoryAdapters?.referenceRepositories,
    explorationDocuments: resolvedReferences.explorationDocuments,
    referenceAssets: resolvedReferences.referenceAssets
  })
  const sourceRevisions = await readValue(readSourceRevisions, expectedTarget, {})
  const memorySourceRevisions = buildMemorySourceRevisions({
    live,
    projection,
    worldbook,
    explorationDocuments: memorySources.explorationDocuments,
    referenceAssets: memorySources.referenceAssets,
    outlineNodes,
    sceneIntents,
    memories,
    manuscriptSourceRevisions: memorySources.manuscriptSourceRevisions
  })
  return {
    live,
    projection,
    worldbook,
    outlineNodes,
    sceneIntents,
    memories,
    sourceRevisions,
    memorySourceRevisions,
    ...resolvedReferences,
    explorationDocuments: memorySources.explorationDocuments,
    referenceAssets: memorySources.referenceAssets
  }
}

export function createAuthoringRunSessionAdapter({
  repositoryAdapters = null,
  readOutlineNodes = () => [],
  readSceneIntents = () => [],
  readReferenceSelections = () => [],
  readSourceRevisions = () => ({}),
  readPinnedCandidateIds = () => [],
  readExcludedCandidateIds = () => [],
  authorId = '',
  sessionId = ''
} = {}) {
  async function prepareSession({ taskId, request } = {}) {
    const expectedTarget = targetFromRequest(request)
    if (!expectedTarget) return failure('authoring-run-target-invalid')
    const bundle = await readLiveBundle({
      expectedTarget,
      repositoryAdapters,
      readOutlineNodes,
      readSceneIntents,
      readReferenceSelections,
      readSourceRevisions
    })
    if (!bundle) return failure('authoring-run-live-target-unavailable')
    // 重写当前块不消费“安排下一段”；只有 run-only 设定可作为这次改写参考。
    // 纠正当前已经体现在共享 sceneProjection 中，不需要第二份 intent 候选。
    const runSceneIntents = expectedTarget.contextMode === 'rewrite-unit'
      ? list(bundle.sceneIntents).filter((intent) => text(intent?.mode) === 'run-only')
      : bundle.sceneIntents
    if (bundle.projection?.worldbookStatus === 'missing'
      || (text(bundle.projection?.worldbookId) && !bundle.worldbook)
      || (bundle.projection?.worldbookStatus === 'bound' && !text(bundle.worldbook?.id))) {
      return failure('authoring-run-worldbook-unavailable', {
        worldbookId: text(bundle.projection?.worldbookId)
      })
    }
    if (!sceneIntentBindingsAreCurrent({
      target: expectedTarget,
      worldbook: bundle.worldbook,
      sceneIntents: runSceneIntents
    })) {
      return failure('authoring-run-scene-intent-stale')
    }
    const instruction = authoringRunInstruction(request)
    const sessionRepositories = createSessionRepositories(bundle, expectedTarget)
    const currentRevisions = collectAuthoringRunDependencyRevisions({
      document: bundle.live.document,
      documentId: expectedTarget.documentId,
      documentRevision: bundle.live.documentRevision,
      sceneProjection: bundle.projection,
      worldbook: bundle.worldbook,
      explorationDocuments: bundle.explorationDocuments,
      referenceAssets: bundle.referenceAssets,
      memories: bundle.memories,
      sceneIntents: runSceneIntents,
      outlineNodes: bundle.outlineNodes,
      sourceRevisions: bundle.sourceRevisions,
      memorySourceRevisions: bundle.memorySourceRevisions
    })
    return createAuthoringRunSession({
      taskId,
      taskKind: expectedTarget.role === 'exploration' ? 'exploration' : 'manuscript',
      profile: 'narrative-long',
      target: {
        ...expectedTarget,
        documentSchemaRevision: text(bundle.live.documentSchemaRevision || bundle.live.document?.revision)
      },
      documentSnapshot: bundle.live.document,
      sceneProjection: bundle.projection,
      matchedWorldbookEntries: sceneWorldbookSelections({
        target: expectedTarget,
        document: bundle.live.document,
        projection: bundle.projection,
        worldbook: bundle.worldbook,
        sceneIntents: runSceneIntents,
        instruction
      }),
      worldbookRepository: sessionRepositories.worldbookRepository,
      references: bundle.references,
      referenceRepositories: sessionRepositories.referenceRepositories,
      memoryRepository: sessionRepositories.memoryRepository,
      outlineNodes: bundle.outlineNodes,
      sceneIntents: runSceneIntents,
      authorId: text(typeof authorId === 'function' ? authorId() : authorId),
      sessionId: text(typeof sessionId === 'function' ? sessionId() : sessionId),
      instruction,
      pinnedCandidateIds: list(await readValue(readPinnedCandidateIds, expectedTarget, [])),
      excludedCandidateIds: list(await readValue(readExcludedCandidateIds, expectedTarget, [])),
      currentRevisions
    })
  }

  async function collectLiveDependencies(session) {
    const expectedTarget = session?.target
    if (!expectedTarget) return Object.freeze({})
    const bundle = await readLiveBundle({
      expectedTarget,
      repositoryAdapters,
      readOutlineNodes,
      readSceneIntents,
      readReferenceSelections: () => list(session.references).map((reference) => ({
        id: reference.id,
        sourceKind: reference.sourceKind,
        sourceId: reference.sourceId,
        usageRole: reference.usageRole
      })),
      readSourceRevisions
    })
    if (!bundle) return Object.freeze({})
    return collectAuthoringRunDependencyRevisions({
      document: bundle.live.document,
      documentId: expectedTarget.documentId,
      documentRevision: bundle.live.documentRevision,
      sceneProjection: bundle.projection,
      worldbook: bundle.worldbook,
      explorationDocuments: bundle.explorationDocuments,
      referenceAssets: bundle.referenceAssets,
      memories: bundle.memories,
      sceneIntents: bundle.sceneIntents,
      outlineNodes: bundle.outlineNodes,
      sourceRevisions: bundle.sourceRevisions,
      memorySourceRevisions: bundle.memorySourceRevisions
    })
  }

  return Object.freeze({ prepareSession, collectLiveDependencies })
}

export default createAuthoringRunSessionAdapter
