// 能力任务代理：把任务作为 capability 任务发到 kit 任务面，submit 回执即任务结果。
// advisor 路径（taskType+信封+问题）把回执序列化为 advice JSON——createAdvisorTaskResponse 的既有解析/模板/语义修复全部原样工作；
// 结构化生成路径（W1-1 试点）自备 systemPrompt+submitTool 直接复用低层 submitCapabilityTask。
// 门控语义：任务面 /model 探测健康才走此路径；不可达/失败抛错由调用方回落漏斗直连（双层 fail-open）。
import { randomUUID } from 'node:crypto'
import { getCapabilityToolSpec, CAPABILITY_TOOL_SPECS } from '../../shared/capabilityToolContracts.js'
import { KIT_TASK_PLANE_ENDPOINT } from '../../shared/kitTaskPlane.js'

const TASK_PLANE_ENDPOINT = process.env.PINAX_ADAPTER_ENDPOINT || KIT_TASK_PLANE_ENDPOINT

/** 能力任务面是否可用（/model 探测，3s 超时，5s 缓存）。 */
let planeCache = { ok: false, checkedAt: 0 }
export async function capabilityPlaneAvailable({ force = false } = {}) {
  const now = Date.now()
  if (!force && now - planeCache.checkedAt < 5000) return planeCache.ok
  let ok = false
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    const response = await fetch(new URL('/model', TASK_PLANE_ENDPOINT), { signal: controller.signal })
    clearTimeout(timer)
    ok = response.ok
  } catch { ok = false }
  planeCache = { ok, checkedAt: now }
  return ok
}

export const CAPABILITY_TASK_TYPES = Object.keys(CAPABILITY_TOOL_SPECS)

/**
 * 低层：跑一个 capability 任务到终态，返回 kit 的提交回执。
 * 全部任务内容经 systemPrompt 传递（kit 侧不另发 user 轮）；submitTool.parameters 必须是 JSON schema 对象。
 * 返回 { capabilityResult, model, taskId, steps, usage }；失败抛错（code/retryable 语义），回落策略归调用方。
 */
export async function submitCapabilityTask({
  systemPrompt,
  submitTool,
  maxTokens = 4000,
  budget = {},
  requestId = '',
  taskId = '',
  timeoutMs = 90_000,
  signal
} = {}) {
  const prompt = String(systemPrompt || '').trim()
  const toolName = String(submitTool?.name || '').trim()
  if (!prompt || !toolName) {
    throw Object.assign(new Error('能力任务缺少系统提示或提交工具'), { code: 'AGENT_PROVIDER_CONFIG_INVALID', retryable: false })
  }
  const resolvedTaskId = String(taskId || '').trim() || `pcap_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`
  const resolvedTimeoutMs = Math.max(1000, Math.floor(Number(timeoutMs) || 90_000))
  const body = {
    requestId: String(requestId || '').trim() || resolvedTaskId,
    taskId: resolvedTaskId,
    taskKind: 'capability',
    mode: 'init',
    capability: {
      systemPrompt: prompt,
      submitTool: {
        name: toolName,
        description: String(submitTool?.description || '提交本任务的最终结构化结果；提交即结束任务。'),
        parameters: submitTool?.parameters && typeof submitTool.parameters === 'object'
          ? submitTool.parameters
          : { type: 'object', properties: {} }
      }
    },
    kernel: { blocks: [] },
    // kit 侧边界：maxTokens 整数 200–8000；budget 须为有限正数。
    maxTokens: Math.max(200, Math.min(8000, Math.floor(Number(maxTokens) || 4000))),
    budget: {
      agentTimeoutMs: Math.max(1000, Math.floor(Number(budget.agentTimeoutMs) || resolvedTimeoutMs)),
      maxModelSteps: Math.max(1, Math.floor(Number(budget.maxModelSteps) || 8)),
      maxCallsPerTurn: Math.max(1, Math.floor(Number(budget.maxCallsPerTurn) || 6))
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), resolvedTimeoutMs + 15_000)
  const onAbort = () => controller.abort(signal?.reason)
  if (signal) {
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  try {
    const response = await fetch(new URL('/v1/pinax/tasks', TASK_PLANE_ENDPOINT), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    if (!response.ok || !response.body) {
      throw Object.assign(new Error(`能力任务启动失败 (${response.status})`), { code: 'KIT_CAPABILITY_FAILED', retryable: response.status >= 500 })
    }
    // 消费 SSE 流到任务终态
    const decoder = new TextDecoder()
    let buffer = ''
    let completed = null
    let failed = null
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true })
      let index = buffer.indexOf('\n\n')
      while (index >= 0) {
        const frame = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        index = buffer.indexOf('\n\n')
        if (!frame.trim()) continue
        const dataLine = frame.split('\n').find((line) => line.startsWith('data: '))
        if (!dataLine) continue
        try {
          const payload = JSON.parse(dataLine.slice(6))
          if (/event: task\.completed/.test(frame)) completed = payload
          if (/event: task\.failed/.test(frame)) failed = payload
        } catch { /* 非 JSON 帧忽略 */ }
      }
      if (completed || failed) break
    }
    if (completed?.capabilityResult) {
      return {
        capabilityResult: completed.capabilityResult,
        model: String(completed.model || ''),
        taskId: String(completed.taskId || resolvedTaskId),
        steps: Number(completed.steps || 0) || 0,
        usage: completed.usage || null
      }
    }
    const message = failed?.error?.message || '能力任务未产出提交回执'
    throw Object.assign(new Error(message), {
      code: failed?.error?.code || 'KIT_CAPABILITY_FAILED',
      retryable: Boolean(failed?.error?.retryable)
    })
  } catch (error) {
    if (signal?.aborted) throw Object.assign(new Error('能力任务已取消'), { code: 'AGENT_REQUEST_ABORTED', retryable: true })
    if (error?.code) throw error
    throw Object.assign(new Error(error?.message || '能力任务转发失败'), { code: 'KIT_CAPABILITY_FAILED', retryable: true })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener?.('abort', onAbort)
  }
}

/** 跑一个 advisor 能力任务。返回与 runAdvisorAgent 同形：{ advice, provider }；失败抛错（retryable 语义）。 */
export async function runCapabilityTaskAgent({ taskType, envelope, question, taskMeta = {} } = {}) {
  const spec = getCapabilityToolSpec(taskType)
  if (!spec) throw Object.assign(new Error(`任务 ${taskType} 无能力工具契约`), { code: 'AGENT_PROVIDER_CONFIG_INVALID', retryable: false })
  const prompt = String(taskMeta?.prompt || '').trim()
  if (!prompt) throw Object.assign(new Error('能力任务缺少系统提示'), { code: 'AGENT_PROVIDER_CONFIG_INVALID', retryable: false })

  const timeoutMs = Number(taskMeta?.options?.timeoutMs) || 90_000
  // 桥接：指令卡里的「只返回 JSON」文本协议 → 本次以 submit 工具参数提交（agent 统一调度的关键桥）
  const systemPrompt = `${prompt}\n\n== 提交方式（覆盖上文"返回 JSON"类指令）==\n本次运行为能力任务：禁止把结果 JSON 作为普通文本返回。完成上述协议要求的 JSON 后，调用工具 ${spec.toolName}，把该 JSON 作为工具参数整体提交；提交即结束任务。如需核实设定，可先调用资料工具（预算内）。`
  const completed = await submitCapabilityTask({
    systemPrompt,
    submitTool: { name: spec.toolName, description: spec.description, parameters: spec.schema },
    maxTokens: 4000,
    budget: { agentTimeoutMs: timeoutMs, maxModelSteps: 8, maxCallsPerTurn: 6 },
    requestId: taskMeta?.requestId,
    timeoutMs
  })
  return {
    advice: JSON.stringify(completed.capabilityResult),
    provider: {
      id: 'agent-loop-kit',
      capabilities: ['text'],
      timeoutMs: 90_000,
      fallback: false,
      fallbackUsed: false,
      ...(completed.model ? { model: completed.model } : {}),
      taskId: completed.taskId
    }
  }
}
