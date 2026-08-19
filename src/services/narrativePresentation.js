// P4：可信说话者注册表（verified/unresolved/message-fallback 三种 trust 状态）
import { resolveSpeakerName } from '../../shared/narrativeSpeakerContract.js'

const BLOCK_KINDS = new Set(['narration', 'action', 'dialogue', 'thought', 'system'])
const READABLE_PROSE_KINDS = new Set(['narration', 'action', 'thought'])
const UNKNOWN_MARKER_RE = /^\s*:::\s*[^\s|：]+(?:[|：][^\n]*)?\s*(.*)$/
const BARE_MARKER_RE = /^\s*:::\s*$/
// P3：所有围栏变体
const FENCE_RE = /^\s*```(?:text|markdown|md|diff|json|html|js|python|plaintext)?\s*$/i

export const NARRATIVE_PRESENTATION_VERSION = 5
export const NARRATIVE_BLOCK_KINDS = Object.freeze([...BLOCK_KINDS])

export function buildNarrativeFormatInstructions() {
  return [
    '【叙事输出格式】',
    'marker 只是传输协议，不是正文。每个自然段或说话人切换时使用一次，不要把每句话拆成一块；不要输出 HTML、JSON、颜色说明或其他控制标签。',
    '允许的类型只有：:::narration、:::action|角色名、:::dialogue|角色名、:::thought|角色名、:::system。',
    'marker 与正文之间换行；一个自然段 1-2 个句子，自然段之间用换行分隔，不要把整轮正文写成一行或只用空格隔开句子。',
    '正文直接以叙述或对白开始；不要输出"【正文】""【旁白】"之类的小节标题、序号或任何框架说明。',
    '台词统一使用中文双引号“”，嵌套引用使用中文单引号‘’；最终可见正文不要混用「」或『』。叙述中夹有一句台词时仍可放在 narration 块，不要为了 marker 改写自然行文；不要替玩家决定未输入的行动。',
    '示例：\n:::narration\n雨水沿着舷窗滑落。\n\n风声从甲板缝隙里灌进来。\n:::dialogue|陆晨曦\n“信号还在吗？”\n:::action|陆晨曦\n她抬手调高了增益。',
    '如果没有明显语义切换，可以只输出一个 narration 块，但段与段之间仍要空行。'
  ].join('\n')
}

export function createNarrativeMessageId(message = {}, index = 0) {
  const seed = [message.id, message.timestamp, message.role, message.name, message.content, index]
    .map((value) => String(value ?? ''))
    .join('|')
  return `msg_${hashText(seed)}`
}

// P3/P6：旧 parser 可能把 marker 协议头残留进 block.text（老对话的 :::narration 泄漏，
// 含行首与行内形式）。检测到即触发一次重解析，不依赖版本号（避免把新消息的
// verified speaker 打回名字 hash）。
function presentationHasLeakedMarkers(presentation) {
  if (!presentation || !Array.isArray(presentation.blocks)) return false
  return presentation.blocks.some((block) => (
    /:::\s*[a-z]+\b/i.test(String(block?.text || ''))
  ))
}

function presentationNeedsFormattingRefresh(presentation) {
  if (!presentation || !Array.isArray(presentation.blocks)) return false
  return presentation.blocks.some((block) => {
    if (READABLE_PROSE_KINDS.has(block?.kind)) {
      return splitReadableProse(block?.text).length > 1
    }
    if (block?.kind === 'dialogue') {
      const source = String(block?.text || '').trim()
      const chunks = splitDialogueProse(source)
      return chunks.length > 1 || chunks[0] !== source
    }
    return false
  })
}

export function ensureNarrativeMessage(message = {}, index = 0) {
  const normalized = { ...message }
  if (!normalized.id) normalized.id = createNarrativeMessageId(normalized, index)
  const presentationNeedsRefresh = !normalized.presentation
    || Number(normalized.presentation.version || 0) < NARRATIVE_PRESENTATION_VERSION
    || presentationHasLeakedMarkers(normalized.presentation)
    || presentationNeedsFormattingRefresh(normalized.presentation)
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
  // P4：可信说话者注册表（cast/世界书/运行时角色），未提供时退回旧行为
  const speakerRegistry = Array.isArray(options.speakerRegistry) ? options.speakerRegistry : null
  const structured = parseMarkedBlocks(sourceText, messageId, { complete, fallbackSpeaker, speakerMap, speakerRegistry })
  if (structured) return structured
  const legacyBlocks = parseLegacyBlocks(sourceText, messageId, { fallbackSpeaker, speakerRegistry })
  return {
    version: NARRATIVE_PRESENTATION_VERSION,
    source: 'parser',
    status: complete ? 'complete' : 'provisional',
    content: legacyBlocks.map((block) => block.text).join('\n\n'),
    blocks: legacyBlocks,
    hasMarkers: false
  }
}

export function parseMarkedBlocks(text, messageId = 'message', options = {}) {
  const complete = options.complete !== false
  const fallbackSpeaker = normalizeSpeaker(options.fallbackSpeaker)
  const speakerMap = options.speakerMap && typeof options.speakerMap === 'object' ? options.speakerMap : null
  const speakerRegistry = Array.isArray(options.speakerRegistry) ? options.speakerRegistry : null
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
      // P6：同一 marker 块内按空行拆分自然段 —— 每个段落一个 block，
      // CSS 的段首缩进 / 段落间距（.narrative-block--narration 等）才生效；
      // 无空行的 narration/action/thought 再走阅读密度兜底（模型把整轮压成一行时）。
      const paragraphs = splitParagraphs(value)
      for (const paragraph of paragraphs) {
        const chunks = splitPresentationBlock(current.kind, paragraph)
        for (const chunk of chunks) {
          const block = createBlock(current.kind, chunk, speaker, messageId, blocks.length, speakerSource, speakerMap, speakerRegistry)
          // Preserve explicit model line breaks. The short-block compactor is
          // only allowed to merge parser-created fragments, not author/model
          // paragraph boundaries.
          if (paragraphs.length > 1 || chunks.length > 1) block.paragraphBoundary = true
          blocks.push(block)
        }
      }
    }
    current = null
  }

  for (const line of lines) {
    if (FENCE_RE.test(line)) continue
    if (BARE_MARKER_RE.test(line)) {
      sawMarker = true
      flush()
      continue
    }
    // P6：模型常把 marker 写进行中（`。」 :::narration 柳洵`），
    // 按行内任意位置的已知 marker 切块 —— marker 前文本归属当前块，marker 起新块。
    const markerSegments = scanInlineMarkers(line)
    if (markerSegments.length > 0) {
      sawMarker = true
      let cursor = 0
      for (const segment of markerSegments) {
        const leading = line.slice(cursor, segment.index)
        if (leading.trim()) {
          if (current) current.lines.push(leading)
          else current = { kind: 'narration', speaker: '', lines: [leading] }
        }
        flush()
        current = { kind: segment.kind, speaker: segment.speaker, lines: [] }
        cursor = segment.end
      }
      const trailing = line.slice(cursor)
      if (trailing.trim()) current.lines.push(trailing)
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
  // P4 规则 5：合并相邻的短未署名 narration（无说话者切换、合并后 ≤180 字）
  const mergedBlocks = mergeAdjacentShortNarration(blocks)
  // P3/P6：transport sanitizer —— 移除残留的协议头（行首或行内 :::kind|speaker）
  const sanitizedBlocks = mergedBlocks.filter((block) => {
    block.text = sanitizeTransportMarkers(block.text)
    delete block.paragraphBoundary
    return Boolean(block.text)
  })
  return {
    version: NARRATIVE_PRESENTATION_VERSION,
    source: 'model-structured',
    status: complete ? 'complete' : 'provisional',
    content: sanitizedBlocks.map((block) => block.text).join('\n\n'),
    blocks: sanitizedBlocks,
    hasMarkers: true
  }
}

// P4：按换行把一段文本拆成自然段 —— 空行和单换行都算段落边界
//（模型常用单换行分段；只认空行会让多句块塌成一大段）。
function splitParagraphs(value) {
  const source = String(value || '').trim()
  if (!source) return []
  return source.split(/\n+/).map((part) => part.trim()).filter(Boolean)
}

// 阅读密度兜底：显式换行仍是第一优先；模型没有换行时，三句及以上或
// 超过约 120 个中文字符的 narration/action/thought 按 1-2 句分组。
function splitReadableProse(value) {
  const source = String(value || '').trim()
  if (!source) return []
  const sentences = splitIntoSentences(source)
  const cjkCount = (source.match(/[\u4e00-\u9fff]/g) || []).length
  if (cjkCount <= 120 && sentences.length <= 2) return [source]
  return groupSentences(sentences).flatMap((group) => splitLongSingleSentence(group))
}

function splitPresentationBlock(kind, value) {
  if (READABLE_PROSE_KINDS.has(kind)) return splitReadableProse(value)
  if (kind === 'dialogue') return splitDialogueProse(value)
  return [String(value || '').trim()].filter(Boolean)
}

function normalizeCompleteDialogueWrapper(value) {
  const source = String(value || '').trim()
  if (source.length < 2) return source
  const opening = source[0]
  const closing = source[source.length - 1]
  const isCompleteWrapper = (opening === '“' && closing === '”')
    || (opening === '「' && closing === '」')
    || (opening === '『' && closing === '』')
    || (opening === '"' && closing === '"')
  if (!isCompleteWrapper) return source
  const inner = source.slice(1, -1)
    .replace(/「([^「」]*)」/g, '‘$1’')
    .replace(/『([^『』]*)』/g, '‘$1’')
  return `“${inner}”`
}

function splitDialogueProse(value) {
  const normalized = normalizeCompleteDialogueWrapper(value)
  if (!(normalized.startsWith('“') && normalized.endsWith('”'))) return [normalized]
  const inner = normalized.slice(1, -1).trim()
  if (!inner) return [normalized]
  const sentences = splitIntoSentences(inner)
  const cjkCount = (inner.match(/[\u4e00-\u9fff]/g) || []).length
  if (cjkCount <= 120 && sentences.length <= 2) return [normalized]
  return groupSentences(sentences)
    .flatMap((group) => splitLongSingleSentence(group))
    .map((group) => `“${group}”`)
}

function splitLongSingleSentence(value) {
  const source = String(value || '').trim()
  const cjkCount = (source.match(/[\u4e00-\u9fff]/g) || []).length
  if (cjkCount <= 120 || splitIntoSentences(source).length > 1) return [source]

  const chunks = []
  let remaining = source
  while ((remaining.match(/[\u4e00-\u9fff]/g) || []).length > 120) {
    const boundary = findClauseBoundary(remaining)
    if (boundary <= 0) break
    chunks.push(remaining.slice(0, boundary).trim())
    remaining = remaining.slice(boundary).trimStart()
  }
  if (remaining) chunks.push(remaining)
  return chunks.filter(Boolean)
}

function findClauseBoundary(source) {
  const semicolons = []
  const commas = []
  let depth = 0
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (/[「『“‘]/.test(char)) depth += 1
    else if (/[」』”’]/.test(char)) depth = Math.max(0, depth - 1)
    else if (depth === 0 && /[；;]/.test(char)) semicolons.push(index + 1)
    else if (depth === 0 && /[，,]/.test(char)) commas.push(index + 1)
  }
  return selectClauseBoundary(semicolons) || selectClauseBoundary(commas)
}

function selectClauseBoundary(boundaries) {
  const candidates = boundaries.filter((index) => index >= 60 && index <= 120)
  if (!candidates.length) return 0
  return candidates.reduce((best, index) => (
    Math.abs(index - 100) < Math.abs(best - 100) ? index : best
  ), candidates[0])
}

// P4：句子级切分 —— 成对引号（「『“‘”」』’）内不拆，短台词与归属动作保留在同一段。
function splitIntoSentences(source) {
  const sentences = []
  let buffer = ''
  let depth = 0
  for (const char of source) {
    buffer += char
    if (/[「『“‘]/.test(char)) depth += 1
    else if (/[」』”’]/.test(char)) depth = Math.max(0, depth - 1)
    else if (depth === 0 && /[。！？…!?]/.test(char)) {
      sentences.push(buffer.trim())
      buffer = ''
    }
  }
  if (buffer.trim()) sentences.push(buffer.trim())
  return sentences.filter(Boolean)
}

const DIALOGUE_START_RE = /^[“「『‘]/
const TRANSITION_MARKER_RE = /(?:次日|翌日|隔天|清晨|傍晚|黄昏|深夜|黎明|夜里|上午|中午|下午|晚上|来到|走到|回到|穿过|进入|抵达|离开)/

// 以 1-2 句、约 60-120 字为目标的段落分组；角色切换、时间/地点转换处优先断开。
function groupSentences(sentences) {
  const groups = []
  let current = []
  let currentChars = 0
  for (const sentence of sentences) {
    const length = sentence.length
    const startsDialogue = DIALOGUE_START_RE.test(sentence)
    const isTransition = TRANSITION_MARKER_RE.test(sentence)
    if (current.length > 0 && (
      current.length >= 2
      || currentChars + length > 120
      || startsDialogue
      || isTransition
    )) {
      groups.push(current.join(''))
      current = []
      currentChars = 0
    }
    current.push(sentence)
    currentChars += length
  }
  if (current.length) groups.push(current.join(''))
  return groups
}

// P4 规则 5：合并相邻的短未署名 narration（<35 字，合并后 ≤180 字，无说话者切换）。
function mergeAdjacentShortNarration(blocks) {
  const output = []
  for (const block of blocks) {
    const previous = output[output.length - 1]
    const isShort = block.kind === 'narration' && !block.speaker && block.text.length < 35
    const previousIsShort = previous && previous.kind === 'narration' && !previous.speaker && previous.text.length < 35
    if (previousIsShort && isShort && !previous.paragraphBoundary && !block.paragraphBoundary
      && previous.text.length + block.text.length <= 180) {
      output[output.length - 1] = { ...previous, text: `${previous.text}${block.text}` }
      continue
    }
    output.push(block)
  }
  return output
}

// P6：扫描一行内任意位置出现的已知 marker（模型常把 `:::` 写进行中）。
function scanInlineMarkers(line) {
  const matches = []
  const pattern = /:::\s*(narration|action|dialogue|thought|system)(?:[|：]([^\s|：]{1,80}))?\s*/gi
  for (const match of String(line || '').matchAll(pattern)) {
    matches.push({
      index: match.index,
      end: match.index + match[0].length,
      kind: match[1].toLowerCase(),
      speaker: normalizeSpeaker(match[2])
    })
  }
  return matches
}

// P3/P6：transport sanitizer —— 移除残留的协议头（行首或行内 :::kind|speaker）与
// 模型模仿控制消息输出的【正文】【旁白】【回应】等小节标题 token，保留正文。
function sanitizeTransportMarkers(text) {
  const withoutMarkers = String(text || '')
    .replace(/:::\s*[a-z]+(?:[|：][^\s|：]{0,80})?\s*/gi, '')
    .replace(/:::/g, '')
  return sanitizeNarrativeSectionTitles(withoutMarkers)
}

function sanitizeNarrativeSectionTitles(text) {
  return String(text || '')
    .replace(/[【\[](?:正文|旁白|回应|叙述|对白|正文开始|正文完|完)[】\]]/gi, '')
    .trim()
}

function trimPendingMarkerLine(text) {
  const source = String(text || '')
  const lines = source.split(/\r?\n/)
  const lastLine = lines[lines.length - 1]
  // P3：任何 marker 前缀半成品（含 kind、speaker 分隔符和未完成的 speaker 名）都暂存
  if (/^\s*:{1,3}\s*[a-z]*(?:[|：][^\n]*)?$/i.test(lastLine)) lines.pop()
  return lines.join('\n')
}

function parseLegacyBlocks(text, messageId, options = {}) {
  const source = String(text || '').trim()
  if (!source) return []
  const blocks = []
  const fallbackSpeaker = normalizeSpeaker(options.fallbackSpeaker)
  const speakerRegistry = Array.isArray(options.speakerRegistry) ? options.speakerRegistry : null
  const paragraphs = source.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)
  for (const paragraph of paragraphs) {
    for (const line of paragraph.split('\n').map((value) => value.trim()).filter(Boolean)) {
      const cleanLine = sanitizeNarrativeSectionTitles(line)
      if (!cleanLine) continue
      const action = cleanLine.match(/^\*([^*\n]+)\*$/)
      const thought = cleanLine.match(/^[（(]([^）)\n]+)[）)]$/)
      if (action) blocks.push(createBlock('action', action[1], '', messageId, blocks.length))
      else if (thought) blocks.push(createBlock('thought', thought[1], '', messageId, blocks.length))
      else if (isDialogueDominant(cleanLine)) {
        const explicitSpeaker = extractExplicitDialogueSpeaker(cleanLine)
        const speaker = explicitSpeaker || fallbackSpeaker
        for (const chunk of splitDialogueProse(cleanLine)) {
          blocks.push(createBlock(
            'dialogue',
            chunk,
            speaker,
            messageId,
            blocks.length,
            explicitSpeaker ? 'text' : (speaker ? 'message' : ''),
            null,
            speakerRegistry
          ))
        }
      }
      else {
        for (const chunk of splitReadableProse(cleanLine)) {
          blocks.push(createBlock('narration', chunk, '', messageId, blocks.length))
        }
      }
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

// P4：可信说话者注册表决定 trust。
// - verified：注册表命中 → 显示 speaker label + 稳定 speakerId
// - message-fallback：消息 name 级 fallback（可信）→ 显示 label，id 走 cast/名字映射
// - unresolved：未知 marker/text 名称 → 未署名对白（保留 speakerRaw 供诊断，不创建 speakerId）
function createBlock(kind, text, speaker, messageId, index, speakerSource = '', speakerMap = null, speakerRegistry = null) {
  const normalizedKind = BLOCK_KINDS.has(kind) ? kind : 'narration'
  const normalizedText = String(text || '').trim()
  const normalizedSpeaker = normalizeSpeaker(speaker)
  const block = {
    id: `block_${hashText(`${messageId}|${index}|${normalizedKind}|${normalizedText}`)}`,
    kind: normalizedKind,
    text: normalizedText
  }
  if (normalizedSpeaker) {
    if (speakerRegistry) {
      const resolved = resolveSpeakerName(speakerRegistry, normalizedSpeaker)
      if (resolved.verified) {
        block.speaker = resolved.displayName
        block.speakerId = resolved.speakerId
        block.speakerTrust = 'verified'
      } else if (speakerSource === 'message') {
        block.speaker = normalizedSpeaker
        block.speakerId = resolveSpeakerId(normalizedSpeaker, speakerMap)
        block.speakerTrust = 'message-fallback'
        block.speakerRaw = resolved.speakerRaw
      } else {
        block.speakerTrust = 'unresolved'
        block.speakerRaw = resolved.speakerRaw
      }
    } else {
      block.speaker = normalizedSpeaker
      block.speakerId = resolveSpeakerId(normalizedSpeaker, speakerMap)
    }
  }
  if (speakerSource) block.speakerSource = speakerSource
  return block
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
