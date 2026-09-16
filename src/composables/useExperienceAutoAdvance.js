// Experience 半自动推进（R-X1）：timer、暂停判断、schedule/run/stop、
// 人工输入取消与卸载清理的唯一 owner。依赖全部由页面注入：
// 不 import 页面、router 或 store singleton；本 composable 不互相 import。
import { computed, ref } from 'vue'

const AUTO_ADVANCE_MAX_BEATS = 3
const AUTO_ADVANCE_INTERVAL_MS = 1500

export function useExperienceAutoAdvance({
  gameStore,
  onlineSession,
  isStarting,
  isLocalDemoSequence,
  handleSend,
  handleLocalDemoEvent
}) {
  const autoAdvanceEnabled = ref(false)
  const autoAdvancePending = ref(false)
  const autoAdvanceRequestActive = ref(false)
  let autoAdvanceTimer = null
  // C6：半自动节奏 —— 一次自动会话最多推进 N 个完整 beat，间隔阅读友好。
  const autoAdvanceBeatCount = ref(0)

  const canUseAutoAdvance = computed(() => !onlineSession && Boolean(gameStore.currentSessionId) && !isStarting.value)
  const isDemoSequence = computed(() => (typeof isLocalDemoSequence === 'function' ? isLocalDemoSequence() : isLocalDemoSequence.value))

  function clearAutoAdvanceTimer() {
    if (autoAdvanceTimer !== null) {
      clearTimeout(autoAdvanceTimer)
      autoAdvanceTimer = null
    }
  }

  function stopAutoAdvance({ abortRunning = false } = {}) {
    clearAutoAdvanceTimer()
    autoAdvancePending.value = false
    autoAdvanceEnabled.value = false
    autoAdvanceBeatCount.value = 0
    if (abortRunning && autoAdvanceRequestActive.value && gameStore.isLoading) {
      gameStore.cancelNarrativeGeneration?.('auto-advance-stopped')
    }
  }

  // C6：半自动暂停条件 —— 决策点/场景转折/机制触发时停下，不无限推进。
  function shouldPauseAutoAdvance(content, placeIdBefore) {
    const text = String(content || '').trim()
    if (!text) return false
    // 直接向玩家提问（问句结尾）
    if (/[？?]$/.test(text)) return true
    // 地点切换
    if (placeIdBefore && gameStore.worldMapState?.placeId
      && placeIdBefore !== gameStore.worldMapState.placeId) {
      return true
    }
    // 机制触发（战斗/交易/任务/对话面板）
    const latestAssistant = [...(gameStore.messages || [])].reverse()
      .find((message) => message?.role === 'assistant')
    if (latestAssistant?.mechanismTrigger) return true
    return false
  }

  function scheduleAutoAdvance(delay = 1300) {
    clearAutoAdvanceTimer()
    if (!autoAdvanceEnabled.value || !canUseAutoAdvance.value) return
    autoAdvancePending.value = true
    autoAdvanceTimer = setTimeout(() => {
      autoAdvanceTimer = null
      void runAutoAdvance()
    }, delay)
  }

  async function runAutoAdvance() {
    autoAdvancePending.value = false
    if (!autoAdvanceEnabled.value || !canUseAutoAdvance.value) return
    if (gameStore.isLoading) {
      return
    }

    if (isDemoSequence.value) {
      if (handleLocalDemoEvent('continue')) scheduleAutoAdvance(900)
      else stopAutoAdvance()
      return
    }

    autoAdvanceRequestActive.value = true
    autoAdvanceBeatCount.value += 1
    const messageCount = gameStore.messages.length
    const placeIdBefore = gameStore.worldMapState?.placeId || ''
    try {
      await handleSend('自动续写：只承接最后一个可见动作或台词。', {
        hidden: true,
        source: 'auto-advance',
        narrativeMode: 'auto-advance'
      })
      const generated = gameStore.messages.slice(messageCount)
        .some((message) => message?.role === 'assistant' && String(message?.content || '').trim())
      const latestAssistant = [...gameStore.messages].reverse()
        .find((message) => message?.role === 'assistant' && String(message?.content || '').trim())
      // C6：达到连续上限，或出现决策点/场景转折/机制触发 → 停止，不再排下一拍。
      const shouldPause = autoAdvanceBeatCount.value >= AUTO_ADVANCE_MAX_BEATS
        || shouldPauseAutoAdvance(latestAssistant?.content || '', placeIdBefore)
      if (generated && autoAdvanceEnabled.value && !shouldPause) {
        scheduleAutoAdvance(AUTO_ADVANCE_INTERVAL_MS)
      } else {
        stopAutoAdvance()
      }
    } catch {
      // 生成函数会记录具体错误；半自动只负责收回本次待续状态。
      stopAutoAdvance()
    } finally {
      autoAdvanceRequestActive.value = false
    }
  }

  function toggleAutoAdvance() {
    if (autoAdvanceEnabled.value) {
      stopAutoAdvance({ abortRunning: true })
      return
    }
    if (!canUseAutoAdvance.value) return
    autoAdvanceEnabled.value = true
    autoAdvanceBeatCount.value = 0
    // 半自动立即起步；自动轮次只接住最近正文的结尾，而不是把隐藏命令
    // 作为普通用户意图扩展到整段历史。
    scheduleAutoAdvance(300)
  }

  // C6：send 后续接（原页面 handleSend 尾部逻辑迁入，消除循环依赖）：
  // 手动输入开启新一轮时重置 beat，生成有产出则排下一拍。
  function handleFollowUpAfterSend({ messageCount, isAutoAdvance }) {
    const shouldAutoFollow = !isAutoAdvance && autoAdvanceEnabled.value && canUseAutoAdvance.value
    if (!shouldAutoFollow) return
    autoAdvanceBeatCount.value = 0
    const generated = gameStore.messages.slice(messageCount)
      .some((message) => message?.role === 'assistant' && String(message?.content || '').trim())
    if (generated) scheduleAutoAdvance(AUTO_ADVANCE_INTERVAL_MS)
    else stopAutoAdvance()
  }

  function handleManualInput() {
    // 已经开始倒计时或自动请求时，输入意味着用户接管；仅“已准备”时
    // 不取消，避免用户写完行动后还得重新开启半自动。
    if (autoAdvancePending.value || autoAdvanceRequestActive.value) {
      stopAutoAdvance({ abortRunning: true })
    }
  }

  return {
    autoAdvanceEnabled,
    autoAdvancePending,
    autoAdvanceBeatCount,
    canUseAutoAdvance,
    toggleAutoAdvance,
    handleManualInput,
    handleFollowUpAfterSend,
    scheduleAutoAdvance,
    stopAutoAdvance,
    disposeAutoAdvance: clearAutoAdvanceTimer
  }
}
