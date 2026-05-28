import { runGenerationTask } from './generationService'

export const FALLBACK_DIALOGUE_OPTIONS = [
  '追问关键细节',
  '表明自己的立场',
  '暂时结束对话'
]

export function parseDialogueOptions(content) {
  const text = String(content || '').trim()
  if (!text) return []

  const parsed = parseJsonOptions(text)
  const source = parsed.length ? parsed : parseLineOptions(text)
  return normalizeDialogueOptions(source)
}

export async function generateDialogueOptions({
  context = null,
  playerCharacter = null,
  recentMessages = [],
  worldId = '',
  settings = null
} = {}) {
  const baseMessages = buildDialogueOptionMessages({
    context,
    playerCharacter,
    recentMessages
  })

  const result = await runGenerationTask({
    baseMessages,
    settings,
    taskType: 'mechanism.dialogue-options',
    parseContent: (text) => parseDialogueOptions(text || ''),
    isValidParsed: (parsed) => Array.isArray(parsed) && parsed.length > 0,
    attempts: [
      { name: 'dialogue-options' },
      {
        name: 'dialogue-options-retry',
        appendMessages: [
          { role: 'user', content: '请重新生成 3 个对话选项，严格输出 JSON 数组格式。' }
        ]
      }
    ]
  })

  const options = result.success ? result.parsed : []
  return options.length ? options : buildFallbackOptions(context)
}

export function buildFallbackOptions(context = null) {
  const value = context && typeof context === 'object' ? context : {}
  const speaker = String(value.speaker || value.name || '').trim()
  if (!speaker) return [...FALLBACK_DIALOGUE_OPTIONS]

  return [
    `追问${speaker}的意图`,
    '说出自己的判断',
    '先保持沉默观察'
  ]
}

export function buildDialogueOptionMessages({
  context = null,
  playerCharacter = null,
  recentMessages = []
} = {}) {
  const value = context && typeof context === 'object' ? context : { dialogue: String(context || '') }
  const speaker = String(value.speaker || value.name || '对方').trim()
  const dialogue = String(value.dialogue || value.text || value.context || value.preview || '').trim()
  const playerName = String(playerCharacter?.name || '玩家').trim()
  const recent = normalizeRecentMessages(recentMessages)

  return [
    {
      role: 'system',
      content: [
        '你为小说互动体验生成对话回应选项。',
        '只输出 JSON：{"options":["选项1","选项2","选项3"]}。',
        '每个选项必须贴合当前剧情、角色关系和刚刚说出的话，不要使用固定模板。',
        '选项要像玩家可点击的行动，使用第一人称或简洁动词短句，8到24个汉字，避免解释。'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        `玩家角色：${playerName}`,
        `说话角色：${speaker}`,
        `刚刚的台词：${dialogue || '无'}`,
        recent ? `最近剧情：\n${recent}` : '',
        '生成 3 个彼此不同的对话回应选项。'
      ].filter(Boolean).join('\n\n')
    }
  ]
}

function parseJsonOptions(text) {
  const candidates = [
    text,
    text.match(/\{[\s\S]*\}/)?.[0],
    text.match(/\[[\s\S]*\]/)?.[0]
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (Array.isArray(parsed)) return parsed
      if (Array.isArray(parsed?.options)) return parsed.options
      if (Array.isArray(parsed?.dialogueOptions)) return parsed.dialogueOptions
      if (Array.isArray(parsed?.replies)) return parsed.replies
    } catch {
      // Try the next candidate.
    }
  }

  return []
}

function parseLineOptions(text) {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.、）)]|选项\s*\d+[:：])\s*/, '').trim())
    .filter(Boolean)
}

function normalizeDialogueOptions(options = []) {
  const seen = new Set()
  const normalized = []

  for (const option of options) {
    const text = String(option || '')
      .replace(/^["“「']|["”」']$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!text || text.length < 2 || text.length > 40) continue
    if (seen.has(text)) continue
    seen.add(text)
    normalized.push(text)
    if (normalized.length >= 3) break
  }

  return normalized
}

function normalizeRecentMessages(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .slice(-6)
    .map((message) => {
      const role = message?.role === 'user' ? '玩家' : '叙事'
      const content = String(message?.content || '').replace(/\s+/g, ' ').trim()
      if (!content) return ''
      return `${role}：${content.slice(0, 180)}`
    })
    .filter(Boolean)
    .join('\n')
    .slice(0, 900)
}
