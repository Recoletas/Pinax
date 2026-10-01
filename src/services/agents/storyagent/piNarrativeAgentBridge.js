// Pinax 侧接入件（放进 Pinax 仓库，例如 src/services/agents/piAgent/piNarrativeAgentBridge.js）。
// 定位：任务级外挂——替换 experienceTurnCoordinator 里对 runNarrativeAgentGeneration 的调用，
// 不碰 Pinax 的状态机、工具执行器、adoption/undo 流。
//
// v1 覆盖范围（诚实边界）：
//   ✅ 自动助手（experience）正文回合：资料查询 → 流式正文 → 取消/恢复
//   ❌ Authoring 的 BeatPlan 规划轮（narrativeBeatPlanTool）——未接
//   ❌ critic shadow、evidence validator、写入采纳/撤销——仍归 Pinax 本体
//
// 用法（在 Pinax 侧）：
//   const bridge = createPiNarrativeAgentBridge({ endpoint: 'http://127.0.0.1:8451' })
//   const run = await bridge.run({
//     kernel: narrativeKernel,                 // buildNarrativeKernel 产物
//     index: narrativeIndex,                   // getNarrativeResourceIndex 产物
//     registry: narrativeRegistry,             // 仅用于取 revision / 授权工具名单
//     mode, intent, formatInstructions, maxTokens, requestId, signal,
//     callbacks: { onChunk, onComplete },
//     onStatus,
//   })
//   // run 形状对齐 orchestrator 返回：{ ok, finalContent, trace, usage, toolRounds, totalCalls }

const DOMAINS = {
  world: 'world_lookup',
  geo: 'geo_lookup',
  history: 'history_lookup',
  memory: 'memory_lookup',
  politics: 'politics_lookup',
}

function text(value, limit = 520) {
  const s = String(value ?? '').trim()
  return s.length > limit ? `${s.slice(0, limit - 1)}…` : s
}

// 浏览器侧 stores 的数据 Node 看不见——随请求带资源快照上行（解决落盘时机不一致）
export function buildResourceSnapshot(index, { maxItemsPerDomain = 120 } = {}) {
  const domains = {}
  for (const [domain, toolName] of Object.entries(DOMAINS)) {
    const resources = index?.byDomain?.get?.(domain) || index?.byDomain?.[domain] || []
    if (!Array.isArray(resources) || resources.length === 0) continue
    domains[toolName] = resources.slice(0, maxItemsPerDomain).map((r) => ({
      id: text(r.id, 120),
      title: text(r.title || r.name || '', 120),
      type: text(r.type || '', 60),
      summary: text(r.summary || r.content || r.description || r.text || '', 520),
      aliases: (r.aliases || []).map((a) => text(a, 60)).filter(Boolean),
      tags: (r.tags || []).map((t) => text(t, 40)).filter(Boolean),
      relations: (r.relations || []).slice(0, 12).map((rel) => ({ type: text(rel.type || 'related', 40), targetId: text(rel.targetId || rel.id || '', 120) })),
      trust: text(r.trust || '', 40),
      sourceRefs: (r.sourceRefs || []).slice(0, 6).map((s) => text(s, 120)),
      ...(r.position ? { position: r.position } : {}),
      ...(Array.isArray(r.connectedPlaces) ? { connectedPlaces: r.connectedPlaces.slice(0, 20) } : {}),
      ...(r.faction ? { faction: text(r.faction, 80) } : {}),
      ...(Array.isArray(r.controls) ? { controls: r.controls.slice(0, 20) } : {}),
      ...(r.time ? { time: text(r.time, 60) } : {}),
      ...(r.cause ? { cause: text(r.cause, 120) } : {}),
    }))
  }
  return { revision: text(index?.revision || '', 80), currentPlaceId: text(index?.currentPlaceId || '', 120), domains }
}

// kernel.blocks 复用 Pinax 已预算化的串行化产物；缺省时从 kernel 现拼一份有界块表
export function buildKernelPayload(kernel) {
  if (Array.isArray(kernel?.serialization?.blocks)) {
    return { revision: text(kernel.revision || '', 80), blocks: kernel.serialization.blocks }
  }
  const pick = (kind, value, limit) => (value ? { kind, title: kind, text: text(value, limit) } : null)
  const blocks = [
    pick('scene', kernel?.scene?.title || kernel?.scene?.summary, 800),
    pick('character', kernel?.character?.name ? `${kernel.character.name}${kernel.character.profile ? `：${kernel.character.profile}` : ''}` : kernel?.character?.summary, 1200),
    pick('time', kernel?.time?.label || kernel?.time, 200),
    pick('location', kernel?.location?.name || kernel?.location, 400),
    pick('activities', Array.isArray(kernel?.activities) ? kernel.activities.map((a) => a?.title || a).join('；') : kernel?.activities, 600),
    pick('goals', Array.isArray(kernel?.goals) ? kernel.goals.join('；') : kernel?.goals, 600),
    pick('continuity', kernel?.continuity?.summary || kernel?.thread?.summary, 1200),
    pick('voice', kernel?.voice?.policy || kernel?.voice?.anchor, 800),
    pick('recent', Array.isArray(kernel?.recentMessages) ? kernel.recentMessages.slice(-6).map((m) => `${m.role}:${text(m.content, 200)}`).join('\n') : kernel?.recentText, 2400),
  ].filter(Boolean)
  return { revision: text(kernel?.revision || '', 80), blocks }
}

function parseSseFrame(raw) {
  const lines = String(raw || '').split(/\r?\n/)
  const eventName = lines.find((l) => l.startsWith('event:'))?.slice(6).trim() || 'message'
  const data = lines.find((l) => l.startsWith('data:'))?.slice(5).trim()
  if (!data) return null
  let parsed = null
  try { parsed = JSON.parse(data) } catch { return null }
  return { eventName, data: parsed }
}

export function createPiNarrativeAgentBridge({ endpoint = 'http://127.0.0.1:8451', fetchImpl = fetch, parseEvent = null } = {}) {
  const base = String(endpoint).replace(/\/$/, '')

  async function streamTask(path, body, { signal, callbacks = {}, onStatus, state }) {
    const response = await fetchImpl(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (!response.ok && response.headers.get('content-type')?.includes('application/json')) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`pinax-adapter 拒绝请求（${response.status}）：${err.error || 'unknown'} ${err.message || ''}`)
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finalText = ''
    const events = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        if (!raw.trim()) continue
        // parseEvent 可传入 Pinax 的 parseNarrativeAgentSseEvent 以断言契约一致
        const frame = parseEvent ? parseEvent(raw) : parseSseFrame(raw)?.data
        const named = parseSseFrame(raw)
        const type = frame?.type || named?.eventName
        if (!frame && named?.eventName?.startsWith('task.')) {
          state.taskEvent = named.data
          // 任务生命周期外露（PR #4 审阅④）：task.started 携带 taskId，客户端运行中即可取消
          callbacks.onTask?.(named.data, named.eventName)
          continue
        }
        if (!frame && named?.eventName === 'beat.plan' && named.data) {
          // BeatPlan 规划轮（②）：受理的节拍计划随扩展帧外露
          state.beatPlan = named.data.plan || named.data
          callbacks.onBeatPlan?.(state.beatPlan)
          continue
        }
        if (!frame && named?.eventName === 'reasoning.delta' && named.data) {
          // 思维链增量（深度思考模型扩展帧）：不经契约 parser，直通 onReasoning
          state.reasoningChars = (state.reasoningChars || 0) + String(named.data.delta || '').length
          callbacks.onReasoning?.({ content: String(named.data.delta || '') })
          continue
        }
        if (!type) continue
        events.push({ type, data: frame ?? null, at: Date.now() })
        if (type === 'text.delta') {
          const content = String(frame?.content ?? '')
          finalText += content
          callbacks.onChunk?.({ content })
        } else if (type === 'tool.call') {
          onStatus?.({ phase: 'tool', tool: frame?.toolName, action: frame?.action })
        } else if (type === 'step.start') {
          onStatus?.({ phase: 'step', stepIndex: frame?.stepIndex, toolChoice: frame?.toolChoice })
        } else if (type === 'usage') {
          state.usage = frame?.usage || state.usage
        } else if (type === 'error') {
          state.error = { code: frame?.code, message: frame?.message, retryable: frame?.retryable }
        }
      }
    }
    return { finalText, events }
  }

  return {
    async healthz() {
      const r = await fetchImpl(`${base}/healthz`).then((x) => x.json()).catch(() => null)
      return r
    },

    async run({ kernel, index, registry, mode = 'continue', intent = null, formatInstructions = '', maxTokens = 1600, requestId = '', signal = null, callbacks = {}, onStatus = null, budget = null, taskId = null, bookId = null }) {
      const state = { usage: null, error: null, taskEvent: null, beatPlan: null }
      const body = {
        requestId: requestId || `pi_${Date.now().toString(36)}`,
        mode,
        intent,
        formatInstructions,
        maxTokens,
        // 作品归属（PR #4 审阅②）：任务开始时固定；适配器全程携带并落账
        ...(bookId ? { bookId } : {}),
        kernel: buildKernelPayload(kernel),
        resources: buildResourceSnapshot(index, { maxItemsPerDomain: budget?.maxItemsPerDomain }),
        ...(budget ? { budget: { agentTimeoutMs: budget.agentTimeoutMs, maxModelSteps: budget.maxModelSteps, maxCallsPerTurn: budget.maxCallsPerTurn } } : {}),
        ...(taskId ? { taskId } : {}),
      }
      const toolNames = Object.keys(body.resources.domains)
      if (registry?.revision) body.resources.revision = body.resources.revision || String(registry.revision)
      const { finalText, events } = await streamTask('/v1/pinax/tasks', body, { signal, callbacks, onStatus, state })
      callbacks.onComplete?.({ content: finalText })
      const toolCalls = events.filter((e) => e.type === 'tool.call')
      const steps = events.filter((e) => e.type === 'step.start')
      if (state.error && !finalText) throw new Error(`pinax-adapter 运行失败：${state.error.code} ${state.error.message}`)
      return {
        ok: !state.error,
        finalContent: finalText,
        provider: 'pi-agent',
        model: state.taskEvent?.model || 'pi-agent',
        usage: state.usage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        toolRounds: Math.max(0, steps.length - 1),
        totalCalls: toolCalls.length,
        beatPlan: state.beatPlan || null,
        trace: {
          engine: 'pi-agent-adapter',
          steps: steps.length,
          terminalMode: events.some((e) => e.type === 'tool.call') ? 'tool-assisted' : 'direct-text',
          calls: toolCalls.map((e) => ({ name: e.data?.toolName, action: e.data?.action })),
          groundingPolicy: { level: toolCalls.length ? 'evidenced' : 'none' },
          taskId: state.taskEvent?.taskId || null,
          status: state.taskEvent?.status || (state.error ? 'failed' : 'completed'),
          reasoningChars: state.reasoningChars || 0,
        },
        finalToolResults: [],
      }
    },

    async tasks() {
      const r = await fetchImpl(`${base}/v1/pinax/tasks/list`)
      return r.ok ? r.json() : null
    },

    async status(taskId) {
      const r = await fetchImpl(`${base}/v1/pinax/tasks/${encodeURIComponent(taskId)}`)
      return r.ok ? r.json() : null
    },

    async cancel(taskId) {
      const r = await fetchImpl(`${base}/v1/pinax/tasks/${encodeURIComponent(taskId)}/cancel`, { method: 'POST' })
      return r.ok ? r.json() : null
    },

    async resume({ taskId, kernel, index, intent = null, callbacks = {}, onStatus = null, signal = null, requestId = '', bookId = null }) {
      const state = { usage: null, error: null, taskEvent: null }
      const body = {
        requestId: requestId || `pi_resume_${Date.now().toString(36)}`,
        mode: 'continue',
        intent,
        // 归属不变式：续跑重发同值；客户端漏发时适配器以快照为准（旧任务永远归旧作品）
        ...(bookId ? { bookId } : {}),
        kernel: buildKernelPayload(kernel),
        resources: buildResourceSnapshot(index),
      }
      const { finalText, events } = await streamTask(`/v1/pinax/tasks/${encodeURIComponent(taskId)}/resume`, body, { signal, callbacks, onStatus, state })
      callbacks.onComplete?.({ content: finalText })
      const steps = events.filter((e) => e.type === 'step.start').length
      return { ok: !state.error, finalContent: finalText, trace: { engine: 'pi-agent-adapter', taskId, resumed: true, status: state.taskEvent?.status || (state.error ? 'failed' : 'completed'), steps, reasoningChars: state.reasoningChars || 0 } }
    },
  }
}
