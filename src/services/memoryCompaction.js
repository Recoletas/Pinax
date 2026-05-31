export const MEMORY_TEXT_LIMIT = 72
const MEMORY_STYLE_LIMIT = 120

export function compactMemoryText(text, type = 'general', metadata = {}) {
  const source = cleanMemorySource(text)
  if (!source) return ''

  const normalizedType = String(type || metadata?.sourceType || '').trim().toLowerCase()
  const specific = extractSpecificMemorySummary(source, normalizedType, metadata)
  if (specific) return clampMemoryText(specific, MEMORY_TEXT_LIMIT)

  return clampMemoryText(source, normalizedType === 'style' ? MEMORY_STYLE_LIMIT : MEMORY_TEXT_LIMIT)
}

export function needsLlmMemoryCompaction(sourceText, heuristicText, type = 'general', metadata = {}) {
  if (metadata?.disableLlmCompaction) return false

  const source = cleanMemorySource(sourceText)
  const heuristic = cleanMemorySource(heuristicText)
  if (!source || source.length <= MEMORY_TEXT_LIMIT) return false
  if (!heuristic) return true
  if (heuristic.endsWith('...')) return true
  if (heuristic.length > MEMORY_TEXT_LIMIT) return true

  const normalizedType = String(type || metadata?.sourceType || '').trim().toLowerCase()
  const hasFactPrefix = /^(对话|地点|物品|决策|剧情|偏好|约束|风格|角色)[:：]/.test(heuristic)
  if (!hasFactPrefix && source.length > 120) return true
  if ((normalizedType === 'general' || normalizedType === 'dialogue') && source.length > 180) return true

  return false
}

export function buildMemoryCompactionMessages({ source, type = 'general', metadata = {}, heuristic = '' } = {}) {
  const normalizedSource = cleanMemorySource(source).slice(0, 1800)
  const normalizedType = String(type || metadata?.sourceType || 'general').trim()
  const scopeHint = metadata?.scope ? `记忆作用域：${metadata.scope}` : ''

  return [
    {
      role: 'system',
      content: [
        '你负责把小说体验文本压缩为一条可长期保存的记忆候选。',
        '只输出 JSON：{"memory":"..."}。',
        `memory 必须不超过 ${MEMORY_TEXT_LIMIT} 个汉字，不能是整段复述，不能包含解释。`,
        '优先保留：人物关系变化、明确地点、获得物品、重要决定、关键台词含义。',
        '如果是对话，写成“对话：角色：要点”或“对话：要点”；如果是地点/物品，写成“地点：...”或“物品：...”。'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        `来源类型：${normalizedType}`,
        scopeHint,
        heuristic ? `当前算法提取：${heuristic}` : '',
        `原文：${normalizedSource}`,
        '生成一条短记忆。'
      ].filter(Boolean).join('\n\n')
    }
  ]
}

export function parseMemoryCompactionResult(content) {
  const text = cleanMemorySource(content)
  if (!text) return ''

  const candidates = [
    text,
    text.match(/\{[\s\S]*\}/)?.[0]
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      const memory = parsed?.memory || parsed?.summary || parsed?.content || ''
      const normalized = normalizeLlmMemory(memory)
      if (normalized) return normalized
    } catch {
      // Try plain text below.
    }
  }

  return normalizeLlmMemory(text)
}

export function cleanMemorySource(text) {
  return String(text || '')
    .replace(/^小说体验事件[:：]\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/\.{3,}$|…+$/g, '')
    .trim()
}

function extractSpecificMemorySummary(source, type, metadata = {}) {
  if (type === 'dialogue') return extractDialogueMemorySummary(source)
  if (type === 'location' || type === 'location_discovery') return extractLocationMemorySummary(source)
  if (type === 'item' || type === 'item_acquisition') return extractItemMemorySummary(source)
  if (type === 'decision') return extractDecisionMemorySummary(source)
  if (type === 'event' || type === 'plot-event') return extractEventMemorySummary(source, metadata)
  if (type === 'preference' || type === 'author-preference') return compactPrefixedMemory('偏好', source)
  if (type === 'constraint') return compactPrefixedMemory('约束', source)
  if (type === 'style' || type === 'style-sample') return compactPrefixedMemory('风格', source, MEMORY_STYLE_LIMIT)
  if (type === 'character' || type === 'character-state') return compactPrefixedMemory('角色', source)
  return ''
}

function extractDialogueMemorySummary(source) {
  const match = source.match(/"([^"]{3,120})"|“([^”]{3,120})”|「([^」]{3,120})」/)
  if (!match) return ''

  const dialogue = clampMemoryText(match[1] || match[2] || match[3] || '', 42, '')
  const speaker = inferSpeakerBefore(source, match.index)
  return speaker ? `对话：${speaker}：${dialogue}` : `对话：${dialogue}`
}

function inferSpeakerBefore(source, index = 0) {
  const prefix = source.slice(0, Math.max(0, index)).replace(/\s+/g, ' ').trim()
  const tail = prefix.slice(-48)
  const patterns = [
    /([^\s，。！？、“”"'《》]{2,12}?)(?:低声说|轻声说|沉声说|喃喃道|回应道|开口道|说道|问道|答道|笑道|喊道|叹道|说|道)(?:[:：]?)$/,
    /([^\s，。！？、“”"'《》]{2,12})[:：]?$/
  ]

  for (const pattern of patterns) {
    const found = tail.match(pattern)
    const name = found?.[1]?.trim()
    if (name && !/^(我|你|他|她|它|这|那|一个|一位|对方|别人)$/.test(name)) {
      return name
    }
  }
  return ''
}

function extractLocationMemorySummary(source) {
  const patterns = [
    /(?:首次进入|发现(?:了)?(?:新)?(?:地方|地点)?|抵达|踏入|来到|进入)([^\s，。！？]{2,20})/,
    /(?:身处|位于|站在)([^\s，。！？]{2,20})/
  ]

  for (const pattern of patterns) {
    const match = source.match(pattern)
    const location = cleanupExtractedPhrase(match?.[1] || '')
    if (location) return `地点：${location}`
  }
  return ''
}

function extractItemMemorySummary(source) {
  const patterns = [
    /(?:获得|得到|发现)[了]?([^\s，。！？]{2,28}(?:道具|武器|装备|物品|宝物|钥匙|令牌|卷轴|地图|书信|药水|长剑|短刀|碎片|戒指))/,
    /(?:获得|得到|发现)[了]?([^\s，。！？]{2,22})/
  ]

  for (const pattern of patterns) {
    const match = source.match(pattern)
    const item = cleanupExtractedPhrase(match?.[1] || '')
    if (item) return `物品：${item}`
  }
  return ''
}

function extractDecisionMemorySummary(source) {
  const match = source.match(/(?:决定|选择|答应|拒绝)[了]?([^。！？]{2,44})/)
  const decision = cleanupExtractedPhrase(match?.[1] || '')
  return decision ? `决策：${decision}` : ''
}

function extractEventMemorySummary(source) {
  const sentence = source.match(/[^。！？]{8,64}[。！？]/)?.[0] || ''
  return sentence ? `剧情：${sentence.replace(/[。！？]$/, '')}` : ''
}

function compactPrefixedMemory(prefix, source, maxChars = MEMORY_TEXT_LIMIT) {
  const value = clampMemoryText(source.replace(new RegExp(`^${prefix}[:：]`), ''), maxChars - prefix.length - 1, '')
  return value ? `${prefix}：${value}` : ''
}

function cleanupExtractedPhrase(value) {
  return String(value || '')
    .replace(/^[，。！？、：；\s]+|[，。！？、：；\s]+$/g, '')
    .replace(/[的地得]$/, '')
    .trim()
}

function normalizeLlmMemory(value) {
  const text = cleanMemorySource(value)
    .replace(/^["“「']|["”」']$/g, '')
    .replace(/^记忆[:：]\s*/, '')
    .trim()
  if (!text) return ''
  return clampMemoryText(text, MEMORY_TEXT_LIMIT)
}

function clampMemoryText(text, maxChars = MEMORY_TEXT_LIMIT, suffix = '...') {
  const cleaned = cleanMemorySource(text)
  if (!cleaned || cleaned.length <= maxChars) return cleaned

  const sentence = cleaned.match(new RegExp(`^.{16,${maxChars}}?[。！？；]`))?.[0]
  if (sentence) return sentence.replace(/[。！？；]$/, '')

  return `${cleaned.slice(0, maxChars).replace(/[，、：；。！？\s]+$/g, '')}${suffix}`
}
