import { buildWorldbookContext } from './worldbookContextBuilder'
import { runGenerationTask } from './generationService'
import { validateStoryboardShots } from './storyboardStore'
import { CAMERA_MOVEMENTS, SHOT_TYPES } from '../types/director'

const STORYBOARD_SHOT_TYPES = Object.keys(SHOT_TYPES)
const STORYBOARD_CAMERA_MOVEMENTS = Object.keys(CAMERA_MOVEMENTS)
const STORYBOARD_TRANSITIONS = ['cut', 'dissolve', 'fade', 'none']

function normalizeText(value) {
  return String(value || '').trim()
}

function stripFence(content) {
  return normalizeText(content)
    .replace(/^```(?:json|markdown|md|txt)?\s*/i, '')
    .replace(/```$/i, '')
    .trim()
}

function buildAdventureTriggerContext({
  runtimeState = {},
  plotEntry = null,
  chatHistory = []
} = {}) {
  const worldMapState = runtimeState?.worldMapState || {}
  const goals = Array.isArray(runtimeState?.goals) ? runtimeState.goals : []
  const encounteredCharacters = Array.isArray(runtimeState?.encounteredCharacters) ? runtimeState.encounteredCharacters : []
  const keyChoices = Array.isArray(runtimeState?.keyChoices) ? runtimeState.keyChoices : []
  const plotJournal = Array.isArray(runtimeState?.plotJournal) ? runtimeState.plotJournal : []
  const latestMessages = Array.isArray(chatHistory)
    ? chatHistory
      .filter((message) => message?.role === 'user' || message?.role === 'assistant')
      .slice(-6)
      .map((message) => `${message.role === 'user' ? '玩家' : 'GM'}：${normalizeText(message.content)}`)
      .filter(Boolean)
    : []

  const locationParts = [
    worldMapState.currentCountry,
    worldMapState.currentCity,
    worldMapState.currentScene
  ].map(normalizeText).filter(Boolean)

  const lines = []
  if (locationParts.length > 0) {
    lines.push(`当前位置：${locationParts.join(' / ')}`)
  }

  const activeGoals = goals
    .filter((goal) => normalizeText(goal?.title) && normalizeText(goal?.status) !== 'completed')
    .slice(0, 3)
    .map((goal) => normalizeText(goal.title))
  if (activeGoals.length > 0) {
    lines.push(`当前目标：${activeGoals.join('；')}`)
  }

  const characterNames = encounteredCharacters
    .map((character) => normalizeText(character?.name || character))
    .filter(Boolean)
    .slice(-6)
  if (characterNames.length > 0) {
    lines.push(`已遇角色：${characterNames.join('、')}`)
  }

  const recentChoices = keyChoices
    .map((choice) => normalizeText(choice?.label || choice?.title || choice))
    .filter(Boolean)
    .slice(-4)
  if (recentChoices.length > 0) {
    lines.push(`关键选择：${recentChoices.join('；')}`)
  }

  const sourceSummary = normalizeText(plotEntry?.summary)
  if (sourceSummary) {
    lines.push(`本段冒险总结：${sourceSummary}`)
  }

  const unresolvedHooks = Array.isArray(plotEntry?.unresolvedHooks)
    ? plotEntry.unresolvedHooks.map(normalizeText).filter(Boolean)
    : []
  if (unresolvedHooks.length > 0) {
    lines.push(`未决钩子：${unresolvedHooks.join('；')}`)
  }

  if (latestMessages.length > 0) {
    lines.push('最近对话：')
    lines.push(latestMessages.join('\n'))
  }

  const priorSummaries = plotJournal
    .filter((item) => {
      const itemId = normalizeText(item?.id || item?.chapterId)
      const currentId = normalizeText(plotEntry?.id || plotEntry?.chapterId)
      return itemId && itemId !== currentId
    })
    .slice(-3)
    .map((item) => normalizeText(item?.summary))
    .filter(Boolean)
  if (priorSummaries.length > 0) {
    lines.push('前文摘要：')
    priorSummaries.forEach((summary, index) => {
      lines.push(`${index + 1}. ${summary}`)
    })
  }

  return lines.join('\n')
}

export function parseAdventureProseDraft(content) {
  const text = stripFence(content)
    .replace(/^#+\s*/gm, '')
    .trim()

  return text.length >= 60 ? text : ''
}

export function buildAdventureProseMessages({
  worldbook = null,
  runtimeState = {},
  chatHistory = [],
  plotEntry = null,
  sessionTitle = ''
} = {}) {
  const worldbookContext = buildWorldbookContext({
    worldbook,
    chatHistory,
    runtimeState,
    tokenBudget: 1400,
    scanDepth: 6
  })
  const adventureContext = buildAdventureTriggerContext({ runtimeState, plotEntry, chatHistory })

  const messages = []
  if (worldbookContext.messages[0]) {
    messages.push(worldbookContext.messages[0])
  }

  messages.push({
    role: 'system',
    content: [
      '你是“玩到写”章节改写助手。',
      '请把一段已经发生的世界冒险，改写成可继续编辑的小说章节草稿。',
      '只输出正文，不要标题、不要分点、不要解释、不要 Markdown。',
      '必须保留地点、角色、关键选择与已发生事实，不能擅自改结局。',
      '允许补足场景描写、动作衔接和情绪，但不要引入与世界书冲突的新设定。',
      '输出 3-5 段中文正文，整体控制在 220-700 字。'
    ].join('\n')
  })

  messages.push({
    role: 'user',
    content: [
      sessionTitle ? `会话标题：${sessionTitle}` : '',
      `章节标识：${normalizeText(plotEntry?.chapterId || 'chapter')}`,
      adventureContext
    ].filter(Boolean).join('\n\n')
  })

  return messages
}

export async function generateAdventureProseDraft({
  worldbook = null,
  runtimeState = {},
  chatHistory = [],
  plotEntry = null,
  settings = {},
  sessionTitle = ''
} = {}) {
  const result = await runGenerationTask({
    taskType: 'adventure.trigger.prose',
    baseMessages: buildAdventureProseMessages({
      worldbook,
      runtimeState,
      chatHistory,
      plotEntry,
      sessionTitle
    }),
    settings,
    generationOptions: {
      max_tokens: 1200,
      temperature: 0.55
    },
    attempts: [
      { name: 'adventure-prose-first' },
      {
        name: 'adventure-prose-retry',
        appendMessages: [{
          role: 'user',
          content: '上一版不够像可直接编辑的正文。请只输出更完整的正文段落，保留既有事实，不要标题或解释。'
        }]
      }
    ],
    parseContent: parseAdventureProseDraft,
    isValidParsed: (parsed) => Boolean(parsed && parsed.length >= 60)
  })

  return {
    success: Boolean(result?.success && result?.parsed),
    content: normalizeText(result?.parsed || '')
  }
}

export function parseAdventureStoryboardDraft(content) {
  const text = stripFence(content)
  if (!text) return []

  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return []
    parsed = JSON.parse(match[0])
  }

  const shots = Array.isArray(parsed?.shots) ? parsed.shots : []
  const validation = validateStoryboardShots(
    shots.map((shot, index) => ({
      sequence: shot?.sequence || index + 1,
      shotId: shot?.shotId || `${index + 1}`,
      sourceText: shot?.sourceText || shot?.content || '',
      content: shot?.content || shot?.sourceText || '',
      shotType: shot?.shotType || shot?.shotSize || 'medium',
      camera: shot?.camera || shot?.cameraMovement || 'fixed',
      duration: shot?.duration || 3,
      visual: shot?.visual || shot?.tone || '',
      dialogue: shot?.dialogue || '',
      sound: shot?.sound || '',
      transition: shot?.transition || 'cut',
      notes: shot?.notes || '',
      emotion: shot?.emotion || '',
      scene: shot?.scene || ''
    }))
  )

  return validation.valid ? validation.normalized.slice(0, 6) : []
}

export function buildAdventureStoryboardMessages({
  worldbook = null,
  runtimeState = {},
  chatHistory = [],
  plotEntry = null,
  sessionTitle = ''
} = {}) {
  const worldbookContext = buildWorldbookContext({
    worldbook,
    chatHistory,
    runtimeState,
    tokenBudget: 1200,
    scanDepth: 6
  })
  const adventureContext = buildAdventureTriggerContext({ runtimeState, plotEntry, chatHistory })

  const messages = []
  if (worldbookContext.messages[0]) {
    messages.push(worldbookContext.messages[0])
  }

  messages.push({
    role: 'system',
    content: [
      '你是“玩到写”分镜整理助手。',
      '请把一段冒险经历整理成可继续进入分镜工作流的镜头草稿。',
      '只输出 JSON 对象，不要解释，不要 Markdown。',
      'JSON 结构：{"shots":[{"sequence":1,"sourceText":"...","shotType":"wide","camera":"fixed","duration":3,"visual":"...","dialogue":"...","sound":"...","transition":"cut","notes":"..."}]}',
      `shotType 只能使用：${STORYBOARD_SHOT_TYPES.join(', ')}`,
      `camera 只能使用：${STORYBOARD_CAMERA_MOVEMENTS.join(', ')}`,
      `transition 只能使用：${STORYBOARD_TRANSITIONS.join(', ')}`,
      '输出 3-6 条分镜，每条都要具体，保留地点、角色、关键选择与冲突推进。'
    ].join('\n')
  })

  messages.push({
    role: 'user',
    content: [
      sessionTitle ? `会话标题：${sessionTitle}` : '',
      `分镜段落：${normalizeText(plotEntry?.chapterId || 'chapter')}`,
      adventureContext
    ].filter(Boolean).join('\n\n')
  })

  return messages
}

export async function generateAdventureStoryboardDraft({
  worldbook = null,
  runtimeState = {},
  chatHistory = [],
  plotEntry = null,
  settings = {},
  sessionTitle = ''
} = {}) {
  const result = await runGenerationTask({
    taskType: 'adventure.trigger.storyboard',
    baseMessages: buildAdventureStoryboardMessages({
      worldbook,
      runtimeState,
      chatHistory,
      plotEntry,
      sessionTitle
    }),
    settings,
    generationOptions: {
      max_tokens: 1400,
      temperature: 0.35,
      response_format: { type: 'json_object' }
    },
    attempts: [
      { name: 'adventure-storyboard-first' },
      {
        name: 'adventure-storyboard-retry',
        appendMessages: [{
          role: 'user',
          content: [
            '上一版 JSON 结构无效，或字段不符合要求。',
            '请重新输出严格有效的 JSON 对象，shots 至少 3 条，字段名保持不变。'
          ].join('\n')
        }]
      }
    ],
    parseContent: parseAdventureStoryboardDraft,
    isValidParsed: (parsed) => Array.isArray(parsed) && parsed.length > 0
  })

  return {
    success: Boolean(result?.success && Array.isArray(result?.parsed) && result.parsed.length > 0),
    shots: Array.isArray(result?.parsed) ? result.parsed : []
  }
}

export function formatAdventureStoryboardSeedContent(draft = {}) {
  const title = normalizeText(draft?.title || '分镜草稿')
  const summary = normalizeText(draft?.summary)
  const shots = Array.isArray(draft?.shots) ? draft.shots : []
  const lines = [title]

  if (summary) {
    lines.push(`摘要：${summary}`)
  }

  shots.forEach((shot, index) => {
    const shotType = SHOT_TYPES[shot.shotType]?.label || shot.shotType || '中景'
    const camera = CAMERA_MOVEMENTS[shot.cameraMovement]?.label || shot.cameraMovement || '固定'
    lines.push(`${index + 1}. [${shotType} / ${camera}] ${normalizeText(shot.sourceText || shot.content)}`)
    if (normalizeText(shot.visual)) lines.push(`视觉：${normalizeText(shot.visual)}`)
    if (normalizeText(shot.dialogue)) lines.push(`对白：${normalizeText(shot.dialogue)}`)
    if (normalizeText(shot.sound)) lines.push(`声音：${normalizeText(shot.sound)}`)
  })

  return lines.join('\n')
}
