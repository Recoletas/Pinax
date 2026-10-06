// 统一模型漏斗网关：内置（服务器密钥）配置的文本模型调用统一转发到 kit 任务面 /v1/pinax/complete。
// 门控语义：只有「服务器密钥」配置（浏览器 key 为空或 sentinel，且 baseUrl 是 MiniMax 官方域——
// 与 shared/textModelKeys.js resolveTextApiKey 的注入语义一致）才走漏斗；自带 key 的自定义配置保持直连，零变化。
// 可用性探测带 5s 缓存；任务面不可达时调用方回落直连原路径（与 storyagent 代理的 fail-open 设计一致）。
const TASK_PLANE_ENDPOINT = process.env.PINAX_ADAPTER_ENDPOINT || 'http://127.0.0.1:8451'
const MINIMAX_OFFICIAL_HOSTS = new Set(['api.minimaxi.com', 'api.minimax.io', 'api.minimax.chat'])
const SENTINEL = 'minimax-server-key'

let availabilityCache = { ok: false, checkedAt: 0 }

export function isServerKeyedTextConfig(config = {}) {
  const apiKey = String(config.apiKey || '').trim()
  const serverKeyed = !apiKey || apiKey === SENTINEL
  if (!serverKeyed) return false
  try {
    const url = new URL(String(config.baseUrl || ''))
    return MINIMAX_OFFICIAL_HOSTS.has(url.hostname) && !url.username && !url.port && !url.search
  } catch {
    return false
  }
}

export async function kitFunnelAvailable({ force = false } = {}) {
  const now = Date.now()
  if (!force && now - availabilityCache.checkedAt < 5000) return availabilityCache.ok
  let ok = false
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2000)
    const response = await fetch(new URL('/model', TASK_PLANE_ENDPOINT), { signal: controller.signal })
    clearTimeout(timer)
    ok = response.ok
  } catch { ok = false }
  availabilityCache = { ok, checkedAt: now }
  return ok
}

export function invalidateKitFunnelCache() {
  availabilityCache = { ok: false, checkedAt: 0 }
}

/** 一次性补全转发。返回 { ok, content, toolCalls, finishReason, usage, model }；上游失败抛错（code: KIT_COMPLETE_FAILED）。 */
export async function forwardComplete(payload, { timeoutMs = 120_000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(new URL('/v1/pinax/complete', TASK_PLANE_ENDPOINT), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
    const body = await response.json().catch(() => null)
    if (!response.ok || body?.ok !== true) {
      throw Object.assign(new Error(body?.message || `kit complete failed (${response.status})`), { code: 'KIT_COMPLETE_FAILED' })
    }
    return body
  } finally {
    clearTimeout(timer)
  }
}

/** 流式补全转发：onDelta(content) 增量回调；resolve 为完整结果（与 forwardComplete 同形状，toolCalls 恒空）。 */
export async function forwardCompleteStream(payload, onDelta, { timeoutMs = 180_000 } = {}) {  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(new URL('/v1/pinax/complete/stream', TASK_PLANE_ENDPOINT), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
    if (!response.ok || !response.body) {
      throw Object.assign(new Error(`kit complete stream failed (${response.status})`), { code: 'KIT_COMPLETE_FAILED' })
    }
    const decoder = new TextDecoder()
    let buffer = ''
    let result = { ok: true, content: '', toolCalls: [], finishReason: 'stop', usage: null, model: null }
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true })
      let index = buffer.indexOf('\n\n')
      while (index >= 0) {
        const raw = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 2)
        index = buffer.indexOf('\n\n')
        if (!raw.startsWith('data: ')) continue
        const data = raw.slice(6)
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          if (parsed.error) throw Object.assign(new Error(parsed.error), { code: 'KIT_COMPLETE_FAILED' })
          if (typeof parsed.content === 'string' && parsed.content) {
            result.content += parsed.content
            onDelta?.(parsed.content)
          }
        } catch (error) {
          if (error?.code === 'KIT_COMPLETE_FAILED') throw error
          /* 非 JSON 帧忽略 */
        }
      }
    }
    return result
  } finally {
    clearTimeout(timer)
  }
}

/** 叙事 agent-step 的 kit 漏斗 runner（与 runToolCallingProviderTurn 同返回合同）。
 *  入参 request：generationToolContract 归一化形状 {messages(parts), tools, options, requestId}。
 *  单回合：一次 /complete 转发，tools + toolChoice 透传；浏览器仍拥有工具执行与多回合循环。 */
export async function runKitFunnelProviderTurn(request, { signal } = {}) {
  const messages = (request.messages || []).map((message) => {
    const textParts = (message.parts || []).filter((part) => part.type === 'text').map((part) => part.text || '')
    const toolCalls = (message.parts || []).filter((part) => part.type === 'tool-call').map((part) => ({
      id: String(part.toolCallId || ''),
      name: String(part.toolName || ''),
      arguments: (part.input && typeof part.input === 'object') ? part.input : {}
    }))
    if (message.role === 'tool') {
      const resultPart = (message.parts || []).find((part) => part.type === 'tool-result')
      return {
        role: 'tool',
        toolCallId: String(resultPart?.toolCallId || message.toolCallId || ''),
        toolName: String(resultPart?.toolName || message.toolName || ''),
        output: typeof resultPart?.output === 'string' ? resultPart.output : JSON.stringify(resultPart?.output ?? ''),
        isError: resultPart?.isError === true
      }
    }
    return {
      role: message.role,
      content: textParts.join('\n'),
      ...(message.role === 'assistant' && toolCalls.length ? { toolCalls } : {})
    }
  }).filter((message) => message.role !== 'assistant' || message.content || message.toolCalls?.length)
  const toolChoice = request.options?.toolChoice
  const mappedToolChoice = toolChoice === 'auto' || toolChoice === 'none' || (toolChoice && typeof toolChoice === 'object')
    ? toolChoice
    : (toolChoice === 'required' || toolChoice === 'any') && request.tools?.length
      ? { type: 'function', function: { name: request.tools[0].name } }
      : undefined
  const payload = {
    messages,
    ...(request.tools?.length ? { tools: request.tools.map((tool) => ({ name: tool.name, description: tool.description || '', parameters: tool.parameters || { type: 'object', properties: {} } })) } : {}),
    ...(mappedToolChoice ? { toolChoice: mappedToolChoice } : {}),
    ...(Number.isFinite(Number(request.options?.maxTokens)) ? { maxTokens: Number(request.options.maxTokens) } : {}),
    ...(Number.isFinite(Number(request.options?.temperature)) ? { temperature: Number(request.options.temperature) } : {}),
    ...(request.options?.thinking ? { thinking: request.options.thinking } : {}),
    ...(request.requestId ? {} : {})
  }
  try {
    const result = await forwardComplete(payload, { timeoutMs: Number(request.options?.timeoutMs) || 100_000 })
    const calls = (result.toolCalls || []).map((call, index) => ({
      id: call.id || `call_${index + 1}`,
      name: call.name,
      arguments: call.arguments && typeof call.arguments === 'object' ? call.arguments : {}
    }))
    return {
      kind: calls.length ? 'tool_calls' : 'final_ready',
      calls,
      text: calls.length ? '' : String(result.content || ''),
      usage: result.usage ? { inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0, totalTokens: result.usage.totalTokens ?? 0 } : { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      finishReason: result.finishReason || (calls.length ? 'tool_calls' : 'stop')
    }
  } catch (error) {
    if (signal?.aborted) throw Object.assign(new Error('kit funnel aborted'), { code: 'NARRATIVE_PROVIDER_ABORTED' })
    throw Object.assign(new Error(error?.message || 'kit funnel 转发失败'), {
      code: error?.code === 'KIT_COMPLETE_FAILED' ? 'NARRATIVE_PROVIDER_UPSTREAM_FAILED' : (error?.code || 'NARRATIVE_PROVIDER_NETWORK_FAILED'),
      retryable: true
    })
  }
}

/** structured 生成专用：kit 漏斗版 fetchImpl——拦截 structuredOutputAdapter 的上游请求，
 *  经 forwardComplete 执行后合成 OpenAI 形状响应。runner/模式/降级逻辑零改动（受同款 builtin 门控）。 */
export function createKitFunnelFetchImpl() {
  return async function kitFunnelFetch(_url, init = {}) {
    let body = {}
    try { body = JSON.parse(init.body || '{}') } catch { body = {} }
    const messages = (body.messages || []).map((message) => ({
      role: message.role,
      content: typeof message.content === 'string'
        ? message.content
        : Array.isArray(message.content)
          ? message.content.map((block) => (typeof block === 'string' ? block : (block?.text || ''))).join('\n')
          : ''
    }))
    const tools = (body.tools || []).map((tool) => ({
      name: tool.function?.name || tool.name || '',
      description: tool.function?.description || tool.description || '',
      parameters: tool.function?.parameters || tool.input_schema || tool.parameters || { type: 'object', properties: {} }
    }))
    const toolChoice = body.tool_choice === 'any' && tools.length
      ? { type: 'function', function: { name: tools[0].name } }
      : body.tool_choice
    const result = await forwardComplete({
      ...(body.system ? { systemPrompt: body.system } : {}),
      messages,
      ...(tools.length ? { tools } : {}),
      ...(toolChoice ? { toolChoice } : {}),
      ...(Number.isFinite(Number(body.max_tokens)) ? { maxTokens: Number(body.max_tokens) } : {}),
      ...(Number.isFinite(Number(body.temperature)) ? { temperature: Number(body.temperature) } : {}),
      ...(body.response_format?.type === 'json_object' ? { responseFormat: 'json_object' } : {}),
      timeoutMs: 120000
    })
    const toolCalls = (result.toolCalls || []).map((call, index) => ({
      id: call.id || `call_${index + 1}`,
      type: 'function',
      function: { name: call.name, arguments: typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments || {}) }
    }))
    const payload = {
      choices: [{
        message: { role: 'assistant', content: result.content || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) },
        finish_reason: toolCalls.length ? 'tool_calls' : (result.finishReason === 'length' ? 'length' : 'stop')
      }],
      usage: {
        prompt_tokens: result.usage?.inputTokens ?? 0,
        completion_tokens: result.usage?.outputTokens ?? 0,
        total_tokens: result.usage?.totalTokens ?? 0
      }
    }
    return { ok: true, status: 200, json: async () => payload }
  }
}
