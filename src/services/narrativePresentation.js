const BLOCK_KINDS = new Set(['narration', 'action', 'dialogue', 'thought', 'system'])
const MARKER_RE = /^:::(narration|action|dialogue|thought|system)(?:\|([^\n|]{1,80}))?\s*$/

export const NARRATIVE_PRESENTATION_VERSION = 2
export const NARRATIVE_BLOCK_KINDS = Object.freeze([...BLOCK_KINDS])

export function buildNarrativeFormatInstructions() {
  return [
    '【叙事输出格式】',
    '请在每个语义块的行首使用 marker；不要输出 HTML、JSON、颜色说明或其他控制标签。',
    '允许的类型只有：:::narration、:::action|角色名、:::dialogue|角色名、:::thought|角色名、:::system。',
    'marker 后换行写正文；同一块可以有多行；speaker 只有明确知道说话者时才填写，不要猜测角色。',
    '台词保留中文或英文引号，动作和心理保持自然文字；不要替玩家决定未输入的行动。',
    '示例：\n:::narration\n雨水沿着舷窗滑落。\n:::dialogue|陆晨曦\n“信号还在吗？”\n:::action|陆晨曦\n她抬手调高了增益。',
    '如果没有明显语义切换，可以只输出一个 narration 块。'
  ].join('\n')
}

export function createNarrativeMessageId(message = {}, index = 0) {
  const seed = [message.id, message.timestamp, message.role, message.name, message.content, index]
    .map((value) => String(value ?? ''))
    .join('|')
  return `msg_${hashText(seed)}`
}

export function ensureNarrativeMessage(message = {}, index = 0) {
  const normalized = { ...message }
  if (!normalized.id) normalized.id = createNarrativeMessageId(normalized, index)
  const presentationNeedsRefresh = !normalized.presentation
    || (normalized.presentation.source === 'parser'
      && Number(normalized.presentation.version || 0) < NARRATIVE_PRESENTATION_VERSION)
  if (presentationNeedsRefresh && normalized.content && normalized.type !== 'scene') {
    normalized.presentation = parseNarrativePresentation(normalized.content, {
      messageId: normalized.id,
      complete: true,
      fallbackSpeaker: getTrustedMessageSpeaker(normalized),
      role: normalized.role
    })
  }
  return normalized
}

export function normalizeNarrativeMessages(messages = []) {
  return (Array.isArray(messages) ? messages : []).map((message, index) => (
    ensureNarrativeMessage(message || {}, index)
  ))
}

export function parseNarrativePresentation(text, options = {}) {
  const complete = options.complete !== false
  const sourceText = complete ? String(text || '') : trimPendingMarkerLine(text)
  const messageId = String(options.messageId || 'message')
  const fallbackSpeaker = normalizeSpeaker(options.fallbackSpeaker)
  const structured = parseMarkedBlocks(sourceText, messageId, { complete, fallbackSpeaker })
  if (structured) return structured
  return {
    version: NARRATIVE_PRESENTATION_VERSION,
    source: 'parser',
    status: complete ? 'complete' : 'provisional',
    content: sourceText,
    blocks: parseLegacyBlocks(sourceText, messageId, { fallbackSpeaker }),
    hasMarkers: false
  }
}

export function parseMarkedBlocks(text, messageId = 'message', options = {}) {
  const complete = options.complete !== false
  const fallbackSpeaker = normalizeSpeaker(options.fallbackSpeaker)
  const lines = String(text || '').split('\n')
  const blocks = []
  let current = null
  let sawMarker = false
  let invalidMarker = false

  const flush = () => {
    if (!current) return
    const value = current.lines.join('\n').trim()
    if (value) {
      const speaker = current.speaker || (current.kind === 'dialogue' ? fallbackSpeaker : '')
      const speakerSource = current.speaker ? 'marker' : (speaker ? 'message' : '')
      blocks.push(createBlock(current.kind, value, speaker, messageId, blocks.length, speakerSource))
    }
    current = null
  }

  for (const line of lines) {
    const marker = line.match(MARKER_RE)
    if (marker) {
      sawMarker = true
      flush()
      current = { kind: marker[1], speaker: normalizeSpeaker(marker[2]), lines: [] }
      continue
    }
    if (/^:::[^\s]/.test(line)) invalidMarker = true
    if (current) current.lines.push(line)
    else if (line.trim()) current = { kind: 'narration', speaker: '', lines: [line] }
  }
  flush()

  if (!sawMarker || invalidMarker || (complete && blocks.length === 0)) return null
  return {
    version: NARRATIVE_PRESENTATION_VERSION,
    source: 'model-structured',
    status: complete ? 'complete' : 'provisional',
    content: blocks.map((block) => block.text).join('\n\n'),
    blocks,
    hasMarkers: true
  }
}

function trimPendingMarkerLine(text) {
  const source = String(text || '')
  const lines = source.split('\n')
  const lastLine = lines[lines.length - 1]
  if (/^:{1,3}[a-z]*(?:\|[^\n]*)?$/i.test(lastLine)) lines.pop()
  return lines.join('\n')
}

function parseLegacyBlocks(text, messageId, options = {}) {
  const source = String(text || '').trim()
  if (!source) return []
  const blocks = []
  const fallbackSpeaker = normalizeSpeaker(options.fallbackSpeaker)
  const paragraphs = source.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)
  for (const paragraph of paragraphs) {
    for (const line of paragraph.split('\n').map((value) => value.trim()).filter(Boolean)) {
      const action = line.match(/^\*([^*\n]+)\*$/)
      const thought = line.match(/^[（(]([^）)\n]+)[）)]$/)
      if (action) blocks.push(createBlock('action', action[1], '', messageId, blocks.length))
      else if (thought) blocks.push(createBlock('thought', thought[1], '', messageId, blocks.length))
      else if (hasDialogue(line)) {
        const explicitSpeaker = extractExplicitDialogueSpeaker(line)
        const speaker = explicitSpeaker || fallbackSpeaker
        blocks.push(createBlock(
          'dialogue',
          line,
          speaker,
          messageId,
          blocks.length,
          explicitSpeaker ? 'text' : (speaker ? 'message' : '')
        ))
      }
      else blocks.push(createBlock('narration', line, '', messageId, blocks.length))
    }
  }
  return blocks
}

function hasDialogue(text) {
  return /"[^"\n]+"|“[^”\n]+”|「[^」\n]+」|‘[^’\n]+’/.test(text)
}

function extractExplicitDialogueSpeaker(text) {
  const line = String(text || '').trim()
  const openingQuoteIndex = line.search(/[“"「‘]/)
  if (openingQuoteIndex < 0) return ''

  const beforeQuote = line.slice(0, openingQuoteIndex).trim()
  const prefix = beforeQuote.match(/^([^\s：:，,。！？!?]{1,24}?)(?:轻声|低声|沉声|冷冷地|缓缓地?|忽然)?(?:说|说道|问|问道|答|答道|喊|喊道|叫|叫道|低语|呢喃|开口)\s*[：:]?$/)
    || beforeQuote.match(/^([^\s：:，,。！？!?]{1,24})\s*[：:]$/)
  if (prefix) return normalizeExplicitSpeaker(prefix[1])

  const closingQuoteIndex = Math.max(
    line.lastIndexOf('”'),
    line.lastIndexOf('"'),
    line.lastIndexOf('」'),
    line.lastIndexOf('’')
  )
  if (closingQuoteIndex < openingQuoteIndex) return ''
  const afterQuote = line.slice(closingQuoteIndex + 1).trim()
  const suffix = afterQuote.match(/^([^\s：:，,。！？!?]{1,24}?)(?:轻声|低声|沉声|冷冷地|缓缓地?|忽然)?(?:说|说道|问|问道|答|答道|喊|喊道|叫|叫道|低语|呢喃|开口)[。！？!?]?$/)
  return suffix ? normalizeExplicitSpeaker(suffix[1]) : ''
}

function normalizeExplicitSpeaker(value) {
  const speaker = normalizeSpeaker(value)
  return /^(?:他|她|它|他们|她们|对方|有人|那人|来人|声音)$/.test(speaker) ? '' : speaker
}

function createBlock(kind, text, speaker, messageId, index, speakerSource = '') {
  const normalizedKind = BLOCK_KINDS.has(kind) ? kind : 'narration'
  const normalizedText = String(text || '').trim()
  return {
    id: `block_${hashText(`${messageId}|${index}|${normalizedKind}|${normalizedText}`)}`,
    kind: normalizedKind,
    text: normalizedText,
    ...(speaker ? { speaker } : {}),
    ...(speakerSource ? { speakerSource } : {})
  }
}

export function getTrustedMessageSpeaker(message = {}) {
  if (message.role === 'system' || message.type === 'system') return ''
  const speaker = normalizeSpeaker(message.name)
  if (!speaker) return ''
  return /^(?:assistant|ai|user|system|narrator|旁白|系统)$/i.test(speaker) ? '' : speaker
}

function normalizeSpeaker(value) {
  return String(value || '').replace(/[\r\n|<>]/g, '').trim().slice(0, 80)
}

function hashText(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}
