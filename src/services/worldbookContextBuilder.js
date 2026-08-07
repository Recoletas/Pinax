import { estimateTokens } from '../composables/useTokenEstimate'
import { appendContextLedgerPart, createContextLedger } from './contextLedger'

const DEFAULT_TOKEN_BUDGET = 2000
const DEFAULT_SCAN_DEPTH = 3
const DEFAULT_STARTER_ENTRY_LIMITS = {
  location: 3,
  organization: 3,
  event: 3,
  quest: 2,
  character: 2,
  item: 1,
  lore: 1
}

export const ENTRY_TYPE_PRIORITY = {
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

export const ENTRY_TYPE_ALIASES = {
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

  const goals = Array.isArray(runtimeState?.goals) ? runtimeState.goals : []
  for (const goal of goals.slice(0, 4)) {
    if (goal?.title) runtimeParts.push(String(goal.title))
  }

  const encounteredCharacters = Array.isArray(runtimeState?.encounteredCharacters) ? runtimeState.encounteredCharacters : []
  for (const character of encounteredCharacters.slice(-6)) {
    if (character?.name) runtimeParts.push(String(character.name))
  }

  const keyChoices = Array.isArray(runtimeState?.keyChoices) ? runtimeState.keyChoices : []
  for (const choice of keyChoices.slice(-5)) {
    if (choice?.label) runtimeParts.push(String(choice.label))
  }

  const factionRelations = runtimeState?.factionRelations && typeof runtimeState.factionRelations === 'object'
    ? runtimeState.factionRelations
    : {}
  for (const [name, score] of Object.entries(factionRelations)) {
    const normalizedName = String(name || '').trim()
    if (!normalizedName) continue
    runtimeParts.push(normalizedName)
    if (Number.isFinite(Number(score))) {
      runtimeParts.push(`${normalizedName} ${Number(score) >= 15 ? '友好' : Number(score) <= -15 ? '紧张' : '观望'}`)
    }
  }

  const plotJournal = Array.isArray(runtimeState?.plotJournal) ? runtimeState.plotJournal : []
  for (const item of plotJournal.slice(-2)) {
    if (item?.summary) runtimeParts.push(String(item.summary))
    for (const participant of Array.isArray(item?.participants) ? item.participants : []) {
      const name = String(participant || '').trim()
      if (name) runtimeParts.push(name)
    }
    for (const locationName of Array.isArray(item?.locations) ? item.locations : []) {
      const name = String(locationName || '').trim()
      if (name) runtimeParts.push(name)
    }
    for (const choice of Array.isArray(item?.keyChoices) ? item.keyChoices : []) {
      const label = String(choice || '').trim()
      if (label) runtimeParts.push(label)
    }
    for (const hook of Array.isArray(item?.unresolvedHooks) ? item.unresolvedHooks : []) {
      const label = String(hook || '').trim()
      if (label) runtimeParts.push(label)
    }
  }

  // History node context: when entering a session from a prior history node,
  // boost worldbook entries that mention its participants / hooks / bound
  // entry ids. We deliberately do NOT inject full geoHistory — the runtime
  // patch only carries enough signal to surface relevant constant / keyword
  // matches downstream of the existing token budget.
  const historyNode = runtimeState?.historyNode && typeof runtimeState.historyNode === 'object'
    ? runtimeState.historyNode
    : null
  if (historyNode) {
    if (historyNode.title) runtimeParts.push(String(historyNode.title))
    for (const participant of Array.isArray(historyNode.participants) ? historyNode.participants : []) {
      const name = String(participant || '').trim()
      if (name) runtimeParts.push(name)
    }
    for (const hook of Array.isArray(historyNode.unresolvedHooks) ? historyNode.unresolvedHooks : []) {
      const label = String(hook || '').trim()
      if (label) runtimeParts.push(label)
    }
    // Prior facts often double as character/location names that should hit
    // keyword matches — include them as bare terms (not full sentences).
    for (const fact of Array.isArray(historyNode.priorFacts) ? historyNode.priorFacts : []) {
      const value = String(fact || '').trim()
      if (value) runtimeParts.push(value)
    }
  }

  // Forward-compatible slice for a future geoHistoryContext structure. Only
  // safe fields are mirrored here; full geoHistory is intentionally not
  // dumped into the scan text to avoid prompt explosion.
  const geoHistoryContext = runtimeState?.geoHistoryContext && typeof runtimeState.geoHistoryContext === 'object'
    ? runtimeState.geoHistoryContext
    : null
  if (geoHistoryContext) {
    for (const summary of Array.isArray(geoHistoryContext.summaries) ? geoHistoryContext.summaries : []) {
      const value = String(summary || '').trim()
      if (value) runtimeParts.push(value)
    }
    for (const participant of Array.isArray(geoHistoryContext.participants) ? geoHistoryContext.participants : []) {
      const name = String(participant || '').trim()
      if (name) runtimeParts.push(name)
    }
    for (const location of Array.isArray(geoHistoryContext.locations) ? geoHistoryContext.locations : []) {
      const name = String(location || '').trim()
      if (name) runtimeParts.push(name)
    }
    for (const choice of Array.isArray(geoHistoryContext.keyChoices) ? geoHistoryContext.keyChoices : []) {
      const label = String(choice || '').trim()
      if (label) runtimeParts.push(label)
    }
    for (const hook of Array.isArray(geoHistoryContext.unresolvedHooks) ? geoHistoryContext.unresolvedHooks : []) {
      const label = String(hook || '').trim()
      if (label) runtimeParts.push(label)
    }
    // entryIds are scanned as keywords so that bound worldbook entries get
    // a strong match signal even when their human keys wouldn't trigger.
    for (const entryId of Array.isArray(geoHistoryContext.entryIds) ? geoHistoryContext.entryIds : []) {
      const id = String(entryId || '').trim()
      if (id) runtimeParts.push(id)
    }
  }

  return [...parts, ...runtimeParts].join('\n').toLowerCase()
}

function starterEntryLimits(limits = {}) {
  return {
    ...DEFAULT_STARTER_ENTRY_LIMITS,
    ...(limits && typeof limits === 'object' ? limits : {})
  }
}

function collectStarterEntries(rawEntries = [], seenIds = new Set(), limits = {}) {
  const normalizedLimits = starterEntryLimits(limits)
  const counts = Object.fromEntries(Object.keys(normalizedLimits).map(type => [type, 0]))
  const starters = []

  for (const rawEntry of rawEntries) {
    const entry = normalizeEntry(rawEntry)
    if (!entry || seenIds.has(entry.id)) continue
    const limit = normalizedLimits[entry.type]
    if (!limit || counts[entry.type] >= limit) continue

    starters.push({
      ...entry,
      matchReason: 'starter',
      matchedKeys: [],
      matchedKeysLabel: '开局'
    })
    seenIds.add(entry.id)
    counts[entry.type] += 1
  }

  return starters
}

export function matchWorldbookEntries({
  worldbook,
  chatHistory = [],
  runtimeState = {},
  scanDepth = DEFAULT_SCAN_DEPTH,
  includeStarterEntries = false,
  starterEntryLimits: starterLimits = {},
  historyEntryIds = null,
  respectProbability = true
} = {}) {
  if (!worldbook || !Array.isArray(worldbook.entries) || worldbook.entries.length === 0) {
    return []
  }

  const scanText = collectScanText(chatHistory, runtimeState, scanDepth)
  const matchedEntries = []
  const seenIds = new Set()

  // Pre-pass: history-bound entry ids short-circuit to a high-priority
  // include so bound worldbook entries get into the budget before the
  // generic scan runs. Caller-provided list takes precedence over ids
  // embedded in runtimeState.historyNode.entryIds when both are present.
  const historyIdSet = new Set()
  if (Array.isArray(historyEntryIds)) {
    for (const id of historyEntryIds) {
      const normalized = String(id || '').trim()
      if (normalized) historyIdSet.add(normalized)
    }
  } else {
    const runtimeEntryIds = Array.isArray(runtimeState?.historyNode?.entryIds)
      ? runtimeState.historyNode.entryIds
      : []
    for (const id of runtimeEntryIds) {
      const normalized = String(id || '').trim()
      if (normalized) historyIdSet.add(normalized)
    }
  }

  for (const rawEntry of worldbook.entries) {
    const entry = normalizeEntry(rawEntry)
    if (!entry) continue

    if (historyIdSet.has(entry.id) && !seenIds.has(entry.id)) {
      matchedEntries.push({
        ...entry,
        matchReason: 'history',
        matchedKeys: [],
        matchedKeysLabel: '历史节点绑定'
      })
      seenIds.add(entry.id)
    }

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
    if (respectProbability && probability < 100 && Math.random() * 100 > probability) {
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

  if (includeStarterEntries) {
    matchedEntries.push(...collectStarterEntries(worldbook.entries, seenIds, starterLimits))
  }

  return matchedEntries.sort((a, b) => {
    const modeDelta = (a.matchReason === 'history' ? -1 : a.matchReason === 'constant' ? 0 : 1)
      - (b.matchReason === 'history' ? -1 : b.matchReason === 'constant' ? 0 : 1)
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
  scanDepth = DEFAULT_SCAN_DEPTH,
  includeStarterEntries = false,
  starterEntryLimits = {},
  historyEntryIds = null
} = {}) {
  const warnings = []
  let contextLedger = createContextLedger({
    worldbookId: worldbook?.id || ''
  })
  // token-based budget: maxChars is a worst-case ASCII upper bound
  // (1 / 0.3 ≈ 3.33 chars/token); budget CHECK uses estimateTokens()
  const effectiveBudget = Number(tokenBudget) || DEFAULT_TOKEN_BUDGET
  const maxChars = Math.max(800, Math.ceil(effectiveBudget / 0.3))
  const emptyBudgetReport = {
    tokenBudget,
    maxChars,
    usedChars: 0,
    usedTokens: 0,
    truncatedEntries: 0
  }

  if (!worldbook) {
    warnings.push('no-worldbook')
    contextLedger = appendContextLedgerPart(contextLedger, {
      source: 'worldbook',
      title: 'No active worldbook',
      purpose: 'worldbook-empty',
      content: 'No active worldbook was available for this generation.',
      included: false,
      warning: 'no-worldbook'
    })
    return {
      messages: [],
      matchedEntries: [],
      budgetReport: emptyBudgetReport,
      warnings,
      contextLedger
    }
  }

  const matchedEntries = matchWorldbookEntries({
    worldbook,
    chatHistory,
    runtimeState,
    scanDepth,
    includeStarterEntries,
    starterEntryLimits,
    historyEntryIds
  })

  if (matchedEntries.length === 0) {
    warnings.push('no-matched-entries')
    contextLedger = appendContextLedgerPart(contextLedger, {
      source: 'worldbook',
      title: worldbook.name || 'Worldbook',
      purpose: 'worldbook-empty',
      content: 'No worldbook entries matched the current chat/runtime scan.',
      included: false,
      warning: 'no-matched-entries'
    })
    return {
      messages: [],
      matchedEntries,
      budgetReport: { ...emptyBudgetReport },
      warnings,
      contextLedger
    }
  }

  const parts = []
  let usedChars = 0
  let usedTokens = 0
  let truncatedEntries = 0

  parts.push(`【世界书：${worldbook.name || '未命名世界书'}】`)

  const worldDesc = String(worldbook.worldDescription || worldbook.description || '').trim()
  if (worldDesc) {
    const text = `\n\n【世界设定】\n${worldDesc}`
    parts.push(text)
    usedChars += text.length
    usedTokens += estimateTokens(text)
    contextLedger = appendContextLedgerPart(contextLedger, {
      source: 'worldbook',
      title: worldbook.name || '世界设定',
      purpose: 'worldbook-summary',
      content: worldDesc,
      included: true,
      limit: effectiveBudget
    })
  }

  const writingStyle = String(worldbook.writingStyle || '').trim()
  if (writingStyle) {
    const text = `\n\n【写作风格】\n${writingStyle}`
    parts.push(text)
    usedChars += text.length
    usedTokens += estimateTokens(text)
    contextLedger = appendContextLedgerPart(contextLedger, {
      source: 'worldbook',
      title: '写作风格',
      purpose: 'worldbook-summary',
      content: writingStyle,
      included: true,
      limit: effectiveBudget
    })
  }

  const forbidden = String(worldbook.forbidden || '').trim()
  if (forbidden) {
    const text = `\n\n【禁止内容】\n${forbidden}`
    parts.push(text)
    usedChars += text.length
    usedTokens += estimateTokens(text)
    contextLedger = appendContextLedgerPart(contextLedger, {
      source: 'worldbook',
      title: '禁止内容',
      purpose: 'worldbook-summary',
      content: forbidden,
      included: true,
      limit: effectiveBudget
    })
  }

  const examples = String(worldbook.examples || '').trim()
  if (examples) {
    const text = `\n\n【示例文本】\n${examples}`
    parts.push(text)
    usedChars += text.length
    usedTokens += estimateTokens(text)
    contextLedger = appendContextLedgerPart(contextLedger, {
      source: 'worldbook',
      title: '示例文本',
      purpose: 'worldbook-summary',
      content: examples,
      included: true,
      limit: effectiveBudget
    })
  }

  parts.push('\n\n--- 以下是世界书中的关键设定条目，必须在叙事中严格遵循 ---')

  for (const entry of matchedEntries) {
    const entryText = `\n\n◆ 【${entry.name}】(${entry.type || 'general'})\n${entry.content}`
    if (usedTokens + estimateTokens(entryText) > effectiveBudget) {
      truncatedEntries += 1
      warnings.push(`truncated:${entry.name}`)
      contextLedger = appendContextLedgerPart(contextLedger, {
        source: 'worldbook',
        title: entry.name,
        purpose: 'worldbook-entry-truncated',
        content: entry.content,
        included: false,
        truncated: true,
        limit: effectiveBudget,
        entryId: entry.id,
        warning: `truncated:${entry.name}`
      })
      continue
    }
    parts.push(entryText)
    usedChars += entryText.length
    usedTokens += estimateTokens(entryText)
    contextLedger = appendContextLedgerPart(contextLedger, {
      source: 'worldbook',
      title: entry.name,
      purpose: 'worldbook-entry',
      content: entry.content,
      included: true,
      limit: effectiveBudget,
      entryId: entry.id
    })
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
    warnings,
    contextLedger
  }
}

export function buildWorldbookContextMessage(options = {}) {
  const result = buildWorldbookContext(options)
  return result.messages[0] || null
}

export function describeWorldbookWarning(code) {
  return WORLDBOOK_WARNING_LABELS[code] || code
}
