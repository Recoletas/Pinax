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
        locator: source.type === 'source' ? { kind: 'source-document', documentId: source.sourceDocumentId || source.id, worldbookId: prepared.editBaseline?.worldbook?.id || '', contentHash: source.contentHash || '', chunkId: source.chunkId || '', start: source.sourceOffset, end: Number.isFinite(source.sourceOffset) ? source.sourceOffset + original.length : null } : domain === 'world' ? { kind: 'worldbook-entry', worldbookId: prepared.editBaseline?.worldbook?.id || '', entryId: source.id } : domain === 'manuscript' ? { kind: 'manuscript', chapterId: source.id, documentId: source.id } : domain === 'notes' ? { kind: 'exploration', documentId: source.id } : domain === 'outline' ? { kind: 'outline-node', nodeId: source.id } : null })
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
  const health = await engine.healthz({ signal })
  if (!current()) return false
  if (!health?.ok) throw new Error('助手服务暂不可用，输入已保留。')
  if (engine.authorize) {
    if (health.assistantProtocolVersion !== 2) throw new Error('助手运行包需要更新，本轮尚未执行，输入已保留。')
    await engine.authorize(state.agentPermission || { mode: 'review', scope: 'current' }, state.activeSessionId, prepared, signal)
    if (!current()) return false
  }
  const answer = { id, role: 'assistant', kind: 'agent', projectId, chapterId: destination.chapterId, text: '', thinking: '', tools: [], status: 'running', createdAt: Date.now(), taskId: '' }
  state.messages.push(answer)
  // Use the reactive object from the collection; raw-object writes do not trigger Vue updates.
  const message = state.messages[state.messages.length - 1]
  runtime.agentMessageId = message.id
  let streamedAnswer = ''
  const callbacks = {
    onChunk: ({ content }) => { if (current()) { streamedAnswer += String(content || ''); message.text = streamedAnswer } },
    onReasoning: ({ content }) => { if (current()) message.thinking = (message.thinking + String(content || '')).slice(-4000) },
    onTask: (task) => {
      if (!current()) return
      if (task.bookId && task.bookId !== projectId) throw new Error('任务作品归属不一致。')
      if (task.taskId) { message.taskId = task.taskId; state.agentTaskId = task.taskId; persist() }
    },
    onStatus: (status) => { if (current() && status.phase === 'tool' && status.tool !== 'complete_assistant_task') message.tools.push({ name: String(status.tool || ''), action: String(status.action || ''), status: 'running' }) },
    onToolResult: result => {
      if (!current() || result.toolName === 'complete_assistant_task') return
      const tool = message.tools.find(item => item.name === result.toolName && item.status === 'running')
      if (!tool) return
      let payload
      try { payload = JSON.parse(result.result?.content?.find(block => block.type === 'text')?.text || '{}') } catch { /* plain tool results */ }
      tool.status = result.isError || payload?.ok === false || (tool.name === 'submit_edit_proposals' && payload?.ok !== true) ? 'failed' : 'completed'
      if (tool.status === 'failed') tool.error = String(payload?.error || (result.isError ? result.result?.content?.find(block => block.type === 'text')?.text : '') || '工具未返回有效结果。').split('\n')[0].slice(0, 180)
    },
    onComplete: ({ content }) => { if (current()) message.text = streamedAnswer.trim() ? streamedAnswer : String(content || '') }
  }
  try {
    const result = await (previousTask ? engine.resume({ prepared, text: question, taskId: previousTask, signal, callbacks }) : engine.run({ prepared, text: providerQuestion, taskId: id, signal, callbacks }))
    if (!current()) return false
    message.toolResults = result?.finalToolResults || []
    if (!result?.ok) throw new Error(result?.error?.message || '写作任务未完成，请重试。')
    message.text = String(result.finalContent || streamedAnswer || '')
    if (!message.text.trim()) throw new Error('写作任务没有返回可用回答。')
    message.status = 'completed'
    message.taskId = result.trace?.taskId || message.taskId
    message.usage = result.usage || null
    message.beatPlan = result.beatPlan || null
    message.references = retrievedReferences(prepared, message.toolResults, projectId)
    const submitted = message.toolResults.filter(tool => tool.toolName === 'submit_edit_proposals' && !tool.isError)
    if (submitted.length) {
      const changes = submitted.flatMap(tool => {
        const payload = JSON.parse((tool.result?.content || []).filter(block => block.type === 'text').map(block => block.text || '').join(''))
        return payload.ok ? payload.changes || [] : []
      })
      if (changes.length) message.proposal = await engine.prepareProposal({ changes }, prepared, message.id)
    }
    if (!current()) return false
    const deliveryResult = message.toolResults.findLast(tool => tool.toolName === 'complete_assistant_task' && !tool.isError)
    if (engine.authorize) {
      let delivery
      try { delivery = JSON.parse(deliveryResult?.result?.content?.find(block => block.type === 'text')?.text || '{}') } catch { /* invalid delivery */ }
      if (!delivery?.ok || !['answer', 'proposal', 'needs_input', 'blocked'].includes(delivery.outcome) || !['answer', 'edit', 'mixed'].includes(delivery.intent) || (['edit', 'mixed'].includes(delivery.intent) && delivery.outcome === 'answer') || (delivery.outcome === 'proposal' && !message.proposal) || (message.proposal && delivery.outcome !== 'proposal') || (message.toolResults.some(tool => tool.toolName === 'submit_edit_proposals') && delivery.outcome === 'answer')) throw new Error('助手未交付有效的修改，已有内容已保留。')
      message.outcome = delivery.outcome
      if (['needs_input', 'blocked'].includes(delivery.outcome)) message.status = delivery.outcome
      message.deliveryMessage = String(delivery.message || '')
      message.text = delivery.outcome === 'answer' ? (streamedAnswer.trim() ? streamedAnswer : message.text || message.deliveryMessage) : message.deliveryMessage || message.text
    }
    state.agentTaskId = message.taskId
    return true
  } catch (error) {
    message.status = signal.aborted ? 'cancelled' : 'failed'
    message.failureReason = signal.aborted ? '' : String(error.message || '生成中断，文字已保留。')
    delete message.proposal
    // Partial failed output stays visible, never becomes adoptable.
    throw error
  } finally { runtime.agentMessageId = '' }
}
