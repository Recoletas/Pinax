// 有界半自动推进策略（plan Phase 3 任务 4 / spec §6.4）。
// 沿用体验页安全边界：最多连续三拍；用户输入、直接提问、地点切换、
// 机制触发、异常审阅打开、手动停止、stale/失败时暂停。
// 纯函数、无 DOM、无持久化：composer 在每次 apply token 时调用，
// 页面用 detectSemiAutoEnvironmentPause 从共享投影/异常状态推导环境信号。

export const SEMI_AUTO_MAX_BEATS = 3

const CONTINUE_VERDICT = Object.freeze({ pause: false, reason: '' })

function paused(reason) {
  return { pause: true, reason }
}

// 环境信号（页面侧状态推导）：
// - direct-question：上一拍生成正文以问句收尾，等用户回答；
// - location-change：上一拍起点的地点与当前共享投影地点不一致；
// - mechanism-trigger：本拍正文、canonical 机制状态或本拍新增 runtime event 触发机制；
// - exception-review：typed 异常审阅打开。
export function detectSemiAutoEnvironmentPause({
  generatedText = '',
  previousLocationId = '',
  currentLocationId = '',
  mechanismTrigger = false,
  exceptionReviewOpen = false
} = {}) {
  if (exceptionReviewOpen) return 'exception-review'
  if (/[？?]\s*$/.test(String(generatedText || '').trim())) return 'direct-question'
  if (mechanismTrigger) return 'mechanism-trigger'
  if (previousLocationId && currentLocationId && previousLocationId !== currentLocationId) {
    return 'location-change'
  }
  return ''
}

// 单拍决策：返回 { pause, reason }。reason 为 typed 稳定标识，按硬边界优先排序。
export function shouldPauseSemiAutoBeat({
  appliedBeats = 0,
  userTyped = false,
  busy = false,
  manualStop = false,
  failureReason = '',
  environmentReason = ''
} = {}) {
  // 硬上限：即使 provider 持续成功也必须停。
  if (Number(appliedBeats) >= SEMI_AUTO_MAX_BEATS) return paused('max-beats')
  if (manualStop) return paused('manual-stop')
  if (failureReason) return paused('stale-or-failure')
  if (environmentReason === 'exception-review') return paused('exception-review')
  if (userTyped) return paused('user-input')
  if (busy) return paused('busy')
  if (environmentReason) return paused(environmentReason)
  return CONTINUE_VERDICT
}
