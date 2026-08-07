import { ref } from 'vue'
import { getItem, setItem } from './useStorage'
import { STORAGE_KEYS } from './useStorage'

/**
 * 全局 tip 状态机。模块作用域 ref, 跨组件共享。
 *
 * 设计取舍:
 * - queue: 防止 5 个 tip 同时触发同屏挤爆, FIFO 排队
 * - seen: 持久化 dismiss / markSeen 的 id, 关掉永不再弹
 * - category='nav' 的 tip 在路由切换时自动 dismiss
 *
 * API:
 *   showTip({id, title, body, cta?, variant?, autoHide?, category?})
 *     - 若 id 已在 seen, 跳过
 *     - 若 currentTip 为空, 立即展示; 否则 push 进 queue
 *   dismissTip()              — 关闭当前 tip, 写 seen
 *   markSeen(id)              — 写 seen, 不展示 (用于派生前提满足永久剔除)
 *   isSeen(id)                — 读 seen
 *   rearm(id)                 — 清 seen flag (user did X 后撤回派生场景)
 *   bindRouter(router)        — 监听 router.afterEach, 自动 dismiss category=nav
 */

const TIP_KEY = STORAGE_KEYS.PINAX_TIPS_SEEN
const QUEUE_DELAY_MS = 3000
const AUTO_HIDE_MS = 5000

const currentTip = ref(null)
const queue = ref([])
const seen = ref(loadSeen())
let queueTimer = null
let autoHideTimer = null
let routerUnsubscribe = null

function loadSeen() {
  const raw = getItem(TIP_KEY)
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { ...raw }
  return {}
}

function persistSeen() {
  setItem(TIP_KEY, seen.value)
}

function showNext() {
  if (currentTip.value) return
  const next = queue.value.shift()
  if (!next) return
  currentTip.value = next
  if (next.autoHide) {
    if (autoHideTimer) clearTimeout(autoHideTimer)
    autoHideTimer = setTimeout(() => {
      dismissTip()
    }, AUTO_HIDE_MS)
  }
}

function scheduleNext() {
  if (queueTimer) clearTimeout(queueTimer)
  queueTimer = setTimeout(() => {
    queueTimer = null
    showNext()
  }, QUEUE_DELAY_MS)
}

function showTip(input = {}) {
  if (!input || !input.id) return false
  if (seen.value[input.id]) return false
  const tip = {
    id: input.id,
    title: input.title || '',
    body: input.body || '',
    cta: input.cta || null,
    variant: input.variant || 'info',
    autoHide: input.autoHide !== false,
    category: input.category || 'info'
  }
  if (currentTip.value) {
    queue.value.push(tip)
  } else {
    currentTip.value = tip
    if (tip.autoHide) {
      if (autoHideTimer) clearTimeout(autoHideTimer)
      autoHideTimer = setTimeout(() => {
        dismissTip()
      }, AUTO_HIDE_MS)
    }
  }
  return true
}

function dismissTip() {
  if (autoHideTimer) {
    clearTimeout(autoHideTimer)
    autoHideTimer = null
  }
  const cur = currentTip.value
  if (cur) {
    seen.value = { ...seen.value, [cur.id]: true }
    persistSeen()
  }
  currentTip.value = null
  if (queue.value.length > 0) {
    scheduleNext()
  }
}

function dismissByCategory(category) {
  const cur = currentTip.value
  if (cur && cur.category === category) {
    dismissTip()
  } else {
    queue.value = queue.value.filter((t) => t.category !== category)
  }
}

function markSeen(id) {
  if (!id) return
  if (seen.value[id]) return
  seen.value = { ...seen.value, [id]: true }
  persistSeen()
}

function isSeen(id) {
  return Boolean(seen.value[id])
}

function rearm(id) {
  if (!id) return
  if (!seen.value[id]) return
  const next = { ...seen.value }
  delete next[id]
  seen.value = next
  persistSeen()
}

function bindRouter(router) {
  if (routerUnsubscribe) {
    routerUnsubscribe()
    routerUnsubscribe = null
  }
  if (!router) return
  // 路由切换时, 自动 dismiss 导航类 tip (避免跳页后还残留 CTA)
  routerUnsubscribe = router.afterEach(() => {
    dismissByCategory('nav')
  })
}

function clear() {
  if (autoHideTimer) {
    clearTimeout(autoHideTimer)
    autoHideTimer = null
  }
  if (queueTimer) {
    clearTimeout(queueTimer)
    queueTimer = null
  }
  currentTip.value = null
  queue.value = []
}

function _devReset() {
  // 调试用: devtools 调用, 清空所有 seen flag 和当前 tip
  seen.value = {}
  persistSeen()
  clear()
}

export function useTipState() {
  return {
    currentTip,
    queue,
    seen,
    showTip,
    dismissTip,
    markSeen,
    isSeen,
    rearm,
    bindRouter,
    _devReset
  }
}