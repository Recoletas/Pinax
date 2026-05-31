import { summarizeStructuredSettings } from './settingPanelSchema'

const DEFAULT_TOKEN_BUDGET = 2000
const DEFAULT_SCAN_DEPTH = 3

const ENTRY_TYPE_PRIORITY = {
  rule: 1,
  forbidden: 2,
  style: 3,
  character: 4,
  location: 5,
  item: 6,
  organization: 7,
  event: 8,
  lore: 9,
  quest: 10,
  general: 11
}

const ENTRY_TYPE_ALIASES = {
  org: 'organization',
  faction: 'organization',
  lore: 'lore',
  setting: 'lore',
  quest: 'quest'
}

export const WORLDBOOK_WARNING_LABELS = {
  'no-worldbook': '当前没有激活世界书',
  'no-matched-entries': '本次没有命中任何条目',
  'structured-settings-truncated': '结构化设定因预算不足被截断'
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const id = String(entry.id || '').trim()
  const content = String(entry.content || '').trim()
  if (!id || !content) return null

  const rawType = String(entry.type || 'general').trim().toLowerCase() || 'general'
  const type = ENTRY_TYPE_ALIASES[rawType] || rawType

  return {
    ...entry,
    id,
    content,
    name: String(entry.name || entry.keys?.[0] || '未命名条目').trim() || '未命名条目',
    type,
    keys: Array.isArray(entry.keys) ? entry.keys : [],
    keysSecondary: Array.isArray(entry.keysSecondary) ? entry.keysSecondary : []
  }
}

function getTypePriority(type) {
  return Object.prototype.hasOwnProperty.call(ENTRY_TYPE_PRIORITY, type)
    ? ENTRY_TYPE_PRIORITY[type]
    : ENTRY_TYPE_PRIORITY.general
}

function collectScanText(chatHistory = [], runtimeState = {}, scanDepth = DEFAULT_SCAN_DEPTH) {
  const messagesToScan = Array.isArray(chatHistory) ? chatHistory.slice(-scanDepth) : []
  const parts = messagesToScan.map((message) => String(message?.content || ''))

  const runtimeParts = []
  const characterName = String(runtimeState?.writingCharacter?.name || runtimeState?.character?.name || '').trim()
  if (characterName) runtimeParts.push(characterName)

  const location = runtimeState?.worldMapState || runtimeState?.location || {}
  const locationParts = [location.currentCountry, location.currentCity, location.currentScene].filter(Boolean)
  if (locationParts.length) runtimeParts.push(locationParts.join(' '))

  const time = runtimeState?.writingTime || runtimeState?.time || {}
  const timeParts = [time.eraName, time.year, time.month, time.day].filter(Boolean)
  if (timeParts.length) runtimeParts.push(timeParts.join(' '))

  const activities = Array.isArray(runtimeState?.activities) ? runtimeState.activities : []
  for (const activity of activities.slice(-5)) {
    if (activity?.title) runtimeParts.push(String(activity.title))
  }

  return [...parts, ...runtimeParts].join('\n').toLowerCase()
}

export function matchWorldbookEntries({
  worldbook,
  chatHistory = [],
  runtimeState = {},
  scanDepth = DEFAULT_SCAN_DEPTH
} = {}) {
  if (!worldbook || !Array.isArray(worldbook.entries) || worldbook.entries.length === 0) {
    return []
  }

  const scanText = collectScanText(chatHistory, runtimeState, scanDepth)
  const matchedEntries = []
  const seenIds = new Set()

  for (const rawEntry of worldbook.entries) {
    const entry = normalizeEntry(rawEntry)
    if (!entry) continue

    const mode = String(entry.injection?.mode || 'selective')
    if (mode === 'constant') {
      if (!seenIds.has(entry.id)) {
        matchedEntries.push({
          ...entry,
          matchReason: 'constant',
          matchedKeys: [],
          matchedKeysLabel: '常驻'
        })
        seenIds.add(entry.id)
      }
      continue
    }

    const probability = Number(entry.injection?.probability ?? 100)
    if (probability < 100 && Math.random() * 100 > probability) {
      continue
    }

    const allKeys = [...entry.keys, ...entry.keysSecondary]
    const matchedKeys = []

    for (const key of allKeys) {
      const normalizedKey = String(key || '').toLowerCase().trim()
      if (normalizedKey && scanText.includes(normalizedKey) && !matchedKeys.includes(String(key).trim())) {
        matchedKeys.push(String(key).trim())
      }
    }

    const matched = matchedKeys.length > 0

    if (matched && !seenIds.has(entry.id)) {
      matchedEntries.push({
        ...entry,
        matchReason: 'keyword',
        matchedKeys,
        matchedKeysLabel: matchedKeys.join('、')
      })
      seenIds.add(entry.id)
    }
  }

  return matchedEntries.sort((a, b) => {
    const modeDelta = (a.matchReason === 'constant' ? 0 : 1) - (b.matchReason === 'constant' ? 0 : 1)
    if (modeDelta !== 0) return modeDelta
    const priorityDelta = getTypePriority(a.type) - getTypePriority(b.type)
    if (priorityDelta !== 0) return priorityDelta
    return String(a.name).localeCompare(String(b.name), 'zh-Hans-CN')
  })
}

export function buildWorldbookContext({
  worldbook,
  chatHistory = [],
  runtimeState = {},
  tokenBudget = DEFAULT_TOKEN_BUDGET,
  scanDepth = DEFAULT_SCAN_DEPTH
} = {}) {
  const warnings = []

  if (!worldbook) {
    warnings.push('no-worldbook')
    return {
      messages: [],
      matchedEntries: [],
      budgetReport: {
        tokenBudget,
        maxChars: tokenBudget * 2,
        usedChars: 0,
        truncatedEntries: 0
      },
      warnings
    }
  }

  const matchedEntries = matchWorldbookEntries({
    worldbook,
    chatHistory,
    runtimeState,
    scanDepth
  })

  if (matchedEntries.length === 0) {
    warnings.push('no-matched-entries')
    return {
      messages: [],
      matchedEntries,
      budgetReport: {
        tokenBudget,
        maxChars: tokenBudget * 2,
        usedChars: 0,
        truncatedEntries: 0
      },
      warnings
    }
  }

  const parts = []
  let usedChars = 0
  const maxChars = Math.max(800, Math.floor(Number(tokenBudget) || DEFAULT_TOKEN_BUDGET) * 2)
  let truncatedEntries = 0

  parts.push(`【世界书：${worldbook.name || '未命名世界书'}】`)

  const worldDesc = String(worldbook.worldDescription || worldbook.description || '').trim()
  if (worldDesc) {
    const text = `\n\n【世界设定】\n${worldDesc}`
    parts.push(text)
    usedChars += text.length
  }

  const writingStyle = String(worldbook.writingStyle || '').trim()
  if (writingStyle) {
    const text = `\n\n【写作风格】\n${writingStyle}`
    parts.push(text)
    usedChars += text.length
  }

  const forbidden = String(worldbook.forbidden || '').trim()
  if (forbidden) {
    const text = `\n\n【禁止内容】\n${forbidden}`
    parts.push(text)
    usedChars += text.length
  }

  const examples = String(worldbook.examples || '').trim()
  if (examples) {
    const text = `\n\n【示例文本】\n${examples}`
    parts.push(text)
    usedChars += text.length
  }

  const structuredSummary = summarizeStructuredSettings(worldbook.structuredSettings)
  if (structuredSummary) {
    const text = `\n\n【结构化设定】\n${structuredSummary}`
    if (usedChars + text.length <= maxChars) {
      parts.push(text)
      usedChars += text.length
    } else {
      warnings.push('structured-settings-truncated')
    }
  }

  parts.push('\n\n--- 以下是世界书中的关键设定条目，必须在叙事中严格遵循 ---')

  for (const entry of matchedEntries) {
    const entryText = `\n\n◆ 【${entry.name}】(${entry.type || 'general'})\n${entry.content}`
    if (usedChars + entryText.length > maxChars) {
      truncatedEntries += 1
      warnings.push(`truncated:${entry.name}`)
      continue
    }
    parts.push(entryText)
    usedChars += entryText.length
  }

  parts.push('\n\n⚠️ 重要约束：')
  parts.push('1. 上述设定中的名称、特征、关系必须保持一致，不得擅自更改')
  parts.push('2. 不得创造与设定矛盾的情节或角色')
  parts.push('3. 如果用户行为影响设定中的状态，合理反映变化')
  parts.push('4. 对话中涉及设定内容时，确保符合设定描述')
  if (forbidden) {
    parts.push('5. 严格遵守禁止内容限制，不得出现相关内容')
  }

  return {
    messages: [{
      role: 'system',
      content: parts.join('')
    }],
    matchedEntries,
    budgetReport: {
      tokenBudget,
      maxChars,
      usedChars,
      truncatedEntries
    },
    warnings
  }
}

export function buildWorldbookContextMessage(options = {}) {
  const result = buildWorldbookContext(options)
  return result.messages[0] || null
}

export function describeWorldbookWarning(code) {
  return WORLDBOOK_WARNING_LABELS[code] || code
}
