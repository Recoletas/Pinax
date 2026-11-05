/**
 * Core 的公共结果信封。Host 与 Store 都只通过这个形状交换结果，
 * 不把异常、UI 状态或平台对象带进业务层。
 */
export function ok(value) {
  return { ok: true, value }
}

export function fail(code, message, details = null) {
  const error = {
    code: String(code || 'CORE_ERROR'),
    message: String(message || '核心执行失败')
  }
  if (details && typeof details === 'object') error.details = details
  return { ok: false, error }
}
