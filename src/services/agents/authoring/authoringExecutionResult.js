// Authoring 回合执行结果的 typed 归一：phase/code/可重试性/正文是否仍可恢复。
// 纯数据模块：不做 UI、不做 provider I/O、不携带 prompt/transcript 等敏感载荷。

export const AUTHORING_FAILURE_PHASES = Object.freeze([
  'context', 'provider', 'protocol', 'stale', 'editor-write', 'persist', 'observer'
])

const LEGACY_PHASE = Object.freeze({
  stale: 'stale',
  'editor-write': 'editor-write',
  persist: 'persist',
  'control-text-leak': 'protocol',
  'empty-result': 'protocol',
  aborted: 'provider',
  error: 'provider'
})

export function authoringFailure(input = {}) {
  const phase = AUTHORING_FAILURE_PHASES.includes(input.phase) ? input.phase : 'provider'
  return Object.freeze({
    ok: false,
    phase,
    code: String(input.code || `AUTHORING_${phase.replace('-', '_').toUpperCase()}_FAILED`),
    message: String(input.message || '生成失败'),
    retryable: input.retryable !== false,
    generatedTextAvailable: input.generatedTextAvailable === true,
    requestId: String(input.requestId || '')
  })
}

export function normalizeAuthoringFailure(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  return authoringFailure({
    ...source,
    phase: source.phase || LEGACY_PHASE[source.reason] || 'provider'
  })
}
