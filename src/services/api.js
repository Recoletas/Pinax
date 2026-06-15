import axios from 'axios'
import { getItem, getTextItem, setTextItem, STORAGE_KEYS } from '../composables/useStorage'
import { getMemoryKindLabel, queueMemoryCandidate } from './memoryCandidates'
import {
  buildMemoryCompactionMessages,
  compactMemoryText,
  needsLlmMemoryCompaction,
  parseMemoryCompactionResult
} from './memoryCompaction'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

export default api
export { compactMemoryText } from './memoryCompaction'

function createPreferenceUserId() {
  return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function getOrCreatePreferenceUserId() {
  const key = STORAGE_KEYS.PREFERENCE_USER_ID || 'preference_user_id'
  const existing = getTextItem(key).trim()
  if (existing) return existing

  const nextId = createPreferenceUserId()
  setTextItem(key, nextId)
  return nextId
}

const MEMORY_SCOPE_VALUES = new Set(['global-author', 'project', 'session'])

function normalizeMemoryScope(scope) {
  const value = String(scope || '').trim()
  return MEMORY_SCOPE_VALUES.has(value) ? value : ''
}

function resolveMemoryScope(type, metadata = {}) {
  const explicitScope = normalizeMemoryScope(metadata.scope)
  if (explicitScope) return explicitScope

  const normalizedType = String(type || '').trim().toLowerCase()
  if (normalizedType === 'preference' || normalizedType === 'style') {
    return 'global-author'
  }

  if (metadata.projectId || metadata.worldId) {
    return 'project'
  }

  return 'session'
}

function resolveMemoryScopeId(scope, metadata = {}) {
  const explicitScopeId = String(metadata.scopeId || '').trim()
  if (explicitScopeId) return explicitScopeId

  if (scope === 'global-author') {
    return String(metadata.userId || metadata.authorId || getOrCreatePreferenceUserId()).trim()
  }

  if (scope === 'project') {
    return String(metadata.projectId || metadata.worldId || metadata.gameId || '').trim()
  }

  return String(metadata.sessionId || metadata.currentSessionId || metadata.projectId || metadata.worldId || '').trim()
}

// ---------------- 游戏配置与状态 ----------------

export async function getWorlds() {
  const response = await api.get('/config/worlds')
  return response.data.worlds || []
}

export async function getWorld(worldId) {
  const response = await api.get(`/config/worlds/${worldId}`)
  return response.data
}

export async function startGame(worldId) {
  const response = await api.post('/game/start', { worldId })
  return response.data
}

export async function sendAction(gameId, action, isStart = false) {
  if (isStart) {
    const response = await api.post('/game/start', { worldId: action })
    return response.data
  }
  const response = await api.post('/game/action', { gameId, action })
  return response.data
}

export async function getState(gameId) {
  const response = await api.get(`/game/state/${gameId}`)
  return response.data
}

// ---------------- AI 与 聊天 (核心修改区) ----------------

/**
 * Read the per-browser API configuration.
 *
 * Settings live ONLY in the user's localStorage. The server never sees
 * another user's API key, never persists them, and never has a global
 * `secrets.json` to leak. The frontend injects `apiKey` (and mem0 keys) into
 * the request body of every /api/* call that needs them.
 */
export async function getResolvedApiSettings() {
  const localRaw = getItem(STORAGE_KEYS.API_SETTINGS) || {}
  const merged = {
    provider: localRaw.provider || null,
    baseUrl: localRaw.baseUrl || null,
    apiKey: localRaw.apiKey || null,
    model: localRaw.model || null
  }

  console.info('[API] Resolved settings (localStorage only):', {
    provider: merged.provider,
    baseUrl: merged.baseUrl,
    model: merged.model,
    hasApiKey: Boolean(merged.apiKey)
  })

  return merged
}

/**
 * Read the per-browser mem0 configuration (apiKey + host).
 * Returns `{}` when the user has not configured mem0.
 */
export function getResolvedMem0Settings() {
  const cached = getItem(STORAGE_KEYS.MEM0_SETTINGS) || {}
  return {
    apiKey: String(cached.apiKey || '').trim(),
    host: String(cached.host || '').trim()
  }
}

function normalizeGenerationOptions(options = {}) {
  const normalized = {}

  if (Number.isFinite(Number(options.max_tokens))) {
    normalized.max_tokens = Number(options.max_tokens)
  }

  if (Number.isFinite(Number(options.temperature))) {
    normalized.temperature = Number(options.temperature)
  }

  if (options.response_format && typeof options.response_format === 'object') {
    normalized.response_format = options.response_format
  }

  if (Number.isFinite(Number(options.max_input_chars))) {
    normalized.max_input_chars = Math.max(1200, Math.floor(Number(options.max_input_chars)))
  }

  if (Number.isFinite(Number(options.retryCount))) {
    normalized.retryCount = Math.max(0, Math.floor(Number(options.retryCount)))
  }

  if (typeof options.request_id === 'string' && options.request_id.trim()) {
    normalized.request_id = options.request_id.trim()
  }

  if (typeof options.taskType === 'string' && options.taskType.trim()) {
    normalized.taskType = options.taskType.trim()
  }

  if (typeof options.promptVersion === 'string' && options.promptVersion.trim()) {
    normalized.promptVersion = options.promptVersion.trim()
  }

  if (typeof options.attemptName === 'string' && options.attemptName.trim()) {
    normalized.attemptName = options.attemptName.trim()
  }

  return normalized
}

function createRequestId() {
  return `gen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function notifyGenerationMeta(meta) {
  if (typeof window === 'undefined' || !meta || typeof meta !== 'object') return
  try {
    window.dispatchEvent(new CustomEvent('ai-generation-meta', { detail: meta }))
  } catch (e) {
    console.warn('[API] failed to dispatch ai-generation-meta event:', e)
  }
}

/**
 * 发送聊天请求
 * settings 参数优先传入，否则自动 resolve
 */
export async function sendChat(messages, character = null, worldId = null, settings = null, generationOptions = null) {
  const apiSettings = settings || await getResolvedApiSettings()
  const userId = getOrCreatePreferenceUserId()
  const generation = normalizeGenerationOptions({
    ...apiSettings,
    ...(generationOptions || {}),
    request_id: generationOptions?.request_id || createRequestId()
  })

  if (!apiSettings.baseUrl || !apiSettings.apiKey || !apiSettings.model) {
    throw new Error('AI 配置不完整，请前往设置填写 API Key、Base URL 和模型名称')
  }

  try {
    const response = await api.post('/generate', {
      messages,
      character,
      worldId,
      userId,
      provider: apiSettings.provider,
      baseUrl: apiSettings.baseUrl,
      apiKey: apiSettings.apiKey,
      model: apiSettings.model,
      ...generation
    })

    const meta = response?.data?.meta
    if (meta && (meta.truncatedInput || Number(meta.retryCount) > 0 || (Array.isArray(meta.warnings) && meta.warnings.length > 0))) {
      notifyGenerationMeta(meta)
    }

    return response.data
  } catch (error) {
    const errorMeta = error?.response?.data?.meta
    if (errorMeta && (errorMeta.truncatedInput || Number(errorMeta.retryCount) > 0 || (Array.isArray(errorMeta.warnings) && errorMeta.warnings.length > 0))) {
      notifyGenerationMeta(errorMeta)
    }
    handleApiError(error)
  }
}

/**
 * 发送流式聊天请求
 * @param {Function} onChunk - 每次收到内容块时的回调: (chunk: { content?: string, reasoning_content?: string }) => void
 * @param {Function} onComplete - 完成时的回调: (meta: object) => void
 * @param {Function} onError - 错误时的回调: (error: Error) => void
 */
export async function sendChatStream(messages, character = null, worldId = null, settings = null, generationOptions = null, callbacks = {}) {
  const { onChunk, onComplete, onError } = callbacks
  const apiSettings = settings || await getResolvedApiSettings()
  const userId = getOrCreatePreferenceUserId()
  const generation = normalizeGenerationOptions({
    ...apiSettings,
    ...(generationOptions || {}),
    request_id: generationOptions?.request_id || createRequestId()
  })

  if (!apiSettings.baseUrl || !apiSettings.apiKey || !apiSettings.model) {
    const error = new Error('AI 配置不完整，请前往设置填写 API Key、Base URL 和模型名称')
    if (onError) onError(error)
    throw error
  }

  const timeoutMs = Number.isFinite(Number(generationOptions?.timeout_ms))
    ? Math.max(1000, Math.floor(Number(generationOptions.timeout_ms)))
    : 30000
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs)

  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages,
        character,
        worldId,
        userId,
        provider: apiSettings.provider,
        baseUrl: apiSettings.baseUrl,
        apiKey: apiSettings.apiKey,
        model: apiSettings.model,
        ...generation
      }),
      signal: abortController.signal
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const error = new Error(errorData.error || `请求失败 (${response.status})`)
      if (onError) onError(error)
      throw error
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullContent = ''
    // 忽略推理/思考过程，不处理 reasoning_content

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue

        const data = trimmed.slice(6)
        if (data === '[DONE]') {
          if (onComplete) {
            onComplete({ content: fullContent })
          }
          return { content: fullContent }
        }

        try {
          const parsed = JSON.parse(data)

          if (parsed.error) {
            const error = new Error(parsed.error)
            if (onError) onError(error)
            throw error
          }

          // 只处理正文内容，忽略推理/思考过程
          if (parsed.content) {
            fullContent += parsed.content
            if (onChunk) onChunk({ content: parsed.content })
          }
          // 忽略 reasoning_content，不处理
        } catch (e) {
          // Skip invalid JSON but rethrow actual errors
          if (e.message && !e.message.includes('JSON')) {
            throw e
          }
        }
      }
    }

    if (onComplete) onComplete({ content: fullContent })

    return { content: fullContent }
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('请求超时，请稍后重试')
      if (onError) onError(timeoutError)
      throw timeoutError
    }
    if (onError) onError(error)
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function recordPreference({ userId, action, card }) {
  if (!action || !card || !String(card.content || '').trim()) {
    return { success: false, skipped: true }
  }

  const mem0 = getResolvedMem0Settings()
  try {
    const response = await api.post('/preferences/record', {
      userId: userId || getOrCreatePreferenceUserId(),
      action,
      card,
      mem0ApiKey: mem0.apiKey,
      mem0Host: mem0.host
    })
    return response.data
  } catch (error) {
    console.warn('[API] recordPreference failed:', error.response?.data || error.message)
    return { success: false, recorded: false }
  }
}

export async function compactMemoryTextForCandidate(text, type = 'general', metadata = {}) {
  const heuristic = compactMemoryText(text, type, metadata)
  if (!needsLlmMemoryCompaction(text, heuristic, type, metadata)) {
    return heuristic
  }

  const llmMemory = await compactMemoryTextWithLlm({
    source: text,
    type,
    metadata,
    heuristic
  })

  return llmMemory || heuristic
}

async function compactMemoryTextWithLlm({ source, type, metadata, heuristic }) {
  try {
    const response = await sendChat(
      buildMemoryCompactionMessages({ source, type, metadata, heuristic }),
      null,
      metadata?.worldId || metadata?.projectId || '',
      null,
      {
        max_tokens: 120,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        taskType: 'memory.compact',
        attemptName: 'memory-compact',
        max_input_chars: 2400
      }
    )
    return parseMemoryCompactionResult(response?.content || response?.text || '')
  } catch (error) {
    console.warn('[Memory] LLM compaction failed, using heuristic:', error?.message || error)
    return ''
  }
}

/**
 * 记录通用记忆
 * @param {string} text - 记忆内容
 * @param {string} type - 记忆类型
 * @param {object} metadata - 额外元数据
 */
export async function recordMemory(text, type = 'general', metadata = {}) {
  const compactedText = await compactMemoryTextForCandidate(text, type, metadata)
  if (!compactedText) {
    return { success: false, skipped: true }
  }

  const kindMap = {
    preference: 'author-preference',
    character: 'character-state',
    location: 'project-fact',
    decision: 'plot-event',
    event: 'plot-event',
    location_discovery: 'project-fact',
    item_acquisition: 'plot-event',
    dialogue: 'plot-event',
    style: 'style-sample',
    constraint: 'constraint',
    general: 'project-fact'
  }

  const scope = resolveMemoryScope(type, metadata)
  const candidate = queueMemoryCandidate({
    content: compactedText,
    scope,
    scopeId: resolveMemoryScopeId(scope, metadata),
    kind: metadata.kind || kindMap[type] || 'project-fact',
    confidence: metadata.confidence ?? 0.6,
    sourceRef: metadata.sourceRef || type,
    metadata: {
      ...metadata,
      userId: getOrCreatePreferenceUserId(),
      sourceType: type,
      sourceLength: String(text || '').length
    }
  })

  if (candidate.success && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('memory-recorded', {
      detail: {
        text: compactedText.slice(0, 50),
        type,
        kind: candidate.candidate?.kind,
        scope: candidate.candidate?.scope,
        scopeId: candidate.candidate?.scopeId,
        kindLabel: candidate.candidate ? getMemoryKindLabel(candidate.candidate.kind) : ''
      }
    }))
  }

  return {
    success: Boolean(candidate.success),
    recorded: Boolean(candidate.success),
    candidate: candidate.candidate || null,
    kindLabel: candidate.candidate ? getMemoryKindLabel(candidate.candidate.kind) : ''
  }
}

/**
 * 测试 API 连接
 */
export async function testApiConnection(apiSettings) {
  try {
    const response = await api.post('/chat/test', {
      baseUrl: apiSettings.baseUrl,
      apiKey: apiSettings.apiKey,
      provider: apiSettings.provider,
      model: apiSettings.model
    })
    return response.data
  } catch (error) {
    return {
      ok: false,
      message: error.response?.data?.message || '连接请求失败'
    }
  }
}

/**
 * 获取支持的模型列表
 */
export async function fetchAvailableModels(apiSettings) {
  try {
    const response = await api.post('/chat/models', {
      baseUrl: apiSettings.baseUrl,
      apiKey: apiSettings.apiKey,
      provider: apiSettings.provider
    })
    return response.data.models || []
  } catch (error) {
    console.error('[API] fetchAvailableModels failed:', error)
    return []
  }
}

// ---------------- 写作上下文嵌入 LLM ----------------

/**
 * 提示词模板引擎 - 严谨的提示词工程
 */
const SYSTEM_PROMPT_TEMPLATE = `【身份】你是一位资深的文学创作助手，专注于为作者提供叙事支持和灵感启发。

【核心能力】
- 用生动的语言描绘场景氛围、环境细节、人物动作与心理活动
- 根据既有设定自然地推进叙事脉络
- 与创作者互动，响应其创作意图并提供灵感

【回复格式要求】
- 使用 *动作* 格式描述角色动作
- 使用 "对话" 格式描述对话
- 段落分明，场景转换时使用空行
- 长度适中，一般 50-200 字

{context}

【当前情境】
{current_situation}

请作为创作助手，根据上述设定和情境，延续叙事并回应创作动作。`

/**
 * 获取写作上下文详情
 */
export function getWritingContextDetail(override = {}) {
  const context = {
    character: null,
    time: null,
    location: null,
    scene: null,
    activities: [],
    goals: [],
    encounteredCharacters: [],
    factionRelations: {},
    keyChoices: [],
    plotJournal: []
  }

  const hasOverride = (key) => Object.prototype.hasOwnProperty.call(override || {}, key)

  // 角色信息
  const character = hasOverride('character')
    ? (override.character || {})
    : (getItem(STORAGE_KEYS.WRITING_CHARACTER) || {})
  const characterName = String(character.name || '').trim()
  if (characterName && characterName !== 'User' && characterName !== '未命名') {
    context.character = {
      name: characterName,
      gender: character.gender || null,
      age: character.age || null,
      traits: character.traits || [],
      description: character.description || null,
      goal: character.goal || null,
      mood: character.mood
    }
  }

  // 时间信息
  const time = hasOverride('time')
    ? (override.time || {})
    : (getItem(STORAGE_KEYS.WRITING_TIME) || {})
  if (time.year) {
    context.time = {
      era: time.eraId === 'gregorian' ? '公元' : (time.eraName || ''),
      year: time.year,
      month: time.month || null,
      day: time.day || null
    }
  }

  // 当前位置
  const worldmap = hasOverride('location')
    ? (override.location || {})
    : (getItem(STORAGE_KEYS.WRITING_WORLDMAP) || {})
  if (worldmap.currentCountry || worldmap.currentCity || worldmap.currentScene) {
    context.location = {
      country: worldmap.currentCountry || null,
      city: worldmap.currentCity || null,
      scene: worldmap.currentScene || null
    }
  }

  // 当前场景
  if (hasOverride('scene')) {
    const scene = override.scene || {}
    if (scene && (scene.name || scene.position || scene.action || scene.description)) {
      context.scene = {
        name: scene.name || null,
        position: scene.position || null,
        action: scene.action || null,
        description: scene.description || null
      }
    }
  } else {
    const scenes = getItem(STORAGE_KEYS.WRITING_SCENES) || {}
    if (scenes.currentId) {
      const current = scenes.scenes?.find(s => s.id === scenes.currentId)
      if (current) {
        context.scene = {
          name: current.name,
          position: current.position || null,
          action: current.action || null,
          description: current.description || null
        }
      }
    }
  }

  // 最近活动
  const activities = hasOverride('activities')
    ? (Array.isArray(override.activities) ? override.activities : [])
    : (getItem(STORAGE_KEYS.WRITING_ACTIVITIES) || [])
  if (activities.length > 0) {
    context.activities = activities.slice(-5).reverse().map(a => ({
      title: a.title,
      date: a.date || null,
      type: a.type || 'event'
    }))
  }

  if (Array.isArray(override.goals) && override.goals.length > 0) {
    context.goals = override.goals
      .map((goal) => ({
        title: String(goal?.title || '').trim(),
        status: String(goal?.status || 'active').trim()
      }))
      .filter((goal) => goal.title)
      .slice(0, 4)
  }

  if (Array.isArray(override.encounteredCharacters) && override.encounteredCharacters.length > 0) {
    context.encounteredCharacters = override.encounteredCharacters
      .map((character) => String(character?.name || character || '').trim())
      .filter(Boolean)
      .slice(0, 8)
  }

  if (override.factionRelations && typeof override.factionRelations === 'object') {
    context.factionRelations = Object.entries(override.factionRelations).reduce((acc, [name, value]) => {
      const key = String(name || '').trim()
      const score = Number(value)
      if (!key || !Number.isFinite(score)) return acc
      acc[key] = score
      return acc
    }, {})
  }

  if (Array.isArray(override.keyChoices) && override.keyChoices.length > 0) {
    context.keyChoices = override.keyChoices
      .map((choice) => String(choice?.label || choice?.title || choice || '').trim())
      .filter(Boolean)
      .slice(-5)
  }

  if (Array.isArray(override.plotJournal) && override.plotJournal.length > 0) {
    context.plotJournal = override.plotJournal
      .map((item) => String(item?.summary || item?.content || '').trim())
      .filter(Boolean)
      .slice(-2)
  }

  return context
}

/**
 * 获取格式化后的写作上下文字符串
 */
export function getWritingContext() {
  const detail = getWritingContextDetail()
  const parts = []

  // 角色
  if (detail.character) {
    parts.push(`【角色信息】`)
    parts.push(`姓名：${detail.character.name}`)
    if (detail.character.gender) parts.push(`性别：${detail.character.gender}`)
    if (detail.character.age) parts.push(`年龄：${detail.character.age}`)
    if (detail.character.traits.length) {
      parts.push(`性格特征：${detail.character.traits.join('、')}`)
    }
    if (detail.character.description) {
      parts.push(`角色设定：${detail.character.description}`)
    }
    if (detail.character.goal) {
      parts.push(`当前目标：${detail.character.goal}`)
    }
    if (detail.character.mood !== undefined) {
      const moodValue = detail.character.mood
      const moodLabels = { 15: '悲伤', 30: '低落', 50: '平静', 70: '愉悦', 85: '亢奋', 95: '激动' }
      const label = moodLabels[Math.round(moodValue / 15) * 15] || '平静'

      // 心境基础状态
      parts.push(`心境状态：${label} (${moodValue}%)`)

      // 心境对应的叙事走向引导
      const moodNarrativeGuides = {
        15: '叙事倾向于内省与回忆，可能出现失落、怀念、孤独的主题，场景描写偏感伤。',
        30: '叙事节奏放缓，倾向于犹豫、迷茫或等待的心理状态，事件发展可能遭遇阻碍。',
        50: '叙事保持平稳客观，以场景描写和情节推进为主，情绪渲染适度。',
        70: '叙事倾向于积极元素，可能出现巧合、顺利的发展，人际互动愉悦。',
        85: '叙事节奏加快，可能出现戏剧性转折、意外事件或内心激荡的表达。',
        95: '叙事充满张力，可能伴随激烈冲突、突发状况或情感爆发，节奏紧张急促。'
      }
      const roundedMood = Math.round(moodValue / 15) * 15
      if (moodNarrativeGuides[roundedMood]) {
        parts.push(`【叙事氛围引导】${moodNarrativeGuides[roundedMood]}`)
      }
    }
  }

  // 时间
  if (detail.time) {
    parts.push(`【时间背景】`)
    let timeStr = `纪年：${detail.time.era} `
    timeStr += `${detail.time.year}`
    if (detail.time.month) timeStr += `年${detail.time.month}`
    if (detail.time.day) timeStr += `月${detail.time.day}`
    timeStr += '日'
    parts.push(timeStr)
  }

  // 地点
  if (detail.location) {
    parts.push(`【当前位置】`)
    const locParts = [detail.location.country, detail.location.city, detail.location.scene].filter(Boolean)
    parts.push(`地点：${locParts.join(' - ')}`)
  }

  // 场景详情
  if (detail.scene) {
    parts.push(`【场景详情】`)
    parts.push(`场景：${detail.scene.name}`)
    if (detail.scene.position) parts.push(`位置：${detail.scene.position}`)
    if (detail.scene.action) parts.push(`正在做：${detail.scene.action}`)
    if (detail.scene.description) parts.push(`场景描述：${detail.scene.description}`)
  }

  // 最近活动
  if (detail.activities.length > 0) {
    parts.push(`【最近重要活动】`)
    const typeLabels = { event: '事件', milestone: '里程碑', decision: '决定', encounter: '遭遇' }
    detail.activities.forEach(a => {
      parts.push(`- ${a.date || ''} ${a.title} (${typeLabels[a.type] || a.type})`)
    })
  }

  if (detail.goals?.length > 0) {
    parts.push(`【当前目标】`)
    detail.goals.forEach((goal) => {
      parts.push(`- ${goal.title} (${goal.status || 'active'})`)
    })
  }

  if (detail.encounteredCharacters?.length > 0) {
    parts.push(`【已遇角色】`)
    parts.push(detail.encounteredCharacters.join('、'))
  }

  if (detail.keyChoices?.length > 0) {
    parts.push(`【关键选择】`)
    detail.keyChoices.forEach((choice) => {
      parts.push(`- ${choice}`)
    })
  }

  const factionEntries = Object.entries(detail.factionRelations || {})
  if (factionEntries.length > 0) {
    parts.push(`【阵营关系】`)
    factionEntries.slice(0, 6).forEach(([name, score]) => {
      const tendency = score >= 15 ? '友好' : score <= -15 ? '紧张' : '观望'
      parts.push(`- ${name}: ${tendency} (${score})`)
    })
  }

  if (detail.plotJournal?.length > 0) {
    parts.push(`【最近剧情摘要】`)
    detail.plotJournal.forEach((summary) => {
      parts.push(`- ${summary}`)
    })
  }

  return parts.join('\n')
}

/**
 * 构建当前情境简述
 */
function buildCurrentSituation(context) {
  const situation = []

  if (context.character) {
    situation.push(`${context.character.name}正处于`)
  }

  if (context.location) {
    const loc = [context.location.country, context.location.city, context.location.scene].filter(Boolean).join(' - ')
    situation.push(`地点：${loc}`)
  }

  if (context.scene) {
    situation.push(`场景：${context.scene.name}`)
    if (context.scene.position) situation.push(`位置：${context.scene.position}`)
    if (context.scene.action) situation.push(`动作：${context.scene.action}`)
  }

  if (context.time) {
    let timeStr = `时间：${context.time.era} `
    timeStr += `${context.time.year}`
    if (context.time.month) timeStr += `年${context.time.month}`
    if (context.time.day) timeStr += `月${context.time.day}`
    timeStr += '日'
    situation.push(timeStr)
  }

  if (context.goals?.length > 0) {
    situation.push(`当前目标：${context.goals[0].title}`)
  }

  if (context.keyChoices?.length > 0) {
    situation.push(`最近选择：${context.keyChoices[context.keyChoices.length - 1]}`)
  }

  if (context.encounteredCharacters?.length > 0) {
    situation.push(`已遇角色：${context.encounteredCharacters.join('、')}`)
  }

  const factionEntries = Object.entries(context.factionRelations || {})
  if (factionEntries.length > 0) {
    const summary = factionEntries
      .slice(0, 3)
      .map(([name, score]) => `${name} ${score >= 15 ? '友好' : score <= -15 ? '紧张' : '观望'}`)
      .join('；')
    situation.push(`阵营关系：${summary}`)
  }

  if (context.plotJournal?.length > 0) {
    situation.push(`最近剧情：${context.plotJournal[context.plotJournal.length - 1]}`)
  }

  // 基于心境的场景氛围补充
  if (context.character && context.character.mood !== undefined) {
    const moodValue = context.character.mood
    const roundedMood = Math.round(moodValue / 15) * 15

    const moodSceneHints = {
      15: '此刻氛围略显沉重，周围的一切似乎都蒙上了一层淡淡的忧郁。',
      30: '空气中弥漫着些许沉闷，气氛不算太好，但仍有等待转机的余地。',
      50: '一切如常，没有特别的好坏之分，是一个平静的时空切片。',
      70: '此刻心情不错，环境中的一切似乎都显得顺眼，机遇似乎也在悄然出现。',
      85: '情绪高涨，精力充沛，似乎万事俱备，行动力十足。',
      95: '心潮澎湃，情绪激昂，可能即将迎来某种转折或突破。'
    }

    if (moodSceneHints[roundedMood]) {
      situation.push(moodSceneHints[roundedMood])
    }
  }

  return situation.length > 0 ? situation.join('\n') : '暂无特定情境'
}

/**
 * 对话角色口吻的系统提示词
 */
const DIALOGUE_SYSTEM_TEMPLATE = `【角色扮演】你正在以特定角色的身份与用户对话。

【角色设定】
{character_info}

【对话规则】
- 你就是这个角色，以第一人称视角直接与用户对话
- 所有对话使用「"对话内容"」格式，如："今天天气真好"
- 动作和心理描写使用「（动作/心理内容）」格式，如：（他皱起眉头，陷入沉思）
- 不要以旁白身份说话，不要描述角色自身的内心活动
- 保持角色性格、说话方式和语气一致
- 长度适中，一般 30-150 字

{writing_context}

【当前情境】
{current_situation}

请以该角色的身份，延续对话并回应用户的行动。`

function hasSupplementalRuntimeContext(detail) {
  return detail.goals.length > 0 ||
    detail.encounteredCharacters.length > 0 ||
    detail.keyChoices.length > 0 ||
    Object.keys(detail.factionRelations || {}).length > 0 ||
    detail.plotJournal.length > 0
}

/**
 * 将写作上下文作为系统消息注入
 * @param {object|null} dialogueCharacter - 对话角色信息
 * @param {object} options - 选项
 * @param {boolean} options.excludeTime - 是否排除时间信息
 */
export function buildContextMessage(dialogueCharacter = null, options = {}) {
  const { excludeTime = false, contextDetail = null } = options
  const context = getWritingContextDetail(contextDetail || {})

  // 如果需要排除时间，临时清除时间信息
  if (excludeTime) {
    context.time = null
  }

  // 对话模式：使用角色口吻模板
  if (dialogueCharacter) {
    const situation = buildCurrentSituation(context)
    const contextStr = getWritingContextFromDetail(context)

    const characterInfo = [dialogueCharacter.name]
    if (dialogueCharacter.gender) characterInfo.push(`性别：${dialogueCharacter.gender}`)
    if (dialogueCharacter.age) characterInfo.push(`年龄：${dialogueCharacter.age}`)
    if (dialogueCharacter.traits && dialogueCharacter.traits.length) {
      characterInfo.push(`性格特征：${dialogueCharacter.traits.join('、')}`)
    }
    if (dialogueCharacter.description) {
      characterInfo.push(`角色设定：${dialogueCharacter.description}`)
    }

    return {
      role: 'system',
      content: DIALOGUE_SYSTEM_TEMPLATE
        .replace('{character_info}', characterInfo.join('\n'))
        .replace('{writing_context}', contextStr ? `\n【背景信息】\n${contextStr}` : '')
        .replace('{current_situation}', situation)
    }
  }

  // 普通模式
  const hasPrimaryContext = Boolean(context.character || context.time || context.location || context.scene)
  const hasActivityContext = context.activities.length > 0
  if (!hasPrimaryContext && !hasActivityContext && !hasSupplementalRuntimeContext(context)) {
    return null
  }

  const contextStr = getWritingContextFromDetail(context)
  const situation = buildCurrentSituation(context)

  return {
    role: 'system',
    content: SYSTEM_PROMPT_TEMPLATE
      .replace('{context}', contextStr ? `\n【背景信息】\n${contextStr}` : '')
      .replace('{current_situation}', situation)
  }
}

/**
 * 从已有的 context detail 对象构建上下文字符串
 */
function getWritingContextFromDetail(detail) {
  const parts = []

  // 角色
  if (detail.character) {
    parts.push(`【角色信息】`)
    parts.push(`姓名：${detail.character.name}`)
    if (detail.character.gender) parts.push(`性别：${detail.character.gender}`)
    if (detail.character.age) parts.push(`年龄：${detail.character.age}`)
    if (detail.character.traits.length) {
      parts.push(`性格特征：${detail.character.traits.join('、')}`)
    }
    if (detail.character.description) {
      parts.push(`角色设定：${detail.character.description}`)
    }
    if (detail.character.goal) {
      parts.push(`当前目标：${detail.character.goal}`)
    }
    if (detail.character.mood !== undefined) {
      const moodValue = detail.character.mood
      const moodLabels = { 15: '悲伤', 30: '低落', 50: '平静', 70: '愉悦', 85: '亢奋', 95: '激动' }
      const label = moodLabels[Math.round(moodValue / 15) * 15] || '平静'
      parts.push(`心境状态：${label} (${moodValue}%)`)
    }
  }

  // 时间
  if (detail.time) {
    parts.push(`【时间背景】`)
    let timeStr = `纪年：${detail.time.era} `
    timeStr += `${detail.time.year}`
    if (detail.time.month) timeStr += `年${detail.time.month}`
    if (detail.time.day) timeStr += `月${detail.time.day}`
    timeStr += '日'
    parts.push(timeStr)
  }

  // 地点
  if (detail.location) {
    parts.push(`【当前位置】`)
    const locParts = [detail.location.country, detail.location.city, detail.location.scene].filter(Boolean)
    parts.push(`地点：${locParts.join(' - ')}`)
  }

  // 场景详情
  if (detail.scene) {
    parts.push(`【场景详情】`)
    parts.push(`场景：${detail.scene.name}`)
    if (detail.scene.position) parts.push(`位置：${detail.scene.position}`)
    if (detail.scene.action) parts.push(`正在做：${detail.scene.action}`)
    if (detail.scene.description) parts.push(`场景描述：${detail.scene.description}`)
  }

  // 最近活动
  if (detail.activities.length > 0) {
    parts.push(`【最近重要活动】`)
    const typeLabels = { event: '事件', milestone: '里程碑', decision: '决定', encounter: '遭遇' }
    detail.activities.forEach(a => {
      parts.push(`- ${a.date || ''} ${a.title} (${typeLabels[a.type] || a.type})`)
    })
  }

  if (detail.goals?.length > 0) {
    parts.push(`【当前目标】`)
    detail.goals.forEach((goal) => {
      parts.push(`- ${goal.title} (${goal.status || 'active'})`)
    })
  }

  if (detail.encounteredCharacters?.length > 0) {
    parts.push(`【已遇角色】`)
    parts.push(detail.encounteredCharacters.join('、'))
  }

  if (detail.keyChoices?.length > 0) {
    parts.push(`【关键选择】`)
    detail.keyChoices.forEach((choice) => {
      parts.push(`- ${choice}`)
    })
  }

  const factionEntries = Object.entries(detail.factionRelations || {})
  if (factionEntries.length > 0) {
    parts.push(`【阵营关系】`)
    factionEntries.slice(0, 6).forEach(([name, score]) => {
      const tendency = score >= 15 ? '友好' : score <= -15 ? '紧张' : '观望'
      parts.push(`- ${name}: ${tendency} (${score})`)
    })
  }

  if (detail.plotJournal?.length > 0) {
    parts.push(`【最近剧情摘要】`)
    detail.plotJournal.forEach((summary) => {
      parts.push(`- ${summary}`)
    })
  }

  return parts.join('\n')
}

/**
 * 计算提示词信息
 */
export function getPromptInfo(chatHistory = []) {
  const contextMsg = buildContextMessage()

  let historyLength = 0
  chatHistory.forEach(m => {
    if (m.content) historyLength += m.content.length
  })

  return {
    contextLength: contextMsg ? contextMsg.content.length : 0,
    contextTokens: contextMsg ? Math.ceil(contextMsg.content.length / 4) : 0,
    historyLength,
    historyTokens: Math.ceil(historyLength / 4),
    totalLength: (contextMsg ? contextMsg.content.length : 0) + historyLength,
    totalTokens: (contextMsg ? Math.ceil(contextMsg.content.length / 4) : 0) + Math.ceil(historyLength / 4)
  }
}

// ---------------- 创作顾问 ----------------

// ---------------- 其他 ----------------

export async function getEventCategories() {
  const response = await api.get('/events/categories')
  return response.data.categories || []
}

export async function getEvents(category) {
  const response = await api.get(`/events/${category}`)
  return response.data
}

/**
 * 通用错误处理辅助函数
 */
function handleApiError(error) {
  const errorData = error.response?.data
  console.error('API Error:', errorData || error.message)
  
  // 抛出一个友好的错误，包含后端返回的细节
  const baseMessage = errorData?.message || errorData?.error?.message || errorData?.error || '请求失败，请检查网络或配置'
  const code = errorData?.code
  const message = code ? `${baseMessage} [${code}]` : baseMessage
  throw new Error(message)
}
