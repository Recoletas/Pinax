// 统一模型漏斗网关：文本模型调用统一转发到 kit 任务面 /v1/pinax/complete（内核持有模型与密钥）；
// 结构化生成（W1-1 试点）另有 capability 版 fetchImpl——把单发结构化生成改为 kit 任务面 capability 任务
// （agent 循环与强制提交归 kit 持有），失败回落漏斗直连（双层 fail-open）。
// 可用性探测带 5s 缓存；任务面不可达时调用方给出统一"未检测到可用模型"错误（2026-10-08 直连退役）。
import { KIT_TASK_PLANE_ENDPOINT } from '../../shared/kitTaskPlane.js'
import { capabilityPlaneAvailable, submitCapabilityTask } from './capabilityTaskRunner.js'

const TASK_PLANE_ENDPOINT = process.env.PINAX_ADAPTER_ENDPOINT || KIT_TASK_PLANE_ENDPOINT

let availabilityCache = { ok: false, checkedAt: 0 }

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

/** 把独立系统提示折进首个 user 轮，并剔除 messages 里的 system 角色。
 *  部分 OpenAI 兼容网关（如 dots3-note-prev）遇到单独 system 轮直接返回空补全（usage 全 0、finishReason=error），
 *  折进用户轮后对所有网关都安全。forwardComplete / forwardCompleteStream 统一在此收敛，覆盖 chat / agent / 结构化全部漏斗调用方。 */
function foldSystemIntoPrompt(payload) {
  const systemText = String(payload?.systemPrompt || '').trim()
  const source = Array.isArray(payload?.messages) ? payload.messages : []
  const systemInMessages = source.filter((message) => message?.role === 'system' && String(message.content || '').trim()).map((message) => String(message.content).trim())
  const lead = [systemText, ...systemInMessages].filter(Boolean).join('\n\n')
  const messages = source.filter((message) => message?.role !== 'system').map((message) => ({ ...message }))
  if (!lead) return messages === source ? payload : { ...payload, messages }
  const firstUser = messages.find((message) => message.role === 'user')
  if (firstUser) firstUser.content = `${lead}\n\n${firstUser.content}`.trim()
  else messages.unshift({ role: 'user', content: lead })
  const { systemPrompt, ...rest } = payload
  return { ...rest, messages }
}

/** 一次性补全转发。返回 { ok, content, toolCalls, finishReason, usage, model }；上游失败抛错（code: KIT_COMPLETE_FAILED）。
 *  signal：调用方（如 chat 的客户端断连）中止时联动中止内核请求。 */
export async function forwardComplete(payload, { timeoutMs = 120_000, signal } = {}) {
  const folded = foldSystemIntoPrompt(payload)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort(signal?.reason)
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  try {
    const response = await fetch(new URL('/v1/pinax/complete', TASK_PLANE_ENDPOINT), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(folded),
      signal: controller.signal
    })
    const body = await response.json().catch(() => null)
    if (!response.ok || body?.ok !== true) {
      throw Object.assign(new Error(body?.message || `kit complete failed (${response.status})`), { code: 'KIT_COMPLETE_FAILED' })
    }
    return body
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** 流式补全转发：onDelta(content) 增量回调；resolve 为完整结果（与 forwardComplete 同形状，toolCalls 恒空）。 */
export async function forwardCompleteStream(payload, onDelta, { timeoutMs = 180_000, signal } = {}) {
  const folded = foldSystemIntoPrompt(payload)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort(signal?.reason)
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  try {
    const response = await fetch(new URL('/v1/pinax/complete/stream', TASK_PLANE_ENDPOINT), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(folded),
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
 *  单回合：一次 /complete 转发，tools + toolChoice 透传；浏览器仍拥有工具执行与多回合循环。
 *  2026-10-08 回归修复（docs/plan/legacy-feature-regression-findings-20261008.md 问题一）：
 *  契约层 content 必填、parts 可选，本网关曾只读 parts——content-only 调用方
 *  （narrativeCritic / authoringRehearsalToolRun / narrativeTaskQuality）静默拿到空提示词。
 *  取文本一律 parts 优先、string content 兜底；assistant 轮 toolCalls 仍只认 parts（契约层 raw.toolCalls 合并维持现状）。 */
export async function runKitFunnelProviderTurn(request, { signal } = {}) {
  const messages = (request.messages || []).map((message) => {
    const textParts = (message.parts || []).filter((part) => part.type === 'text').map((part) => part.text || '')
    const text = textParts.length ? textParts.join('\n') : (typeof message.content === 'string' ? message.content : '')
    const toolCalls = (message.parts || []).filter((part) => part.type === 'tool-call').map((part) => ({
      id: String(part.toolCallId || ''),
      name: String(part.toolName || ''),
      arguments: (part.input && typeof part.input === 'object') ? part.input : {}
    }))
    if (message.role === 'tool') {
      const resultPart = (message.parts || []).find((part) => part.type === 'tool-result')
      const partOutput = resultPart
        ? (typeof resultPart.output === 'string' ? resultPart.output : JSON.stringify(resultPart.output ?? ''))
        : ''
      // tool-result 部件缺失时回退 string content，避免工具结果退化为 '""'
      const output = resultPart
        ? partOutput
        : (typeof message.content === 'string' && message.content ? message.content : JSON.stringify(resultPart?.output ?? ''))
      return {
        role: 'tool',
        toolCallId: String(resultPart?.toolCallId || message.toolCallId || ''),
        toolName: String(resultPart?.toolName || message.toolName || message.name || ''),
        output,
        isError: resultPart?.isError === true
      }
    }
    return {
      role: message.role,
      content: text,
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
  // 20261008 空提示词护栏：组装后若不存在任何正文非空的 user/system 轮，转发只会让模型自由发挥
  // （20261008 回归的现象——不报错、产出与提示词无关的文本）。这是全链路最后一道防线，直接拒绝转发。
  if (!messages.some((message) => (message.role === 'user' || message.role === 'system') && String(message.content || '').trim())) {
    throw Object.assign(new Error('agent-step 组装后所有提示词为空——拒绝转发（20261008 空提示词护栏）'), { code: 'NARRATIVE_AGENT_EMPTY_PROMPT', retryable: false })
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

/** 解析 structuredOutputAdapter 合成的上游请求体（anthropic / openai-responses / openai-chat 三种形状）。
 *  返回系统文本、会话轮、输出 Schema、强制工具名与采样参数；funnel 与 capability 两个 fetchImpl 共用。 */
function parseStructuredAdapterBody(rawBody) {
  let body = {}
  try { body = JSON.parse(rawBody || '{}') } catch { body = {} }
  const flatten = (content) => typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((block) => (typeof block === 'string' ? block : (block?.text || ''))).join('\n')
      : ''
  // 收集全部系统文本（Anthropic 的 top-level system / responses 的 instructions + OpenAI 的 role=system 消息）
  const systemParts = []
  if (typeof body.system === 'string' && body.system.trim()) systemParts.push(body.system.trim())
  if (typeof body.instructions === 'string' && body.instructions.trim()) systemParts.push(body.instructions.trim())
  const turns = []
  const pushTurn = (role, content) => {
    if (role === 'system') { if (content.trim()) systemParts.push(content.trim()); return }
    if (role) turns.push({ role, content })
  }
  for (const message of (Array.isArray(body.messages) ? body.messages : [])) pushTurn(message?.role, flatten(message?.content))
  for (const item of (Array.isArray(body.input) ? body.input : [])) pushTurn(item?.role, flatten(item?.content))
  // 抽取各模式的输出 Schema（内核不保证遵守 native json_schema / forced tool_choice，转为提示词显式约束）
  const schema = body.output_config?.format?.schema
    || body.response_format?.json_schema?.schema
    || body.response_format?.schema
    || body.text?.format?.schema
    || body.tools?.[0]?.function?.parameters
    || body.tools?.[0]?.parameters
    || body.tools?.[0]?.input_schema
    || null
  const forcedTool = Array.isArray(body.tools) && body.tools.length ? body.tools[0] : null
  const maxTokens = Number.isFinite(Number(body.max_tokens))
    ? Number(body.max_tokens)
    : (Number.isFinite(Number(body.max_output_tokens)) ? Number(body.max_output_tokens) : null)
  return {
    body,
    systemParts,
    turns,
    schema,
    toolName: forcedTool ? String(forcedTool.function?.name || forcedTool.name || '') : '',
    maxTokens,
    temperature: Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : null
  }
}

/** 按 structuredOutputAdapter 的三协议读取面合成上游响应。
 *  text-json 模式的请求体不带协议信号（anthropic 与 openai-chat 形状相同），故合成全协议超集——
 *  providerText / finishReason / 工具解析各自只读自己协议的键，多余键无害。 */
function renderStructuredResponse({ content, toolCalls = [], finishReason = 'stop', usage = {} }) {
  const textOut = content || ''
  const truncated = finishReason === 'length'
  const calls = Array.isArray(toolCalls) ? toolCalls : []
  const anthropicBlocks = calls.length
    ? calls.map((call, index) => ({ type: 'tool_use', id: call.id || `toolu_${index + 1}`, name: call.name, input: call.arguments || {} }))
    : [{ type: 'text', text: textOut }]
  const responsesOutput = calls.length
    ? calls.map((call) => ({ type: 'function_call', name: call.name, arguments: typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments || {}) }))
    : [{ type: 'message', content: [{ type: 'output_text', text: textOut }] }]
  const chatToolCalls = calls.map((call, index) => ({
    id: call.id || `call_${index + 1}`,
    type: 'function',
    function: { name: call.name, arguments: typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments || {}) }
  }))
  return {
    content: anthropicBlocks,
    stop_reason: calls.length ? 'tool_use' : (truncated ? 'max_tokens' : 'end_turn'),
    output: responsesOutput,
    output_text: textOut,
    status: truncated ? 'incomplete' : 'completed',
    choices: [{
      message: { role: 'assistant', content: textOut || null, ...(chatToolCalls.length ? { tool_calls: chatToolCalls } : {}) },
      finish_reason: chatToolCalls.length ? 'tool_calls' : (truncated ? 'length' : 'stop')
    }],
    usage: {
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      total_tokens: usage.total_tokens ?? 0,
      prompt_tokens: usage.input_tokens ?? 0,
      completion_tokens: usage.output_tokens ?? 0
    }
  }
}

/** structured 生成专用：kit 漏斗版 fetchImpl——拦截 structuredOutputAdapter 的上游请求，
 *  经 forwardComplete 执行后合成超集响应。
 *  两道内核无关的健壮性处理，令「只要有模型，所有内容都搞定」：
 *  1. 系统提示折进首个 user 消息，不再单独发 systemPrompt——部分兼容网关（如 dots3-note-prev）
 *     见到独立 system 轮会直接返回空补全（finishReason=error、usage 全 0）。
 *  2. 三种模式（native-json-schema / forced-tool / json-object）的输出 Schema 统一抽出，作为
 *     「只输出严格符合该 Schema 的 JSON」显式指令追加到同一 user 消息，并以 responseFormat=json_object 转发——
 *     内核不保证遵守 native json_schema / forced tool_choice。
 *  runner / 模式选择 / 能力降级逻辑零改动。 */
export function createKitFunnelFetchImpl() {
  return async function kitFunnelFetch(_url, init = {}) {
    const parsed = parseStructuredAdapterBody(init.body)
    const schemaInstruction = parsed.schema
      ? `输出必须是且仅是一个完整 JSON 对象，严格符合以下 JSON Schema，不得输出解释、Markdown、思考过程或额外字段：\n${JSON.stringify(parsed.schema)}`
      : ''
    // 把系统提示 + Schema 指令折进首个 user 轮（没有 user 轮则新起一个前置轮）
    const leadText = [...parsed.systemParts, schemaInstruction].filter(Boolean).join('\n\n')
    const messages = parsed.turns.map((turn) => ({ ...turn }))
    if (leadText) {
      const firstUser = messages.find((turn) => turn.role === 'user')
      if (firstUser) firstUser.content = `${leadText}\n\n${firstUser.content}`.trim()
      else messages.unshift({ role: 'user', content: leadText })
    }
    const wantsJson = Boolean(parsed.schema) || parsed.body.response_format?.type === 'json_object' || parsed.body.response_format?.type === 'json_schema'
    const result = await forwardComplete({
      messages,
      ...(parsed.maxTokens != null ? { maxTokens: parsed.maxTokens } : {}),
      ...(parsed.temperature != null ? { temperature: parsed.temperature } : {}),
      ...(wantsJson ? { responseFormat: 'json_object' } : {}),
      timeoutMs: 120000
    })
    const payload = renderStructuredResponse({
      content: result.content || '',
      toolCalls: result.toolCalls || [],
      finishReason: result.finishReason || 'stop',
      usage: { input_tokens: result.usage?.inputTokens ?? 0, output_tokens: result.usage?.outputTokens ?? 0, total_tokens: result.usage?.totalTokens ?? 0 }
    })
    return { ok: true, status: 200, json: async () => payload }
  }
}

/** structured 生成专用（W1-1 试点）：capability 版 fetchImpl——单发结构化生成的循环归 kit 持有。
 *  adapter 请求体抽出系统文本 + 会话轮 + 输出 Schema 折成 capability.systemPrompt；
 *  Schema 同时进 submitTool.parameters（强制提交工具即 schema 绕过），submit 回执合成上游响应。
 *  双层 fail-open：任务面探测不可达 → 直走漏斗；任务失败/未提交 → 同一请求回落漏斗（原因留 console.warn）。
 *  修复重试仍留 Pinax（runStructuredGeneration 的两轮循环不在本文件），每次重试=一个新任务。 */
const STRUCTURED_CAPABILITY_TIMEOUT_MS = 40_000
export function createKitStructuredCapabilityFetchImpl() {
  const funnelFetch = createKitFunnelFetchImpl()
  return async function kitStructuredCapabilityFetch(url, init = {}) {
    const signal = init?.signal
    try {
      if (!(await capabilityPlaneAvailable())) return funnelFetch(url, init)
      const parsed = parseStructuredAdapterBody(init.body)
      const submitToolName = parsed.toolName || 'submit_structured_generation'
      const schemaInstruction = parsed.schema
        ? `输出必须是且仅是一个完整 JSON 对象，严格符合以下 JSON Schema，不得输出解释、Markdown、思考过程或额外字段：\n${JSON.stringify(parsed.schema)}`
        : ''
      const conversationText = parsed.turns.map((turn) => String(turn.content || '').trim()).filter(Boolean).join('\n\n')
      const submitInstruction = `== 提交方式 ==\n本次运行为结构化设定能力任务：完成上述协议要求的 JSON 后，调用工具 ${submitToolName}，把该 JSON 作为工具参数整体提交；提交即结束任务。禁止把结果 JSON 作为普通文本返回。`
      const completed = await submitCapabilityTask({
        systemPrompt: [...parsed.systemParts, schemaInstruction, conversationText, submitInstruction].filter(Boolean).join('\n\n'),
        submitTool: {
          name: submitToolName,
          description: '提交结构化设定草稿 JSON；提交即结束任务。',
          parameters: parsed.schema || { type: 'object', properties: {} }
        },
        ...(Number.isFinite(Number(parsed.maxTokens)) ? { maxTokens: Number(parsed.maxTokens) } : {}),
        budget: { agentTimeoutMs: STRUCTURED_CAPABILITY_TIMEOUT_MS, maxModelSteps: 2, maxCallsPerTurn: 3 },
        timeoutMs: STRUCTURED_CAPABILITY_TIMEOUT_MS,
        signal
      })
      const payload = renderStructuredResponse({
        content: JSON.stringify(completed.capabilityResult),
        toolCalls: parsed.toolName ? [{ id: 'cap_submit_1', name: parsed.toolName, arguments: completed.capabilityResult }] : [],
        usage: { input_tokens: completed.usage?.inputTokens ?? 0, output_tokens: completed.usage?.outputTokens ?? 0, total_tokens: completed.usage?.totalTokens ?? 0 }
      })
      return { ok: true, status: 200, json: async () => payload }
    } catch (error) {
      if (signal?.aborted || error?.code === 'AGENT_REQUEST_ABORTED') throw error
      console.warn(`[Structured] capability task failed (${error?.code || error?.message}); falling back to funnel`)
      return funnelFetch(url, init)
    }
  }
}
