// Use pi's native steering queue; model/permission snapshots remain unchanged.
export function createAssistantSteering({ agent, task, req, signal, emit }) {
  const seen = new Set()
  const enqueuing = new Map()
  if (task) { task.state.pendingInput = new Set(); agent.steeringMode = 'all' }
  return {
    async enqueue(input) {
      if (req.taskKind !== 'assistant' || !task || input?.bookId !== req.bookId || typeof input?.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.id) || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 12000) return { ok: false, error: 'invalid-live-input' }
      if (seen.has(input.id)) return { ok: true, id: input.id }
      if (enqueuing.has(input.id)) return enqueuing.get(input.id)
      if (signal.aborted || task.state.delivery?.outcome === 'needs_input' || !agent.state.isStreaming) return { ok: false, error: 'task-not-steerable' }
      task.state.pendingInput.add(input.id)
      const request = Promise.resolve().then(() => agent.steer({ role: 'user', content: [{ type: 'text', text: input.text.trim() }], timestamp: Date.now(), pinaxInputId: input.id })).then(() => {
        seen.add(input.id)
        return { ok: true, id: input.id }
      }, () => {
        task.state.pendingInput.delete(input.id)
        return { ok: false, error: 'task-not-steerable' }
      }).finally(() => enqueuing.delete(input.id))
      enqueuing.set(input.id, request)
      return request
    },
    consumed(message) {
      if (message?.role !== 'user' || !task) return
      task.state.delivery = null
      task.state.answerText = ''
      if (!task.state.pendingInput.delete(message.pinaxInputId)) return
      emit(`event: tool.result\ndata: ${JSON.stringify({ toolName: 'author_input', result: { content: [{ type: 'text', text: JSON.stringify({ id: message.pinaxInputId }) }] }, isError: false })}\n\n`)
    }
  }
}
