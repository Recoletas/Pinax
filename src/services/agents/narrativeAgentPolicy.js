const REQUIRED_GROUNDING_PATTERNS = Object.freeze([
  { pattern: /历史|史实|追溯|因果|年代|时间线/, reason: '用户要求核对历史或时间关系' },
  { pattern: /路线|路径|航线|前往.*(地点|城|镇|港|山|河)|沿着.*(路|河|山脉)/, reason: '当前请求涉及路线或空间关系' },
  { pattern: /世界书|世界规则|既有设定|设定冲突|规则|禁忌|canonical/, reason: '当前请求要求遵守已有世界规则' },
  { pattern: /核对|查证|确认.*(人物|地点|组织|信号|资料)|追查|调查/, reason: '当前请求明确要求事实核对' }
])

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function turnInput(kernel) {
  const turn = (kernel?.blocks || []).find((block) => block?.kind === 'turn')
  return text(turn?.content?.input)
}

export function deriveNarrativeGroundingPolicy({ kernel, mode = 'continue' } = {}) {
  const input = turnInput(kernel)
  const matches = REQUIRED_GROUNDING_PATTERNS
    .filter(({ pattern }) => pattern.test(input))
    .map(({ reason }) => reason)
  const required = matches.length > 0
  return {
    level: required ? 'required' : 'optional',
    required,
    mode: text(mode) || 'continue',
    input: input.slice(0, 240),
    reasons: matches,
    minEvidenceItems: required ? 1 : 0
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
    /EMPTY|REASONING_ONLY|TOOL_CALL|TOOL_ARGUMENT|TOOL_ACTION|TOOL_UNKNOWN|TOOL_INPUT|STEP_INVALID|PROTOCOL|TOOLS_UNSUPPORTED|BEAT_PLAN/.test(code)
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
