// Experience 会话保存调度（B2）：会话列表的去抖写盘、卸载 flush、会话记录
// 构造与标题派生。Pinia 仍是唯一状态 owner——本模块只持有调度句柄
// （WeakMap 以 store 实例为键，不读取 store 其他字段），不缓存任何可变
// 会话数据；持久化复用 useStorage/STORAGE_KEYS，不新建第二套 storage。

import { debounce, flushPending } from '../../composables/useDebounce'
import { setItem, STORAGE_KEYS } from '../../composables/useStorage'
import { normalizeTurnRecords } from '../../../shared/narrativeTurnContract.js'
import {
  cloneState,
  DEFAULT_WORLD_MAP_STATE,
  DEFAULT_WRITING_CHARACTER,
  DEFAULT_WRITING_TIME
} from './gameSessionNormalization.js'

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

// 新会话记录构造。runtimeState 由调用方决定（继承当前快照或空运行时），
// 这里只负责把消息/聊天/世界状态按存档合同落成一条记录。
export function buildCreatedSessionRecord({ id, title = '新会话', now = Date.now(), worldbookId, runtimeState }) {
  return {
    id,
    schemaVersion: 1,
    title,
    createdAt: now,
    updatedAt: now,
    worldId: worldbookId,
    worldbookId,
    runtimeState,
    messages: cloneState(runtimeState.messages, []),
    chatHistory: cloneState(runtimeState.chatHistory, []),
    worldState: {
      character: cloneState(runtimeState.writingCharacter, DEFAULT_WRITING_CHARACTER),
      time: cloneState(runtimeState.writingTime, DEFAULT_WRITING_TIME),
      worldMap: cloneState(runtimeState.worldMapState, DEFAULT_WORLD_MAP_STATE),
      activities: cloneState(runtimeState.activities, [])
    }
  }
}

// 保存当前会话时写入既有记录的字段集；调用方把它逐字段合并进 sessions[idx]，
// 记录对象本身仍属于 store 的 sessions 数组。
export function buildCurrentSessionFields({
  messages,
  chatHistory,
  runtimeState,
  writingCharacter,
  writingTime,
  worldMapState,
  activities,
  turnRecords,
  lastCommittedTurnId,
  activeBranchId,
  worldbookId,
  previousSchemaVersion = 0,
  now = Date.now()
}) {
  return {
    schemaVersion: previousSchemaVersion || 1,
    messages: cloneState(messages, []),
    chatHistory: cloneState(chatHistory, []),
    runtimeState,
    worldState: {
      character: cloneState(writingCharacter, DEFAULT_WRITING_CHARACTER),
      time: cloneState(writingTime, DEFAULT_WRITING_TIME),
      worldMap: cloneState(worldMapState, DEFAULT_WORLD_MAP_STATE),
      activities: cloneState(activities, [])
    },
    // R1a：回合事务记录随 session 持久化（LRU ≤50，含全量 preRuntimeSnapshot）
    turnRecords: normalizeTurnRecords(turnRecords),
    lastCommittedTurnId: lastCommittedTurnId || null,
    activeBranchId: activeBranchId || 'main', // P0-4：活动分支持久化
    worldId: worldbookId,
    worldbookId,
    updatedAt: now
  }
}

// 标题派生：第一条 assistant 消息前 30 字；无 assistant 消息时返回 null
//（调用方保持原标题）。
export function deriveSessionTitle(messages = []) {
  const firstMsg = (Array.isArray(messages) ? messages : []).find(
    (message) => message.role === 'assistant' && message.content
  )
  if (!firstMsg) return null
  return firstMsg.content.slice(0, 30) + (firstMsg.content.length > 30 ? '...' : '')
}

// 同一 worldbook 的最近会话（updatedAt 降序）。
export function findLatestSessionForWorldbook(sessions, worldbookId) {
  if (!worldbookId || !Array.isArray(sessions)) return null
  const target = worldbookId
  const sorted = [...sessions].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  return sorted.find((session) => (session.worldbookId || session.worldId) === target) || null
}
