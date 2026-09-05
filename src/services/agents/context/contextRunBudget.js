// 文本工作台 v3 Phase 7：跨 model call 的累计 token budget 与 typed outcome。

export const CONTEXT_RUN_BUDGETS = Object.freeze({
  'inline-fast': Object.freeze({ maxInputTokens: 5000, maxOutputTokens: 600, maxTotalTokens: 5600, tools: false, summaries: false }),
  'manual-short': Object.freeze({ maxInputTokens: 10000, maxOutputTokens: 1800, maxTotalTokens: 11800, tools: false, summaries: false }),
  'narrative-long': Object.freeze({ maxInputTokens: 48000, maxOutputTokens: 10000, maxTotalTokens: 58000, tools: true, summaries: false }),
  'analysis-background': Object.freeze({ maxInputTokens: 80000, maxOutputTokens: 12000, maxTotalTokens: 92000, tools: true, summaries: true })
})

export const CONTEXT_RUN_OUTCOMES = Object.freeze([
  'completed', 'budget-capped', 'context-truncated', 'stale', 'aborted', 'timeout',
  'grounding-insufficient', 'loop-capped', 'invalid-result'
])

export function estimateTokenUsage({ inputChars = 0, outputChars = 0 } = {}) {
  return {
    inputTokens: Math.ceil(Math.max(0, Number(inputChars) || 0) * 0.7),
    outputTokens: Math.ceil(Math.max(0, Number(outputChars) || 0) * 0.7)
  }
}
function normalizedUsage(usage, fallback) {
  const hasProviderUsage = usage && (
    Number.isFinite(Number(usage.inputTokens)) || Number.isFinite(Number(usage.outputTokens))
  )
  const inputTokens = hasProviderUsage ? Math.max(0, Number(usage.inputTokens || 0)) : fallback.inputTokens
  const outputTokens = hasProviderUsage ? Math.max(0, Number(usage.outputTokens || 0)) : fallback.outputTokens
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, source: hasProviderUsage ? 'provider' : 'estimated' }
}

export function createContextRunBudget(profile = 'narrative-long') {
  const limits = CONTEXT_RUN_BUDGETS[profile] || CONTEXT_RUN_BUDGETS['narrative-long']
  const calls = []
  let totals = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  function aggregateUsageSource() {
    const sources = new Set(calls.map((call) => call.source))
    if (sources.size > 1) return 'mixed'
    return sources.values().next().value || 'estimated'
  }
  function canStartCall({ inputChars = 0, maxOutputTokens = 0 } = {}) {
    const estimated = estimateTokenUsage({ inputChars })
    const projected = {
      inputTokens: totals.inputTokens + estimated.inputTokens,
      outputTokens: totals.outputTokens + Math.max(0, Number(maxOutputTokens) || 0)
    }
    projected.totalTokens = projected.inputTokens + projected.outputTokens
    return {
      allowed: projected.inputTokens <= limits.maxInputTokens
        && projected.outputTokens <= limits.maxOutputTokens
        && projected.totalTokens <= limits.maxTotalTokens,
      projected,
      limits
    }
  }
  function recordCall({ inputChars = 0, outputChars = 0, usage = null, phase = '' } = {}) {
    const callUsage = normalizedUsage(usage, estimateTokenUsage({ inputChars, outputChars }))
    totals = {
      inputTokens: totals.inputTokens + callUsage.inputTokens,
      outputTokens: totals.outputTokens + callUsage.outputTokens,
      totalTokens: totals.totalTokens + callUsage.totalTokens
    }
    const receipt = Object.freeze({ index: calls.length, phase, ...callUsage })
    calls.push(receipt)
    return receipt
  }
  return Object.freeze({
    profile,
    limits,
    canStartCall,
    recordCall,
    get usage() { return { ...totals, source: aggregateUsageSource() } },
    get calls() { return [...calls] },
    get capped() {
      return totals.inputTokens >= limits.maxInputTokens
        || totals.outputTokens >= limits.maxOutputTokens
        || totals.totalTokens >= limits.maxTotalTokens
    }
  })
}

export function classifyContextRunOutcome({ error = null, text = '', receipt = null, reconciliation = [], budget = null } = {}) {
  const code = String(error?.code || '')
  let status = 'invalid-result'
  if (!error) {
    if (budget?.capped) status = 'budget-capped'
    else if (receipt?.anyCut || reconciliation.length) status = 'context-truncated'
    else if (String(text || '').trim()) status = 'completed'
  } else if (/ABORT/.test(code) || error?.name === 'AbortError') status = 'aborted'
  else if (/STALE/.test(code)) status = 'stale'
  else if (/TIMEOUT/.test(code)) status = 'timeout'
  else if (/GROUNDING/.test(code)) status = 'grounding-insufficient'
  else if (/LOOP|ROUND_LIMIT|BUDGET_EXCEEDED/.test(code)) status = 'loop-capped'
  return Object.freeze({
    status,
    code: code || (status === 'invalid-result' ? 'AGENT_INVALID_RESULT' : ''),
    retryable: Boolean(error?.retryable || ['stale', 'timeout', 'grounding-insufficient'].includes(status)),
    degraded: status === 'budget-capped' && Boolean(String(text || '').trim())
  })
}
