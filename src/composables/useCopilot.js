/**
 * useCopilot - AI 续写补全组合式函数
 *
 * 功能：
 * - 监听用户输入停顿，自动触发 AI 续写建议
 * - 管理建议状态（生成中/显示/采纳/拒绝）
 * - 上下文窗口截取与 Token 预算管理
 */

import { ref, onUnmounted } from 'vue'
import { runGenerationTask } from '../services/generationService'
import { getResolvedApiSettings } from '../services/api'
import { useWorldStore } from '../stores/worldStore'
import { buildWorldbookContext } from '../services/worldbookContextBuilder'
import { getSystemTemplate } from '../services/promptRegistry'

const DEFAULT_UPSTREAM = 900
const DEFAULT_DOWNSTREAM = 180
const DEFAULT_DEBOUNCE_MS = 220
const MAX_SUGGESTION_LENGTH = 180
const DEFAULT_WORLDBOOK_TOKEN_BUDGET = 520
const DEFAULT_EXTRA_CONTEXT_LIMIT = 1200
const META_LINE_PATTERN = /^(?:思考|分析|解释|说明|备注|建议|推理|结论|总结|提示|补充|进一步|下面|以下|我认为|我建议|可以考虑|我们可以|建议如下|分析如下|这段|这一段|这里|可改为|可以写成|可以这样|你可以|应该|因为|为了|如果|注意)[:：，,\-\s]*/i
const META_PHRASE_PATTERN = /(?:作为(?:AI|人工智能|写作助手)|我(?:无法|不能|可以|建议|认为)|这(?:不是|应该|可以|属于)|需要根据|建议你|可以这样写|以下是|下面是|续写如下|补全如下|可参考|没有足够|无法判断)/
const PROSE_SIGNAL_PATTERN = /[。！？!?」』”"）)]$|^["“「『*]|^[他她它我你他们她们我们]/u

function clampCursorPosition(text, cursorPos) {
  const length = String(text || '').length
  const numericPos = Number(cursorPos)
  if (!Number.isFinite(numericPos)) return length
  return Math.max(0, Math.min(length, numericPos))
}

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

export function extractCopilotWindow(content, cursorPos, opts = {}) {
  const text = String(content || '')
  if (!text) {
    return {
      before: '',
      after: '',
      contextText: '',
      cursorPos: 0
    }
  }

  const safeCursor = clampCursorPosition(text, cursorPos)
  const { upstream = DEFAULT_UPSTREAM, downstream = DEFAULT_DOWNSTREAM } = opts
  const beforeRaw = text.slice(Math.max(0, safeCursor - upstream), safeCursor)
  const after = text.slice(safeCursor, safeCursor + downstream)
  const paragraphBoundary = beforeRaw.lastIndexOf('\n\n')
  const before = paragraphBoundary !== -1
    ? beforeRaw.slice(paragraphBoundary + 2)
    : beforeRaw

  return {
    before,
    after,
    contextText: before + after,
    cursorPos: safeCursor
  }
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

function buildRuntimeState(context = {}) {
  const chapterTitle = String(context.chapterTitle || '').trim()
  return {
    activities: chapterTitle ? [{ title: chapterTitle }] : []
  }
}

export function normalizeCopilotSuggestion(rawText, maxLength = MAX_SUGGESTION_LENGTH) {
  let text = String(rawText || '').trim()
  if (!text) return ''

  text = text
    .replace(/^(?:续写|补全|建议|输出)[:：]\s*/i, '')
    .replace(/^以下是(?:续写|补全|建议)?[:：]?\s*/i, '')
    .trim()
    .replace(/^```(?:\w+)?\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  if (META_PHRASE_PATTERN.test(text)) {
    const proseCandidate = text
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .find((line) => line && !META_LINE_PATTERN.test(line) && PROSE_SIGNAL_PATTERN.test(line))
    text = proseCandidate || ''
  }

  const lines = text
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !META_LINE_PATTERN.test(line))
    .filter((line) => !META_PHRASE_PATTERN.test(line))

  text = (lines.length > 0 ? lines.join('\n') : '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!text) return ''

  if (!PROSE_SIGNAL_PATTERN.test(text) && !/[。！？!?」』”"]/.test(text)) {
    return ''
  }

  if (text.length <= maxLength) return text

  const clipped = text.slice(0, maxLength)
  const sentenceEnd = Math.max(
    clipped.lastIndexOf('。'),
    clipped.lastIndexOf('！'),
    clipped.lastIndexOf('？'),
    clipped.lastIndexOf('.'),
    clipped.lastIndexOf('!'),
    clipped.lastIndexOf('?')
  )

  return sentenceEnd > Math.floor(maxLength * 0.45)
    ? clipped.slice(0, sentenceEnd + 1).trim()
    : clipped.trim()
}

function shouldInsertAsciiSpace(before, suggestion) {
  if (!before || !suggestion) return false
  const last = before[before.length - 1]
  const first = suggestion[0]
  return /[A-Za-z0-9)]/.test(last) && /[A-Za-z0-9(]/.test(first)
}

export function insertCopilotSuggestion(content, cursorPos, rawSuggestion) {
  const text = String(content || '')
  const safeCursor = clampCursorPosition(text, cursorPos)
  const suggestion = String(rawSuggestion || '')
  if (!suggestion) {
    return { content: text, newCursorPos: safeCursor }
  }

  const before = text.slice(0, safeCursor)
  const after = text.slice(safeCursor)
  const inserted = shouldInsertAsciiSpace(before, suggestion) ? ` ${suggestion}` : suggestion

  return {
    content: before + inserted + after,
    newCursorPos: safeCursor + inserted.length
  }
}

export function normalizeCopilotExtraContext(extraContext = '', limit = DEFAULT_EXTRA_CONTEXT_LIMIT) {
  const text = String(extraContext || '')
    .trim()
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')

  if (!text) return ''
  if (text.length <= limit) return text

  const clipped = text.slice(0, limit)
  const boundaries = ['\n\n', '。', '！', '？', '\n']
  const cutAt = boundaries.reduce((best, boundary) => {
    const index = clipped.lastIndexOf(boundary)
    return index > best ? index : best
  }, -1)

  return cutAt > Math.floor(limit * 0.55)
    ? clipped.slice(0, cutAt + 1).trim()
    : clipped.trim()
}

export function buildCopilotMessages({
  content = '',
  cursorPos = 0,
  chapterTitle = '',
  extraContext = '',
  worldbook = null,
  maxSuggestionLength = MAX_SUGGESTION_LENGTH,
  worldbookTokenBudget = DEFAULT_WORLDBOOK_TOKEN_BUDGET
} = {}) {
  const contextWindow = extractCopilotWindow(content, cursorPos)
  const referenceContext = normalizeCopilotExtraContext(extraContext)
  const template = getSystemTemplate('copilot')
  const worldbookResult = buildWorldbookContext({
    worldbook,
    chatHistory: [{
      role: 'user',
      content: [referenceContext, contextWindow.contextText].filter(Boolean).join('\n\n')
    }],
    runtimeState: buildRuntimeState({ chapterTitle }),
    tokenBudget: worldbookTokenBudget,
    scanDepth: 1
  })

  const systemPrompt = `${template.role}。
${template.instruction}

【内联补全要求】
1. 只输出正文片段。禁止回答用户、禁止解释、禁止思考、禁止分析、禁止标题、禁止分点、禁止 Markdown。
2. 续写应紧接光标前文本，避免重复已有句子。
3. 如果光标后还有文本，续写必须能自然衔接后文，不要改写后文。
4. 保持角色称谓、叙事视角、时态、标点和分段习惯一致。
5. 输出长度控制在 20-${Math.max(70, Math.min(180, maxSuggestionLength))} 字，优先给出最直接、最有信息量的后续一句。
6. 如果给出参考素材，只吸收可用信息，不要复述素材标签，不要把素材当成要解释的用户问题。
7. 如果不能直接续写，输出空字符串，不要解释原因。`

  const userPrompt = [
    chapterTitle ? `当前章节：${chapterTitle}` : '',
    '只返回要插入「光标」处的正文，不要说“可以这样写/以下是/建议”。',
    '请补全：',
    '',
    referenceContext ? `【参考素材】\n${referenceContext}` : '',
    '【光标前】',
    contextWindow.before || '（空）',
    '',
    '【光标后】',
    contextWindow.after || '（空）'
  ].filter(Boolean).join('\n')

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      ...worldbookResult.messages,
      { role: 'user', content: userPrompt }
    ],
    matchedEntries: worldbookResult.matchedEntries,
    warnings: worldbookResult.warnings,
    contextWindow
  }
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
  const matchedEntries = ref([])
  const warnings = ref([])
  const lastCursorPosition = ref(0)
  const lastRequestId = ref(0)

  // 计时器
  let debounceTimer = null
  let abortController = null
  let requestVersion = 0

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
    requestVersion += 1
    cleanup()
    suggestion.value = ''
    isVisible.value = false
    isGenerating.value = false
    matchedEntries.value = []
    warnings.value = []
  }

  // 触发生成
  async function triggerGeneration(content, cursorPos, context = {}) {
    if (isGenerating.value) {
      cleanup()
    }

    lastCursorPosition.value = cursorPos
    const requestId = ++requestVersion
    lastRequestId.value = requestId

    // 提取上下文
    const contextWindow = extractCopilotWindow(content, cursorPos)
    if (contextWindow.contextText.length < 50 || contextWindow.before.trim().length < 20) {
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

      const worldStore = useWorldStore()
      const prompt = buildCopilotMessages({
        content,
        cursorPos,
        chapterTitle: context.chapterTitle,
        extraContext: context.extraContext,
        worldbook: worldStore.activeWorldbook,
        maxSuggestionLength
      })
      matchedEntries.value = prompt.matchedEntries
      warnings.value = prompt.warnings

      abortController = new AbortController()

      const result = await runGenerationTask({
        taskType: 'writing.copilot',
        baseMessages: prompt.messages,
        settings: apiSettings,
        generationOptions: {
          max_tokens: Math.min(Math.max(Math.ceil(maxSuggestionLength * 1.15), 72), 220),
          temperature: 0.35,
          stream: false
        },
        attempts: [{ name: 'copilot-generation' }],
        signal: abortController.signal
      })

      if (requestId !== requestVersion) return

      if (result?.success && result.content) {
        const newSuggestion = normalizeCopilotSuggestion(result.content, maxSuggestionLength)
        suggestion.value = newSuggestion
        isVisible.value = Boolean(newSuggestion)
      }
    } catch (err) {
      if (requestId !== requestVersion) return
      if (err.name !== 'AbortError') {
        console.error('Copilot generation error:', err)
        error.value = err.message || '生成失败'
      }
    } finally {
      if (requestId === requestVersion) {
        isGenerating.value = false
      }
      abortController = null
    }
  }

  // 防抖触发
  function debouncedTrigger(content, cursorPos, context = {}) {
    requestVersion += 1
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

    const result = insertCopilotSuggestion(content, cursorPos, suggestion.value)

    // 重置状态
    suggestion.value = ''
    isVisible.value = false

    return result
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
    matchedEntries,
    warnings,
    lastCursorPosition,
    lastRequestId,

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
