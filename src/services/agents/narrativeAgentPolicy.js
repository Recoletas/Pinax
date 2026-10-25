function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function turnInput(kernel) {
  const turn = (kernel?.blocks || []).find((block) => block?.kind === 'turn')
  return text(turn?.content?.input)
}

export function deriveNarrativeGroundingPolicy({ kernel, mode = 'continue' } = {}) {
  const input = turnInput(kernel)
  // Story words such as “时间线” or “规则” are not a retrieval contract.
  // The model can consult the available sources; actual provenance remains in
  // the evidence report. Missing a tool hit must not discard a written draft.
  return {
    level: 'optional',
    required: false,
    mode: text(mode) || 'continue',
    input: input.slice(0, 240),
    reasons: [],
    minEvidenceItems: 0
  }
}

export function classifyNarrativeRecoveryError(error) {
  const code = text(error?.code).toUpperCase()
  const status = Number(error?.status || error?.details?.status || 0)
  const contentRefusal = /REFUSAL|CONTENT_FILTER|SAFETY/.test(code)
  const configuration = status === 401 || status === 403 || /AUTH|API_KEY|CONFIG|CREDENTIAL/.test(code)
  const retryable = !contentRefusal && !configuration && (
    Boolean(error?.retryable) ||
    [408, 429].includes(status) ||
    status >= 500 ||
    /TIMEOUT|UPSTREAM|NETWORK|EMPTY|PROTOCOL|TOOL_CALL|STEP_INVALID/.test(code)
  )
  const repairable = !contentRefusal && !configuration && (
    /EMPTY|REASONING_ONLY|TOOL_CALL|TOOL_ARGUMENT|TOOL_ACTION|TOOL_UNKNOWN|TOOL_INPUT|TOOL_NOT_DECLARED|STEP_INVALID|PROTOCOL|TOOLS_UNSUPPORTED|BEAT_PLAN/.test(code)
  )
  return {
    code,
    configuration,
    contentRefusal,
    retryable,
    repairable,
    retrySameTranscript: retryable && !repairable,
    noRetry: contentRefusal || configuration
  }
}

export function hasNarrativeGroundingEvidence(results = []) {
  return (Array.isArray(results) ? results : []).some((result) => (
    result?.ok !== false
    && Array.isArray(result?.items)
    && result.items.some((item) => (
      item?.eligibleEvidence === true
      || (item?.trust && item.trust !== 'draft' && item.conflictState === 'clean')
    ))
  ))
}

export default {
  classifyNarrativeRecoveryError,
  deriveNarrativeGroundingPolicy,
  hasNarrativeGroundingEvidence
}
