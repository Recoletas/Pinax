import { sha256Hex } from '../../../../shared/collaboration/canonicalJson.js'
import { createBrowserStorageRepository } from '../../storage/browserStorageRepository.js'
// === bridge-sync：此行之下两副本必须逐字节一致（scripts/check-bridge-sync.mjs）===

const DOMAINS = {
  workspace: 'workspace',
  world: 'world_lookup',
  geo: 'geo_lookup',
  history: 'history_lookup',
  memory: 'memory_lookup',
  politics: 'politics_lookup',
  manuscript: 'manuscript', notes: 'notes', outline: 'outline',
}

function text(value, limit = 520) {
  const s = String(value ?? '').trim()
  return s.length > limit ? `${s.slice(0, limit - 1)}…` : s
}

// 浏览器侧 stores 的数据 Node 看不见——随请求带资源快照上行（解决落盘时机不一致）
export function buildResourceSnapshot(index, { maxItemsPerDomain = 120 } = {}) {
  const domains = {}
  const coverage = {}
  const currentChapterId = String(index?.currentChapterId || '')
  maxItemsPerDomain = Number.isFinite(maxItemsPerDomain) ? Math.max(1, Math.min(120, Math.floor(maxItemsPerDomain))) : 120
  for (const [domain, toolName] of Object.entries(DOMAINS)) {
    const resources = index?.byDomain?.get?.(domain) || index?.byDomain?.[domain] || []
    if (!Array.isArray(resources) || resources.length === 0) continue
    const itemLimit = ['manuscript', 'notes', 'outline'].includes(domain) ? Math.min(60, maxItemsPerDomain) : maxItemsPerDomain
    coverage[toolName] = { included: Math.min(resources.length, itemLimit), available: resources.length, maxTextCharacters: domain === 'world' ? null : domain === 'manuscript' ? 8000 : 2400,
      ...(domain === 'manuscript' && currentChapterId ? { completeSourceIds: resources.slice(0, itemLimit).filter(r => String(r.id) === currentChapterId).map(r => String(r.id)) } : {}) }
    domains[toolName] = resources.slice(0, itemLimit).map((r) => ({
      id: text(r.id, 120),
      ...(domain === 'workspace' ? { bookId: text(r.bookId, 120), resourceId: text(r.resourceId, 120) } : {}),
      sourceLength: String(r.text ?? r.content ?? r.summary ?? '').trim().length,
      title: text(r.title || r.name || '', 120),
      type: text(r.entryType === 'source' ? 'source' : r.type || '', 60),
      ...(r.entryType ? { entryType: text(r.entryType, 60) } : {}),
      summary: text(domain === 'manuscript' && String(r.id) === currentChapterId ? (r.text ?? r.content ?? '') : r.summary || r.content || r.description || r.text || '', 520),
      text: text(r.text ?? r.content ?? r.summary ?? '', domain === 'world' || domain === 'manuscript' && String(r.id) === currentChapterId ? Infinity : domain === 'manuscript' ? 8000 : 2400),
      aliases: (Array.isArray(r.aliases) ? r.aliases : []).map((a) => text(a, 60)).filter(Boolean),
      tags: (Array.isArray(r.tags) ? r.tags : []).map((t) => text(t, 40)).filter(Boolean),
      relations: (Array.isArray(r.relations) ? r.relations : []).slice(0, 12).map((rel) => ({ type: text(rel.type || 'related', 40), targetId: text(rel.targetId || rel.id || '', 120) })),
      trust: text(r.trust || '', 40),
      sourceRefs: (Array.isArray(r.sourceRefs) ? r.sourceRefs : []).slice(0, 6).map((s) => text(s, 120)),
      ...(r.position ? { position: r.position } : {}),
      ...(Array.isArray(r.connectedPlaces) ? { connectedPlaces: r.connectedPlaces.slice(0, 20) } : {}),
      ...(r.faction ? { faction: text(r.faction, 80) } : {}),
      ...(Array.isArray(r.controls) ? { controls: r.controls.slice(0, 20) } : {}),
      ...(r.time ? { time: text(r.time, 60) } : {}),
      ...(r.cause ? { cause: text(r.cause, 120) } : {}),
    }))
  }
  // Keep the request below the proxy's 1 MB resource limit; declare every clipped source.
  let excess = JSON.stringify({ domains, coverage }).length - 850000
  if (excess > 0) {
    // Editing requires the complete current baseline. Trim reference snapshots
    // first; never silently turn a whole-chapter edit into an opening excerpt.
    const currentChapter = domains.manuscript?.find(row => row.id === currentChapterId)
    const rows = Object.values(domains).flat().filter(row => row !== currentChapter).sort((a, b) => b.text.length - a.text.length)
    for (const row of rows) {
      if (excess <= 0) break
      const before = JSON.stringify(row.text).length
      row.text = text(row.text, Math.max(320, row.text.length - excess))
      excess -= before - JSON.stringify(row.text).length
    }
  }
  return { revision: text(index?.revision || '', 80), currentPlaceId: text(index?.currentPlaceId || '', 120), domains, coverage }
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
  const data = lines.filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n')
  if (!data) return null
  let parsed = null
  try { parsed = JSON.parse(data) } catch { return null }
  return { eventName, data: parsed }
}

const STREAM_EVENT_TYPES = new Set(['step.start', 'tool.input.delta', 'tool.call', 'text.delta', 'step.finish', 'usage', 'error'])
const TASK_EVENT_TYPES = new Set(['task.started', 'task.completed', 'task.failed'])
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])

function abortError(signal) {
  if (signal?.reason?.name === 'AbortError') return signal.reason
  return new DOMException(String(signal?.reason?.message || '请求已中止'), 'AbortError')
}

async function requestError(response) {
  const payload = await response.json().catch(() => null)
  const code = typeof payload?.error === 'string' ? payload.error : payload?.error?.code || 'request-failed'
  const friendly = ({
    'task-already-running': '这项任务仍在运行，当前输入尚未发送；请等待完成或停止任务。',
    'task-already-exists': '任务标识已存在，当前输入未重复发送。',
    'task-book-mismatch': '原任务属于另一部作品，当前输入尚未发送。',
    'task-book-unbound': '原任务没有可核对的作品归属，当前输入尚未发送。',
    'task-not-active': '原任务已不在执行，已有记录保留；请重新确认任务状态。',
    'generation-request-not-active': '这次正文生成请求已结束，草稿已保留；请确认当前任务状态后继续。',
    'invalid-generation-result': '正文生成结果不完整，本次修改未提交。'
  })[code] || ({ 403: '当前浏览器无权续接这项任务，现有对话已保留。', 404: '未找到原任务，当前输入尚未发送；现有对话已保留。', 409: '任务状态已变化，当前操作未提交；请确认任务状态后再试。', 422: '原任务暂无法续接，当前输入尚未发送；现有对话已保留。', 429: '写作工具正在忙，请稍后重试。', 503: '写作工具暂不可用，请稍后重试。' })[response.status]
  const error = new Error(friendly || '写作任务请求失败，请稍后重试。')
  error.name = 'PinaxAdapterRequestError'
  error.status = response.status
  error.code = code
  if (payload?.taskId) error.taskId = payload.taskId
  if (code === 'task-already-running') error.executionActive = true
  return error
}

export function createPiNarrativeAgentBridge({ endpoint = '/api/storyagent', fetchImpl = fetch, parseEvent = null } = {}) {
  const base = String(endpoint).replace(/\/$/, '')
  let workspaceSupported = false
  function snapshotForRuntime(index, options) {
    const snapshot = buildResourceSnapshot(index, options)
    if (!workspaceSupported) { delete snapshot.domains.workspace; delete snapshot.coverage.workspace }
    return snapshot
  }
  const repo = createBrowserStorageRepository()
  let session = ''
  try { session = repo.getText('pinax_agent_client_capability') || '' } catch { /* transient capability */ }
  if (!/^[a-f0-9]{64}$/.test(session)) {
    session = [...crypto.getRandomValues(new Uint8Array(32))].map(v => v.toString(16).padStart(2, '0')).join('')
    try { repo.setText('pinax_agent_client_capability', session) } catch { /* page-local capability */ }
  }
  const headers = { 'content-type': 'application/json', 'x-pinax-agent-session': session }
  const scope = sha256Hex(session).slice(0, 24)
  const freshId = () => `${Date.now().toString(36)}_${[...crypto.getRandomValues(new Uint8Array(8))].map(v => v.toString(16).padStart(2, '0')).join('')}`
  const scopedId = (id) => { const prefix = `pa_${scope}_`; return String(id || '').startsWith(prefix) ? id : `${prefix}${String(id || freshId()).slice(0, 52)}` }
  const pendingStops = new Map()
  const taskError = (code, message, taskId, details = {}) => Object.assign(new Error(message), { name: 'PinaxAdapterRequestError', code, taskId, ...details })

  function awaitWithSignal(promise, signal) {
    if (!signal) return promise
    if (signal.aborted) return Promise.reject(abortError(signal))
    return new Promise((resolve, reject) => {
      const abort = () => reject(abortError(signal))
      signal.addEventListener('abort', abort, { once: true })
      promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
    })
  }

  async function readTaskStatus(taskId, { signal = null, bookId = null } = {}) {
    const response = await fetchImpl(`${base}/v1/pinax/tasks/${encodeURIComponent(taskId)}`, { headers, signal })
    if (!response.ok) throw await requestError(response)
    const snapshot = await response.json()
    if (snapshot?.taskId !== taskId || typeof snapshot.executionActive !== 'boolean' || !['running', ...TERMINAL_STATUSES].includes(snapshot.status)) {
      throw taskError('AGENT_TASK_STATUS_UNCONFIRMED', '尚未确认原任务状态，当前输入尚未发送。', taskId)
    }
    if (bookId && snapshot.bookId !== bookId) throw taskError('task-book-mismatch', '原任务作品归属不一致，当前输入尚未发送。', taskId)
    return snapshot
  }

  async function waitForTaskIdle(taskId, options = {}) {
    const stopping = pendingStops.get(taskId)
    if (stopping?.pending) {
      try { await awaitWithSignal(stopping.promise, options.signal) }
      catch { if (options.signal?.aborted) throw abortError(options.signal) }
    }
    const snapshot = await readTaskStatus(taskId, options)
    const stopUnconfirmed = pendingStops.has(taskId)
    if (snapshot.executionActive) throw taskError(stopUnconfirmed ? 'AGENT_TASK_STOP_UNCONFIRMED' : 'task-already-running', stopUnconfirmed
      ? '尚未确认原任务停止，当前输入尚未发送；请重试停止。'
      : '这项任务仍在运行，当前输入尚未发送；请等待完成或停止任务。', taskId, { executionActive: true, status: snapshot.status })
    // Process loss can leave a running journal without an owner. The next
    // explicit author turn may resume its history; it never replays this request.
    if (!TERMINAL_STATUSES.has(snapshot.status) && snapshot.interrupted !== true) throw taskError('AGENT_TASK_STATUS_UNCONFIRMED', '尚未确认原任务状态，当前输入尚未发送。', taskId)
    pendingStops.delete(taskId)
    return snapshot
  }

  function cancelTask(taskId, { signal = null } = {}) {
    let stopping = pendingStops.get(taskId)
    if (!stopping?.pending) {
      stopping = { pending: true, promise: null }
      pendingStops.set(taskId, stopping)
      const current = stopping
      current.promise = (async () => {
        const before = await readTaskStatus(taskId)
        if (!before.executionActive && TERMINAL_STATUSES.has(before.status)) return { ok: true, stopped: true, taskId, status: before.status, cancelled: before.status === 'cancelled' }
        const response = await fetchImpl(`${base}/v1/pinax/tasks/${encodeURIComponent(taskId)}/cancel`, { method: 'POST', headers })
        if (!response.ok) throw await requestError(response)
        const result = await response.json()
        if (result?.ok !== true || result.stopped !== true || result.taskId !== taskId || !TERMINAL_STATUSES.has(result.status)) throw taskError('AGENT_TASK_STOP_UNCONFIRMED', '运行器尚未确认原任务停止，请重试停止；已有文字已保留。', taskId)
        const after = await readTaskStatus(taskId)
        if (after.executionActive || !TERMINAL_STATUSES.has(after.status)) throw taskError('AGENT_TASK_STOP_UNCONFIRMED', '原任务仍未结束，请重试停止；已有文字已保留。', taskId, { executionActive: after.executionActive, status: after.status })
        return { ...result, status: after.status, cancelled: after.status === 'cancelled' }
      })().then(result => { if (pendingStops.get(taskId) === current) pendingStops.delete(taskId); return result })
        .catch(error => { throw taskError('AGENT_TASK_STOP_UNCONFIRMED', '尚未确认远端任务停止，已有文字已保留；请确认任务状态后继续。', taskId, { cause: error, ...(typeof error.executionActive === 'boolean' ? { executionActive: error.executionActive } : {}) }) }).finally(() => { current.pending = false })
      // A caller may stop waiting while remote cancellation is still settling.
      current.promise.catch(() => {})
    }
    return awaitWithSignal(stopping.promise, signal)
  }

  async function streamTask(path, body, { signal, callbacks = {}, onStatus, state }) {
    const response = await fetchImpl(`${base}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    })
    if (!response.ok) throw await requestError(response)
    if (!response.body) throw new Error('pinax-adapter 未返回事件流')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finalText = ''
    const events = []
    let ended = false
    let readerCancelled = false
    const cancelReader = () => {
      if (readerCancelled) return
      readerCancelled = true
      // 清理失败不能替换原来的中止/传输异常。
      reader.cancel(signal?.reason).catch(() => {})
    }
    const emitStatus = (status) => {
      onStatus?.(status)
      if (callbacks.onStatus !== onStatus) callbacks.onStatus?.(status)
    }
    const consumeFrame = async (raw) => {
      if (!raw.trim()) return
      const named = parseSseFrame(raw)
      if (state.terminal && (TASK_EVENT_TYPES.has(named?.eventName) || STREAM_EVENT_TYPES.has(named?.eventName))) throw new Error('pinax-adapter 终态之后仍有任务输出')
      // 生命周期不属于 narrative parser 的事件集，两种接入方式都必须处理。
      if (TASK_EVENT_TYPES.has(named?.eventName)) {
        if (!named.data || typeof named.data !== 'object' || Array.isArray(named.data)) throw new Error('pinax-adapter 任务事件格式错误')
        if (named.data.taskId && body.taskId && named.data.taskId !== body.taskId) throw new Error('pinax-adapter 任务标识不一致')
        const fallbackStatus = named.eventName === 'task.started' ? 'running' : named.eventName === 'task.completed' ? 'completed' : 'failed'
        state.taskEvent = { ...state.taskEvent, ...named.data, status: named.data.status || fallbackStatus }
        const validStatus = named.eventName === 'task.started' ? state.taskEvent.status === 'running'
          : named.eventName === 'task.completed' ? state.taskEvent.status === 'completed'
            : ['failed', 'cancelled'].includes(state.taskEvent.status)
        if (!validStatus || state.terminal) throw new Error('pinax-adapter 任务生命周期不一致')
        if (named.eventName !== 'task.started') {
          state.terminal = true
          if (state.taskEvent.status !== 'completed') {
            state.error = state.taskEvent.error || state.error || { code: 'PINAX_ADAPTER_TASK_FAILED', message: `任务状态：${state.taskEvent.status}`, retryable: false }
          }
        }
        if (named.eventName === 'task.completed') {
          if (typeof named.data.finalText === 'string') finalText = named.data.finalText
          state.beatPlan = named.data.beatPlan || state.beatPlan || null
        }
        callbacks.onTask?.(state.taskEvent, named.eventName)
        return
      }
      if (named?.eventName === 'reasoning.delta') { const content = String(named.data?.delta || ''); state.reasoningChars = (state.reasoningChars || 0) + content.length; callbacks.onReasoning?.({ content }); return }
      if (named?.eventName === 'beat.plan') { state.beatPlan = named.data?.plan || null; callbacks.onBeatPlan?.(state.beatPlan); return }
      if (named?.eventName === 'narrative.request') {
        if (state.terminal || named.data?.bookId !== body.bookId) throw new Error('正文生成请求归属不一致。')
        const taskId = state.taskEvent?.taskId || body.taskId
        let result
        try {
          if (!callbacks.onNarrativeRequest) throw new Error('当前页面未连接推演生成器，请更新页面。')
          result = await callbacks.onNarrativeRequest(named.data.request)
        } catch (error) { result = { error: String(error.message || error) } }
        const receipt = await fetchImpl(`${base}/v1/pinax/tasks/${encodeURIComponent(taskId)}/narrative-result`, {
          method: 'POST', headers, signal,
          body: JSON.stringify({ ...result, bookId: body.bookId, callId: named.data.callId, nonce: named.data.nonce })
        })
        if (!receipt.ok) throw await requestError(receipt)
        return
      }
      if (named?.eventName === 'tool.result') {
        if (named.data && typeof named.data.toolName === 'string') {
          (state.toolResults ||= []).push(named.data); callbacks.onToolResult?.(named.data)
        }
        return
      }
      if (named?.eventName === 'prompt.composed') {
        callbacks.onPromptComposed?.(named.data)
        return
      }
      // 默认 parser 读取标准 schema；显式 parser 可增加 Pinax 的契约核对。
      const frame = parseEvent ? parseEvent(raw) : named?.data
      if (!frame || frame.schemaVersion !== 1 || !STREAM_EVENT_TYPES.has(frame.type)) {
        if (STREAM_EVENT_TYPES.has(named?.eventName)) throw new Error('pinax-adapter 叙事事件不符合流契约')
        return
      }
      const type = frame.type
      events.push({ type, data: frame, at: Date.now() })
      if (type === 'text.delta') {
        const content = String(frame.content ?? '')
        finalText += content
        callbacks.onChunk?.({ content })
      } else if (type === 'tool.input.delta') {
        (state.toolInputs ||= {})[frame.callId] = frame.input
      } else if (type === 'tool.call') {
        emitStatus({ phase: 'tool', tool: frame.toolName, action: frame.action, callId: frame.callId, input: state.toolInputs?.[frame.callId] || null })
      } else if (type === 'step.start') {
        emitStatus({ phase: 'step', stepIndex: frame.stepIndex, toolChoice: frame.toolChoice })
      } else if (type === 'usage') {
        state.usage = frame.usage || state.usage
      } else if (type === 'error') {
        state.error = { code: frame.code, message: frame.message, retryable: frame.retryable }
      }
    }
    signal?.addEventListener('abort', cancelReader, { once: true })
    try {
      while (true) {
        if (signal?.aborted) throw abortError(signal)
        const { done, value } = await reader.read()
        if (signal?.aborted) throw abortError(signal)
        if (done) { ended = true; break }
        buffer += decoder.decode(value, { stream: true })
        let separator
        while ((separator = /\r?\n\r?\n/.exec(buffer))) {
          const raw = buffer.slice(0, separator.index)
          buffer = buffer.slice(separator.index + separator[0].length)
          await consumeFrame(raw)
        }
      }
      buffer += decoder.decode()
      if (buffer.trim()) await consumeFrame(buffer)
      if (!state.terminal) throw new Error(`pinax-adapter 事件流未确认任务终态${state.error?.message ? `：${state.error.message}` : ''}`)
      return { finalText, events }
    } catch (error) {
      cancelReader()
      // A lost reader is not confirmation that the remote model stopped. Share
      // the same cancellation with the stop button and retain failures for recovery.
      const taskId = state.taskEvent?.taskId || body.taskId
      if (taskId) {
        try { if (state.terminal) await waitForTaskIdle(taskId); else await cancelTask(taskId) }
        catch (stopError) { stopError.streamError = error; throw stopError }
      }
      if (signal?.aborted) throw abortError(signal)
      throw error
    } finally {
      signal?.removeEventListener('abort', cancelReader)
      if (!ended) cancelReader()
      reader.releaseLock()
    }
  }

  function resultOf(state, finalText, events, taskId, resumed = false) {
    const toolCalls = events.filter((e) => e.type === 'tool.call')
    const steps = events.filter((e) => e.type === 'step.start')
    const status = state.taskEvent?.status === 'completed' && state.error ? 'failed' : state.taskEvent?.status
    const ok = status === 'completed' && !state.error
    return {
      ok,
      finalContent: finalText,
      provider: 'pi-agent',
      model: state.taskEvent?.model || 'pi-agent',
      usage: state.usage || state.taskEvent?.usage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      toolRounds: Math.max(0, steps.length - 1),
      totalCalls: toolCalls.length,
      ...(state.error ? { error: state.error } : {}),
      trace: {
        engine: 'pi-agent-adapter',
        steps: Number(state.taskEvent?.steps) || steps.length,
        reasoningChars: state.reasoningChars || 0,
        terminalMode: toolCalls.length ? 'tool-assisted' : 'direct-text',
        calls: toolCalls.map((e) => ({ name: e.data.toolName, action: e.data.action })),
        groundingPolicy: { level: (state.toolResults || []).some(result => !result.isError && /lookup|manuscript|notes/.test(result.toolName)) ? 'evidenced' : 'none' },
        taskId: state.taskEvent?.taskId || taskId || null,
        ...(state.taskEvent?.bookId ? { bookId: state.taskEvent.bookId } : {}),
        status,
        ...(resumed ? { resumed: true } : {}),
      },
      beatPlan: state.beatPlan || null,
      delivery: state.taskEvent?.delivery || null,
      ...(Array.isArray(state.taskEvent?.proposalChanges) ? { proposalChanges: state.taskEvent.proposalChanges } : {}),
      finalToolResults: state.toolResults || [],
    }
  }

  return {
    async healthz({ signal = null, timeoutMs = 2500 } = {}) {
      const controller = new AbortController()
      const abort = () => controller.abort(signal.reason)
      if (signal?.aborted) abort()
      else signal?.addEventListener('abort', abort, { once: true })
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetchImpl(`${base}/healthz`, { signal: controller.signal })
        const health = response.ok ? await response.json() : null
        workspaceSupported = health?.assistantWorkspace === true
        return health
      } catch { if (signal?.aborted) throw abortError(signal); return null }
      finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
    },

    async run({ kernel, index, registry, mode = 'continue', intent = null, formatInstructions = '', requestId = '', signal = null, callbacks = {}, onStatus = null, budget = null, taskId = null, bookId = null, taskKind = 'narrative', maxTokens = null, modelConfig = null }) {
      taskId = base === '/api/storyagent' ? scopedId(taskId) : taskId || freshId()
      if (signal?.aborted) throw abortError(signal)
      const state = { usage: null, error: null, taskEvent: null, terminal: false }
      const body = {
        requestId: requestId || `pi_${Date.now().toString(36)}`,
        mode, taskKind,
        ...(modelConfig ? { modelConfig } : {}),
        intent,
        ...(maxTokens ? { maxTokens } : {}),
        formatInstructions,
        // 作品归属（PR #4 审阅②）：任务开始时固定；适配器全程携带并落账
        ...(bookId ? { bookId } : {}),
        kernel: buildKernelPayload(kernel),
        resources: snapshotForRuntime(index, { maxItemsPerDomain: budget?.maxItemsPerDomain }),
        ...(budget ? { budget: { agentTimeoutMs: budget.agentTimeoutMs, maxModelSteps: budget.maxModelSteps, maxCallsPerTurn: budget.maxCallsPerTurn } } : {}),
        ...(taskId ? { taskId } : {}),
      }
      if (registry?.revision) body.resources.revision = body.resources.revision || String(registry.revision)
      const { finalText, events } = await streamTask('/v1/pinax/tasks', body, { signal, callbacks, onStatus, state })
      const result = resultOf(state, finalText, events, taskId)
      if (result.ok) callbacks.onComplete?.({ content: finalText })
      return result
    },

    async tasks(bookId = '') {
      const response = await fetchImpl(`${base}/v1/pinax/tasks/list?bookId=${encodeURIComponent(bookId)}`, { headers })
      return response.ok ? response.json() : { tasks: [] }
    },

    async status(taskId) {
      const r = await fetchImpl(`${base}/v1/pinax/tasks/${encodeURIComponent(taskId)}`, { headers })
      return r.ok ? r.json() : null
    },

    async compact(taskId, { bookId, modelConfig = null, signal = null } = {}) {
      const response = await fetchImpl(`${base}/v1/pinax/tasks/${encodeURIComponent(taskId)}/compact`, {
        method: 'POST', signal, headers,
        body: JSON.stringify({ bookId, ...(modelConfig ? { modelConfig } : {}) })
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.message || result.error || '上下文整理失败，原会话已保留。')
      return result
    },
    waitForTaskIdle,
    cancel: cancelTask,

    async resume({ taskId, kernel, index, intent = null, callbacks = {}, onStatus = null, signal = null, requestId = '', bookId = null, taskKind = 'assistant', formatInstructions = '', budget = null, maxTokens = null, modelConfig = null }) {
      await waitForTaskIdle(taskId, { signal, bookId })
      const state = { usage: null, error: null, taskEvent: null, terminal: false }
      const body = {
        ...(modelConfig ? { modelConfig } : {}),
        requestId: requestId || `pi_resume_${Date.now().toString(36)}`,
        mode: 'continue', taskId, taskKind, formatInstructions,
        ...(budget ? { budget: { agentTimeoutMs: budget.agentTimeoutMs, maxModelSteps: budget.maxModelSteps, maxCallsPerTurn: budget.maxCallsPerTurn } } : {}),
        intent,
        ...(maxTokens ? { maxTokens } : {}),
        // 归属不变式：续跑重发同值；客户端漏发时适配器以快照为准（旧任务永远归旧作品）
        ...(bookId ? { bookId } : {}),
        kernel: buildKernelPayload(kernel),
        resources: snapshotForRuntime(index),
      }
      const { finalText, events } = await streamTask(`/v1/pinax/tasks/${encodeURIComponent(taskId)}/resume`, body, { signal, callbacks, onStatus, state })
      const result = resultOf(state, finalText, events, taskId, true)
      if (result.ok) callbacks.onComplete?.({ content: finalText })
      return result
    },
  }
}
