// 漫画图片请求守卫（本地防重复策略）。
// 参考 StoryForge src/lib/comic/image-request-guard.ts（MIT, cd1236c）的
// claim/未知结果语义，去除其 Agent conversation 依赖：只保留
// “发送前登记、结果未知不自动重发、同意图需作者显式再生成”。
// 这是本地单浏览器策略，不冒称跨设备服务端 exactly-once。

export const COMIC_REQUEST_OUTCOMES = Object.freeze([
  'running',
  'outcome-unknown',
  'known-failed',
  'cancelled-before-send',
  'persist-failed',
  'stale'
])

export function createComicRequestId(now = Date.now()) {
  return `comicreq_${now.toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function comicRequestIntentHash(payload) {
  const text = JSON.stringify(payload ?? null)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

/**
 * 判断是否允许发送新请求。同 scope 已有未决请求（同 intent hash）时拒绝自动重发；
 * 作者显式确认“重新生成”后由调用方清除未决记录再发起。
 */
export function canSendComicRequest(existingPending, { intentHash, requestId } = {}) {
  if (!existingPending?.requestId) return { allowed: true, reason: '' }
  if (requestId && existingPending.requestId === requestId) {
    return { allowed: true, reason: 'resume' }
  }
  if (existingPending.intentHash && existingPending.intentHash === intentHash) {
    return { allowed: false, reason: 'duplicate-pending-intent' }
  }
  return { allowed: false, reason: 'pending-outcome-unknown' }
}

/**
 * 恢复时分类遗留的未决请求：进程内存里没有对应在途意图即为 outcome-unknown，
 * 不能自动重发，也不能伪称已失败。
 */
export function classifyOrphanedComicRequest(pendingRequest, { hasLiveIntent = false } = {}) {
  if (!pendingRequest?.requestId) return null
  if (hasLiveIntent) return 'running'
  return 'outcome-unknown'
}
