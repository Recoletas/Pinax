/**
 * useCopilot - AI 续写补全组合式函数
 *
 * 功能：
 * - 监听用户输入停顿，自动触发 AI 续写建议
 * - 管理建议状态（生成中/显示/采纳/拒绝）
 * - 上下文窗口截取与 Token 预算管理
 */

import { ref, computed, onUnmounted, watch } from 'vue'
import { runGenerationRetryPlan } from '../services/generationRetry'
import { getResolvedApiSettings } from '../services/api'
import { useWorldStore } from '../stores/worldStore'

const DEFAULT_UPSTREAM = 1500
const DEFAULT_DOWNSTREAM = 500
const DEFAULT_DEBOUNCE_MS = 300
const MAX_SUGGESTION_LENGTH = 500

/**
 * 构建上下文窗口
 * @param {string} text - 完整文本
 * @param {number} cursorPos - 光标位置
 * @param {object} opts - 配置选项
 * @returns {string} 截取后的上下文
 */
function buildContextWindow(text, cursorPos, opts = {}) {
  const { upstream = DEFAULT_UPSTREAM, downstream = DEFAULT_DOWNSTREAM } = opts

  if (!text || cursorPos < 0) return ''

  // 向上截取
  const upstreamText = text.slice(Math.max(0, cursorPos - upstream), cursorPos)
  // 向下截取
  const downstreamText = text.slice(cursorPos, cursorPos + downstream)

  // 段落对齐：尝试以最后一个完整段落为界
  const paragraphBoundary = upstreamText.lastIndexOf('\n\n')
  const trimmedUpstream = paragraphBoundary !== -1
    ? upstreamText.slice(paragraphBoundary + 2)
    : upstreamText

  return trimmedUpstream + downstreamText
}

/**
 * 提取 Copilot 上下文
 * @param {string} content - 章节内容
 * @param {number} cursorPos - 光标位置
 * @returns {string} 上下文文本
 */
export function extractForCopilot(content, cursorPos) {
  if (!content) return ''
  if (content.length < 2000) return content
  return buildContextWindow(content, cursorPos, { upstream: DEFAULT_UPSTREAM, downstream: DEFAULT_DOWNSTREAM })
}

/**
 * 获取匹配的世界书条目
 * @param {string} text - 文本
 * @param {number} maxEntries - 最大条目数
 * @returns {Array} 匹配的条目
 */
function getMatchingWorldBookEntries(text, maxEntries = 5) {
  const worldStore = useWorldStore()
  const worldbook = worldStore.activeWorldbook
  if (!worldbook || !worldbook.entries) return []

  const lowerText = text.toLowerCase()
  const matched = []

  for (const entry of worldbook.entries) {
    if (matched.length >= maxEntries) break
    if (!entry.keys || entry.keys.length === 0) continue

    const hasMatch = entry.keys.some(key =>
      key && lowerText.includes(key.toLowerCase())
    )

    if (hasMatch) {
      matched.push(entry)
    }
  }

  return matched
}

/**
 * 构建世界书上下文
 * @param {Array} entries - 条目列表
 * @returns {string} 世界书上下文
 */
function buildWorldBookContext(entries) {
  if (!entries || entries.length === 0) return ''

  const parts = entries.map(entry => {
    const name = entry.name || '未命名'
    const content = entry.content || ''
    return `【${name}】${content}`
  })

  return `相关设定：\n${parts.join('\n')}`
}

/**
 * useCopilot 组合式函数
 * @param {object} options - 配置选项
 * @returns {object} Copilot 状态和方法
 */
export function useCopilot(options = {}) {
  const {
    debounceMs = DEFAULT_DEBOUNCE_MS,
    maxSuggestionLength = MAX_SUGGESTION_LENGTH,
    autoTrigger = true
  } = options

  // 状态
  const isGenerating = ref(false)
  const suggestion = ref('')
  const isVisible = ref(false)
  const error = ref(null)
  const lastCursorPosition = ref(0)

  // 计时器
  let debounceTimer = null
  let abortController = null

  // 清理函数
  function cleanup() {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  // 取消当前建议
  function cancelSuggestion() {
    cleanup()
    suggestion.value = ''
    isVisible.value = false
    isGenerating.value = false
  }

  // 触发生成
  async function triggerGeneration(content, cursorPos, context = {}) {
    if (isGenerating.value) {
      cleanup()
    }

    lastCursorPosition.value = cursorPos

    // 提取上下文
    const contextText = extractForCopilot(content, cursorPos)
    if (contextText.length < 50) {
      // 内容太短，不触发
      return
    }

    isGenerating.value = true
    error.value = null

    try {
      const apiSettings = await getResolvedApiSettings()
      if (!apiSettings?.baseUrl || !apiSettings?.apiKey) {
        error.value = '请先配置 AI 设置'
        isGenerating.value = false
        return
      }

      // 获取匹配的世界书条目
      const worldBookEntries = getMatchingWorldBookEntries(contextText)
      const worldBookContext = buildWorldBookContext(worldBookEntries)

      // 构建提示词
      const systemPrompt = `你是一个小说续写助手。根据用户提供的上下文，续写接下来的内容。

要求：
1. 续写内容要与上下文风格保持一致
2. 续写长度控制在 100-300 字
3. 不要重复上下文中已有的内容
4. 如果上下文中涉及特定角色或设定，请保持一致
5. 只输出续写内容，不要输出任何解释或标记

${worldBookContext ? '\n' + worldBookContext + '\n\n请在续写中遵循以上设定。' : ''}`

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `请续写以下内容：\n\n${contextText}` }
      ]

      abortController = new AbortController()

      const result = await runGenerationRetryPlan({
        baseMessages: messages,
        settings: apiSettings,
        generationOptions: {
          max_tokens: Math.min(maxSuggestionLength * 2, 600),
          temperature: 0.7,
          stream: false
        },
        attempts: [{ name: 'copilot-generation' }],
        signal: abortController.signal
      })

      if (result?.success && result.content) {
        let newSuggestion = result.content.trim()
        // 限制建议长度
        if (newSuggestion.length > maxSuggestionLength) {
          newSuggestion = newSuggestion.slice(0, maxSuggestionLength)
        }
        suggestion.value = newSuggestion
        isVisible.value = true
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Copilot generation error:', err)
        error.value = err.message || '生成失败'
      }
    } finally {
      isGenerating.value = false
      abortController = null
    }
  }

  // 防抖触发
  function debouncedTrigger(content, cursorPos, context = {}) {
    cleanup()

    if (!autoTrigger || !content || cursorPos < 0) return

    debounceTimer = setTimeout(() => {
      triggerGeneration(content, cursorPos, context)
    }, debounceMs)
  }

  // 采纳建议
  function acceptSuggestion(content, cursorPos) {
    if (!suggestion.value || !isVisible.value) {
      return { content, newCursorPos: cursorPos }
    }

    const before = content.slice(0, cursorPos)
    const after = content.slice(cursorPos)
    const newContent = before + suggestion.value + after
    const newCursorPos = cursorPos + suggestion.value.length

    // 重置状态
    suggestion.value = ''
    isVisible.value = false

    return { content: newContent, newCursorPos }
  }

  // 拒绝建议
  function rejectSuggestion() {
    cancelSuggestion()
  }

  // 手动触发
  function manualTrigger(content, cursorPos, context = {}) {
    cancelSuggestion()
    triggerGeneration(content, cursorPos, context)
  }

  // 组件卸载时清理
  onUnmounted(() => {
    cleanup()
  })

  return {
    // 状态
    isGenerating,
    suggestion,
    isVisible,
    error,

    // 方法
    triggerGeneration: debouncedTrigger,
    manualTrigger,
    acceptSuggestion,
    rejectSuggestion,
    cancelSuggestion
  }
}

/**
 * 创建 Ghost Text 叠加层
 * @param {HTMLTextAreaElement} textarea - 文本框元素
 * @param {string} suggestion - 建议文本
 * @returns {HTMLDivElement|null} 叠加层元素
 */
export function createGhostOverlay(textarea, suggestion) {
  if (!textarea || !suggestion) return null

  const overlay = document.createElement('div')
  overlay.className = 'copilot-ghost-overlay'

  // 复制 textarea 的样式
  const style = getComputedStyle(textarea)
  overlay.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    font-family: ${style.fontFamily};
    font-size: ${style.fontSize};
    line-height: ${style.lineHeight};
    padding: ${style.padding};
    border: ${style.border};
    box-sizing: border-box;
    pointer-events: none;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow: hidden;
    color: transparent;
    background: transparent;
    z-index: 1;
  `

  // 获取光标位置前的文本
  const textBeforeCursor = textarea.value.slice(0, textarea.selectionStart)
  const textAfterCursor = textarea.value.slice(textarea.selectionStart)

  // 渲染文本 + 建议
  overlay.innerHTML = `
    <span class="ghost-existing">${escapeHtml(textBeforeCursor)}</span>
    <span class="ghost-suggestion" style="color: #999; background: rgba(0,0,0,0.05); border-radius: 2px;">${escapeHtml(suggestion)}</span>
    <span class="ghost-existing">${escapeHtml(textAfterCursor)}</span>
  `

  return overlay
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export default useCopilot
