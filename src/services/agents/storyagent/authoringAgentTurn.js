import { normalizeRequestModelConfig } from '../../../../shared/requestModelConfig.js'
import { normalizeAssistantQuestions } from '../../../../shared/assistantUserInput.js'
import { toResolvedTextApiSettings } from '../../textProviderConfigStore.js'
import { recordPromptSnapshot } from '../promptSnapshot.js'
import { recordAgentRequestTrace } from '../agentRequestTrace.js'
import { assistantFocusInstruction } from '../authoring/assistantRegenerateOptions.js'
import { ASSISTANT_STOP_MESSAGES } from '../authoring/authoringAssistantConversationStore.js'

function sameJsonValue(left, right) {
  if (left === right) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && sameJsonValue(left[key], right[key]))
}

function preserveInheritedBaselines(proposal, inherited, worldbookId) {
  for (const change of proposal.changes) {
    const previous = inherited.find(item => ['kind', 'targetId', 'field', 'operation', 'before', 'after'].every(key => item[key] === change[key]) && sameJsonValue(item.details, change.details))
    if (!previous) continue
    if (change.kind === 'worldbook' && String(proposal.worldbookId || '') !== String(worldbookId || '')) throw new Error('等待回答期间关联设定库已变化，原候选已保留，请重新定位后继续。')
    // An unchanged candidate is still based on the version read before asking.
    // Re-preparing it must not authorize overwriting edits made while waiting.
    for (const key of ['baseline', 'anchor', 'detailsBaseline']) {
      if (Object.hasOwn(previous, key)) change[key] = previous[key]
      else delete change[key]
    }
  }
  return proposal
}

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

export async function runAuthoringAgentTurn({ engine, entry, question, providerQuestion, token, signal, persist, isCurrent, id, sampling = null, modelSelection = null, permission, sessionId, editDecisions = null, onInputConsumed }) {
  const { state, runtime, projectId } = entry
  const previousTask = state.agentTaskId || ''
  const waitingProposal = previousTask && state.messages.findLast(message => message.taskId === previousTask && message.status === 'needs_input' && message.proposal?.bookId === projectId)?.proposal
  const inheritedWorldbookId = waitingProposal?.worldbookId
  const inheritedChanges = waitingProposal ? JSON.parse(JSON.stringify(waitingProposal.changes.filter(change => !change.status || change.status === 'pending'))) : []
  // Prepare synchronously before health probing or loading the bridge.
  const prepared = engine.prepare({ text: previousTask ? question : providerQuestion, bookId: projectId, pinnedRefs: state.agentRefs || [], skills: state.agentSkills || [], editDecisions })
  prepared.authorQuestion = question
  const currentQuestionSuffix = `\n\n本次作者问题：${question}`
  prepared.authorConversation = providerQuestion !== question && providerQuestion?.endsWith(currentQuestionSuffix)
    ? providerQuestion.slice(0, -currentQuestionSuffix.length) : ''
  prepared.authorAmendments = []
  prepared.sampling = sampling
  prepared.modelConfig = normalizeRequestModelConfig(modelSelection)
  prepared.modelSettings = modelSelection ? toResolvedTextApiSettings(modelSelection) : null
  if (sampling) {
    prepared.kernel.serialization.blocks.push({ kind: 'assistant-focus', title: '本轮参考侧重', text: assistantFocusInstruction(sampling.intent) })
    if (sampling.temperatureOverride !== null) prepared.kernel.serialization.blocks.push({ kind: 'assistant-sampling', title: '本轮取样参数', text: JSON.stringify({ temperature: sampling.temperatureOverride }) })
  }
  const destination = engine.destination?.() || { chapterId: '' }
  const current = () => isCurrent(token) && !signal.aborted
  if (engine.enrichPrepared) await engine.enrichPrepared(prepared, { text: question, signal })
  if (!current()) return false
  const health = await engine.healthz({ signal })
  if (!current()) return false
  if (prepared.modelConfig && !health?.requestModels) throw new Error('运行器尚未支持按任务切换模型，请更新运行器；本次尚未调用模型。')
  if (engine.authorize && !health?.assistantNarrativeExchange) throw new Error('运行器需要更新以支持写作方法与连续生成；本次尚未调用模型。')
  if (!health?.ok) throw new Error('助手服务暂不可用，输入已保留。')
  if (sampling?.temperatureOverride != null && !health.assistantSampling) throw new Error('助手运行包尚未支持参数重答，请更新运行包后重试。')
  if (previousTask) {
    await engine.waitForTaskIdle?.(previousTask, { bookId: projectId, signal })
    if (!current()) return false
    state.agentStopPending = false
  }
  if (engine.authorize) {
    if (health.assistantProtocolVersion !== 2) throw new Error('助手运行包需要更新，本轮尚未执行，输入已保留。')
    await engine.authorize(permission, sessionId, prepared, signal)
    if (!current()) return false
  }
  const answer = { id, role: 'assistant', kind: 'agent', projectId, chapterId: destination.chapterId, text: '', thinking: '', tools: [], status: 'running', createdAt: Date.now(), taskId: '', params: sampling, modelName: modelSelection?.model || health.model || '', modelConfigId: modelSelection?.id || '' }
  state.messages.push(answer)
  // Use the reactive object from the collection; raw-object writes do not trigger Vue updates.
  const message = state.messages[state.messages.length - 1]
  runtime.agentMessageId = message.id
  let streamedAnswer = ''
  let proposalWork = Promise.resolve()
  const sameChange = (left, right) => ['kind', 'targetId', 'field', 'operation', 'before'].every(key => left[key] === right[key])
  function retainProposal(changes, { narrativeReceipt, tool } = {}) {
    const work = proposalWork.then(async () => {
      const inputChanges = typeof changes === 'function' ? changes(message.proposal?.changes || []) : changes
      const proposal = preserveInheritedBaselines(await engine.prepareProposal({ changes: inputChanges }, prepared, message.id), inheritedChanges, inheritedWorldbookId)
      const previous = message.proposal
      if (narrativeReceipt) proposal.narrativeReceipt = narrativeReceipt
      else if (previous?.narrativeReceipt && previous.changes.some(change => change.kind === 'chapter' && proposal.changes.some(next => sameChange(change, next) && change.after === next.after))) proposal.narrativeReceipt = previous.narrativeReceipt
      // This completed candidate belongs to its original message, including when
      // a later call is cancelled while proposal validation is settling.
      if (state.messages.includes(message)) { message.proposal = proposal; persist() }
      return proposal
    })
    proposalWork = work.catch(error => {
      if (tool) { tool.status = 'failed'; tool.error = String(error.message || '修改建议未通过校验。'); persist() }
    })
    return work
  }
  prepared.onNarrativeModelRequest = input => {
    if (!current()) return
    const key = `${id}:narrative:${input.phase}`
    recordPromptSnapshot({ key, surface: 'authoring', projectId, sessionId, temperature: input.temperature,
      blocks: input.messages.map(item => ({ kind: item.role === 'system' ? 'system' : 'user', content: item.content, chars: String(item.content || '').length })),
      toolNames: input.toolNames, budget: { usedChars: input.messages.reduce((sum, item) => sum + String(item.content || '').length, 0) } })
    if (!['review', 'plan'].includes(input.phase)) message.narrativePromptKey = key
  }
  const callbacks = {
    onNarrativeRequest: async request => {
      if (!current()) throw new Error('任务已停止。')
      // Validate all pending edits against this task's original baseline first.
      if (request.pendingChanges?.length) await engine.prepareProposal({ changes: request.pendingChanges }, prepared, message.id)
      let draft = null, lastUpdate = 0, lastPersist = 0
      const onDraftUpdate = update => {
        if (!current() || prepared.onNarrativeDraftUpdate !== onDraftUpdate || update?.phase !== 'write') return
        if (update.text && Date.now() - lastUpdate < 100) return
        lastUpdate = update.text ? Date.now() : 0
        if (!draft) {
          if (!update.text) return
          ;(message.generatedDrafts ||= []).push({ ...request, text: '', status: 'generating' })
          draft = message.generatedDrafts.at(-1)
        }
        draft.text = String(update.text || '')
        if (!draft.text || Date.now() - lastPersist >= 1000) { lastPersist = Date.now(); persist() }
      }
      prepared.onNarrativeDraftUpdate = onDraftUpdate
      let proposal
      try { proposal = await engine.prepareNarrativeProposal(request, prepared, message.id, signal) }
      catch (error) {
        if (error.generatedText?.trim() || draft?.text) {
          if (draft) {
            const previousText = draft.text
            draft.text = error.generatedText?.trim() || draft.text; draft.status = 'interrupted'
            // Stop already retained the visible partial draft. Replace that
            // suffix when abort returns its last tokens, rather than duplicating it.
            if (previousText && message.text.endsWith(previousText)) message.text = message.text.slice(0, -previousText.length) + draft.text
          }
          else (message.generatedDrafts ||= []).push({ ...request, text: error.generatedText, status: 'interrupted' })
          persist()
        }
        throw error
      } finally {
        if (prepared.onNarrativeDraftUpdate === onDraftUpdate) prepared.onNarrativeDraftUpdate = null
      }
      const change = proposal.changes.find(item => item.kind === 'chapter' && item.field === 'content')
      const previous = request.pendingChanges || []
      const same = previous.find(item => sameChange(item, change))
      const completeChange = same && request.draftAction === 'extend' && change.operation === 'append' ? { ...change, after: `${same.after}\n\n${change.after}` } : change
      const groupId = previous.find(item => item.groupId)?.groupId || `narrative-${message.id}`
      await retainProposal([...previous.filter(item => item !== same), completeChange].map(item => ({ ...item, groupId })), { narrativeReceipt: proposal.narrativeReceipt })
      if (draft) { message.generatedDrafts = message.generatedDrafts.filter(item => item !== draft); persist() }
      // Keep the validated candidate before posting its result to the runtime.
      if (!current()) throw new Error('任务已停止。')
      return { text: change.after }
    },
    onChunk: ({ content }) => { if (current()) { streamedAnswer += String(content || ''); message.text = streamedAnswer } },
    onReasoning: ({ content }) => { if (current()) message.thinking = (message.thinking + String(content || '')).slice(-4000) },
    onTask: (task) => {
      if (!current()) return
      if (task.bookId && task.bookId !== projectId) throw new Error('任务作品归属不一致。')
      if (task.taskId) { message.taskId = task.taskId; state.agentTaskId = task.taskId; persist() }
    },
    onStatus: (status) => {
      if (!current() || status.phase !== 'tool' || status.tool === 'complete_assistant_task') return
      const callId = String(status.callId || '')
      const tool = callId && message.tools.find(item => item.callId === callId)
      if (tool) {
        // Replayed starts may fill missing input, but cannot reopen a finished call.
        if (!tool.input && status.input) tool.input = status.input
        if (!tool.action && status.action) tool.action = String(status.action)
        return
      }
      message.tools.push({ name: String(status.tool || ''), action: String(status.action || ''), callId, input: status.input || null, status: 'running' })
    },
    onPromptComposed: composed => {
      if (!current() || !composed || typeof composed.system !== 'string' || typeof composed.user !== 'string') return
      recordPromptSnapshot({ key: id, surface: 'authoring-agent', projectId, sessionId,
        blocks: [{ kind: 'system', content: composed.system, chars: composed.system.length }, { kind: 'user', content: composed.user, chars: composed.user.length }, ...(composed.history?.length ? [{ kind: 'history', content: composed.history, chars: JSON.stringify(composed.history).length }] : [])],
        toolNames: composed.toolNames || [], temperature: composed.temperature, budget: { usedChars: composed.system.length + composed.user.length + (composed.history?.length ? JSON.stringify(composed.history).length : 0) } })
      message.promptSnapshotKey = id
    },
    onToolResult: result => {
      if (!current() || result.toolName === 'complete_assistant_task') return
      if (result.toolName === 'author_input') {
        try {
          const inputId = JSON.parse(result.result?.content?.[0]?.text || '{}').id
          const input = state.pendingMessages?.find(item => item.id === inputId)
          if (input?.question) prepared.authorAmendments.push(input.question)
          onInputConsumed?.(inputId)
        } catch { /* malformed acknowledgement */ }
        return
      }
      const callId = String(result.callId || '')
      let tool = message.tools.find(item => callId ? item.callId === callId : item.name === result.toolName && item.status === 'running')
      if (tool && tool.status !== 'running') return
      if (!tool) {
        // A result is evidence of its own call even when the start was missed.
        tool = { name: result.toolName, action: '', callId, input: result.input || null, status: 'running' }
        message.tools.push(tool)
        tool = message.tools.at(-1)
      }
      let payload
      try { payload = JSON.parse(result.result?.content?.find(block => block.type === 'text')?.text || '{}') } catch { /* plain tool results */ }
      tool.status = result.isError || payload?.ok === false || (tool.name === 'submit_edit_proposals' && payload?.ok !== true) ? 'failed' : 'completed'
      if (tool.status === 'failed') tool.error = String(payload?.error?.message || payload?.error || (result.isError ? result.result?.content?.find(block => block.type === 'text')?.text : '') || '工具未返回有效结果。').trim().split('\n')[0].slice(0, 180)
      if (['submit_edit_proposals', 'generate_narrative_draft'].includes(tool.name) && tool.status === 'completed') {
        // Save accepted batches before the stream ends, including a later disconnect.
        ;(message.toolResults ||= []).push(result)
        persist()
        if (payload?.ok && (payload.proposalChanges?.length || payload.changes?.length)) {
          const changes = payload.proposalChanges || (previous => [...previous.filter(change => !payload.changes.some(next => sameChange(change, next))), ...payload.changes])
          // The bridge need not await display callbacks; the turn owner drains
          // this ordered validation queue before completing or stopping.
          void retainProposal(changes, { tool }).catch(() => {})
        }
      }
    },
    onComplete: ({ content }) => { if (current()) message.text = streamedAnswer.trim() ? streamedAnswer : String(content || '') }
  }
  try {
    const result = await (previousTask ? engine.resume({ prepared, text: question, taskId: previousTask, signal, callbacks }) : engine.run({ prepared, text: providerQuestion, taskId: id, signal, callbacks }))
    // Reconcile identified results if the stream omitted their individual callback.
    for (const toolResult of result?.finalToolResults || []) if (toolResult.callId && toolResult.toolName !== 'author_input') callbacks.onToolResult(toolResult)
    await proposalWork
    if (!current()) return false
    message.toolResults = [...(message.toolResults || []), ...(result?.finalToolResults || []).filter(tool => !(message.toolResults || []).some(existing => existing === tool || tool.callId && existing.callId === tool.callId && existing.toolName === tool.toolName))]
    if (!result?.ok) throw new Error(result?.error?.message || '写作任务未完成，请重试。')
    message.text = String(streamedAnswer.trim() ? streamedAnswer : result.finalContent || '')
    message.status = 'completed'
    message.taskId = result.trace?.taskId || message.taskId
    message.usage = result.usage || null
    message.beatPlan = result.beatPlan || null
    message.references = retrievedReferences(prepared, message.toolResults, projectId)
    const editResults = message.toolResults.filter(tool => ['submit_edit_proposals', 'generate_narrative_draft'].includes(tool.toolName) && !tool.isError).map(tool => {
      try { return JSON.parse(tool.result?.content?.find(block => block.type === 'text')?.text || '{}') } catch { return {} }
    }).filter(payload => payload.ok)
    const accumulated = editResults.findLast(payload => Array.isArray(payload.proposalChanges))
    const changes = Array.isArray(result.proposalChanges) ? result.proposalChanges : accumulated?.proposalChanges || editResults.flatMap(payload => payload.changes || [])
    if (changes.length) await retainProposal(changes)
    if (!current()) return false
    const deliveryResult = message.toolResults.findLast(tool => ['complete_assistant_task', 'request_user_input'].includes(tool.toolName) && !tool.isError)
    if (engine.authorize) {
      let delivery
      // The runtime's terminal metadata is authoritative. Earlier tool results may
      // describe an intermediate proposal or question within the same pi turn.
      try { delivery = result.delivery ? { ok: true, ...result.delivery } : deliveryResult ? JSON.parse(deliveryResult.result?.content?.find(block => block.type === 'text')?.text || '{}') : null } catch { /* invalid delivery */ }
      if (!delivery?.ok || !['answer', 'proposal', 'needs_input', 'blocked'].includes(delivery.outcome) || !['answer', 'edit', 'mixed'].includes(delivery.intent) || (delivery.outcome === 'proposal' && !message.proposal) || (message.proposal && !['proposal', 'needs_input', 'blocked'].includes(delivery.outcome))) throw new Error('助手未交付有效的修改，已有内容已保留。')
      // Older runtimes may acknowledge an answer that never emitted any text.
      // Keep reasoning separate and do not present the delivery receipt as a reply.
      if (delivery.outcome === 'answer' && !streamedAnswer.trim() && (!message.text.trim() || message.text === String(delivery.message || ''))) {
        message.text = ''
        throw new Error('助手未输出正式回答，请重新生成；完成说明不能代替回答。')
      }
      message.outcome = delivery.outcome
      if (delivery.outcome === 'needs_input' && delivery.questions) message.questions = normalizeAssistantQuestions(delivery.questions)
      if (['needs_input', 'blocked'].includes(delivery.outcome)) message.status = delivery.outcome
      message.deliveryMessage = String(delivery.message || '')
      message.text = streamedAnswer.trim() ? streamedAnswer : message.text || message.deliveryMessage
    }
    if (!message.text.trim()) throw new Error('写作任务没有返回可用回答。')
    // A question may follow useful edits. Keep that original candidate until the
    // resumed task has produced a valid replacement, then expose only its latest copy.
    if (previousTask && Array.isArray(result.proposalChanges)) {
      for (const previous of state.messages) {
        if (previous === message || previous.taskId !== previousTask || previous.status !== 'needs_input' || !previous.proposal) continue
        delete previous.proposal
      }
    }
    state.agentTaskId = message.taskId
    return true
  } catch (error) {
    await proposalWork
    if (error.generatedText?.trim()) message.text = error.generatedText
    for (const draft of message.generatedDrafts || []) if (draft.status === 'generating') draft.status = 'interrupted'
    const interruptedDraft = message.generatedDrafts?.findLast(draft => draft.status === 'interrupted' || !message.proposal)?.text
    if (interruptedDraft && !String(message.text || '').includes(interruptedDraft)) message.text += '\n\n' + interruptedDraft
    const retained = (message.toolResults || []).filter(tool => tool.toolName === 'submit_edit_proposals' && !tool.isError).flatMap(tool => {
      try { const payload = JSON.parse(tool.result?.content?.find(block => block.type === 'text')?.text || '{}'); return payload.ok ? payload.changes || [] : [] } catch { return [] }
    })
    if (retained.length && !message.proposal) message.text = `${message.text}\n\n本轮未完成，以下已生成内容保留供复制，尚未写入作品：\n\n${retained.map(change => `### ${change.title || change.targetId}\n${change.after}`).join('\n\n')}`.trim()
    if (signal.aborted) {
      // The owner records why it stopped before aborting the transport. A late
      // abort rejection must not turn a workspace interruption into author cancel.
      if (!['cancelled', 'interrupted'].includes(message.status)) message.status = 'interrupted'
      message.stopReason ||= 'unknown'
      message.failureReason ||= ASSISTANT_STOP_MESSAGES[message.stopReason] || ASSISTANT_STOP_MESSAGES.unknown
    } else {
      message.status = 'failed'
      message.failureReason = String(error.message || '生成中断，文字已保留。')
    }
    // Only candidates that completed validation are reviewable. Interrupted
    // generatedText remains chat text and never replaces that last candidate.
    throw error
  } finally {
    await proposalWork
    if (message.proposal && ['cancelled', 'interrupted', 'failed'].includes(message.status)) message.failureReason = `${message.failureReason || '本轮未完成。'} 上一版完整修改已保留，可查看修改建议。`
    let closedTools = false
    for (const tool of message.tools) if (tool.status === 'running') {
      tool.status = message.status === 'cancelled' || (signal.aborted && message.status !== 'interrupted') ? 'cancelled' : 'interrupted'
      closedTools = true
    }
    // Cancellation is persisted before the transport settles. Its late rejection
    // may carry the last generated prose even when no tool row needs closing.
    if ((closedTools || ['cancelled', 'interrupted', 'failed'].includes(message.status)) && state.messages.includes(message)) persist()
    recordAgentRequestTrace({ requestId: id, kind: 'agent', projectId, taskId: message.taskId, startedAt: message.createdAt, completedAt: Date.now(),
      status: message.status, usage: message.usage, totalCalls: message.tools.length, toolCalls: message.tools.map(tool => ({ name: tool.name, status: tool.status })),
      error: message.failureReason ? { message: message.failureReason.slice(0, 240) } : null })
    if (runtime.agentMessageId === message.id) runtime.agentMessageId = ''
  }
}
