// 落笔上下文闭环 P1 / C1-1A：一次模型运行只消费这一份内存快照。
// documentSnapshot 只用于提交瞬间发现合法正文候选，绝不进入返回的 session；
// 因此光标后正文和未来 writingUnit 没有第二条可被 runtime 误序列化的路径。

import {
  captureAuthoringRunTarget,
  dedupeAuthoringRunCandidates,
  readAuthoringRunMemoryCandidates,
  readAuthoringOutlineCandidates,
  readAuthoringRunReferenceCandidates,
  readAuthoringSceneIntentCandidates,
  readAuthoringSceneProjectionCandidates,
  readAuthoringWorldbookCandidates,
  readManuscriptRunCandidates
} from '../context/authoringRunContextReaders.js'
import { deriveManifestToolAuthorization } from '../context/manifestToolAuthorization.js'
import { COMPILER_PROFILES, compileWritingContext } from '../context/writingContextCompiler.js'

export const AUTHORING_RUN_SESSION_SCHEMA_VERSION = 1

const SAFE_SCENE_FIELDS = Object.freeze([
  'schemaVersion', 'projectId', 'chapterId', 'sceneId', 'revision', 'activeUnitId',
  'worldbookId', 'worldbookStatus', 'anchorStatus', 'anchorId', 'projectionFingerprint',
  'viewpointCharacter', 'activeActor', 'dialogueTarget', 'location', 'time',
  'presentCharacters', 'plannedCharacters', 'plannedCharacterIds', 'activeRelations',
  'unresolvedEvents', 'missingRefs', 'sourceRefs'
])
const AUTHORING_RUN_TASK_KINDS = Object.freeze(['manuscript', 'exploration', 'conflict-check'])
const ALLOWED_ADDITIONAL_CANDIDATE_KINDS = Object.freeze(['outline-node'])

function text(value) {
  return String(value ?? '').trim()
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value) !== ''
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function cloneContextValue(value, seen = new WeakMap()) {
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return seen.get(value)
  if (Array.isArray(value)) {
    const clone = []
    seen.set(value, clone)
    for (const item of value) clone.push(cloneContextValue(item, seen))
    return clone
  }
  const clone = {}
  seen.set(value, clone)
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'function' && item !== undefined) clone[key] = cloneContextValue(item, seen)
  }
  return clone
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const item of Object.values(value)) deepFreeze(item, seen)
  return Object.isFrozen(value) ? value : Object.freeze(value)
}

function frozenSnapshot(value) {
  return deepFreeze(cloneContextValue(value))
}

function failure(reason, details = {}) {
  return frozenSnapshot({ ok: false, reason: text(reason) || 'authoring-run-session-invalid', ...details })
}

function stableHash(value) {
  const source = typeof value === 'string' ? value : JSON.stringify(value)
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function snapshotSceneProjection(projection) {
  if (!projection || typeof projection !== 'object') return null
  return Object.fromEntries(SAFE_SCENE_FIELDS
    .filter((key) => projection[key] !== undefined)
    .map((key) => [key, cloneContextValue(projection[key])]))
}

function normalizeTargetInput(target = {}, documentSnapshot = null) {
  const source = cloneContextValue(target && typeof target === 'object' ? target : {})
  source.role = source.role === 'exploration' || source.documentRole === 'exploration'
    ? 'exploration'
    : 'manuscript'
  if (!hasValue(source.caretOffset) && hasValue(source.cursorLocalOffset)) {
    source.caretOffset = Number(source.cursorLocalOffset)
  }
  // 页面层的 documentRevision 可以是完整文档状态指纹；structured document 的
  // 单调 revision 单独用于核对 projection。未提供时保持旧合同兼容。
  if (hasValue(source.documentSchemaRevision)) {
    source.documentRevision = String(source.documentSchemaRevision)
  } else if (!hasValue(source.documentRevision) && hasValue(documentSnapshot?.revision)) {
    source.documentRevision = String(documentSnapshot.revision)
  }
  return source
}

function freezeCapturedTarget(capturedTarget, rawTarget = {}) {
  const schemaRevision = text(capturedTarget?.documentRevision)
  const opaqueDocumentRevision = hasValue(rawTarget.documentRevision)
    ? text(rawTarget.documentRevision)
    : schemaRevision
  const absoluteCaret = Number(rawTarget.caret)
  return frozenSnapshot({
    ...capturedTarget,
    documentRole: capturedTarget.role,
    documentRevision: opaqueDocumentRevision,
    documentSchemaRevision: schemaRevision,
    caret: Number.isFinite(absoluteCaret) ? absoluteCaret : null,
    cursorLocalOffset: Number(capturedTarget.caretOffset)
  })
}

function projectionTargetIssues(target, projection, currentRevisions = {}) {
  if (!projection) return [{ field: 'sceneProjection', reason: 'projection-missing' }]
  const checks = [
    ['projectId', target.projectId, projection.projectId],
    ['activeUnitId', target.unitId, projection.activeUnitId],
    ['documentRevision', target.documentSchemaRevision, projection.revision]
  ]
  if (target.role === 'manuscript') checks.splice(1, 0, ['chapterId', target.chapterId, projection.chapterId])
  const issues = checks.flatMap(([field, expected, actual]) => (
    text(expected) && text(expected) === text(actual)
      ? []
      : [{ field, reason: hasValue(actual) ? 'projection-target-mismatch' : 'projection-field-missing', expected: text(expected), actual: text(actual) }]
  ))
  const projectionFingerprint = text(projection.projectionFingerprint)
  if (!projectionFingerprint) {
    issues.push({ field: 'projectionFingerprint', reason: 'projection-fingerprint-missing' })
  } else if (!Object.prototype.hasOwnProperty.call(currentRevisions || {}, 'scene-projection')) {
    issues.push({
      field: 'projectionFingerprint',
      reason: 'projection-revision-missing',
      expected: projectionFingerprint,
      actual: ''
    })
  } else if (text(currentRevisions['scene-projection']) !== projectionFingerprint) {
    issues.push({
      field: 'projectionFingerprint',
      reason: 'projection-revision-changed',
      expected: projectionFingerprint,
      actual: text(currentRevisions['scene-projection'])
    })
  }
  return issues
}

function targetDependencyRevisions(target, projection) {
  const documentKey = `document:${target.documentId}`
  const unitKey = `unit:${target.documentId}:${target.unitId}`
  const nodeKey = `node:${target.documentId}:${target.nodeId}`
  return {
    [documentKey]: text(target.documentRevision),
    [unitKey]: `unit-r${text(target.unitRevision)}`,
    [nodeKey]: `node-r${text(target.nodeRevision)}`,
    'scene-projection': text(projection?.projectionFingerprint)
  }
}

function targetRevisionIssues(dependencies, currentRevisions = {}) {
  const issues = []
  for (const [key, expected] of Object.entries(dependencies)) {
    if (key === 'scene-projection') continue
    if (!Object.prototype.hasOwnProperty.call(currentRevisions || {}, key)) {
      issues.push({ dependency: key, reason: 'revision-missing', expected, actual: '' })
      continue
    }
    const actual = text(currentRevisions[key])
    if (actual !== text(expected)) issues.push({ dependency: key, reason: 'revision-changed', expected, actual })
  }
  return issues
}

function sanitizeExclusion(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const candidateId = text(source.candidateId || source.id)
  const reason = text(source.reason)
  if (!candidateId || !reason) return null
  const safe = { candidateId, reason }
  for (const key of ['label', 'kind', 'sourceKind', 'sourceId', 'usageRole', 'primarySourceRef', 'keptCandidateId']) {
    if (hasValue(source[key])) safe[key] = text(source[key])
  }
  const sourceRefs = list(source.sourceRefs).map(text).filter(Boolean).slice(0, 8)
  if (sourceRefs.length) safe.sourceRefs = sourceRefs
  return safe
}

function sanitizeIssue(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const issue = {}
  for (const key of [
    'reason', 'field', 'dependency', 'primarySourceRef', 'sourceRef',
    'candidateId', 'kind', 'expected', 'actual'
  ]) {
    if (hasValue(source[key])) issue[key] = text(source[key])
  }
  for (const key of ['candidateIds', 'revisions', 'projects', 'kinds']) {
    const values = list(source[key]).map(text).filter(Boolean)
    if (values.length) issue[key] = values
  }
  return issue
}

async function invokeReader(name, reader, input) {
  try {
    const result = await reader(input)
    if (!result || typeof result !== 'object') {
      return failure('context-reader-invalid-result', { reader: name })
    }
    if (result.ok === false) {
      return failure(result.reason || 'context-reader-rejected', {
        reader: name,
        ...(result.limit != null ? { limit: result.limit } : {}),
        ...(result.selected != null ? { selected: result.selected } : {}),
        exclusions: list(result.exclusions).map(sanitizeExclusion).filter(Boolean)
      })
    }
    return { ok: true, result }
  } catch (error) {
    return failure('context-reader-failed', {
      reader: name,
      cause: text(error?.code || error?.name || 'unexpected-error')
    })
  }
}

function snapshotResolvedReferences(references = []) {
  return list(references).map((reference) => ({
    id: text(reference.id),
    sourceKind: text(reference.sourceKind),
    sourceId: text(reference.sourceId),
    projectId: text(reference.projectId),
    label: text(reference.label),
    excerpt: text(reference.excerpt),
    sourceRefs: list(reference.sourceRefs).map(text).filter(Boolean),
    revision: text(reference.revision),
    usageRole: text(reference.usageRole),
    scope: 'run-only',
    status: text(reference.status)
  }))
}

function snapshotAcceptedSceneIntents(sceneIntents = [], candidates = [], manifestBlocks = []) {
  const includedCandidateIds = new Set(list(manifestBlocks).map((block) => text(block?.candidateId)).filter(Boolean))
  const candidateBySourceId = new Map(list(candidates)
    .filter((candidate) => includedCandidateIds.has(text(candidate?.id)))
    .map((candidate) => [text(candidate.sourceId), candidate]))
  return list(sceneIntents).flatMap((intent) => {
    const candidate = candidateBySourceId.get(text(intent?.id))
    if (!candidate) return []
    return [{
      id: text(intent.id),
      mode: text(intent.mode),
      entityKind: text(intent.entityKind),
      entityId: text(intent.entityId),
      worldbookId: text(intent.worldbookId),
      entryRevision: text(intent.entryRevision),
      payload: intent.payload && typeof intent.payload === 'object'
        ? cloneContextValue(intent.payload)
        : null,
      label: text(candidate.label),
      content: text(candidate.representations?.full),
      revision: text(candidate.revision),
      sourceRefs: list(candidate.sourceRefs).map(text).filter(Boolean)
    }]
  })
}

function normalizeRunCandidateDependencies(candidate, projection) {
  if (candidate?.kind !== 'scene-projection') return candidate
  return {
    ...candidate,
    dependencyRevisions: { 'scene-projection': text(projection?.projectionFingerprint) }
  }
}

/**
 * Build one immutable, in-memory Authoring run session.
 *
 * The returned session contains only reader-approved candidates and the compiled manifest.
 * Repository handles, the source document snapshot and post-caret prose never escape this call.
 */
export async function createAuthoringRunSession(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const documentSnapshot = frozenSnapshot(source.documentSnapshot || null)
  const projection = frozenSnapshot(snapshotSceneProjection(source.sceneProjection))
  const rawTarget = cloneContextValue(source.target || {})
  const capture = captureAuthoringRunTarget({
    target: normalizeTargetInput(rawTarget, documentSnapshot),
    document: documentSnapshot,
    sceneProjection: projection
  })
  if (!capture?.ok) return failure(capture?.reason || 'target-capture-failed', {
    ...(hasValue(capture?.expected) ? { expected: text(capture.expected) } : {}),
    ...(hasValue(capture?.actual) ? { actual: text(capture.actual) } : {})
  })

  const target = freezeCapturedTarget(capture.target, rawTarget)
  const targetCapture = Object.freeze({ ...capture, target })
  const projectionIssues = projectionTargetIssues(target, projection, source.currentRevisions)
  if (projectionIssues.length) return failure('target-projection-mismatch', {
    issues: projectionIssues.map(sanitizeIssue)
  })

  const dependencies = targetDependencyRevisions(target, projection)
  const revisionIssues = targetRevisionIssues(dependencies, source.currentRevisions)
  if (revisionIssues.length) return failure('target-revision-mismatch', {
    issues: revisionIssues.map(sanitizeIssue)
  })

  const additionalCandidates = list(source.additionalCandidates).map((candidate) => cloneContextValue(candidate))
  const forbiddenAdditional = additionalCandidates.filter((candidate) => (
    !ALLOWED_ADDITIONAL_CANDIDATE_KINDS.includes(candidate?.kind)
  ))
  if (forbiddenAdditional.length) return failure('additional-candidate-kind-forbidden', {
    candidateIds: forbiddenAdditional.map((candidate) => text(candidate?.id)).filter(Boolean),
    kinds: forbiddenAdditional.map((candidate) => text(candidate?.kind)).filter(Boolean)
  })
  const invalidOutlineDependencies = additionalCandidates.flatMap((candidate) => {
    if (candidate?.kind !== 'outline-node') return []
    const primarySourceRef = text(candidate.primarySourceRef)
    const revision = text(candidate.revision)
    const declaredRevision = text(candidate.dependencyRevisions?.[primarySourceRef])
    if (primarySourceRef.startsWith('outline-node:') && revision && declaredRevision === revision) return []
    return [{
      candidateId: text(candidate.id),
      primarySourceRef,
      reason: 'outline-primary-dependency-invalid',
      expected: revision,
      actual: declaredRevision
    }]
  })
  if (invalidOutlineDependencies.length) return failure('additional-candidate-dependency-invalid', {
    issues: invalidOutlineDependencies.map(sanitizeIssue)
  })

  const sharedReaderInput = {
    target,
    targetCapture,
    projectId: target.projectId,
    chapterId: target.chapterId,
    unitId: target.unitId,
    sceneProjection: projection
  }
  const readerCalls = await Promise.all([
    invokeReader('manuscript', readManuscriptRunCandidates, { targetCapture, document: documentSnapshot }),
    invokeReader('scene-projection', readAuthoringSceneProjectionCandidates, sharedReaderInput),
    invokeReader('worldbook', readAuthoringWorldbookCandidates, {
      ...sharedReaderInput,
      worldbookId: text(projection?.worldbookId),
      entries: frozenSnapshot(list(source.matchedWorldbookEntries)),
      repository: source.worldbookRepository
    }),
    invokeReader('references', readAuthoringRunReferenceCandidates, {
      references: frozenSnapshot(list(source.references)),
      projectId: target.projectId,
      repositories: source.referenceRepositories
    }),
    invokeReader('memory', readAuthoringRunMemoryCandidates, {
      projectId: target.projectId,
      authorId: text(source.authorId),
      sessionId: text(source.sessionId),
      instruction: text(source.instruction),
      caretPrefix: capture.caretPrefix,
      sceneProjection: projection,
      currentRevisions: frozenSnapshot(source.currentRevisions || {}),
      repository: source.memoryRepository,
      now: source.now
    }),
    invokeReader('outline', readAuthoringOutlineCandidates, {
      outlineNodes: frozenSnapshot(list(source.outlineNodes)),
      projectId: target.projectId,
      chapterId: target.chapterId
    }),
    invokeReader('scene-intents', readAuthoringSceneIntentCandidates, {
      sceneIntents: frozenSnapshot(list(source.sceneIntents)),
      projectId: target.projectId,
      chapterId: target.chapterId,
      unitId: target.unitId
    })
  ])
  const rejectedReader = readerCalls.find((call) => !call.ok)
  if (rejectedReader) return rejectedReader

  const [manuscript, scene, worldbook, references, memory, outline, sceneIntents] = readerCalls
    .map((call) => call.result)
  const discoveryExclusions = [manuscript, scene, worldbook, references, memory, outline, sceneIntents]
    .flatMap((result) => list(result.exclusions))
    .map(sanitizeExclusion)
    .filter(Boolean)
  const discoveredCandidates = [manuscript, scene, worldbook, references, memory, outline, sceneIntents]
    .flatMap((result) => list(result.candidates))
    .map((candidate) => normalizeRunCandidateDependencies(candidate, projection))

  for (const candidate of additionalCandidates) {
    discoveredCandidates.push(normalizeRunCandidateDependencies(candidate, projection))
  }

  const deduplicated = dedupeAuthoringRunCandidates(discoveredCandidates)
  if (deduplicated?.ok === false) return failure(deduplicated.reason || 'candidate-deduplication-failed', {
    issues: list(deduplicated.issues).map(sanitizeIssue)
  })
  const dedupeIssues = list(deduplicated?.issues).map(sanitizeIssue)
  if (dedupeIssues.length) return failure('candidate-source-conflict', { issues: dedupeIssues })
  discoveryExclusions.push(...list(deduplicated?.exclusions).map(sanitizeExclusion).filter(Boolean))

  const taskKind = text(source.taskKind) || (target.role === 'exploration' ? 'exploration' : 'manuscript')
  if (!AUTHORING_RUN_TASK_KINDS.includes(taskKind)) return failure('task-kind-invalid', { taskKind })
  const profile = text(source.profile) || 'narrative-long'
  if (!Object.prototype.hasOwnProperty.call(COMPILER_PROFILES, profile)) {
    return failure('context-profile-invalid', { profile })
  }
  let manifest
  try {
    manifest = compileWritingContext({
      candidates: list(deduplicated?.candidates),
      target,
      profile,
      taskKind,
      excludedCandidateIds: list(source.excludedCandidateIds),
      pinnedCandidateIds: list(source.pinnedCandidateIds),
      dependencyRevisions: dependencies,
      discoveryExclusions
    })
  } catch (error) {
    if (error?.code === 'CONTEXT_DEPENDENCY_REVISION_CONFLICT') {
      return failure('context-dependency-revision-conflict', {
        issues: list(error.dependencyConflicts).map(sanitizeIssue)
      })
    }
    return failure('context-manifest-compile-failed', {
      cause: text(error?.code || error?.name || 'unexpected-error')
    })
  }
  if (!manifest?.fingerprint) return failure('context-manifest-missing')
  const toolAuthorization = deriveManifestToolAuthorization(manifest, { projectId: target.projectId })
  if (!toolAuthorization.ok) return failure('manifest-tool-authorization-failed', {
    authorizationReason: toolAuthorization.reason
  })

  const taskId = text(source.taskId) || 'authoring.continue'
  const runId = text(source.runId) || `authoring-run-${stableHash({
    taskId,
    taskKind,
    target,
    manifestFingerprint: manifest.fingerprint
  })}`
  const session = frozenSnapshot({
    schemaVersion: AUTHORING_RUN_SESSION_SCHEMA_VERSION,
    kind: 'authoring-run-session',
    status: 'prepared',
    runId,
    taskId,
    taskKind,
    profile,
    target,
    sceneProjection: projection,
    references: snapshotResolvedReferences(references.references),
    sceneIntents: snapshotAcceptedSceneIntents(source.sceneIntents, sceneIntents.candidates, manifest.blocks),
    candidates: list(deduplicated?.candidates),
    discoveryExclusions,
    recall: memory.recall || null,
    manifest,
    toolAuthorization: toolAuthorization.authorization,
    receipt: null
  })
  return Object.freeze({ ok: true, session })
}
