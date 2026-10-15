// Optional adapter route for uncontracted experience turns. Strict task contracts retain the native review/repair owner.
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
    || '/api/storyagent',
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
      const health = await bridge.healthz({ signal: args.signal }).catch(() => null)
      if (args.signal?.aborted) throw new DOMException('已停止', 'AbortError')
      if (!health?.ok) return null
      const run = await bridge.run({
        kernel: args.kernel,
        index: args.index,
        mode: args.mode,
        intent: args.intent,
        formatInstructions: args.formatInstructions,
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
        beatPlan: run.beatPlan || null, error: run.error || null,
      }
    },
  }
}

export const experiencePiAgentRoute = {
  healthz: (...args) => createExperiencePiAgentRoute().healthz(...args),
  run: (...args) => createExperiencePiAgentRoute().run(...args)
}

/** The native loop owns strict task contracts; routing never bypasses its review/repair gate. */
export async function runExperienceAgentGeneration(args, nativeRun, { route = experiencePiAgentRoute, enabled = experiencePiAgentEnabled() } = {}) {
  if (!enabled || args.taskContract) return nativeRun(args)
  const result = await route.run({ ...args, callbacks: {} })
  if (!result) return nativeRun(args)
  if (!result.ok) throw Object.assign(new Error(result.error?.message || '写作任务未完成。'), { code: 'PI_AGENT_RUN_FAILED' })
  if (args.signal?.aborted) throw new DOMException('已停止', 'AbortError')
  args.callbacks?.onChunk?.({ content: result.finalText })
  args.callbacks?.onComplete?.({ content: result.finalText })
  return result
}
