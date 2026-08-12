const BLOCK_KINDS = new Set(['narration', 'action', 'dialogue', 'thought', 'system'])
const MARKER_RE = /^\s*:::\s*(narration|action|dialogue|thought|system)(?:\|([^\s|]{1,80}))?\s*(.*)$/i
const UNKNOWN_MARKER_RE = /^\s*:::\s*[^\s|]+(?:\|[^\n]*)?\s*(.*)$/

export const NARRATIVE_PRESENTATION_VERSION = 3
export const NARRATIVE_BLOCK_KINDS = Object.freeze([...BLOCK_KINDS])

export function buildNarrativeFormatInstructions() {
  return [
    '【叙事输出格式】',
    'marker 只是传输协议，不是正文。每个自然段或说话人切换时使用一次，不要把每句话拆成一块；不要输出 HTML、JSON、颜色说明或其他控制标签。',
    '允许的类型只有：:::narration、:::action|角色名、:::dialogue|角色名、:::thought|角色名、:::system。',
    'marker 后换行写正文；同一块可以有多行；speaker 只有明确知道说话者时才填写，不要猜测角色。',
    '台词保留中文或英文引号；叙述中夹有一句台词时仍可放在 narration 块，不要为了 marker 改写自然行文；不要替玩家决定未输入的行动。',
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
      role: normalized.role,
      // P1-5：消息可携带 speakerMap（名字→稳定 id），与 SceneCast 对齐
      speakerMap: normalized.speakerMap || null
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
  // P1-5：speakerMap（名字→稳定 id）覆盖 speakerId，与 SceneCast 对齐
  const speakerMap = options.speakerMap && typeof options.speakerMap === 'object' ? options.speakerMap : null
  const structured = parseMarkedBlocks(sourceText, messageId, { complete, fallbackSpeaker, speakerMap })
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
  const speakerMap = options.speakerMap && typeof options.speakerMap === 'object' ? options.speakerMap : null
  const lines = String(text || '').split(/\r?\n/)
  const blocks = []
  let current = null
  let sawMarker = false

  const flush = () => {
    if (!current) return
    const value = current.lines.join('\n').trim()
    if (value) {
      const speaker = current.speaker || (current.kind === 'dialogue' ? fallbackSpeaker : '')
      const speakerSource = current.speaker ? 'marker' : (speaker ? 'message' : '')
      blocks.push(createBlock(current.kind, value, speaker, messageId, blocks.length, speakerSource, speakerMap))
    }
    current = null
  }

  for (const line of lines) {
    if (/^\s*```(?:text|markdown)?\s*$/i.test(line)) continue
    const marker = line.match(MARKER_RE)
    if (marker) {
      sawMarker = true
      flush()
      current = { kind: marker[1].toLowerCase(), speaker: normalizeSpeaker(marker[2]), lines: [] }
      // 修复：AI 常把 marker 与内容写在同一行（如 `:::narration 皮货商...`），
      // 剩余内容（捕获组 3）作为该 block 的首行，避免 marker 原样显示在正文。
      const inlineContent = String(marker[3] || '').trim()
      if (inlineContent) current.lines.push(inlineContent)
      continue
    }
    const unknownMarker = line.match(UNKNOWN_MARKER_RE)
    if (unknownMarker) {
      sawMarker = true
      flush()
      current = { kind: 'narration', speaker: '', lines: [] }
      const inlineContent = String(unknownMarker[1] || '').trim()
      if (inlineContent) current.lines.push(inlineContent)
      continue
    }
    if (current) current.lines.push(line)
    else if (line.trim()) current = { kind: 'narration', speaker: '', lines: [line] }
  }
  flush()

  if (!sawMarker || (complete && blocks.length === 0)) return null
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
  const lines = source.split(/\r?\n/)
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
      else if (isDialogueDominant(line)) {
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
  return /"[^"\n]+"|“[^”\n]+”|「[^」\n]+」|『[^』\n]+』|‘[^’\n]+’/.test(text)
}

function isDialogueDominant(text) {
  const line = String(text || '').trim()
  if (!hasDialogue(line)) return false
  if (extractExplicitDialogueSpeaker(line)) return true
  if (/^[“"「『‘]/.test(line)) return true
  return /^[^，,。！？!?]{1,24}(?:轻声|低声|沉声|冷冷地|缓缓地?|忽然)?(?:说|说道|问|问道|答|答道|喊|喊道|叫|叫道|低语|呢喃|开口)\s*[：:]\s*[“"「『‘]/.test(line)
}

function extractExplicitDialogueSpeaker(text) {
  const line = String(text || '').trim()
  const openingQuoteIndex = line.search(/[“"「『‘]/)
  if (openingQuoteIndex < 0) return ''

  const beforeQuote = line.slice(0, openingQuoteIndex).trim()
  const prefix = beforeQuote.match(/^([^\s：:，,。！？!?]{1,24}?)(?:轻声|低声|沉声|冷冷地|缓缓地?|忽然)?(?:说|说道|问|问道|答|答道|喊|喊道|叫|叫道|低语|呢喃|开口)\s*[：:]?$/)
    || beforeQuote.match(/^([^\s：:，,。！？!?]{1,24})\s*[：:]$/)
  if (prefix) return normalizeExplicitSpeaker(prefix[1])

  const closingQuoteIndex = Math.max(
    line.lastIndexOf('”'),
    line.lastIndexOf('"'),
    line.lastIndexOf('」'),
    line.lastIndexOf('』'),
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

// R4：基于 speaker 名字的稳定 id（改名后 hash 变化，但同一名字跨消息稳定）。
// P1-5：可被 speakerMap 覆盖 —— 传入 cast 的角色映射时，speakerId 与
// SceneCast 的 char:entryId 对齐（角色改名不漂移）。
export function speakerIdOf(name) {
  const cleaned = normalizeSpeaker(name)
  if (!cleaned) return ''
  return `spk_${hashText(cleaned).toString(16)}`
}

// 解析 speakerId：优先用 speakerMap（名字→稳定 id），否则 fallback 名字 hash。
function resolveSpeakerId(name, speakerMap) {
  const cleaned = normalizeSpeaker(name)
  if (!cleaned) return ''
  const mapped = speakerMap?.[cleaned]
  return mapped ? String(mapped) : speakerIdOf(cleaned)
}

function createBlock(kind, text, speaker, messageId, index, speakerSource = '', speakerMap = null) {
  const normalizedKind = BLOCK_KINDS.has(kind) ? kind : 'narration'
  const normalizedText = String(text || '').trim()
  const normalizedSpeaker = normalizeSpeaker(speaker)
  return {
    id: `block_${hashText(`${messageId}|${index}|${normalizedKind}|${normalizedText}`)}`,
    kind: normalizedKind,
    text: normalizedText,
    ...(normalizedSpeaker ? { speaker: normalizedSpeaker, speakerId: resolveSpeakerId(normalizedSpeaker, speakerMap) } : {}),
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
