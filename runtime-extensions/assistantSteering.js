// Use pi's native steering queue; model/permission snapshots remain unchanged.
export function createAssistantSteering({ agent, task, req, counters, budget, signal, emit }) {
  const seen = new Set()
  if (task) { task.state.pendingInput = new Set(); agent.steeringMode = 'all' }
  return {
    enqueue(input) {
      if (req.taskKind !== 'assistant' || !task || input?.bookId !== req.bookId || typeof input?.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.id) || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 12000) return { ok: false, error: 'invalid-live-input' }
      if (seen.has(input.id)) return { ok: true, id: input.id }
      if (signal.aborted || task.state.delivery || task.state.editAttempted || counters.steps >= budget.maxModelSteps - 1 || seen.size >= 8) return { ok: false, error: 'task-not-steerable' }
      seen.add(input.id); task.state.pendingInput.add(input.id)
      agent.steer({ role: 'user', content: [{ type: 'text', text: input.text.trim() }], timestamp: Date.now(), pinaxInputId: input.id })
      return { ok: true, id: input.id }
    },
    consumed(message) {
      if (message?.role !== 'user' || !task?.state.pendingInput.delete(message.pinaxInputId)) return
      emit(`event: tool.result\ndata: ${JSON.stringify({ toolName: 'author_input', result: { content: [{ type: 'text', text: JSON.stringify({ id: message.pinaxInputId }) }] }, isError: false })}\n\n`)
    }
  }
}
