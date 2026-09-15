export const CREATION_GENERATION_STATES = Object.freeze([
  'idle',
  'preparing',
  'generating',
  'validating',
  'ready',
  'partial',
  'error',
  'cancelled',
  'stale'
])

const VALID_ACTIONS = new Set(['sources', 'foundation', 'json-import', 'foundation-confirm'])
const ACTIVE_STATES = new Set(['preparing', 'generating', 'validating'])

const STATE_LABELS = Object.freeze({
  idle: '空工作区',
  preparing: '准备中',
  generating: '生成中',
  validating: '校验草稿',
  ready: '待确认',
  partial: '部分完成',
  error: '处理失败',
  cancelled: '已停止',
  stale: '结果已过期'
})

export function normalizeCreationGenerationState(value) {
  const state = String(value || '').trim()
  return CREATION_GENERATION_STATES.includes(state) ? state : 'idle'
}

export function normalizeCreationGenerationAction(value) {
  const action = String(value || '').trim()
  return VALID_ACTIONS.has(action) ? action : ''
}

export function getCreationGenerationLabel(value) {
  return STATE_LABELS[normalizeCreationGenerationState(value)] || STATE_LABELS.idle
}

export function isCreationGenerationActive(value) {
  return ACTIVE_STATES.has(normalizeCreationGenerationState(value))
}

export function getCreationGenerationFailure(error) {
  const code = String(error?.code || '').trim().toLowerCase()
  const status = Number(error?.status || error?.response?.status || 0)
  const message = String(error?.message || '').trim()

  if (error?.name === 'AbortError' || code === 'aborterror' || code === 'cancelled' || code === 'canceled') {
    return { code: 'cancelled', message: '处理已停止，已保留当前输入和已完成资料。' }
  }
  if (error?.name === 'SyntaxError') {
    return { code: 'schema-invalid', message: '文件不是有效 JSON，已保留当前工作区。' }
  }
  if (code.includes('timeout') || code === 'econnaborted' || /超时|timed out/i.test(message)) {
    return { code: 'timeout', message: '处理超时，已保留当前输入和已完成结果，请稍后重试。' }
  }
  if (status === 429 || code.includes('rate')) {
    return { code: 'rate-limited', message: 'AI 渠道暂时限流，已保留当前输入，请稍后重试。' }
  }
  if (status === 404 || code.includes('unsupported') || /不支持|未加载.*路由/i.test(message)) {
    return { code: 'unsupported', message: '当前 AI 渠道或后端不支持此任务，请检查配置后重试。' }
  }
  if (code.includes('config') || /配置不完整|未检测到可用 AI 配置/i.test(message)) {
    return { code: 'configuration', message: 'AI 配置不可用，资料和输入已保留，请先完成配置。' }
  }
  if (code.includes('schema') || /结构|JSON|可用.*基调|可用.*正文/i.test(message)) {
    return { code: 'schema-invalid', message: 'AI 返回结构不完整，已保留输入，请重试或调整说明。' }
  }
  if (code.includes('quota') || /配额|存储空间|quota/i.test(message)) {
    return { code: 'quota-exceeded', message: '本地存储空间不足，已保留内存中的结果，请清理后重试。' }
  }
  return { code: code || 'unknown', message: message || '处理失败，已保留当前输入，请重试。' }
}

export function getCreationSourceResultState({ readyCount = 0, failedCount = 0 } = {}) {
  const ready = Math.max(0, Number(readyCount) || 0)
  const failed = Math.max(0, Number(failedCount) || 0)
  if (ready > 0 && failed > 0) return 'partial'
  if (ready > 0) return 'ready'
  if (failed > 0) return 'error'
  return 'idle'
}
