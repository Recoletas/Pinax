import { createAgentRequestId, recordAgentRequestTrace } from '../agentRequestTrace.js'

function retrievedReferences(prepared, results, projectId) {
  const references = []
  for (const result of results) {
    if (result.isError) continue
    let payload
    try { payload = JSON.parse((result.result?.content || []).filter(block => block.type === 'text').map(block => block.text || '').join('')) } catch { continue }
    const domain = { world_lookup: 'world', manuscript: 'manuscript', notes: 'notes', outline: 'outline' }[payload.domain]
    if (!domain) continue
    const catalogue = prepared.index.byDomain[domain] || []
    for (const hit of [...(payload.hits || []), ...(payload.items || [])]) {
      const source = typeof hit === 'string' ? catalogue.find(item => hit === item.id || hit.startsWith(`${item.id} `)) : catalogue.find(item => item.id === hit?.id)
      if (!source || references.some(item => item.sourceRef === source.sourceRefs?.[0])) continue
      const original = String(source.text || source.summary || '')
      const quote = typeof hit === 'object' ? String(hit.excerpt || hit.text || '') : ''
      references.push({ projectId, sourceRef: source.sourceRefs?.[0] || `${domain}:${source.id}`, label: source.title,
        excerpt: (quote && original.includes(quote) ? quote : original).slice(0, 800), authority: domain === 'manuscript' ? 'manuscript' : domain === 'notes' ? 'suggestion' : domain === 'outline' ? 'outline' : 'worldbook',
        locator: source.type === 'source' ? { kind: 'source-document', documentId: source.sourceDocumentId || source.id, worldbookId: prepared.editBaseline?.worldbook?.id || '', contentHash: source.contentHash || '' } : domain === 'world' ? { kind: 'worldbook-entry', worldbookId: prepared.editBaseline?.worldbook?.id || '', entryId: source.id } : domain === 'manuscript' ? { kind: 'manuscript', chapterId: source.id, documentId: source.id } : domain === 'notes' ? { kind: 'exploration', documentId: source.id } : domain === 'outline' ? { kind: 'outline-node', nodeId: source.id } : null })
    }
  }
  return references.slice(0, 12)
}

export async function runAuthoringAgentTurn({ engine, entry, question, providerQuestion, token, signal, persist, isCurrent, id }) {
  const { state, runtime, projectId } = entry
  // Prepare synchronously before health probing or loading the bridge.
  const prepared = engine.prepare({ text: providerQuestion, bookId: projectId, pinnedRefs: state.agentRefs || [], skills: state.agentSkills || [] })
  const destination = engine.destination?.() || { chapterId: '' }
  const current = () => isCurrent(token) && !signal.aborted
  const previousTask = state.agentTaskId || ''
  if (engine.enrichPrepared) await engine.enrichPrepared(prepared, { text: question, signal })
  if (!current()) return false
  const traceRequestId = createAgentRequestId()
  const traceStartedAt = Date.now()
  const recordTurnTrace = (status, extra = {}) => recordAgentRequestTrace({
    kind: 'agent',
    requestId: traceRequestId,
    projectId,
    taskId: extra.taskId || '',
    startedAt: traceStartedAt,
    completedAt: Date.now(),
    status,
    model: extra.model || '',
    usage: extra.usage || null,
    toolRounds: extra.toolRounds ?? null,
    totalCalls: extra.totalCalls ?? null,
    terminalMode: extra.terminalMode || '',
    reasoningChars: extra.reasoningChars ?? null,
    toolCalls: (extra.toolCalls || []).slice(0, 24),
    resumed: Boolean(extra.resumed),
    error: extra.error || null
  })
  const health = await engine.healthz({ signal })
  if (!current()) return false
  if (!health?.ok) {
    const unavailableMessage = '写作工具暂不可用。可以切换为“讨论故事”继续，或稍后重试。'
    recordTurnTrace('failed', { taskId: previousTask, error: { message: unavailableMessage } })
    throw new Error(unavailableMessage)
  }
  const answer = { id, role: 'assistant', kind: 'agent', projectId, chapterId: destination.chapterId, text: '', thinking: '', tools: [], status: 'running', createdAt: Date.now(), taskId: '' }
  state.messages.push(answer)
  // Use the reactive object from the collection; raw-object writes do not trigger Vue updates.
  const message = state.messages[state.messages.length - 1]
  runtime.agentMessageId = message.id
  const callbacks = {
    onChunk: ({ content }) => { if (current()) message.text += String(content || '') },
    onReasoning: ({ content }) => { if (current()) message.thinking = (message.thinking + String(content || '')).slice(-4000) },
    onTask: (task) => {
      if (!current()) return
      if (task.bookId && task.bookId !== projectId) throw new Error('任务作品归属不一致。')
      if (task.taskId) { message.taskId = task.taskId; state.agentTaskId = task.taskId; persist() }
    },
    onStatus: (status) => { if (current() && status.phase === 'tool') message.tools.push({ name: String(status.tool || ''), action: String(status.action || '') }) },
    onComplete: ({ content }) => { if (current()) message.text = String(content || '') }
  }
  try {
    const result = await (previousTask ? engine.resume({ prepared, text: question, taskId: previousTask, signal, callbacks }) : engine.run({ prepared, text: providerQuestion, taskId: id, signal, callbacks }))
    if (!current()) return false
    if (!result?.ok) throw new Error(result?.error?.message || '写作任务未完成，请重试。')
    message.text = String(result.finalContent || '')
    if (!message.text.trim()) throw new Error('写作任务没有返回可用回答。')
    message.status = 'completed'
    message.taskId = result.trace?.taskId || message.taskId
    message.usage = result.usage || null
    message.beatPlan = result.beatPlan || null
    message.toolResults = (result.finalToolResults || []).slice(0, 12)
    message.references = retrievedReferences(prepared, message.toolResults, projectId)
    const submitted = message.toolResults.filter(tool => tool.toolName === 'submit_edit_proposals' && !tool.isError)
    if (submitted.length) {
      const changes = submitted.flatMap(tool => {
        const payload = JSON.parse((tool.result?.content || []).filter(block => block.type === 'text').map(block => block.text || '').join(''))
        return payload.ok ? payload.changes || [] : []
      })
      if (changes.length) message.proposal = engine.prepareProposal({ changes }, prepared, message.id)
    }
    state.agentTaskId = message.taskId
    recordTurnTrace('completed', {
      taskId: message.taskId,
      model: result.model || '',
      usage: result.usage || null,
      toolRounds: result.toolRounds,
      totalCalls: result.totalCalls,
      terminalMode: result.trace?.terminalMode || '',
      reasoningChars: result.trace?.reasoningChars,
      toolCalls: result.trace?.calls || [],
      resumed: Boolean(result.trace?.resumed)
    })
    return true
  } catch (error) {
    message.status = signal.aborted ? 'cancelled' : 'failed'
    recordTurnTrace(message.status, {
      taskId: state.agentTaskId || previousTask,
      error: { message: String(error?.message || '').slice(0, 240) }
    })
    // Partial failed output stays visible, never becomes adoptable.
    throw error
  } finally { runtime.agentMessageId = '' }
}
