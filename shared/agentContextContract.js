export const AGENT_CONTEXT_SCHEMA_VERSION = 1
export const AGENT_CONTEXT_MAX_CHARS = 32000

export const AGENT_CONTEXT_ERROR_CODES = Object.freeze({
  INVALID: 'AGENT_CONTEXT_INVALID',
  BUDGET_INVALID: 'AGENT_CONTEXT_BUDGET_INVALID',
  REVISION_REQUIRED: 'AGENT_TARGET_REVISION_REQUIRED',
  POLICY_VIOLATION: 'AGENT_TASK_POLICY_VIOLATION'
})

export function serializeAgentBlockContent(content) {
  if (typeof content === 'string') return content.trimEnd()
  if (content == null) return ''
  if (typeof content === 'object') {
    const text = content.text ?? content.contextText ?? content.blockText
    if (text != null) return String(text).trimEnd()
    try {
      return JSON.stringify(content)
    } catch {
      return ''
    }
  }
  return String(content).trimEnd()
}

export function truncateAgentBlockContent(content, maxChars) {
  const retained = serializeAgentBlockContent(content).slice(0, Math.max(0, maxChars))
  if (typeof content === 'string') return retained
  if (content && typeof content === 'object') {
    return { ...content, text: retained }
  }
  return retained
}

export function agentEnvelopeToPromptText(envelope) {
  if (!envelope || !Array.isArray(envelope.blocks)) return ''
  return envelope.blocks
    .map((block) => serializeAgentBlockContent(block?.content))
    .filter(Boolean)
    .join('\n\n')
}

export function collectAgentEnvelopeSourceRefs(envelope) {
  const refs = []
  const seen = new Set()
  for (const block of envelope?.blocks || []) {
    for (const ref of block?.sourceRefs || []) {
      const normalized = String(ref || '').trim()
      if (!normalized || seen.has(normalized)) continue
      seen.add(normalized)
      refs.push(normalized)
    }
  }
  return refs
}

export function clipAgentContextEnvelope(envelope, maxCharsOverride) {
  if (!envelope || !Array.isArray(envelope.blocks)) return envelope
  const maxChars = Math.max(1, Math.min(
    AGENT_CONTEXT_MAX_CHARS,
    Math.floor(Number(maxCharsOverride ?? envelope.budget?.maxChars) || 16000)
  ))
  const ordered = envelope.blocks
    .map((block, index) => ({ block, index }))
    .sort((a, b) => (Number(b.block?.priority) - Number(a.block?.priority)) || (a.index - b.index))
  const included = []
  const dropped = []
  let usedChars = 0

  for (const { block } of ordered) {
    const blockChars = serializeAgentBlockContent(block?.content).length
    const remaining = maxChars - usedChars
    if (blockChars === 0 || blockChars <= remaining) {
      included.push({ ...block })
      usedChars += blockChars
      continue
    }
    if (remaining > 0 && Number(block?.priority) >= 900) {
      included.push({
        ...block,
        content: truncateAgentBlockContent(block.content, remaining),
        truncated: true,
        truncatedAt: remaining,
        originalChars: blockChars,
        retainedChars: remaining
      })
      usedChars += remaining
      continue
    }
    dropped.push({
      kind: block?.kind || 'raw',
      priority: Number(block?.priority) || 0,
      estimatedChars: blockChars,
      sourceRefs: Array.isArray(block?.sourceRefs) ? block.sourceRefs : [],
      reason: remaining <= 0 ? 'budget-exhausted' : 'lower-priority-than-retained-context'
    })
  }

  return {
    ...envelope,
    blocks: included,
    budget: {
      ...envelope.budget,
      maxChars,
      usedChars,
      truncated: dropped.length > 0 || included.some((block) => block.truncated)
    },
    dropReport: dropped.length ? { dropped, totalDropped: dropped.length } : null
  }
}

export function createAgentContextLedger(envelope) {
  const dropped = envelope?.dropReport?.dropped || []
  const estimateTokens = (chars) => Math.max(0, Math.ceil(Number(chars || 0) / 4))
  return {
    schemaVersion: 1,
    budget: envelope?.budget
      ? {
          ...envelope.budget,
          estimatedTokens: estimateTokens(envelope.budget.usedChars)
        }
      : null,
    parts: [
      ...(envelope?.blocks || []).map((block, order) => ({
        order,
        kind: block.kind,
        status: block.truncated ? 'truncated' : 'included',
        chars: serializeAgentBlockContent(block.content).length,
        estimatedTokens: estimateTokens(serializeAgentBlockContent(block.content).length),
        originalChars: block.originalChars ?? null,
        sourceRefs: block.sourceRefs || [],
        reason: block.truncated ? 'priority-block-retained-partially' : 'within-budget'
      })),
      ...dropped.map((block, offset) => ({
        order: (envelope?.blocks?.length || 0) + offset,
        kind: block.kind,
        status: 'dropped',
        chars: block.estimatedChars,
        estimatedTokens: estimateTokens(block.estimatedChars),
        originalChars: block.estimatedChars,
        sourceRefs: block.sourceRefs || [],
        reason: block.reason
      }))
    ]
  }
}

export function validateAgentContextEnvelope(envelope, taskDefinition = null) {
  if (!envelope || typeof envelope !== 'object' || envelope.version !== AGENT_CONTEXT_SCHEMA_VERSION) {
    return { valid: false, code: AGENT_CONTEXT_ERROR_CODES.INVALID, reason: 'invalid-schema-version' }
  }
  if (
    !String(envelope.surface || '').trim()
    || !Array.isArray(envelope.blocks)
    || envelope.blocks.length > 64
  ) {
    return { valid: false, code: AGENT_CONTEXT_ERROR_CODES.INVALID, reason: 'invalid-envelope-shape' }
  }

  const maxChars = Number(envelope.budget?.maxChars)
  const usedChars = Number(envelope.budget?.usedChars)
  if (
    !Number.isInteger(maxChars)
    || maxChars < 1
    || maxChars > AGENT_CONTEXT_MAX_CHARS
    || !Number.isInteger(usedChars)
    || usedChars < 0
    || usedChars > maxChars
  ) {
    return { valid: false, code: AGENT_CONTEXT_ERROR_CODES.BUDGET_INVALID, reason: 'invalid-budget' }
  }

  if (taskDefinition?.surfaces?.length && !taskDefinition.surfaces.includes(envelope.surface)) {
    return { valid: false, code: AGENT_CONTEXT_ERROR_CODES.POLICY_VIOLATION, reason: 'surface-not-allowed' }
  }
  if (taskDefinition?.requiresRevision && !String(envelope.target?.revision || '').trim()) {
    return { valid: false, code: AGENT_CONTEXT_ERROR_CODES.REVISION_REQUIRED, reason: 'target-revision-required' }
  }
  if (
    taskDefinition?.targetTypes?.length
    && !taskDefinition.targetTypes.includes(String(envelope.target?.type || '').trim())
  ) {
    return { valid: false, code: AGENT_CONTEXT_ERROR_CODES.POLICY_VIOLATION, reason: 'target-type-not-allowed' }
  }

  for (const block of envelope.blocks) {
    if (
      !block
      || typeof block !== 'object'
      || !String(block.kind || '').trim()
      || !Number.isFinite(Number(block.priority))
      || !Array.isArray(block.sourceRefs)
      || block.sourceRefs.length > 32
      || block.sourceRefs.some((ref) => String(ref || '').length > 200)
    ) {
      return { valid: false, code: AGENT_CONTEXT_ERROR_CODES.INVALID, reason: 'invalid-block' }
    }
  }

  return { valid: true }
}
