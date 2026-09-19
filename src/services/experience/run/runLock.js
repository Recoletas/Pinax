/**
 * 双标签执行锁（T07，nightly-20260918）：同一会话的主持/回合任务同一时刻
 * 只允许一个 owner——另一个标签页不得重复消费同一任务（重复主持/重复结算）。
 *
 * - Web Locks（浏览器跨标签）优先：`ifAvailable` 语义下拿不到锁立即返回
 *   busy，不排队不等待；owner 标签页崩溃/关闭时浏览器自动释放锁，下一个
 *   获取者即为"过期 owner 恢复"（无需 TTL 心跳）。
 * - 不可用环境（node 评测/旧内核）降级为调用方自带单飞（KP 协调器的
 *   WeakSet），lockHeld=false 如实标注。
 * - 本模块不做跨设备/跨进程互斥承诺（单浏览器产品边界）。
 */

function lockError(code, message) {
  return Object.assign(new Error(message), { code })
}

/**
 * 在独占锁内执行 fn。锁被他人持有时：
 * - onBusyProvided：返回 onBusy() 的结果（推荐——把锁状态映射为业务 busy）；
 * - 否则抛 RUN_LOCK_HELD。
 */
export async function withExclusiveRunLock(lockKey, fn, { lockAdapter = null, onBusy = null } = {}) {
  const adapter = lockAdapter
    || (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function' ? navigator.locks : null)
  if (!adapter) {
    // 无跨标签锁环境：调用方必须自带进程内单飞；如实标注 lockHeld=false。
    return fn({ lockHeld: false })
  }
  return adapter.request(String(lockKey || ''), { ifAvailable: true }, (lock) => {
    if (!lock) {
      if (typeof onBusy === 'function') return onBusy()
      throw lockError('RUN_LOCK_HELD', '该会话的主持任务正由另一标签页执行')
    }
    return fn({ lockHeld: true })
  })
}
