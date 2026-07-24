const META_LINE_PATTERN = /^(?:思考|分析|解释|说明|备注|建议|推理|结论|总结|提示|补充|进一步|下面|以下|我认为|我建议|可以考虑|我们可以|建议如下|分析如下|这段|这一段|这里|可改为|可以写成|可以这样|你可以|应该|因为|为了|如果|注意)[:：，,\-\s]*/i
const META_PHRASE_PATTERN = /(?:作为(?:AI|人工智能|写作助手)|我(?:无法|不能|可以|建议|认为)|这(?:不是|应该|可以|属于)|需要根据|建议你|可以这样写|以下是|下面是|续写如下|补全如下|可参考|没有足够|无法判断)/
const PROSE_SIGNAL_PATTERN = /[。！？!?」』”"）)]$|^["“「『*]|^[他她它我你他们她们我们]/u

export function extractWritingSuggestionWindow(content, cursorPos, options = {}) {
  const text = String(content || '')
  const safeCursor = Math.max(0, Math.min(text.length, Number(cursorPos) || 0))
  const upstream = Math.max(0, Number(options.upstream) || 900)
  const downstream = Math.max(0, Number(options.downstream) || 180)
  const beforeRaw = text.slice(Math.max(0, safeCursor - upstream), safeCursor)
  const paragraphBoundary = beforeRaw.lastIndexOf('\n\n')
  const before = paragraphBoundary >= 0 ? beforeRaw.slice(paragraphBoundary + 2) : beforeRaw
  const after = text.slice(safeCursor, safeCursor + downstream)
  return { before, after, contextText: before + after, cursorPos: safeCursor }
}

export function normalizeWritingSuggestion(rawText, maxLength = 180) {
  let text = String(rawText || '').trim()
    .replace(/^(?:续写|补全|建议|输出)[:：]\s*/i, '')
    .replace(/^以下是(?:续写|补全|建议)?[:：]?\s*/i, '')
    .replace(/^```(?:\w+)?\s*/i, '')
    .replace(/```$/i, '')
    .trim()
  if (!text) return ''

  if (META_PHRASE_PATTERN.test(text)) {
    text = text.split(/\r?\n+/)
      .map((line) => line.trim())
      .find((line) => line && !META_LINE_PATTERN.test(line) && PROSE_SIGNAL_PATTERN.test(line)) || ''
  }
  text = text.split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !META_LINE_PATTERN.test(line) && !META_PHRASE_PATTERN.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!text || (!PROSE_SIGNAL_PATTERN.test(text) && !/[。！？!?」』”"]/.test(text))) return ''
  if (text.length <= maxLength) return text

  const clipped = text.slice(0, maxLength)
  const sentenceEnd = Math.max(
    clipped.lastIndexOf('。'),
    clipped.lastIndexOf('！'),
    clipped.lastIndexOf('？'),
    clipped.lastIndexOf('.'),
    clipped.lastIndexOf('!'),
    clipped.lastIndexOf('?')
  )
  return sentenceEnd > Math.floor(maxLength * 0.45)
    ? clipped.slice(0, sentenceEnd + 1).trim()
    : clipped.trim()
}
