import { ref, computed } from 'vue'

/** 模块加载时一次性读 URL flag — 之后整次会话不变 */
function readFlag() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('debug') === 'perf'
}

const DEBUG_PERF = readFlag()

// 模块级单例状态：所有 usePerf() 调用共享同一份 history，
// 这样生产者（WorldMapVoronoi）和消费者（PerfOverlay）才能看到彼此的更新。
const history = ref([])
const latest = computed(() => history.value[history.value.length - 1] ?? null)

function record(meta) {
  if (!DEBUG_PERF) return
  if (!meta || !Array.isArray(meta.timings)) return
  history.value.push(meta)
  if (typeof console !== 'undefined') {
    const label = `%c[MapEngine] ${meta.seed}`
    console.groupCollapsed(label, 'color:#888')
    console.table(meta.timings)
    console.log('Total:', meta.totalMs, 'ms')
    console.groupEnd()
  }
}

function clear() {
  history.value = []
}

/**
 * 性能数据 composable（singleton）
 * - flag 关闭时 record() 静默 no-op，history 永远是空数组
 * - flag 打开时 record() 追加到 history，latest 是 history 末尾
 * - enabled 是模块加载时冻结的静态布尔，不会随会话变化
 */
export function usePerf() {
  return { history, latest, record, clear, enabled: DEBUG_PERF }
}
