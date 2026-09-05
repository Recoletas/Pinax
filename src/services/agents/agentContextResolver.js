import {
  getCanonicalAgentTask,
  resolveLegacyTaskAlias
} from '../../../shared/agentCapabilityContract.js'
import {
  buildAgentContextEnvelope,
  clipAgentContextEnvelope,
  createAgentContextLedger,
  serializeAgentBlockContent
} from '../../../shared/agentContextContract.js'
import { AGENT_CONTEXT_PROFILES } from './agentContextProfiles.js'

function profilePriority(index) {
  return 1000 - index * 10
}

export async function resolveAgentContext({ taskId, request = {}, facade }) {
  const canonicalId = resolveLegacyTaskAlias(taskId)
  const task = getCanonicalAgentTask(canonicalId)
  if (!task) {
    return { task: null, envelope: null, ledger: null, error: { code: 'AGENT_TASK_UNKNOWN' } }
  }
  const profile = AGENT_CONTEXT_PROFILES[task.contextProfile]
  if (!profile) {
    return { task, envelope: null, ledger: null, error: { code: 'AGENT_CONTEXT_PROFILE_MISSING' } }
  }

  const resolved = await facade.resolve(profile.blocks, request)
  const byKind = new Map()
  for (const block of resolved?.blocks || []) {
    if (!byKind.has(block.kind)) byKind.set(block.kind, [])
    byKind.get(block.kind).push(block)
  }

  const blocks = profile.blocks.flatMap((kind, index) => (byKind.get(kind) || []).map((block) => ({
    kind,
    content: serializeAgentBlockContent(block?.content ?? block?.text ?? block),
    priority: profilePriority(index),
    sourceRefs: Array.isArray(block?.sourceRefs) ? block.sourceRefs.slice(0, 32) : [],
    authority: block?.authority || null,
    entryId: block?.entryId ? String(block.entryId) : undefined,
    id: block?.id ? String(block.id) : undefined,
    included: typeof block?.included === 'boolean' ? block.included : undefined,
    score: block?.score && typeof block.score === 'object' ? block.score : undefined,
    reason: block?.reason ? String(block.reason) : undefined,
    recallAudit: block?.recallAudit && typeof block.recallAudit === 'object' ? block.recallAudit : undefined
  })))

  const clipped = clipAgentContextEnvelope(
    buildAgentContextEnvelope({
      surface: task.owner,
      target: request.target || null,
      budget: { maxChars: profile.maxChars },
      blocks
    }),
    profile.maxChars
  )

  return {
    task,
    profile,
    revision: canonicalId && request.target ? request.target.revision || null : null,
    envelope: clipped,
    ledger: createAgentContextLedger(clipped)
  }
}
