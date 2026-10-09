import express from 'express'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { memoryService } from '../services/memoryService.js'
import { probeNarrativeProviderCapabilities } from '../services/providers/narrativeCapabilityProbe.js'
import { probeStructuredProviderCapabilities } from '../services/structuredGenerationRunner.js'
import { forwardComplete, forwardCompleteStream } from '../services/kitModelGateway.js'
import { MODEL_ROUTING_ERROR_MESSAGE, resolveModelRouting } from '../services/modelRouting.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const router = express.Router()

const PROVIDER_DEFAULTS = {
  openai: { baseUrl: 'https://api.openai.com/v1', chatPath: '/chat/completions' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', chatPath: '/chat/completions' },
  claude: { baseUrl: 'https://api.anthropic.com/v1', chatPath: '/messages', type: 'claude' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', chatPath: '/chat/completions' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', chatPath: '/chat/completions' },
  mistral: { baseUrl: 'https://api.mistral.ai/v1', chatPath: '/chat/completions' },
  cohere: { baseUrl: 'https://api.cohere.ai/v2', chatPath: '/chat', type: 'cohere' },
  perplexity: { baseUrl: 'https://api.perplexity.ai', chatPath: '/chat/completions' },
  ollama: { baseUrl: 'http://localhost:11434', chatPath: '/v1/chat/completions' },
  lmstudio: { baseUrl: 'http://localhost:1234/v1', chatPath: '/chat/completions' },
  textgenwebui: { baseUrl: 'http://localhost:5000', chatPath: '/v1/chat/completions' },
  pollinations: { baseUrl: 'https://gen.pollinations.ai', chatPath: '/v1/chat/completions' },
  moonshot: { baseUrl: 'https://api.moonshot.cn/v1', chatPath: '/chat/completions' },
  fireworks: { baseUrl: 'https://api.fireworks.ai/inference/v1', chatPath: '/chat/completions' },
  xai: { baseUrl: 'https://api.x.ai/v1', chatPath: '/chat/completions' },
  siliconflow: { baseUrl: 'https://api.siliconflow.cn/v1', chatPath: '/chat/completions' },
  ai21: { baseUrl: 'https://api.ai21.com/v1', chatPath: '/chat/completions' }
}

function resolveBaseUrl(provider, baseUrl, fallbackUrl) {
  const defaults = PROVIDER_DEFAULTS[provider] || {}
  let resolved = baseUrl || fallbackUrl || defaults.baseUrl || ''

  if (provider === 'cohere' && /\/v1\/?$/.test(resolved)) {
    resolved = resolved.replace(/\/v1\/?$/, '/v2')
  }

  return resolved
}

const DEFAULT_MEM0_HOST = 'https://api.mem0.ai'

function normalizeMem0ApiUrl(host) {
  const raw = String(host || DEFAULT_MEM0_HOST).trim()
  if (!raw) return ''
  if (/\/v1\/?$/.test(raw)) return raw.replace(/\/$/, '')
  return `${raw.replace(/\/$/, '')}/v1`
}

function createMem0UpstreamError(status) {
  const error = new Error('Mem0 upstream request failed')
  error.status = status
  return error
}

function logMem0ProxyError(action, error) {
  const status = error?.status ? ` HTTP ${error.status}` : ''
  const name = error?.name ? ` ${error.name}` : ''
  console.error(`[chat] mem0 proxy ${action} error:${status}${name}`.trim())
}

function getMem0ClientError(error) {
  return error?.status
    ? `记忆服务请求失败 (${error.status})`
    : '记忆服务请求失败，请检查网络和配置'
}

export function extractTextContent(payload) {
  if (typeof payload === 'string') return payload
  if (payload == null) return ''

  if (Array.isArray(payload)) {
    return payload
      .map((item) => extractTextContent(item))
      .filter(Boolean)
      .join('')
  }

  if (typeof payload === 'object') {
    const blockType = String(payload.type || '').trim().toLowerCase()
    if (['reasoning', 'thinking', 'redacted_thinking'].includes(blockType)) return ''
    if (typeof payload.text === 'string') return payload.text
    if (typeof payload.content === 'string') return payload.content
    if (Array.isArray(payload.content)) return extractTextContent(payload.content)
    if (typeof payload.output_text === 'string') return payload.output_text
    if (Array.isArray(payload.output)) return extractTextContent(payload.output)
    if (typeof payload.response === 'string') return payload.response
    if (Array.isArray(payload.parts)) return extractTextContent(payload.parts)
    if (payload.type === 'tool_use' && payload.input && typeof payload.input === 'object') {
      return JSON.stringify(payload.input)
    }
    if (payload.function && typeof payload.function.arguments === 'string') {
      return payload.function.arguments
    }
  }

  return ''
}

function extractOpenAIChoiceText(choice) {
  if (!choice || typeof choice !== 'object') return ''

  return (
    extractTextContent(choice?.message?.content) ||
    extractTextContent(choice?.content) ||
    extractTextContent(choice?.text) ||
    extractTextContent(choice?.delta?.content) ||
    (Array.isArray(choice?.message?.tool_calls)
      ? choice.message.tool_calls
        .map((toolCall) => extractTextContent(toolCall?.function?.arguments))
        .filter(Boolean)
        .join('')
      : '') ||
    ''
  )
}

function extractLatestUserQuery(messages = []) {
  const latestUserMessage = [...messages].reverse().find((message) => message?.role === 'user')
  if (!latestUserMessage) return ''
  return extractTextContent(latestUserMessage.content)
}

function buildMemoryPrompt(memoryContextText) {
  if (!memoryContextText) return ''
  return `用户偏好记忆（来自历史采纳与情绪反馈）：\n${memoryContextText}\n\n请在不违背当前用户输入的前提下，优先贴合这些偏好风格与情绪倾向。`
}

// 20261008 预算裁定：不再写死默认 max_tokens（thinking 端点的计量方式不同，写死会把
// 思考型模型的正文饿死）。调用方声明了 max_tokens 才透传，未声明时交给内核缺省（4096）。
const DEFAULT_TEMPERATURE = 0.8
const DEFAULT_MAX_INPUT_CHARS = 18000
const MIN_CLIP_CHARS = 120

function toFiniteNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function sendApiError(res, status, code, message, details = null, meta = null) {
  const payload = { error: message, code }
  if (details) payload.details = details
  if (meta && typeof meta === 'object') payload.meta = meta
  return res.status(status).json(payload)
}

function inferRetryCountFromMessages(messages = []) {
  if (!Array.isArray(messages) || !messages.length) return 0
  const retryHints = ['上一条', '重试', '重新输出', '格式不合规', '严格输出']
  const recentUserMessages = messages
    .filter((m) => m?.role === 'user')
    .slice(-3)
    .map((m) => extractTextContent(m?.content))
    .join('\n')

  if (!recentUserMessages) return 0
  return retryHints.some((hint) => recentUserMessages.includes(hint)) ? 1 : 0
}

function collectInputStats(messages = []) {
  if (!Array.isArray(messages)) {
    return {
      messageCount: 0,
      totalChars: 0
    }
  }

  return messages.reduce(
    (acc, message) => {
      const contentText = extractTextContent(message?.content)
      acc.messageCount += 1
      acc.totalChars += contentText.length
      return acc
    },
    { messageCount: 0, totalChars: 0 }
  )
}

function clipMessageContent(message, maxChars, keepTail = false) {
  const normalizedMax = Math.max(0, Math.floor(maxChars))
  const contentText = extractTextContent(message?.content)

  if (contentText.length <= normalizedMax) {
    return {
      message,
      chars: contentText.length,
      clipped: false
    }
  }

  const clippedContent = keepTail
    ? contentText.slice(Math.max(0, contentText.length - normalizedMax))
    : contentText.slice(0, normalizedMax)

  return {
    message: {
      ...message,
      content: clippedContent
    },
    chars: clippedContent.length,
    clipped: true
  }
}

function applyInputBudget(messages = [], maxInputChars = DEFAULT_MAX_INPUT_CHARS) {
  const safeMessages = Array.isArray(messages) ? messages.filter(Boolean) : []
  const safeMaxChars = Math.max(1200, Math.floor(toFiniteNumber(maxInputChars, DEFAULT_MAX_INPUT_CHARS)))
  const originalStats = collectInputStats(safeMessages)

  if (originalStats.totalChars <= safeMaxChars) {
    return {
      messages: safeMessages,
      truncatedInput: false,
      droppedMessages: 0,
      originalStats,
      finalStats: originalStats,
      warnings: []
    }
  }

  const firstSystemIndex = safeMessages.findIndex((message) => message?.role === 'system')
  const restMessages = safeMessages.filter((_, index) => index !== firstSystemIndex)
  const maxSystemChars = Math.max(280, Math.floor(safeMaxChars * 0.2))

  let systemMessage = null
  let systemChars = 0
  let systemClipped = false

  if (firstSystemIndex >= 0) {
    const clippedSystem = clipMessageContent(safeMessages[firstSystemIndex], maxSystemChars, false)
    systemMessage = clippedSystem.message
    systemChars = clippedSystem.chars
    systemClipped = clippedSystem.clipped
  }

  const remainingBudget = Math.max(0, safeMaxChars - systemChars)
  const keptReversed = []
  let usedChars = 0
  let tailClipped = false

  for (let index = restMessages.length - 1; index >= 0; index -= 1) {
    const message = restMessages[index]
    const messageChars = extractTextContent(message?.content).length

    if (!messageChars) {
      keptReversed.push(message)
      continue
    }

    if (usedChars + messageChars <= remainingBudget) {
      keptReversed.push(message)
      usedChars += messageChars
      continue
    }

    const room = remainingBudget - usedChars
    if (room >= MIN_CLIP_CHARS) {
      const clipped = clipMessageContent(message, room, message?.role !== 'system')
      keptReversed.push(clipped.message)
      usedChars += clipped.chars
      tailClipped = tailClipped || clipped.clipped
    }

    break
  }

  let budgetedMessages = keptReversed.reverse()
  if (systemMessage) {
    budgetedMessages = [systemMessage, ...budgetedMessages]
  }

  if (!budgetedMessages.length && safeMessages.length) {
    const fallbackMessage = clipMessageContent(safeMessages[safeMessages.length - 1], safeMaxChars, true)
    budgetedMessages = [fallbackMessage.message]
    tailClipped = tailClipped || fallbackMessage.clipped
  }

  const finalStats = collectInputStats(budgetedMessages)
  const truncatedInput =
    finalStats.totalChars < originalStats.totalChars ||
    budgetedMessages.length < safeMessages.length ||
    systemClipped ||
    tailClipped

  const warnings = truncatedInput
    ? [`输入过长，已按 ${safeMaxChars} 字符预算截断历史上下文`] : []

  return {
    messages: budgetedMessages,
    truncatedInput,
    droppedMessages: Math.max(0, safeMessages.length - budgetedMessages.length),
    originalStats,
    finalStats,
    warnings
  }
}

export async function handleGenerateRequest(req, res) {
  const {
    messages,
    character,
    worldId,
    max_tokens,
    temperature,
    response_format,
    userId,
    mem0ApiKey,
    mem0Host,
    retryCount,
    max_input_chars,
    request_id
  } = req.body || {}

  if (!messages || !Array.isArray(messages)) {
    return sendApiError(res, 400, 'BAD_REQUEST_MESSAGES_REQUIRED', 'messages array is required')
  }

  const inferredRetryCount = inferRetryCountFromMessages(messages)
  const effectiveRetryCount = Math.max(0, Math.floor(toFiniteNumber(retryCount, inferredRetryCount)))
  const maxInputChars = Math.max(
    1200,
    Math.floor(toFiniteNumber(max_input_chars, process.env.GENERATE_MAX_INPUT_CHARS || DEFAULT_MAX_INPUT_CHARS))
  )
  const budgetedInput = applyInputBudget(messages, maxInputChars)
  const budgetWarnings = [...budgetedInput.warnings]
  const requestId = typeof request_id === 'string' && request_id.trim()
    ? request_id.trim()
    : `gen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

  // 统一模型路由（2026-10-08 直连退役）：内容生成一律走内核，请求体里的 provider/baseUrl/apiKey 不再决定通路。
  const routing = await resolveModelRouting()
  if (routing.mode === 'none') {
    return sendApiError(
      res,
      400,
      'API_KEY_REQUIRED',
      MODEL_ROUTING_ERROR_MESSAGE,
      null,
      {
        requestId,
        retryCount: effectiveRetryCount,
        truncatedInput: budgetedInput.truncatedInput,
        droppedMessages: budgetedInput.droppedMessages,
        inputChars: budgetedInput.finalStats.totalChars,
        inputCharsOriginal: budgetedInput.originalStats.totalChars,
        warnings: budgetWarnings,
        maxInputChars
      }
    )
  }

  let responseMeta = {
    requestId,
    retryCount: effectiveRetryCount,
    truncatedInput: budgetedInput.truncatedInput,
    droppedMessages: budgetedInput.droppedMessages,
    inputChars: budgetedInput.finalStats.totalChars,
    inputCharsOriginal: budgetedInput.originalStats.totalChars,
    messageCount: budgetedInput.finalStats.messageCount,
    messageCountOriginal: budgetedInput.originalStats.messageCount,
    warnings: budgetWarnings,
    maxInputChars
  }

  const generationAbort = new AbortController()
  let requestTimedOut = false
  const abortDisconnected = () => {
    if (!res.writableEnded) generationAbort.abort(new Error('client-disconnected'))
  }
  req.once?.('aborted', abortDisconnected)
  res.once?.('close', abortDisconnected)
  if (req.aborted || res.destroyed) abortDisconnected()
  const generationTimeout = setTimeout(() => {
    requestTimedOut = true
    generationAbort.abort(new Error('generation-timeout'))
  }, Math.max(1000, Math.min(120000, toFiniteNumber(req.body?.timeout_ms, 60000))))
  generationTimeout.unref?.()
  try {
    let systemPrompt = `你是一个文字冒险游戏的Narrator（旁白/主持人）。请根据用户的行动生成生动、有趣的剧情描述。

规则：
- 用中文回复
- 回复应该简洁但有画面感（50-150字）
- 描述环境、动作、对话和情感
- 适当的悬念和情节推进
- 遇到模糊的行动请求，请发挥想象力推进剧情

`

    if (character) {
      systemPrompt += `
角色信息：
- 名字：${character.name || '未知'}
- 描述：${character.description || '无'}
- 性格：${character.personality || '无'}
- 招呼语：${character.greeting || '无'}
`
    }

    if (worldId) {
      systemPrompt += `
世界设定：${worldId}
`
    }

    let memoryPrompt = ''
    const memoryQuery = extractLatestUserQuery(budgetedInput.messages)
    if (userId && memoryQuery) {
      const memoryResults = await memoryService.search({
        userId,
        query: memoryQuery,
        topK: 5,
        apiKey: mem0ApiKey,
        host: mem0Host
      })
      memoryPrompt = buildMemoryPrompt(memoryService.formatResults(memoryResults, 5))
    }

    const hasClientSystemPrompt = budgetedInput.messages.some((m) => m?.role === 'system')
    const systemPromptBlocks = []

    if (!hasClientSystemPrompt) {
      systemPromptBlocks.push(systemPrompt)
    }

    if (memoryPrompt) {
      systemPromptBlocks.push(memoryPrompt)
    }

    // 系统内容单独抽取交给内核折叠（部分网关不兼容独立 system 轮）。
    const clientSystemPrompt = budgetedInput.messages
      .filter((message) => message?.role === 'system')
      .map((message) => extractTextContent(message?.content))
      .filter(Boolean)
      .join('\n\n')
    if (clientSystemPrompt) {
      systemPromptBlocks.unshift(clientSystemPrompt)
    }
    const normalizedMessages = budgetedInput.messages
      .filter((message) => message?.role !== 'system')
      .map(m => ({
        role: m.role,
        content: m.content
      }))

    let mergedSystemPrompt = systemPromptBlocks.join('\n\n').trim()
    const maxSystemPromptChars = Math.max(120, Math.floor(maxInputChars * 0.2))

    if (mergedSystemPrompt.length > maxSystemPromptChars) {
      mergedSystemPrompt = mergedSystemPrompt.slice(0, maxSystemPromptChars)
      budgetWarnings.push(`系统提示词过长，已截断到 ${maxSystemPromptChars} 字符`)
    }

    const messageChars = collectInputStats(normalizedMessages).totalChars
    const allowedSystemChars = Math.max(0, maxInputChars - messageChars)
    if (mergedSystemPrompt && mergedSystemPrompt.length > allowedSystemChars) {
      if (allowedSystemChars >= MIN_CLIP_CHARS) {
        mergedSystemPrompt = mergedSystemPrompt.slice(0, allowedSystemChars)
        budgetWarnings.push('系统提示词已进一步压缩，以满足输入预算')
      } else {
        mergedSystemPrompt = ''
        budgetWarnings.push('输入预算紧张，已跳过附加系统提示词')
      }
    }

    const composedMessages = mergedSystemPrompt
      ? [{ role: 'system', content: mergedSystemPrompt }, ...normalizedMessages]
      : normalizedMessages

    responseMeta = {
      requestId,
      retryCount: effectiveRetryCount,
      truncatedInput: budgetedInput.truncatedInput || budgetWarnings.length > 0,
      droppedMessages: budgetedInput.droppedMessages,
      inputChars: collectInputStats(composedMessages).totalChars,
      inputCharsOriginal: budgetedInput.originalStats.totalChars,
      messageCount: composedMessages.length,
      messageCountOriginal: budgetedInput.originalStats.messageCount,
      warnings: [...new Set(budgetWarnings)],
      maxInputChars
    }

    const declaredMaxTokens = Number.isFinite(Number(max_tokens)) ? Math.max(1, Math.floor(Number(max_tokens))) : null
    const effectiveTemperature = toFiniteNumber(temperature, DEFAULT_TEMPERATURE)

    // 内容生成统一经内核漏斗（2026-10-08 直连退役：不再有自带 key 直连路径）。
    try {
      const result = await forwardComplete({
        ...(mergedSystemPrompt ? { systemPrompt: mergedSystemPrompt } : {}),
        messages: normalizedMessages.map((message) => ({ role: message.role, content: typeof message.content === 'string' ? message.content : extractTextContent(message.content) })),
        ...(declaredMaxTokens ? { maxTokens: declaredMaxTokens } : {}),
        temperature: effectiveTemperature,
        ...(response_format?.type === 'json_object' ? { responseFormat: 'json_object' } : {}),
        timeoutMs: Math.max(1000, Math.min(120000, toFiniteNumber(req.body?.timeout_ms, 60000)))
      }, { signal: generationAbort.signal })
      if (!String(result.content || '').trim()) {
        // 20261008 分档（docs/plan/legacy-feature-regression-findings-20261008.md 问题二 / R4）：
        // 思考型上游（如 dots3-note-prev）把输出预算耗在推理上时正文为空、finishReason=length，
        // 与「正常结束但正文为空」根因不同，分两档报错并透出 finishReason/usage，便于区分与调预算。
        // 分档形状参照 server/services/textModelAgentProvider.js 的空内容/截断/纯思考先例。
        if (result.finishReason === 'length') {
          return sendApiError(res, 502, 'UPSTREAM_REASONING_ONLY', '思考型模型把预算耗在推理上，正文为空——请提高 max_tokens 或更换模型', { via: 'kit', model: result.model, finishReason: result.finishReason, usage: result.usage }, responseMeta)
        }
        return sendApiError(res, 502, 'UPSTREAM_EMPTY_CONTENT', '上游模型返回为空内容', { via: 'kit', model: result.model, finishReason: result.finishReason, usage: result.usage }, responseMeta)
      }
      return res.json({ content: result.content, meta: { ...responseMeta, viaKit: true, model: result.model } })
    } catch (kitError) {
      if (generationAbort.signal.aborted) {
        if (!requestTimedOut || res.destroyed) return
        return sendApiError(res, 504, 'GENERATION_TIMEOUT', '生成超时，请稍后重试', null, responseMeta)
      }
      return sendApiError(res, 502, 'UPSTREAM_REQUEST_FAILED', `kit 漏斗请求失败：${kitError?.message || kitError}`, null, responseMeta)
    }
  } catch (e) {
    if (generationAbort.signal.aborted) {
      if (!requestTimedOut || res.destroyed) return
      return sendApiError(res, 504, 'GENERATION_TIMEOUT', '生成超时，请稍后重试', null, responseMeta)
    }
    console.error('Chat error:', e)
    const isUpstreamNetworkError =
      e?.name === 'TypeError' &&
      (String(e?.message || '').toLowerCase().includes('fetch failed') || Boolean(e?.cause))

    const errorCode = isUpstreamNetworkError ? 'UPSTREAM_NETWORK_ERROR' : 'INTERNAL_CHAT_ERROR'
    const errorMessage = isUpstreamNetworkError
      ? '上游服务网络请求失败'
      : (e.message || '内部错误')

    return sendApiError(
      res,
      isUpstreamNetworkError ? 502 : 500,
      errorCode,
      errorMessage,
      null,
      responseMeta
    )
  } finally {
    clearTimeout(generationTimeout)
    req.off?.('aborted', abortDisconnected)
    res.off?.('close', abortDisconnected)
  }
}

router.post('/chat', handleGenerateRequest)

// Streaming endpoint for real-time text generation
router.post('/stream', async (req, res) => {
  const {
    messages,
    character,
    worldId,
    max_tokens,
    temperature,
    userId,
    mem0ApiKey,
    mem0Host,
    max_input_chars,
    request_id
  } = req.body || {}

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' })
  }

  const maxInputChars = Math.max(
    1200,
    Math.floor(toFiniteNumber(max_input_chars, process.env.GENERATE_MAX_INPUT_CHARS || DEFAULT_MAX_INPUT_CHARS))
  )
  const budgetedInput = applyInputBudget(messages, maxInputChars)
  const budgetWarnings = [...budgetedInput.warnings]
  const requestId = typeof request_id === 'string' && request_id.trim()
    ? request_id.trim()
    : `gen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

  // 统一模型路由（2026-10-08 直连退役）：内容生成一律走内核，请求体里的 provider/baseUrl/apiKey 不再决定通路。
  const routing = await resolveModelRouting()
  if (routing.mode === 'none') {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.write(`data: ${JSON.stringify({ error: 'api_key_required', code: 'API_KEY_REQUIRED', message: MODEL_ROUTING_ERROR_MESSAGE })}\n\n`)
    return res.end()
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const upstreamController = new AbortController()
  const abortUpstream = () => {
    if (!res.writableEnded) upstreamController.abort()
  }
  req.once('aborted', abortUpstream)
  res.once('close', abortUpstream)

  try {
    // 记忆注入
    let memoryPrompt = ''
    const memoryQuery = extractLatestUserQuery(budgetedInput.messages)
    const effectiveMem0ApiKey = mem0ApiKey
    const effectiveMem0Host = mem0Host || DEFAULT_MEM0_HOST

    if (userId && memoryQuery && effectiveMem0ApiKey) {
      try {
        const memoryResults = await memoryService.search({
          userId,
          query: memoryQuery,
          topK: 5,
          apiKey: effectiveMem0ApiKey,
          host: effectiveMem0Host
        })
        memoryPrompt = buildMemoryPrompt(memoryService.formatResults(memoryResults, 5))
      } catch (e) {
        console.warn('[stream] Memory search failed:', e.message)
      }
    }

    let systemPrompt = `你是一个文字冒险游戏的Narrator（旁白/主持人）。请根据用户的行动生成生动、有趣的剧情描述。

规则：
- 用中文回复
- 回复应该简洁但有画面感（50-150字）
- 描述环境、动作、对话和情感
- 适当的悬念和情节推进
- 遇到模糊的行动请求，请发挥想象力推进剧情

`

    if (character) {
      systemPrompt += `
角色信息：
- 名字：${character.name || '未知'}
- 描述：${character.description || '无'}
- 性格：${character.personality || '无'}
- 招呼语：${character.greeting || '无'}
`
    }

    if (worldId) {
      systemPrompt += `
世界设定：${worldId}
`
    }

    const clientSystemPrompt = budgetedInput.messages
      .filter((message) => message?.role === 'system')
      .map((message) => extractTextContent(message?.content))
      .filter(Boolean)
      .join('\n\n')
    const systemPromptBlocks = []

    if (clientSystemPrompt) {
      systemPromptBlocks.push(clientSystemPrompt)
    } else {
      systemPromptBlocks.push(systemPrompt)
    }

    // 添加记忆上下文
    if (memoryPrompt) {
      systemPromptBlocks.push(memoryPrompt)
    }

    const normalizedMessages = budgetedInput.messages
      .filter((message) => message?.role !== 'system')
      .map(m => ({
        role: m.role,
        content: m.content
      }))

    let mergedSystemPrompt = systemPromptBlocks.join('\n\n').trim()
    const maxSystemPromptChars = Math.max(120, Math.floor(maxInputChars * 0.2))

    if (mergedSystemPrompt.length > maxSystemPromptChars) {
      mergedSystemPrompt = mergedSystemPrompt.slice(0, maxSystemPromptChars)
      budgetWarnings.push(`系统提示词过长，已截断到 ${maxSystemPromptChars} 字符`)
    }

    const messageChars = collectInputStats(normalizedMessages).totalChars
    const allowedSystemChars = Math.max(0, maxInputChars - messageChars)
    if (mergedSystemPrompt && mergedSystemPrompt.length > allowedSystemChars) {
      if (allowedSystemChars >= MIN_CLIP_CHARS) {
        mergedSystemPrompt = mergedSystemPrompt.slice(0, allowedSystemChars)
        budgetWarnings.push('系统提示词已进一步压缩，以满足输入预算')
      } else {
        mergedSystemPrompt = ''
        budgetWarnings.push('输入预算紧张，已跳过附加系统提示词')
      }
    }

    // 20261008 预算裁定：同非流式——未声明不透传，交内核缺省（4096）。
    const declaredMaxTokens = Number.isFinite(Number(max_tokens)) ? Math.max(1, Math.floor(Number(max_tokens))) : null
    const effectiveTemperature = toFiniteNumber(temperature, DEFAULT_TEMPERATURE)

    // 内容生成统一经内核漏斗（2026-10-08 直连退役）：重播为既有 {content} SSE 帧。
    try {
      await forwardCompleteStream({
        ...(mergedSystemPrompt ? { systemPrompt: mergedSystemPrompt } : {}),
        messages: normalizedMessages.map((message) => ({ role: message.role, content: typeof message.content === 'string' ? message.content : extractTextContent(message.content) })),
        ...(declaredMaxTokens ? { maxTokens: declaredMaxTokens } : {}),
        temperature: effectiveTemperature,
        timeoutMs: 120000
      }, (delta) => {
        if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify({ content: delta })}\n\n`)
      }, { signal: upstreamController.signal })
      if (!res.writableEnded && !res.destroyed) res.write('data: [DONE]\n\n')
      return res.end()
    } catch (kitError) {
      if (!res.writableEnded && !res.destroyed) {
        res.write(`data: ${JSON.stringify({ error: `kit 漏斗请求失败：${kitError?.message || kitError}` })}\n\n`)
        res.write('data: [DONE]\n\n')
        return res.end()
      }
      return
    }
  } catch (e) {
    if (upstreamController.signal.aborted || res.writableEnded || res.destroyed) return
    console.error('Stream error:', e)
    res.write(`data: ${JSON.stringify({ error: e.message || '内部错误' })}\n\n`)
    res.end()
  } finally {
    req.removeListener('aborted', abortUpstream)
    res.removeListener('close', abortUpstream)
  }
})

// 模型选择通道（2026-10-08 直连退役的边界例外，有意直连）：用户在设置面板主动拉取模型列表，
// 用其当前输入的 baseUrl/apiKey 直连渠道；不参与内容生成、不产出内容，密钥不落任何存储。
// Fetch available models from API URL
router.post('/models', async (req, res) => {
  const { baseUrl, apiKey, provider } = req.body
  const effectiveBaseUrl = resolveBaseUrl(provider, baseUrl, '')
  const effectiveApiKey = String(apiKey || '').trim()

  if (!effectiveBaseUrl) {
    return res.status(400).json({ error: 'baseUrl is required' })
  }

  try {
    const headers = {}
    if (effectiveApiKey) {
      headers['Authorization'] = `Bearer ${effectiveApiKey}`
    }

    // Different providers use different endpoints for model lists
    let modelsUrl = effectiveBaseUrl

    if (provider === 'ollama') {
      modelsUrl = `${baseUrl}/api/tags`
      const response = await fetch(modelsUrl, { redirect: 'error', headers })
      if (response.ok) {
        const data = await response.json()
        const models = (data.models || []).map(m => m.name || m.model)
        return res.json({ models })
      }
    } else if (provider === 'lmstudio') {
      modelsUrl = `${baseUrl}/models`
      const response = await fetch(modelsUrl, { redirect: 'error', headers })
      if (response.ok) {
        const data = await response.json()
        const models = (data.data || []).map(m => m.id)
        return res.json({ models })
      }
    } else {
      // Standard OpenAI-compatible /models endpoint
      if (!modelsUrl.endsWith('/models')) {
        modelsUrl = `${modelsUrl.replace(/\/$/, '')}/models`
      }
      const response = await fetch(modelsUrl, { redirect: 'error', headers })

      if (response.ok) {
        const data = await response.json()
        const models = (data.data || []).map(m => m.id)
        return res.json({ models })
      }
    }

    // Try alternative endpoints
    const altUrls = [
      `${effectiveBaseUrl}/v1/models`,
      `${effectiveBaseUrl}/models`,
      `${effectiveBaseUrl}/api/models`
    ]

    for (const url of altUrls) {
      try {
        const response = await fetch(url, { redirect: 'error', headers })
        if (response.ok) {
          const data = await response.json()
          let models = []

          if (Array.isArray(data)) {
            models = data.map(m => m.id || m.name || m)
          } else if (data.data) {
            models = data.data.map(m => m.id || m.name)
          } else if (data.models) {
            models = data.models.map(m => m.id || m.name || m)
          }

          if (models.length > 0) {
            return res.json({ models })
          }
        }
      } catch (e) {
        continue
      }
    }

    return res.status(404).json({ error: 'Could not fetch models', models: [] })
  } catch (e) {
    console.error('Models fetch error:', e)
    res.status(500).json({ error: e.message, models: [] })
  }
})

// 模型选择通道（同 /models，有意直连）：用户主动点「测试连接」时用其当前配置直连验证可用性；
// 内容生成路径不经过这里（生成统一走内核漏斗）。
// Test connection endpoint
router.post('/test', async (req, res) => {
  const { baseUrl, apiKey, provider, model, format } = req.body
  const effectiveBaseUrl = resolveBaseUrl(provider, baseUrl, '')
  const effectiveApiKey = String(apiKey || '').trim()

  if (!effectiveBaseUrl) {
    return res.json({ ok: false, message: '请输入 Base URL' })
  }
  if (!effectiveApiKey) {
    return res.json({ ok: false, message: '请输入 API Key' })
  }
  if (!String(model || '').trim()) return res.json({ ok: false, message: '请输入模型名称' })

  const result = await probeNarrativeProviderCapabilities({
    id: provider,
    baseUrl: effectiveBaseUrl,
    apiKey: effectiveApiKey,
    model,
    format
  })
  const structured = await probeStructuredProviderCapabilities({
    id: provider,
    baseUrl: effectiveBaseUrl,
    apiKey: effectiveApiKey,
    model,
    format
  })
  const textOk = Boolean(result.text?.ok && result.text?.responseText)
  const toolOk = Boolean(result.tool?.validCall)
  const roundTripOk = Boolean(result.roundTrip?.terminal)
  const message = [
    textOk ? '文本可用' : '文本不可用',
    toolOk ? '工具调用可用' : '工具调用未通过',
    roundTripOk ? '工具结果往返可用' : '工具结果往返未通过',
    structured.available ? `结构化设定可用（${structured.mode}）` : '结构化设定不可用'
  ].join('；')
  return res.json({
    ok: textOk,
    message,
    capabilities: result.capabilities,
    probe: {
      text: result.text,
      tool: result.tool,
      roundTrip: result.roundTrip
    },
    structured
  })
})

router.post('/mem0/test', async (req, res) => {
  const { apiKey, host, userId } = req.body || {}
  const effectiveApiKey = String(apiKey || '').trim()
  const effectiveHost = String(host || DEFAULT_MEM0_HOST).trim()

  if (!effectiveApiKey) {
    return res.json({ ok: false, message: '请先输入 Mem0 API Key' })
  }

  const apiUrl = normalizeMem0ApiUrl(effectiveHost)
  const testUserId = String(userId || 'connection_test').trim() || 'connection_test'

  try {
    const params = new URLSearchParams({
      query: '连接测试',
      user_id: testUserId,
      limit: '1'
    })
    const response = await fetch(`${apiUrl}/memories?${params}`, { redirect: 'error',
      headers: {
        Authorization: `Token ${effectiveApiKey}`
      }
    })

    if (response.ok) {
      return res.json({ ok: true, message: '记忆连接成功' })
    }

    return res.json({
      ok: false,
      message: `记忆连接失败 (${response.status})，请检查 Mem0 API Key 和 Host。`
    })
  } catch (e) {
    logMem0ProxyError('test', e)
    return res.json({
      ok: false,
      message: '记忆连接失败，请检查网络和配置。'
    })
  }
})

// Mem0 proxy: write memory
router.post('/mem0/memories', async (req, res) => {
  const { apiKey, host, userId, messages, metadata } = req.body || {}
  const effectiveApiKey = String(apiKey || '').trim()
  const effectiveHost = String(host || DEFAULT_MEM0_HOST).trim()
  const effectiveUserId = String(userId || '').trim() || 'default_user'

  if (!effectiveApiKey) {
    return res.json({ success: false, error: 'mem0 not configured' })
  }

  const apiUrl = normalizeMem0ApiUrl(effectiveHost)
  try {
    const response = await fetch(`${apiUrl.replace('/v1', '/v3')}/memories/add/`, { redirect: 'error',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${effectiveApiKey}`
      },
      body: JSON.stringify({ messages, user_id: effectiveUserId, metadata })
    })
    if (!response.ok) {
      throw createMem0UpstreamError(response.status)
    }
    const data = await response.json()
    return res.json({ success: true, data })
  } catch (e) {
    logMem0ProxyError('store', e)
    return res.json({ success: false, error: getMem0ClientError(e) })
  }
})

// Mem0 proxy: search memories
router.post('/mem0/search', async (req, res) => {
  const { apiKey, host, userId, query, limit, metadataFilter } = req.body || {}
  const effectiveApiKey = String(apiKey || '').trim()
  const effectiveHost = String(host || DEFAULT_MEM0_HOST).trim()
  const effectiveUserId = String(userId || '').trim() || 'default_user'

  if (!effectiveApiKey) {
    return res.json({ success: false, error: 'mem0 not configured' })
  }

  const apiUrl = normalizeMem0ApiUrl(effectiveHost)
  try {
    const body = {
      query: String(query || ''),
      user_id: effectiveUserId,
      output_format: 'v1.1'
    }
    if (limit) body.limit = Number(limit)
    if (metadataFilter && typeof metadataFilter === 'object' && Object.keys(metadataFilter).length > 0) {
      body.filters = metadataFilter
    }

    const response = await fetch(`${apiUrl.replace('/v1', '/v3')}/memories/search/`, { redirect: 'error',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${effectiveApiKey}`
      },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      throw createMem0UpstreamError(response.status)
    }
    const data = await response.json()
    return res.json({ success: true, data })
  } catch (e) {
    logMem0ProxyError('search', e)
    return res.json({ success: false, error: getMem0ClientError(e) })
  }
})

// Mem0 proxy: delete memory
router.post('/mem0/delete', async (req, res) => {
  const { apiKey, host, memoryId } = req.body || {}
  const effectiveApiKey = String(apiKey || '').trim()
  const effectiveHost = String(host || DEFAULT_MEM0_HOST).trim()

  if (!effectiveApiKey) {
    return res.json({ success: false, error: 'mem0 not configured' })
  }

  if (!memoryId) {
    return res.json({ success: false, error: 'memoryId required' })
  }

  const apiUrl = normalizeMem0ApiUrl(effectiveHost)
  try {
    const response = await fetch(`${apiUrl}/memories/${encodeURIComponent(memoryId)}/`, { redirect: 'error',
      method: 'DELETE',
      headers: { Authorization: `Token ${effectiveApiKey}` }
    })
    if (!response.ok) {
      throw createMem0UpstreamError(response.status)
    }
    return res.json({ success: true })
  } catch (e) {
    logMem0ProxyError('delete', e)
    return res.json({ success: false, error: getMem0ClientError(e) })
  }
})

export default router
