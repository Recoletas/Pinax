import { requestAdvisorTask } from '../../advisorTaskService.js'
import { buildContextEnvelope, clipContextEnvelope } from '../agentContextEnvelope.js'

const TASK_ID = 'authoring.rewrite'
const MAX_CONTEXT_CHARS = 16000

function text(value) {
  return String(value ?? '').trim()
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function parseJson(raw) {
  const source = text(raw).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  if (!source) return null
  try {
    return JSON.parse(source)
  } catch {
    const start = source.indexOf('{')
    const end = source.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try { return JSON.parse(source.slice(start, end + 1)) } catch { return null }
  }
}

export function buildAuthoringInterventionRehearsalEnvelope(request = {}) {
  if (request.kind !== 'authoring-intervention-rehearsal-request'
    || request.toolPolicy?.allowTools !== false
    || request.toolPolicy?.toolChoice !== 'none') return null
  const evidence = list(request.evidenceEnvelope?.evidence)
  const authorized = new Set(list(request.toolPolicy.authorizedSourceRefs))
  if (!evidence.length || evidence.some((item) => !authorized.has(item.sourceRef))) return null
  const blocks = [{
    kind: 'rules',
    priority: 1000,
    content: JSON.stringify({
      task: 'causal-rehearsal',
      instruction: '仅改写列出的目标，不增加目标，不改写保持或排除项。返回严格 JSON：{"drafts":[{"targetRef":"...","text":"..."}]}。每个目标恰好一项。',
      intervention: request.intervention,
      directionId: request.directionId,
      targets: request.targets.map((target) => ({
        targetRef: target.targetRef,
        role: target.role,
        originalText: target.originalText,
        evidenceRefs: target.evidenceRefs
      })),
      constraints: request.constraints
    }),
    sourceRefs: evidence.map((item) => item.sourceRef)
  }, ...evidence.map((item, index) => ({
    kind: item.authority === 'manuscript' ? 'selection' : item.authority === 'worldbook' ? 'worldbook' : 'references',
    priority: 900 - index,
    content: `${item.label}\n${item.excerpt}`,
    sourceRefs: [item.sourceRef]
  }))]
  return clipContextEnvelope(buildContextEnvelope({
    surface: 'authoring',
    projectId: request.projectId,
    target: {
      type: 'intervention-rehearsal',
      id: request.intervention.id,
      revision: request.fingerprint
    },
    blocks,
    budget: { maxChars: MAX_CONTEXT_CHARS }
  }), MAX_CONTEXT_CHARS)
}

export function parseAuthoringInterventionRehearsalResponse(raw) {
  const parsed = raw && typeof raw === 'object' && Array.isArray(raw.drafts)
    ? raw
    : parseJson(raw)
  return parsed && Array.isArray(parsed.drafts) ? { drafts: parsed.drafts } : null
}

export async function generateAuthoringInterventionRehearsalDrafts(request, { signal = null } = {}) {
  const envelope = buildAuthoringInterventionRehearsalEnvelope(request)
  if (!envelope) {
    const error = new Error('invalid intervention rehearsal request')
    error.code = 'INTERVENTION_REHEARSAL_REQUEST_INVALID'
    error.retryable = false
    throw error
  }
  const result = await requestAdvisorTask({
    envelope,
    question: '按照已冻结的故事条件变化与目标范围，生成各目标的替换草稿。只返回约定 JSON。',
    taskType: TASK_ID,
    scope: 'writing',
    mode: 'direct',
    options: {
      toolChoice: 'none',
      maxOutputChars: Math.min(12000, Math.max(2400, request.targets.length * 2400))
    },
    signal
  })
  const parsed = parseAuthoringInterventionRehearsalResponse(
    result.result?.replacement || result.result?.text || result.advice
  )
  if (!parsed) {
    const error = new Error('provider did not return target drafts')
    error.code = 'INTERVENTION_REHEARSAL_RESULT_INVALID'
    error.retryable = true
    throw error
  }
  return parsed
}

export default generateAuthoringInterventionRehearsalDrafts
