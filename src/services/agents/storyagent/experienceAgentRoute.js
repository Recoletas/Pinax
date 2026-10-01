// 体验推演的 pi-agent 路由（「experienceTurnCoordinator 开关」工单）：
// 默认关闭（localStorage pinax_experience_pi_agent_enabled=1 开启）。开启后体验回合经
// pinax-adapter 的 pi-agent 循环执行（五 lookup 快照工具环），返回形状对齐
// runNarrativeAgentGeneration 的消费面（finalText/trace/usage/toolRounds/totalCalls/
// finalToolResults）；beatPlan 为可选字段，缺席时协调器自然跳过。
// 适配器不可达时 run() 返回 null，协调器回落 Pinax 本体循环并告警——不阻塞作者写作。
// 边界（诚实）：本路径不含 BeatPlan 规划轮与 critic shadow（仍未接，见 STATUS）。
import { createPiNarrativeAgentBridge } from './piNarrativeAgentBridge.js'
import { parseNarrativeAgentSseEvent } from '../../../../shared/narrativeAgentStreamContract.js'

export const EXPERIENCE_PI_AGENT_FLAG_KEY = 'pinax_experience_pi_agent_enabled'

export function experiencePiAgentEnabled() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(EXPERIENCE_PI_AGENT_FLAG_KEY) === '1'
  } catch {
    return false
  }
}

export function setExperiencePiAgentEnabled(enabled) {
  try {
    if (enabled) localStorage.setItem(EXPERIENCE_PI_AGENT_FLAG_KEY, '1')
    else localStorage.removeItem(EXPERIENCE_PI_AGENT_FLAG_KEY)
  } catch { /* 存储不可用即忽略 */ }
}

let cachedBridge = null
let cachedEndpoint = ''

export function createExperiencePiAgentRoute({ endpoint } = {}) {
  const resolvedEndpoint = String(
    endpoint
    || (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_PI_ADAPTER_URL : '')
    || 'http://127.0.0.1:8451',
  ).replace(/\/$/, '')
  if (!cachedBridge || cachedEndpoint !== resolvedEndpoint) {
    cachedBridge = createPiNarrativeAgentBridge({
      endpoint: resolvedEndpoint,
      // 与 Authoring.vue 生产接线一致：契约帧过 parser，task/reasoning 扩展帧放行为 null——
      // 否则 task.completed 的 data 会被当普通帧，trace.taskId/status 与 onReasoning 全失效
      parseEvent: (raw) => (/^event: (task\.|reasoning\.)/m.test(raw) ? null : parseNarrativeAgentSseEvent(raw)),
    })
    cachedEndpoint = resolvedEndpoint
  }
  const bridge = cachedBridge
  return {
    async healthz() {
      return bridge.healthz()
    },
    /** 适配器不可达时返回 null（协调器回落本体循环）；否则返回对齐形状的运行结果。 */
    async run(args) {
      const health = await bridge.healthz().catch(() => null)
      if (!health?.ok) return null
      const run = await bridge.run({
        kernel: args.kernel,
        index: args.index,
        mode: args.mode,
        intent: args.intent,
        formatInstructions: args.formatInstructions,
        maxTokens: args.maxTokens,
        requestId: args.requestId,
        signal: args.signal,
        taskId: args.taskId || `exp_${Date.now().toString(36)}`,
        bookId: args.bookId || null,
        callbacks: args.callbacks,
        onStatus: args.onStatus,
      })
      return {
        ok: run.ok,
        finalText: run.finalContent,
        trace: run.trace,
        usage: run.usage,
        toolRounds: run.toolRounds,
        totalCalls: run.totalCalls,
        finalToolResults: run.finalToolResults || [],
        // BeatPlan 规划轮（②）：协调器既有消费者（applyBeatPlanToSceneThread）直接可用
        beatPlan: run.beatPlan || null,
      }
    },
  }
}

export const experiencePiAgentRoute = createExperiencePiAgentRoute()
