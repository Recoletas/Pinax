// Experience 会话保存调度（B2）：会话列表的去抖写盘、卸载 flush、会话记录
// 构造与标题派生。Pinia 仍是唯一状态 owner——本模块只持有调度句柄
// （WeakMap 以 store 实例为键，不读取 store 其他字段），不缓存任何可变
// 会话数据；持久化复用 useStorage/STORAGE_KEYS，不新建第二套 storage。

import { debounce, flushPending } from '../../composables/useDebounce'
import { setItem, STORAGE_KEYS } from '../../composables/useStorage'

// 会话列表去抖写盘（每 store 实例一个写手；Pinax Tier 1 #11）。
// getSessions 是显式列出的窄能力：只读的会话数组 getter。
// 写手暴露 lastWriteOk（最近一次 setItem 的返回值）让保存失败可观测：
// setItem 吞错只返回 false，调用方/诊断可通过它确认持久化是否成功。
const sessionListWriters = new WeakMap()

export function getSessionListWriter(store, { getSessions }) {
  if (!sessionListWriters.has(store)) {
    const writer = debounce(() => {
      writer.lastWriteOk = setItem(STORAGE_KEYS.WRITING_SESSIONS, getSessions())
    }, 500, { leading: false, trailing: true })
    writer.lastWriteOk = null
    sessionListWriters.set(store, writer)
  }
  return sessionListWriters.get(store)
}

// 立即落盘：无论是否存在待写批次，都把当前会话列表写一次并返回结果
// （true 成功 / false 失败，如配额超限）。writer.flush() 在无 pending 时
// 是 no-op，恢复/卸载路径不能依赖恰好存在待写批次；已有 pending 时先
// flush 再强制写（数据幂等）。注意：列表内记录的 runtimeState 由
// store 的 saveCurrentSession 同步，本函数只保证列表本身落盘。
export function flushSessionListWriter(store, { getSessions }) {
  const writer = sessionListWriters.get(store)
  if (writer) writer.flush()
  const ok = setItem(STORAGE_KEYS.WRITING_SESSIONS, getSessions())
  if (writer) writer.lastWriteOk = ok
  return ok
}

// 3-event unload flush（守卫：SSR / Node 测试无 window/document）。
// 注意：flushPending 是 useDebounce 的全局 flush，会清空**应用内全部**
// 去抖任务（含其他模块），不是本模块/每 store 隔离；本模块随 gameStore
// 加载注册，注册时机与语义和迁出前一致。
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPending)
  window.addEventListener('pagehide', flushPending)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flushPending()
    })
  }
}

export * from '@pinax/core/experience/sessionRecords'
