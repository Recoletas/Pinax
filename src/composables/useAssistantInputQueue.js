import { computed } from 'vue'

export function createAssistantInputQueue({ activeEntry, send, persist, attached, destination }) {
  const pending = computed(() => activeEntry.value.state.pendingMessages || [])
  function consume(entry, id) {
    const state = entry.state, index = state.pendingMessages.findIndex(item => item.id === id)
    if (index < 0) return
    const [item] = state.pendingMessages.splice(index, 1)
    const answerIndex = state.messages.findIndex(message => message.id === entry.runtime.agentMessageId)
    state.messages.splice(answerIndex < 0 ? state.messages.length : answerIndex, 0, { id: item.id, role: 'user', question: item.question, intent: item.intent, createdAt: item.createdAt })
    persist(entry)
  }
  async function enqueue(payload, mode = 'followup') {
    const entry = activeEntry.value, state = entry.state
    const question = String(payload?.question ?? state.draft).trim()
    const draftBefore = state.draft
    const chapterId = String(destination?.()?.chapterId || '')
    if (entry.runtime.canSaveConversation === false) return false
    if (!question || question.length > 12000 || state.pendingMessages.length >= 8) { state.error = '队列已满或消息过长，请编辑后再发送。'; return false }
    let item = { id: `queued-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`, question, intent: payload?.intent || state.selectedIntent, chapterId, createdAt: Date.now(), status: 'waiting' }
    const owner = state.activeSessionId, token = entry.runtime.token
    state.pendingMessages.push(item)
    item = state.pendingMessages.at(-1)
    state.queuePaused = false
    if (state.draft.trim() === question) { state.draft = ''; entry.runtime.draftRevision += 1 }
    if (persist(entry)?.ok === false) { state.pendingMessages = state.pendingMessages.filter(queued => queued.id !== item.id); state.draft = draftBefore; state.queuePaused = true; persist(entry); return false }
    const running = state.messages.find(message => message.id === entry.runtime.agentMessageId)
    if (mode === 'steer' && (!chapterId || running?.chapterId === chapterId) && state.busy && entry.runtime.requestEngine?.steer && state.agentTaskId) {
      item.status = 'sending'; persist(entry)
      try {
        const result = await entry.runtime.requestEngine.steer(state.agentTaskId, { id: item.id, text: question, bookId: entry.projectId })
        if (state.activeSessionId === owner && entry.runtime.token === token && state.pendingMessages.includes(item)) item.status = result?.ok ? 'accepted' : 'waiting'
      } catch { if (state.activeSessionId === owner && entry.runtime.token === token && state.pendingMessages.includes(item)) item.status = 'waiting' }
      persist(entry)
    }
    if (!state.busy) drain(entry)
    return true
  }
  function drain(entry = activeEntry.value) {
    const state = entry.state
    if (entry !== activeEntry.value || state.busy || entry.runtime.queueDraining || state.queuePaused || !attached() || !state.pendingMessages.length) return
    const item = state.pendingMessages[0]
    if (item.chapterId && item.chapterId !== String(destination?.()?.chapterId || '')) { state.queuePaused = true; state.error = '待发送消息属于另一篇文稿，请切回后继续。'; persist(entry); return }
    if (item.status !== 'waiting') return
    const queue = state.pendingMessages, owner = state.activeSessionId
    entry.runtime.queueDraining = true
    queue.shift(); persist(entry)
    const count = state.messages.length
    let request
    try { request = send({ question: item.question, intent: item.intent, projectId: entry.projectId }) } catch { request = false }
    Promise.resolve(request).then(ok => {
      if (!ok && (state.activeSessionId !== owner || state.messages.length === count)) { queue.unshift(item); state.queuePaused = true; persist(entry) }
    }).catch(() => { state.queuePaused = true; if (state.activeSessionId !== owner || state.messages.length === count) queue.unshift(item); persist(entry) }).finally(() => {
      entry.runtime.queueDraining = false
      if (!state.queuePaused && state.status === 'completed') drain(entry)
    })
  }
  function afterTurn(entry, succeeded) {
    const state = entry.state
    for (const item of state.pendingMessages) if (item.status !== 'waiting') item.status = 'waiting'
    if (!succeeded || state.status === 'needs_input') state.queuePaused = true
    persist(entry)
    if (!state.queuePaused) Promise.resolve().then(() => drain(entry))
  }
  function remove(id) {
    const state = activeEntry.value.state, item = state.pendingMessages.find(item => item.id === id)
    if (!item || item.status !== 'waiting') return false
    state.pendingMessages = state.pendingMessages.filter(item => item.id !== id); persist(activeEntry.value); return true
  }
  function edit(id) {
    const entry = activeEntry.value, item = entry.state.pendingMessages.find(item => item.id === id)
    if (!item || entry.state.draft.trim() || !remove(id)) return false
    entry.state.draft = item.question; entry.runtime.draftRevision += 1; persist(entry); return true
  }
  function resume() { activeEntry.value.state.queuePaused = false; drain() }
  return { pending, enqueue, consume, afterTurn, remove, edit, resume }
}
