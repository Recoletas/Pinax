// Extends PR #7 prompt transparency within the pinned assistant runtime.
// Prompt content is streamed to the owning browser, never stored in task traces here.
export function assistantStreamOptions(req, context, options, listeners) {
  if (req.taskKind !== 'assistant') return options
  const block = (req.kernel?.blocks || []).find(item => item.kind === 'assistant-sampling')
  let temperature
  if (block) {
    const input = JSON.parse(block.text || '{}')
    if (typeof input.temperature !== 'number' || !Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2) throw new Error('Invalid assistant sampling temperature')
    temperature = input.temperature
  }
  const messages = (context.messages || []).map(message => ({ role: message.role, content: message.content }))
  const latest = messages.findLastIndex(message => message.role === 'user')
  const content = latest < 0 ? '' : messages[latest].content
  const user = typeof content === 'string' ? content : (content || []).filter(part => part.type === 'text').map(part => part.text).join('\n')
  const systemMessages = messages.filter(message => message.role === 'system')
  const system = String(context.systemPrompt || systemMessages.map(message => typeof message.content === 'string' ? message.content : (message.content || []).filter(part => part.type === 'text').map(part => part.text).join('\n')).join('\n'))
  const declarations = new Map()
  for (const message of context.messages || []) {
    if (message.role !== 'system') continue
    for (const tool of message.toolsRemoved || []) declarations.delete(typeof tool === 'string' ? tool : tool.name)
    for (const tool of message.toolsAdded || message.tools || []) declarations.set(tool.name, tool)
  }
  const declaredTools = context.tools || [...declarations.values()]
  const payload = { system, user,
    history: messages.filter((message, index) => index !== latest && message.role !== 'system'), toolNames: declaredTools.map(tool => tool.name), temperature: temperature ?? null }
  const frame = `event: prompt.composed\ndata: ${JSON.stringify(payload)}\n\n`
  for (const listener of listeners) listener(frame)
  return { ...options, ...(temperature == null ? {} : { temperature }) }
}
