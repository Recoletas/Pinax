// Keep vendor protocol adjustments scoped to the selected model and request.
export function withRequestModelTransport(models, config) {
  if (config.api !== 'anthropic-messages' || !/^MiniMax-M3(?:[.-]|$)/i.test(config.model || '')) return models
  for (const name of ['stream', 'streamSimple']) {
    if (typeof models[name] !== 'function') continue
    const original = models[name].bind(models)
    models[name] = (model, context, options = {}) => original(model, context, {
      ...options,
      onPayload: async (payload, selected) => {
        const prepared = (options.onPayload ? await options.onPayload(payload, selected) : payload) ?? payload
        return { ...prepared, thinking: { type: 'adaptive' } }
      }
    })
  }
  return models
}

// Never send an interrupted tool call back to the provider as if it completed.
export function cleanAssistantResumeHistory(messages) {
  const results = new Set(messages.filter(message => message.role === 'toolResult').map(message => message.toolCallId))
  const calls = new Set()
  return messages.flatMap(message => {
    if (message.role === 'assistant') {
      if (['error', 'aborted'].includes(message.stopReason)) return []
      if (!Array.isArray(message.content)) return [message]
      const content = message.content.filter(part => part.type !== 'toolCall' || results.has(part.id))
      for (const part of content) if (part.type === 'toolCall') calls.add(part.id)
      return content.length ? [{ ...message, content }] : []
    }
    if (message.role === 'toolResult' && !calls.has(message.toolCallId)) return []
    return [message]
  })
}
