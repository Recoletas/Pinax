import path from 'node:path'
import { createHash } from 'node:crypto'
import {
  AgentHarness, BACKGROUND_CONTEXT, DEFAULT_COMPACTION_SETTINGS, JsonlSessionRepo,
  withAbortSignal
} from '@earendil-works/pi-agent-core'
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node'
import { cleanAssistantResumeHistory } from './requestModelTransport.js'

// Adapt the existing SSE runner to pi's durable harness. The harness owns the
// conversation, tool loop, queues, retry and compaction; task journals remain
// Pinax's public task receipts, not a second conversation engine.
export function createAssistantSession(options, { models, tasksDir, req, task, signal, emit = () => {}, compactOnly = false }) {
  const listeners = new Set()
  const context = signal ? withAbortSignal(signal, BACKGROUND_CONTEXT) : BACKGROUND_CONTEXT
  const state = {
    ...options.initialState,
    messages: [],
    tools: [...(options.initialState?.tools || [])],
    isStreaming: false
  }
  const root = path.resolve(tasksDir, 'pi-sessions')
  const owner = createHash('sha256').update(String(req.bookId || '')).digest('hex')
  const cwd = path.join(root, owner)
  const repository = new JsonlSessionRepo({ sessionsRoot: root, fileSystem: new NodeExecutionEnv({ cwd: root }) })
  let harness, lane, metadata, openedSession, active, closed = false
  let steeringMode = options.steeringMode || 'all'
  let pendingQueues = Promise.resolve()
  const failedToolResults = new Set()

  async function dispatch(event) {
    for (const listener of listeners) await listener(event, signal)
  }

  function lifecycle(event) {
    emit(`event: session.${event.type}\ndata: ${JSON.stringify({ requestId: req.requestId, at: Date.now(), ...event })}\n\n`)
  }

  async function refreshMessages() {
    const entries = await lane.findEntries({ order: 'oldestFirst' }, BACKGROUND_CONTEXT)
    state.messages = entries.filter(entry => entry.type === 'message').map(entry => entry.message)
  }

  async function initialize() {
    const existing = (await repository.list({ cwd }, context)).find(item => item.id === req.taskId)
    if (!existing && compactOnly) throw Object.assign(new Error('这段对话尚无运行器会话，请先继续一次对话。'), { code: 'ASSISTANT_SESSION_NOT_FOUND' })
    const session = existing ? await repository.open(existing, context) : await repository.create({ id: req.taskId, cwd }, context)
    openedSession = session
    metadata = session.metadata
    // Keep model transport, prompt tracing and author sampling in the existing
    // provider adapter. Native summary requests use the same registered models.
    const nativeModels = new Proxy(models, {
      get(target, key) {
        if (key === 'streamSimple') return (model, input, requestOptions) => options.streamFn(model, input, requestOptions)
        const value = Reflect.get(target, key, target)
        return typeof value === 'function' ? value.bind(target) : value
      }
    })
    const created = await AgentHarness.create({
      session,
      models: nativeModels,
      model: state.model,
      thinkingLevel: state.thinkingLevel || 'off',
      systemPrompt: state.systemPrompt,
      tools: state.tools.map(tool => ({
        ...tool,
        execute: async (id, args, onUpdate, _toolContext, _invocation, toolContext) => {
          const result = await tool.execute(id, args, toolContext.abortSignal, onUpdate)
          if (result.isError) failedToolResults.add(id)
          return result
        }
      })),
      compaction: { ...DEFAULT_COMPACTION_SETTINGS },
      steeringMode,
      followUpMode: options.followUpMode || 'all',
      toolExecution: options.toolExecution || 'sequential'
    }, context)
    harness = created.harness
    lane = await harness.lane('assistant', context)
    if (compactOnly && created.open.length) throw Object.assign(new Error('助手任务尚未结束，请结束后再压缩上下文。'), { code: 'ASSISTANT_SESSION_BUSY' })

    // Restore provider/tool selection from this author turn. A persisted session
    // may have been created under another model or a narrower permission mode.
    await lane.setModel({ provider: state.model.provider, modelId: state.model.id }, context)
    await lane.setThinkingLevel(state.thinkingLevel || 'off', context)
    if (!compactOnly) await lane.setActiveTools(state.tools.map(tool => tool.name), context)

    if (!existing) {
      const history = cleanAssistantResumeHistory(options.initialState?.messages || []).filter(message => message.role !== 'system')
      for (const message of history) await lane.appendMessage(message, context)
    }
    await refreshMessages()

    harness.hooks.on('before_tool', async (event, toolContext) => {
      const result = await options.beforeToolCall?.({ toolCall: { id: event.toolCallId, name: event.toolName, arguments: event.args }, tool: state.tools.find(tool => tool.name === event.toolName) }, toolContext.abortSignal)
      return result?.block ? { block: { reason: result.reason || '工具调用未获准。' } } : undefined
    })
    harness.hooks.on('after_tool', event => {
      // Legacy Pinax tools return isError on their result. Native harness tools
      // report it through the hook result, so preserve that protocol meaning.
      if (failedToolResults.delete(event.toolCallId)) return { isError: true }
      // Asking the author is an explicit pause. A successful edit tool remains
      // a normal tool result, so pi can inspect it and continue the same run.
      if (!event.isError && task?.state.delivery?.outcome === 'needs_input' && !task.state.pendingInput?.size) return { terminate: true }
      if (!event.isError && task?.state.narrativeFinishCallId === event.toolCallId && !task.state.pendingInput?.size) {
        task.state.narrativeFinishCallId = null
        task.state.delivery = { intent: 'edit', outcome: 'proposal', message: '草稿已生成，可在正文查看。' }
        return { terminate: true }
      }
    })

    for (const type of ['message_start', 'message_update', 'message_end', 'turn_start', 'turn_end', 'tool_start', 'tool_update', 'tool_end', 'run_end']) {
      harness.events.on(type, async event => {
        if (type === 'message_end') {
          state.messages.push(event.message)
        }
        if (type === 'tool_start') return dispatch({ ...event, type: 'tool_execution_start' })
        if (type === 'tool_update') return dispatch({ ...event, type: 'tool_execution_update' })
        if (type === 'tool_end') return dispatch({ ...event, type: 'tool_execution_end' })
        if (type === 'message_update') return dispatch({ ...event, assistantMessageEvent: event.event })
        if (type === 'run_end') return dispatch({ ...event, type: 'agent_end', messages: state.messages })
        await dispatch(event)
        // The receipt is product metadata. It does not terminate pi's native
        // steering/follow-up queues or replace its decision to continue.
        if (type === 'turn_end') await options.finishTurn?.({ message: event.message, toolResults: event.toolResults, context: { messages: state.messages } }, signal)
      })
    }
    for (const type of ['compaction_start', 'compaction_end', 'retry_scheduled', 'retry_end']) {
      harness.events.on(type, event => lifecycle({ type, reason: event.reason, status: event.status, attempt: event.attempt, nextAttemptAt: event.nextAttemptAt, entryId: event.entryId, error: event.error?.message }))
    }
    return created.open
  }

  const ready = initialize()
  // Prompt awaits and reports initialization failures; merely constructing a run
  // must not produce an unhandled rejection while the server attaches its owner.
  ready.catch(() => {})

  function queue(kind, message) {
    const queued = pendingQueues.then(async () => {
      await ready
      const result = await lane[kind](message, undefined, context)
      if (!result.ok) throw result.error
    })
    // A rejected new input belongs to its caller; it must not fail the work
    // already running. The returned promise still reports that rejection.
    pendingQueues = queued.catch(() => {})
    return queued
  }

  async function prompt(message) {
    active = (async () => {
      const open = await ready
      if (closed) throw new Error('助手会话已关闭。')
      await pendingQueues
      state.isStreaming = true
      try {
        // A fresh author turn must not replay an unfinished browser mutation
        // from before process death. Pi records interrupted tool results while
        // aborting the orphan operation; the current request then starts from
        // that preserved conversation under its current authorization.
        if (open.length) {
          const stopped = await lane.abort(BACKGROUND_CONTEXT)
          if (!stopped.ok) throw stopped.error
          open.length = 0
        }
        const result = typeof message === 'string' ? await lane.prompt(message, undefined, context) : await lane.prompt(message, context)
        if (!result.ok) throw result.error
        if (result.value.status === 'failed') throw new Error(result.value.error?.message || '助手运行失败。')
        if (result.value.status === 'aborted') throw new Error('PINAX_ADAPTER_ABORTED')
        if (result.value.status === 'suspended') throw new Error('模型请求正在后台等待完成。')
      } finally {
        await refreshMessages()
        state.isStreaming = false
      }
    })()
    return active
  }

  async function compact() {
    await ready
    if (closed) throw new Error('助手会话已关闭。')
    const watch = await lane.watch(context)
    const { operation, queues } = watch.snapshot
    watch.unsubscribe()
    if (operation || queues.length) return { ok: false, code: 'ASSISTANT_SESSION_BUSY', error: '助手还有进行中或排队的消息，请处理后再压缩上下文。' }
    const result = await lane.compact(undefined, context)
    await refreshMessages()
    if (!result.ok) return { ok: false, code: result.error._tag, error: result.error._tag === 'NothingToCompact' ? '对话较短，暂时无需压缩。' : result.error.message }
    const receipt = result.value.compaction
    return receipt.status === 'completed'
      ? { ok: true, operationId: receipt.operationId, status: receipt.status }
      : { ok: false, code: receipt.error?.code || receipt.status, error: receipt.error?.message || (receipt.status === 'aborted' ? '已停止压缩，原对话保留。' : '此次未压缩，原对话保留。') }
  }

  return {
    state,
    ready,
    get nativeSession() { return metadata ? { id: metadata.id, path: metadata.path, storageVersion: metadata.storageVersion } : null },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    get steeringMode() { return steeringMode },
    set steeringMode(value) { steeringMode = value; if (harness) void harness.setSteeringMode(value, BACKGROUND_CONTEXT).catch(() => {}) },
    steer(message) { return queue('steer', message) },
    followUp(message) { return queue('followUp', message) },
    prompt,
    compact,
    abort() { void ready.then(() => lane.abort(BACKGROUND_CONTEXT)).catch(() => {}) },
    async waitForIdle() { await active },
    async close() {
      if (closed) return
      closed = true
      try { await ready; await pendingQueues; await harness?.close(BACKGROUND_CONTEXT) }
      finally { await openedSession?.close(BACKGROUND_CONTEXT); await repository.close(BACKGROUND_CONTEXT) }
    }
  }
}

export async function compactAssistantSession({ models, model, tasksDir, req, signal, emit }) {
  const session = createAssistantSession({ initialState: { model, tools: [] }, streamFn: (selected, input, options) => models.streamSimple(selected, input, options) },
    { models, tasksDir, req, signal, emit, compactOnly: true })
  try { return await session.compact() }
  catch (error) { return { ok: false, code: error.code || 'ASSISTANT_COMPACTION_FAILED', error: error.message || '上下文压缩失败，原对话保留。' } }
  finally { await session.close().catch(() => {}) }
}
