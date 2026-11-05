import { isAssistantContextOverflow } from './assistantErrors.js'

// Native pi compaction can itself overflow when a long tool conversation is
// summarized in one request. Split only those summary inputs after a real
// provider rejection; retain every part, then combine their summaries. Normal
// assistant turns/tool results are never truncated or replayed here.
export function completeAssistantSummary(models, model, input, options) {
  const sumUsage = (left, right) => {
    const a = left || {}, b = right || {}
    return Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map(key => [key,
    typeof a[key] === 'object' || typeof b[key] === 'object' ? sumUsage(a[key], b[key]) : (Number(a[key]) || 0) + (Number(b[key]) || 0)
    ]))
  }
  async function complete(context) {
    const result = await models.completeSimple(model, context, options)
    if (result.stopReason !== 'error' || !isAssistantContextOverflow(result.errorMessage)) return result
    let largest = null
    for (let i = 0; i < context.messages.length; i++) {
      const message = context.messages[i]
      if (message.role !== 'user') continue
      const blocks = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content || []
      for (let j = 0; j < blocks.length; j++) if (blocks[j].type === 'text' && (!largest || blocks[j].text.length > largest.text.length)) largest = { i, j, blocks, text: blocks[j].text, string: typeof message.content === 'string' }
    }
    if (!largest) return result
    const start = largest.text.indexOf('<conversation>')
    const end = start < 0 ? -1 : largest.text.indexOf('</conversation>', start)
    const contentStart = start < 0 ? 0 : start + '<conversation>'.length
    const contentEnd = end < 0 ? largest.text.length : end
    const body = largest.text.slice(contentStart, contentEnd)
    if (body.length < 2) return result
    const replace = text => ({ ...context, messages: context.messages.map((message, i) => i !== largest.i ? message : { ...message,
      content: largest.string ? text : largest.blocks.map((block, j) => j === largest.j ? { ...block, text } : block)
    }) })
    const withInstructions = text => largest.text.slice(0, contentStart) + text + largest.text.slice(contentEnd)
    const middle = Math.ceil(body.length / 2)
    const summaries = []
    let usage = {}
    for (const text of [body.slice(0, middle), body.slice(middle)]) {
      if (options?.signal?.aborted) return result
      const part = await complete(replace(withInstructions(text)))
      if (['error', 'aborted'].includes(part.stopReason)) return part
      const summary = (part.content || []).filter(block => block.type === 'text').map(block => block.text).join('\n')
      if (!summary.trim()) return result
      summaries.push(summary); usage = sumUsage(usage, part.usage)
    }
    const combined = summaries.join('\n\n')
    // Don't loop if this model failed to shorten its input.
    if (combined.length >= body.length) return result
    const final = await complete(replace(withInstructions(combined)))
    return { ...final, usage: sumUsage(usage, final.usage) }
  }
  return complete(input)
}
