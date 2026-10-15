// 2026-10-09 用户裁定：写死预算完全废弃——Pinax 不再对模型调用声明 token 预算，
// 未声明一律交内核缺省；失控护栏只保留一个维度，即单个请求内的模型调用轮数上限。
export const MAX_MODEL_ROUNDS_PER_REQUEST = 3

/**
 * 请求级模型调用轮数闸。由入口处理器创建一次，沿调用链透传（taskMeta.roundGuard / options.roundGuard），
 * 每次向内核发起模型调用前 acquire()；超限抛 MODEL_ROUND_LIMIT_EXCEEDED（不可重试）。
 * 未透传时自行按同一上限新建，保证任何一条链都受同一个数字约束。
 */
export function createModelRoundGuard(limit = MAX_MODEL_ROUNDS_PER_REQUEST) {
  const maxRounds = Math.max(1, Math.floor(Number(limit) || MAX_MODEL_ROUNDS_PER_REQUEST))
  let used = 0
  return {
    get used() { return used },
    get limit() { return maxRounds },
    acquire(scope = 'model') {
      used += 1
      if (used > maxRounds) {
        const error = new Error(`单次请求的模型调用轮数已达上限（${maxRounds}，${scope}）`)
        error.code = 'MODEL_ROUND_LIMIT_EXCEEDED'
        error.retryable = false
        throw error
      }
      return used
    }
  }
}

export function resolveModelRoundGuard(guard, scope = 'model') {
  if (guard && typeof guard.acquire === 'function') return guard
  return createModelRoundGuard(MAX_MODEL_ROUNDS_PER_REQUEST)
}
