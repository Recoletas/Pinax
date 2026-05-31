import { runGenerationTask } from './generationService'

const SUMMARY_PREFIX = '【上下文摘要】'
const DEFAULT_KEEP_RECENT = 6
const DEFAULT_MAX_SUMMARY_CHARS = 1400

const IMPORTANT_EVENT_RE = /(来到|身处|抵达|进入|踏入|到达|走进|回到|穿过|发现|获得|得到|拿到|遇见|出现|离开|决定|承诺|请求|拒绝|接受|战斗|交易|任务|线索|记忆|关系|对话|说|问|答)/
const UNRESOLVED_RE = /(尚未|仍然|还要|需要|必须|准备|计划|目标|线索|疑问|等待|未完成|没有|不清楚|下一步)/
const LOCATION_RE = /(?:来到|身处|抵达|进入|踏入|到达|走进|回到|穿过)([^，。！？\n]{2,18})/g
const ITEM_RE = /(?:获得了|发现了|得到了|拿到了|捡到了|拾起了|取到了|收起了|带走了|获得|发现|得到|拿到|捡到|拾起|取到|收起|带走)([^，。！？\n]{1,16}(?:道具|武器|装备|物品|宝物|钥匙|令牌|卷轴|地图|书信|药水|长剑|短刀|碎片|戒指))/g
const SPEAKER_RE = /([一-龥A-Za-z0-9_·]{1,12})(?:低声|沉声|轻声|冷声|缓缓|突然)?(?:说|问|回答|答道|喊道|说道|开口)/
const DIALOGUE_RE = /"([^"\n]{3,80})"|“([^”\n]{3,80})”|「([^」\n]{3,80})」/g

export async function compressChatHistory(chatHistory, options = {}) {
  const messages = normalizeMessages(chatHistory)
  const keepRecentCount = resolveKeepRecentCount(options.keepRecentCount)
  const systemPrompt = messages[0]?.role === 'system' && !isSummaryMessage(messages[0]) ? messages[0] : null
  const bodyStart = systemPrompt ? 1 : 0
  const bodyMessages = messages.slice(bodyStart)

  if (bodyMessages.length <= keepRecentCount) {
    return { compressed: false, reason: '历史过短，无需压缩' }
  }

  const recentMessages = selectRecentMessages(bodyMessages, keepRecentCount)
  const oldMessages = bodyMessages.slice(0, bodyMessages.length - recentMessages.length)
  const sourceMessages = oldMessages.filter((message) => !isSummaryMessage(message))
  const existingSummaries = oldMessages
    .filter(isSummaryMessage)
    .map((message) => stripSummaryPrefix(message.content))
    .filter(Boolean)

  if (sourceMessages.length === 0) {
    return { compressed: false, reason: '无新的历史可压缩' }
  }

  const heuristicSummary = buildHeuristicContextSummary(sourceMessages, {
    existingSummaries,
    maxSummaryChars: options.maxSummaryChars || DEFAULT_MAX_SUMMARY_CHARS
  })
  const llmSummary = await buildLlmSummary({
    messages: sourceMessages,
    existingSummaries,
    heuristicSummary,
    settings: options.settings,
    worldId: options.worldId,
    preferLlm: options.preferLlm !== false,
    maxSummaryChars: options.maxSummaryChars || DEFAULT_MAX_SUMMARY_CHARS
  })
  const summary = normalizeSummaryText(llmSummary || heuristicSummary, options.maxSummaryChars || DEFAULT_MAX_SUMMARY_CHARS)
  const summaryMessage = {
    role: 'system',
    content: `${SUMMARY_PREFIX}${summary}`
  }
  const newHistory = systemPrompt
    ? [systemPrompt, summaryMessage, ...recentMessages]
    : [summaryMessage, ...recentMessages]

  return {
    compressed: true,
    oldCount: oldMessages.length,
    sourceCount: sourceMessages.length,
    recentCount: recentMessages.length,
    newCount: newHistory.length,
    method: llmSummary ? 'llm' : 'heuristic',
    summary,
    newHistory
  }
}

export function buildHeuristicContextSummary(messages, options = {}) {
  const normalized = normalizeMessages(messages).filter((message) => !isSummaryMessage(message))
  const existingSummaries = uniqueStrings(options.existingSummaries || [])
  const maxSummaryChars = options.maxSummaryChars || DEFAULT_MAX_SUMMARY_CHARS

  const userActions = []
  const plotEvents = []
  const dialogues = []
  const unresolved = []
  const characters = new Set()
  const locations = new Set()
  const items = new Set()

  for (const message of normalized) {
    const content = compactWhitespace(message.content)
    if (!content) continue

    collectMatches(content, LOCATION_RE, locations)
    collectMatches(content, ITEM_RE, items)
    const speakerMatch = content.match(SPEAKER_RE)
    if (speakerMatch?.[1]) characters.add(cleanEntity(speakerMatch[1]))

    if (message.role === 'user') {
      userActions.push(shortenLine(content, 120))
      continue
    }

    const sentences = splitSentences(content)
    const important = sentences.filter((sentence) => IMPORTANT_EVENT_RE.test(sentence))
    const selected = important.length ? important : sentences.slice(0, 2)
    for (const sentence of selected.slice(0, 3)) {
      plotEvents.push(shortenLine(sentence, 130))
    }
    for (const sentence of sentences.filter((sentence) => UNRESOLVED_RE.test(sentence)).slice(0, 2)) {
      unresolved.push(shortenLine(sentence, 120))
    }

    for (const dialogue of collectDialogue(content).slice(0, 2)) {
      dialogues.push(shortenLine(dialogue, 90))
    }
  }

  const sections = []
  if (existingSummaries.length) {
    sections.push(formatSection('既有摘要', existingSummaries.slice(-2).map((item) => shortenLine(stripSummaryPrefix(item), 180))))
  }
  sections.push(formatSection('剧情进展', uniqueStrings(plotEvents).slice(-8)))
  sections.push(formatSection('玩家意图/行动', uniqueStrings(userActions).slice(-6)))

  const entityLines = []
  if (characters.size) entityLines.push(`人物：${[...characters].slice(-8).join('、')}`)
  if (locations.size) entityLines.push(`地点：${[...locations].slice(-8).join('、')}`)
  if (items.size) entityLines.push(`物品：${[...items].slice(-8).join('、')}`)
  sections.push(formatSection('角色/地点/物品', entityLines))

  sections.push(formatSection('关键对白', uniqueStrings(dialogues).slice(-5)))
  sections.push(formatSection('未解决线索', uniqueStrings(unresolved).slice(-5)))

  const summary = sections.filter(Boolean).join('\n')
  return normalizeSummaryText(summary || '暂无可提取的关键情节。', maxSummaryChars)
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return []
  return messages
    .map((message) => ({
      role: normalizeRole(message?.role || message?.type),
      content: String(message?.content || '').trim()
    }))
    .filter((message) => message.content)
}

function normalizeRole(role) {
  return role === 'assistant' || role === 'system' ? role : 'user'
}

function resolveKeepRecentCount(value) {
  const count = Number(value)
  if (!Number.isFinite(count)) return DEFAULT_KEEP_RECENT
  return Math.min(10, Math.max(4, Math.floor(count)))
}

function selectRecentMessages(messages, keepRecentCount) {
  const recent = messages.slice(-keepRecentCount)
  const previousIndex = messages.length - keepRecentCount - 1
  if (recent[0]?.role === 'assistant' && previousIndex >= 0) {
    return [messages[previousIndex], ...recent]
  }
  return recent
}

function isSummaryMessage(message) {
  return message?.role === 'system' && String(message?.content || '').trim().startsWith(SUMMARY_PREFIX)
}

function stripSummaryPrefix(text) {
  return String(text || '').trim().replace(/^【上下文摘要】/, '').trim()
}

function formatSection(title, lines) {
  const list = uniqueStrings(lines || []).filter(Boolean)
  if (!list.length) return ''
  return `【${title}】\n${list.map((line) => `- ${line}`).join('\n')}`
}

function compactWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function splitSentences(text) {
  return compactWhitespace(text)
    .split(/(?<=[。！？!?])\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function shortenLine(text, maxLen) {
  const line = compactWhitespace(text)
  return line.length > maxLen ? `${line.slice(0, maxLen - 1)}…` : line
}

function cleanEntity(text) {
  return String(text || '').replace(/[“"「『‘'，。！？、：:\s]/g, '').trim()
}

function collectMatches(text, pattern, target) {
  pattern.lastIndex = 0
  for (const match of text.matchAll(pattern)) {
    const value = cleanEntity(match[1] || match[0])
    if (value) target.add(value)
  }
}

function collectDialogue(text) {
  const result = []
  DIALOGUE_RE.lastIndex = 0
  for (const match of text.matchAll(DIALOGUE_RE)) {
    const content = match[1] || match[2] || match[3] || ''
    if (content) result.push(`“${content.trim()}”`)
  }
  return result
}

function uniqueStrings(items) {
  const seen = new Set()
  const result = []
  for (const item of items || []) {
    const value = compactWhitespace(item)
    if (!value || seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

function normalizeSummaryText(text, maxChars = DEFAULT_MAX_SUMMARY_CHARS) {
  const summary = String(text || '').trim()
  if (summary.length <= maxChars) return summary
  return `${summary.slice(0, maxChars - 1)}…`
}

function hasUsableSettings(settings) {
  return Boolean(settings?.baseUrl && settings?.apiKey && settings?.model)
}

async function buildLlmSummary({
  messages,
  existingSummaries,
  heuristicSummary,
  settings,
  worldId,
  preferLlm,
  maxSummaryChars
}) {
  if (!preferLlm || !hasUsableSettings(settings)) return ''

  try {
    const result = await runGenerationTask({
      taskType: 'context.compress',
      baseMessages: buildContextCompressionMessages({
        messages,
        existingSummaries,
        heuristicSummary,
        maxSummaryChars
      }),
      settings,
      worldId: worldId || null,
      generationOptions: {
        max_tokens: 700,
        temperature: 0.1,
        attemptName: 'context-compress',
        max_input_chars: 9000
      },
      isValidParsed: null
    })
    return normalizeSummaryText(result?.content || '', maxSummaryChars)
  } catch (error) {
    console.warn('[ContextCompression] LLM compression failed, using heuristic:', error?.message || error)
    return ''
  }
}

function buildContextCompressionMessages({ messages, existingSummaries, heuristicSummary, maxSummaryChars }) {
  const source = messages
    .map((message, index) => `${index + 1}. ${message.role === 'assistant' ? '叙述者' : '用户'}：${shortenLine(message.content, 700)}`)
    .join('\n')
  const previous = uniqueStrings(existingSummaries || []).map((item) => `- ${shortenLine(stripSummaryPrefix(item), 240)}`).join('\n') || '无'

  return [
    {
      role: 'system',
      content: [
        '你是小说体验的上下文压缩器。',
        '任务：把历史对话压缩成可继续创作的中文系统摘要，不要续写剧情。',
        '保留：剧情因果、玩家意图、角色状态/关系、地点/物品、未解决线索、重要对白。',
        '删除：寒暄、重复措辞、无效转场、纯修辞。',
        `长度控制在 ${maxSummaryChars} 字以内，使用分节和短项目符号。`
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        '【既有摘要】',
        previous,
        '',
        '【本地预摘要】',
        heuristicSummary || '无',
        '',
        '【待压缩历史】',
        source
      ].join('\n')
    }
  ]
}
