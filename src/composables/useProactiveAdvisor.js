/**
 * useProactiveAdvisor - 主动创作顾问组合式函数
 *
 * 职责：
 * - 后台异步分析写作内容
 * - 非侵入式轻提示
 * - 发现设定冲突、时间矛盾等问题
 */

import { ref, computed, onUnmounted } from 'vue'

// 警报级别
export const ALERT_LEVELS = {
  INFO: 'info',         // 信息性提示
  WARNING: 'warning',   // 轻度违背
  ALERT: 'alert',       // 严重冲突
  CRITICAL: 'critical'  // 剧情失控
}

// 警报类型
export const ALERT_TYPES = {
  CHARACTER_CONSISTENCY: 'character_consistency',   // 角色一致性
  TIMELINE_CONFLICT: 'timeline_conflict',           // 时间线矛盾
  SETTING_VIOLATION: 'setting_violation',           // 设定违背
  PACING_ISSUE: 'pacing_issue',                     // 节奏问题
  PLOT_DEVIATION: 'plot_deviation',                 // 剧情偏离
  STYLE_INCONSISTENCY: 'style_inconsistency'        // 风格不一致
}

// 默认配置
const DEFAULT_CONFIG = {
  minWordCount: 200,          // 触发最低字数
  pauseThresholdMs: 3000,     // 停顿阈值
  contextRadius: 500,         // 光标前后提取字符数
  maxDelayMs: 10000,          // 最长延迟触发
  debounceMs: 2000,           // 去抖延迟
  maxAlerts: 10               // 最大警报数量
}

/**
 * 创建主动顾问
 * @param {object} config - 配置选项
 * @returns {object} 顾问状态和方法
 */
export function useProactiveAdvisor(config = {}) {
  const options = { ...DEFAULT_CONFIG, ...config }

  // 状态
  const alerts = ref([])
  const isAnalyzing = ref(false)
  const lastAnalysisTime = ref(0)
  const hasNewAlerts = ref(false)
  const indicatorState = ref('idle') // idle | breathing | pulsing | critical

  // 计时器
  let pauseTimer = null
  let analysisAbortController = null

  // 统计
  const alertCounts = computed(() => {
    const counts = { info: 0, warning: 0, alert: 0, critical: 0 }
    for (const a of alerts.value) {
      counts[a.level] = (counts[a.level] || 0) + 1
    }
    return counts
  })

  const hasCriticalAlerts = computed(() => alertCounts.value.critical > 0)
  const hasAlertLevelAlerts = computed(() => alertCounts.value.alert > 0)

  /**
   * 添加警报
   * @param {object} alert - 警报对象
   */
  function addAlert(alert) {
    const newAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      read: false,
      ...alert
    }

    alerts.value.unshift(newAlert)

    // 限制数量
    if (alerts.value.length > options.maxAlerts) {
      alerts.value = alerts.value.slice(0, options.maxAlerts)
    }

    hasNewAlerts.value = true
    updateIndicatorState()
  }

  /**
   * 更新指示器状态
   */
  function updateIndicatorState() {
    if (alertCounts.value.critical > 0) {
      indicatorState.value = 'critical'
    } else if (alertCounts.value.alert > 0) {
      indicatorState.value = 'pulsing'
    } else if (alertCounts.value.warning > 0) {
      indicatorState.value = 'breathing'
    } else {
      indicatorState.value = 'idle'
    }
  }

  /**
   * 标记警报已读
   * @param {string} alertId - 警报 ID
   */
  function markAsRead(alertId) {
    const alert = alerts.value.find(a => a.id === alertId)
    if (alert) {
      alert.read = true
    }
    hasNewAlerts.value = alerts.value.some(a => !a.read)
  }

  /**
   * 清除所有警报
   */
  function clearAlerts() {
    alerts.value = []
    hasNewAlerts.value = false
    indicatorState.value = 'idle'
  }

  /**
   * 移除警报
   * @param {string} alertId - 警报 ID
   */
  function removeAlert(alertId) {
    alerts.value = alerts.value.filter(a => a.id !== alertId)
    updateIndicatorState()
  }

  /**
   * 触发后台分析
   * @param {string} content - 内容
   * @param {number} cursorPos - 光标位置
   * @param {object} context - 上下文
   */
  async function triggerAnalysis(content, cursorPos, context = {}) {
    // 取消之前的请求
    if (analysisAbortController) {
      analysisAbortController.abort()
    }

    // 检查字数
    if (content.length < options.minWordCount) {
      return
    }

    isAnalyzing.value = true
    analysisAbortController = new AbortController()

    try {
      // 提取上下文窗口
      const contextWindow = extractContextWindow(content, cursorPos)

      // 执行本地分析（快速检查）
      const localResults = performLocalAnalysis(contextWindow, context)

      // 添加本地分析结果
      for (const result of localResults) {
        addAlert(result)
      }

      // 如果有后端 API，执行远程分析
      if (context.worldBookEntries && context.worldBookEntries.length > 0) {
        const remoteResults = await performRemoteAnalysis(
          contextWindow,
          context,
          analysisAbortController.signal
        )

        for (const result of remoteResults) {
          addAlert(result)
        }
      }

      lastAnalysisTime.value = Date.now()
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('ProactiveAdvisor analysis error:', err)
      }
    } finally {
      isAnalyzing.value = false
      analysisAbortController = null
    }
  }

  /**
   * 提取上下文窗口
   */
  function extractContextWindow(content, cursorPos) {
    const start = Math.max(0, cursorPos - options.contextRadius)
    const end = Math.min(content.length, cursorPos + options.contextRadius)
    return content.slice(start, end)
  }

  /**
   * 执行本地分析
   * @param {string} text - 文本
   * @param {object} context - 上下文
   * @returns {Array} 分析结果
   */
  function performLocalAnalysis(text, context = {}) {
    const results = []

    // 检查时间词冲突
    const timePatterns = ['清晨', '早晨', '上午', '中午', '下午', '傍晚', '黄昏', '夜晚', '深夜', '凌晨']
    const foundTimes = timePatterns.filter(t => text.includes(t))
    if (foundTimes.length > 1 && context.currentPeriod) {
      const hasConflict = !foundTimes.includes(context.currentPeriod)
      if (hasConflict) {
        results.push({
          type: ALERT_TYPES.TIMELINE_CONFLICT,
          level: ALERT_LEVELS.WARNING,
          title: '时间词冲突',
          description: `文本中出现了多个时间词：${foundTimes.join('、')}，当前设定时间为「${context.currentPeriod}」`,
          suggestion: '建议统一时间描述，避免读者困惑。'
        })
      }
    }

    // 检查角色名一致性
    if (context.characters && context.characters.length > 0) {
      for (const char of context.characters) {
        if (text.includes(char.name)) {
          // 检查是否有描述冲突
          const charPattern = new RegExp(`${char.name}[，。、].{0,50}`, 'g')
          const matches = text.match(charPattern) || []
          for (const match of matches) {
            // 简单检查：如果角色设定中有特定特征，检查是否矛盾
            if (char.traits) {
              // 这里可以添加更复杂的分析逻辑
            }
          }
        }
      }
    }

    // 检查段落长度（节奏问题）
    const paragraphs = text.split(/\n{2,}/)
    const longParagraphs = paragraphs.filter(p => p.length > 500)
    if (longParagraphs.length > 2) {
      results.push({
        type: ALERT_TYPES.PACING_ISSUE,
        level: ALERT_LEVELS.INFO,
        title: '段落较长',
        description: `发现 ${longParagraphs.length} 个超过 500 字的长段落，可能影响阅读节奏。`,
        suggestion: '考虑将长段落拆分，增加场景切换或对话。'
      })
    }

    return results
  }

  /**
   * 执行远程分析
   * @param {string} text - 文本
   * @param {object} context - 上下文
   * @param {AbortSignal} signal - 取消信号
   * @returns {Promise<Array>} 分析结果
   */
  async function performRemoteAnalysis(text, context, signal) {
    // 如果没有配置后端 API，返回空数组
    if (!context.apiSettings?.baseUrl) {
      return []
    }

    try {
      const response = await fetch('/api/openclaw/proactive-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          worldBookEntries: context.worldBookEntries || [],
          characters: context.characters || []
        }),
        signal
      })

      if (!response.ok) {
        return []
      }

      const data = await response.json()
      return data.alerts || []
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Remote analysis error:', err)
      }
      return []
    }
  }

  /**
   * 处理写作停顿
   * @param {string} content - 内容
   * @param {number} cursorPos - 光标位置
   * @param {object} context - 上下文
   */
  function handlePause(content, cursorPos, context) {
    // 清除之前的计时器
    if (pauseTimer) {
      clearTimeout(pauseTimer)
    }

    // 设置新的计时器
    pauseTimer = setTimeout(() => {
      triggerAnalysis(content, cursorPos, context)
    }, options.pauseThresholdMs)
  }

  /**
   * 取消当前分析
   */
  function cancelAnalysis() {
    if (pauseTimer) {
      clearTimeout(pauseTimer)
      pauseTimer = null
    }
    if (analysisAbortController) {
      analysisAbortController.abort()
      analysisAbortController = null
    }
    isAnalyzing.value = false
  }

  // 清理
  onUnmounted(() => {
    cancelAnalysis()
  })

  return {
    // 状态
    alerts,
    isAnalyzing,
    lastAnalysisTime,
    hasNewAlerts,
    indicatorState,
    alertCounts,
    hasCriticalAlerts,
    hasAlertLevelAlerts,

    // 方法
    addAlert,
    markAsRead,
    clearAlerts,
    removeAlert,
    triggerAnalysis,
    handlePause,
    cancelAnalysis
  }
}

export default useProactiveAdvisor
