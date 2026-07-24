function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeEvidenceRefs(values, allowedRefs) {
  const result = []
  for (const value of Array.isArray(values) ? values : []) {
    const ref = text(value)
    if (!ref || !allowedRefs.has(ref) || result.includes(ref)) continue
    result.push(ref)
    if (result.length >= 8) break
  }
  return result
}

function normalizeNextActions(payload, allowedRefs) {
  const options = []
  const seen = new Set()
  for (const raw of Array.isArray(payload?.options) ? payload.options : []) {
    const label = text(raw?.label)
    const key = label.toLowerCase()
    if (label.length < 2 || label.length > 64 || seen.has(key)) continue
    seen.add(key)
    options.push({
      id: text(raw?.id) || `option-${options.length + 1}`,
      label,
      intent: text(raw?.intent).slice(0, 120),
      risk: text(raw?.risk).slice(0, 120),
      evidenceRefs: normalizeEvidenceRefs(raw?.evidenceRefs, allowedRefs)
    })
    if (options.length >= 3) break
  }
  if (options.length < 2) return null
  return { kind: 'next-actions', options }
}

function normalizeEmergenceReview(payload, allowedCandidateIds, allowedRefs) {
  const candidateId = text(payload?.candidateId)
  const reason = text(payload?.reason)
  if (!allowedCandidateIds.has(candidateId) || reason.length < 8) return null
  return {
    kind: 'emergence-review',
    candidateId,
    reason: reason.slice(0, 320),
    evidenceRefs: normalizeEvidenceRefs(payload?.evidenceRefs, allowedRefs)
  }
}

export function validateExperienceAgentResult(result, {
  taskType = '',
  allowedCandidateIds = [],
  allowedEvidenceRefs = []
} = {}) {
  const actions = Array.isArray(result?.actions) ? result.actions : []
  const allowedRefs = new Set(allowedEvidenceRefs.map(text).filter(Boolean))
  const candidateIds = new Set(allowedCandidateIds.map(text).filter(Boolean))
  const runtimeActions = actions.filter((action) => action?.type === 'runtime-candidate')

  if (taskType === 'experience.next-actions') {
    if (runtimeActions.length !== 1) {
      return { valid: false, reason: 'invalid-next-actions-count' }
    }
    const payload = normalizeNextActions(runtimeActions[0].payload, allowedRefs)
    if (!payload) return { valid: false, reason: 'invalid-next-actions-payload' }
    return {
      valid: true,
      result: {
        ...result,
        actions: [{ ...runtimeActions[0], payload }]
      }
    }
  }

  if (taskType === 'experience.emergence') {
    if (runtimeActions.length !== 1) {
      return { valid: false, reason: 'invalid-emergence-action-count' }
    }
    const payload = normalizeEmergenceReview(runtimeActions[0].payload, candidateIds, allowedRefs)
    if (!payload) return { valid: false, reason: 'invalid-emergence-payload' }
    return {
      valid: true,
      result: {
        ...result,
        actions: [{ ...runtimeActions[0], payload }]
      }
    }
  }

  return { valid: false, reason: 'unsupported-experience-task' }
}

