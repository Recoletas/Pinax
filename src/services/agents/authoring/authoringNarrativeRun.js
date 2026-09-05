// C1-1B：生产叙事运行的薄边界。
// narrative task 必须先获得冻结 AuthoringRunSession，再由同一 session 的 manifest
// 生成 envelope/ledger 并执行；其余 task 完整回退到既有 resolver。

import { getCanonicalAgentTask } from '../../../../shared/agentCapabilityContract.js'
import {
  AGENT_CONTEXT_MAX_CHARS,
  buildAgentContextEnvelope,
  createAgentContextLedger,
  validateAgentContextEnvelope
} from '../../../../shared/agentContextContract.js'
import { resolveAgentContext as resolveDefaultAgentContext } from '../agentContextResolver.js'
import {
  AUTHORING_NARRATIVE_TASK_IDS,
  resolveAuthoringTaskId
} from './authoringTaskDispatcher.js'

const NARRATIVE_TASK_IDS = new Set(AUTHORING_NARRATIVE_TASK_IDS)
const SESSION_KIND = 'authoring-run-session'
const MANIFEST_KIND = 'compiled-context-manifest'

export const AUTHORING_NARRATIVE_RUN_ERROR_CODES = Object.freeze({
  PREPARE_UNAVAILABLE: 'AUTHORING_RUN_SESSION_PREPARE_UNAVAILABLE',
  PREPARE_FAILED: 'AUTHORING_RUN_SESSION_PREPARE_FAILED',
  SESSION_INVALID: 'AUTHORING_RUN_SESSION_INVALID',
  EXECUTE_UNAVAILABLE: 'AUTHORING_RUN_SESSION_EXECUTE_UNAVAILABLE'
})

function typedError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, ...details })
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isDeepFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return true
  if (!Object.isFrozen(value)) return false
  seen.add(value)
  return Object.values(value).every((child) => isDeepFrozen(child, seen))
}

function normalizeSourceRefs(sourceRefs) {
  if (!Array.isArray(sourceRefs)) return null
  const normalized = sourceRefs.map((sourceRef) => String(sourceRef || '').trim())
  if (normalized.some((sourceRef) => !sourceRef || sourceRef.length > 200)) return null
  if (normalized.length > 32 || new Set(normalized).size !== normalized.length) return null
  return normalized
}

function validateFrozenSession(session, taskId) {
  if (!isRecord(session) || !isDeepFrozen(session)) return 'session-not-deep-frozen'
  if (session.kind !== SESSION_KIND || session.status !== 'prepared') return 'session-kind-or-status-invalid'
  if (Number(session.schemaVersion) !== 1) return 'session-schema-version-invalid'
  if (resolveAuthoringTaskId(session.taskId) !== taskId) return 'session-task-mismatch'
  if (!isRecord(session.sceneProjection)) return 'session-scene-projection-invalid'

  const manifest = session.manifest
  if (!isRecord(manifest) || manifest.kind !== MANIFEST_KIND || Number(manifest.schemaVersion) !== 1) {
    return 'session-manifest-invalid'
  }
  if (!String(manifest.fingerprint || '').trim()) return 'session-manifest-fingerprint-missing'
  if (!String(manifest.target?.projectId || '').trim()) return 'session-manifest-project-id-missing'
  if (String(session.sceneProjection.projectId || '') !== String(manifest.target.projectId)) {
    return 'session-scene-project-mismatch'
  }
  if (!String(session.sceneProjection.activeUnitId || '').trim()
    || !String(session.sceneProjection.projectionFingerprint || '').trim()) {
    return 'session-scene-projection-incomplete'
  }
  if (!Array.isArray(manifest.blocks) || !Array.isArray(manifest.excluded)) {
    return 'session-manifest-collections-invalid'
  }
  const maxChars = Number(manifest.budget?.totalChars)
  if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > AGENT_CONTEXT_MAX_CHARS) {
    return 'session-manifest-budget-invalid'
  }
  if (!Number.isInteger(Number(manifest.totalChars)) || Number(manifest.totalChars) < 0) {
    return 'session-manifest-total-invalid'
  }
  return ''
}

function assertFrozenSession(session, taskId) {
  const reason = validateFrozenSession(session, taskId)
  if (!reason) return session
  throw typedError(
    AUTHORING_NARRATIVE_RUN_ERROR_CODES.SESSION_INVALID,
    `invalid frozen authoring run session: ${reason}`,
    { reason, taskId }
  )
}

function manifestBlockToEnvelopeBlock(block, index) {
  if (!isRecord(block) || !String(block.kind || '').trim()) return null
  const sourceRefs = normalizeSourceRefs(block.sourceRefs)
  if (!sourceRefs) return null
  if (typeof block.text !== 'string' || Number(block.chars) !== block.text.length) return null
  return {
    kind: String(block.kind),
    content: block.text,
    priority: 1000 - index,
    sourceRefs,
    authority: block.sourceAuthority || null,
    entryId: block.sourceId ? String(block.sourceId) : undefined,
    id: block.candidateId ? String(block.candidateId) : undefined,
    included: true,
    reason: block.reason ? String(block.reason) : 'manifest-included',
    manifestRepresentation: block.representation || null,
    manifestRevision: block.revision || null
  }
}

function manifestExclusionToEnvelopeBlock(exclusion, index) {
  if (!isRecord(exclusion)) return null
  const candidateId = String(exclusion.candidateId || '').trim()
  const reason = String(exclusion.reason || '').trim()
  const sourceRefs = normalizeSourceRefs(exclusion.sourceRefs || [])
  if (!candidateId || !reason || !sourceRefs) return null
  return {
    kind: String(exclusion.kind || exclusion.sourceKind || 'context-exclusion'),
    // 排除审计必须进入 ledger，但绝不能被 prompt 序列化。
    content: '',
    priority: -1000 - index,
    sourceRefs,
    entryId: exclusion.sourceId ? String(exclusion.sourceId) : undefined,
    id: candidateId,
    included: false,
    reason
  }
}

function buildManifestContext({ taskId, request, session }) {
  const task = getCanonicalAgentTask(taskId)
  if (!task) return { task: null, envelope: null, ledger: null }

  const includedBlocks = session.manifest.blocks.map(manifestBlockToEnvelopeBlock)
  const excludedBlocks = session.manifest.excluded.map(manifestExclusionToEnvelopeBlock)
  if (includedBlocks.some((block) => !block) || excludedBlocks.some((block) => !block)) {
    throw typedError(
      AUTHORING_NARRATIVE_RUN_ERROR_CODES.SESSION_INVALID,
      'authoring run manifest contains an invalid block',
      { reason: 'session-manifest-block-invalid', taskId }
    )
  }

  const usedChars = includedBlocks.reduce((total, block) => total + block.content.length, 0)
  const declaredChars = Number(session.manifest.totalChars)
  if (usedChars !== declaredChars) {
    throw typedError(
      AUTHORING_NARRATIVE_RUN_ERROR_CODES.SESSION_INVALID,
      'authoring run manifest character total does not match its blocks',
      {
        reason: 'session-manifest-total-mismatch',
        taskId,
        expected: declaredChars,
        actual: usedChars
      }
    )
  }

  const envelope = {
    ...buildAgentContextEnvelope({
      surface: task.owner,
      target: request.target || null,
      budget: {
        maxChars: Number(session.manifest.budget.totalChars),
        usedChars,
        truncated: session.manifest.blocks.some((block) => block.representationReduced)
          || session.manifest.excluded.some((item) => (
            String(item?.reason || '').startsWith('budget-')
            || item?.reason === 'no-allowed-representation'
          ))
      },
      // prompt envelope 只携带 manifest 已入选的块；排除项以原始
      // manifestExcluded 审计，不制造第二条可序列化内容路径。
      blocks: includedBlocks
    }),
    manifestFingerprint: session.manifest.fingerprint,
    manifestExcluded: session.manifest.excluded
  }
  const validation = validateAgentContextEnvelope(envelope, task)
  if (!validation.valid) {
    throw typedError(
      AUTHORING_NARRATIVE_RUN_ERROR_CODES.SESSION_INVALID,
      `invalid manifest context envelope: ${validation.reason}`,
      { reason: validation.reason, taskId }
    )
  }

  const ledger = createAgentContextLedger({
    ...envelope,
    // excluded 块正文恒为空，只用于让统一 ledger 生成明确 excluded part。
    blocks: [...includedBlocks, ...excludedBlocks]
  })

  return {
    task,
    profile: Object.freeze({
      id: String(session.profile || session.manifest.profile || ''),
      maxChars: envelope.budget.maxChars,
      blocks: Object.freeze(session.manifest.blocks.map((block) => String(block.kind)))
    }),
    revision: request.target?.revision || null,
    envelope,
    ledger: {
      ...ledger,
      manifestFingerprint: session.manifest.fingerprint,
      manifestExcluded: session.manifest.excluded
    },
    authoringRunSession: session,
    contextManifest: session.manifest
  }
}

export function createAuthoringNarrativeRun({
  prepareSession,
  executeSession,
  fallbackResolver = resolveDefaultAgentContext
} = {}) {
  async function resolveContext({ taskId, request = {}, facade } = {}) {
    const canonicalId = resolveAuthoringTaskId(taskId)
    if (!NARRATIVE_TASK_IDS.has(canonicalId)) {
      return fallbackResolver({ taskId: canonicalId, request, facade })
    }
    const suppliedSession = request?.intent?.authoringRunSession || null
    if (suppliedSession) {
      const session = assertFrozenSession(suppliedSession, canonicalId)
      const selectedDirection = request?.intent?.turn?.selectedDirection || null
      if (selectedDirection
        && String(selectedDirection.sessionFingerprint || '') !== String(session.manifest.fingerprint || '')) {
        throw typedError(
          AUTHORING_NARRATIVE_RUN_ERROR_CODES.SESSION_INVALID,
          'selected direction does not belong to the frozen authoring session',
          { reason: 'selected-direction-session-mismatch', taskId: canonicalId }
        )
      }
      if (String(request?.target?.id || '') !== String(session.target?.documentId || '')) {
        throw typedError(
          AUTHORING_NARRATIVE_RUN_ERROR_CODES.SESSION_INVALID,
          'frozen authoring session target does not match the task request',
          { reason: 'session-request-target-mismatch', taskId: canonicalId }
        )
      }
      return buildManifestContext({ taskId: canonicalId, request, session })
    }
    if (typeof prepareSession !== 'function') {
      throw typedError(
        AUTHORING_NARRATIVE_RUN_ERROR_CODES.PREPARE_UNAVAILABLE,
        'narrative authoring tasks require a session preparer',
        { taskId: canonicalId }
      )
    }

    let prepared
    try {
      prepared = await prepareSession({ taskId: canonicalId, request })
    } catch (error) {
      throw typedError(
        AUTHORING_NARRATIVE_RUN_ERROR_CODES.PREPARE_FAILED,
        'authoring run session preparation failed',
        {
          reason: 'session-prepare-threw',
          causeCode: String(error?.code || error?.name || 'unexpected-error'),
          taskId: canonicalId
        }
      )
    }
    if (!prepared?.ok) {
      throw typedError(
        AUTHORING_NARRATIVE_RUN_ERROR_CODES.PREPARE_FAILED,
        `authoring run session preparation failed: ${prepared?.reason || 'unknown'}`,
        { reason: prepared?.reason || 'session-prepare-failed', taskId: canonicalId }
      )
    }
    const session = assertFrozenSession(prepared.session, canonicalId)
    return buildManifestContext({ taskId: canonicalId, request, session })
  }

  async function runTurn({
    authoringRunSession,
    intentMode = '',
    envelope = null,
    signal = null,
    turn = null,
    resolveLiveContextDependencies = null
  } = {}) {
    const taskId = resolveAuthoringTaskId(authoringRunSession?.taskId)
    const session = assertFrozenSession(authoringRunSession, taskId)
    if (typeof executeSession !== 'function') {
      throw typedError(
        AUTHORING_NARRATIVE_RUN_ERROR_CODES.EXECUTE_UNAVAILABLE,
        'narrative authoring tasks require a session executor',
        { taskId }
      )
    }
    const result = await executeSession({
      session,
      intentMode,
      turn,
      signal,
      envelope,
      projectId: String(session.manifest.target.projectId),
      projectionFingerprint: String(session.sceneProjection.projectionFingerprint || ''),
      contextManifest: session.manifest,
      projection: session.sceneProjection,
      ...(typeof resolveLiveContextDependencies === 'function'
        ? { resolveLiveContextDependencies }
        : {})
    })
    if (result?.contextOutcome?.status === 'stale') {
      const generatedText = String(result?.text ?? result?.generatedText ?? '')
      throw typedError(
        'AGENT_RESULT_STALE',
        '本轮结果未通过上下文对账，不能采纳',
        {
          adoptable: false,
          generatedText,
          contextManifest: result?.contextManifest || session.manifest,
          contextReceipt: result?.contextReceipt || result?.receipt || null,
          contextCallReceipts: Array.isArray(result?.contextCallReceipts) ? result.contextCallReceipts : [],
          contextOutcome: result?.contextOutcome || { status: 'stale' },
          dependencyIssues: Array.isArray(result?.dependencyIssues)
            ? result.dependencyIssues
            : (Array.isArray(result?.contextOutcome?.dependencyIssues)
                ? result.contextOutcome.dependencyIssues
                : [])
        }
      )
    }
    if (result?.adoptable === false) {
      throw typedError(
        String(result?.contextOutcome?.code || 'AUTHORING_RESULT_NOT_ADOPTABLE'),
        '本轮结果未通过上下文授权，不能采纳',
        {
          adoptable: false,
          generatedText: String(result?.text ?? result?.generatedText ?? ''),
          contextManifest: result?.contextManifest || session.manifest,
          contextReceipt: result?.contextReceipt || result?.receipt || null,
          contextCallReceipts: Array.isArray(result?.contextCallReceipts) ? result.contextCallReceipts : [],
          contextOutcome: result?.contextOutcome || { status: 'invalid-result' },
          dependencyIssues: Array.isArray(result?.dependencyIssues) ? result.dependencyIssues : []
        }
      )
    }
    return result
  }

  return Object.freeze({ resolveContext, runTurn })
}
