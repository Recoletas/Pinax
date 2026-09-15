// 持久化写入的最小结果合同。业务域保留自己的 payload，只统一成功、失败与重试语义。
// UI 不应再从异常、null 或“写后再读”猜测一次写盘是否真的完成。

export function mutationSuccess(payload = {}) {
  return Object.freeze({
    ...payload,
    ok: true,
    reason: null,
    retryable: false
  })
}

export function mutationFailure(reason, { retryable = false, ...context } = {}) {
  return Object.freeze({
    ...context,
    ok: false,
    reason: String(reason || 'mutation-failed'),
    retryable: Boolean(retryable)
  })
}

export function storageWriteFailure(context = {}) {
  return mutationFailure('storage-write-failed', { retryable: true, ...context })
}
