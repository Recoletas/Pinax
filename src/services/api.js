import axios from 'axios'
import { getItem, getTextItem, setTextItem, STORAGE_KEYS } from '../composables/useStorage'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

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
 * 获取完整 API 配置（统一入口）
 * 优先从 localStorage 读取，回退到后端 secrets
 */
export async function getResolvedApiSettings() {
  const localRaw = getItem(STORAGE_KEYS.API_SETTINGS) || {}

  const normalize = (raw) => ({
    provider: raw.provider || null,
    baseUrl: raw.baseUrl || null,
    apiKey: raw.apiKey || null,
    model: raw.model || null
  })

  const local = normalize(localRaw)
  let merged = { ...local }
  let source = 'localStorage'

  if (!merged.baseUrl || !merged.apiKey || !merged.model) {
    try {
      const remote = await getApiSettings()
      merged = {
        provider: local.provider || remote.provider || null,
        baseUrl: local.baseUrl || remote.base_url || remote.baseUrl || null,
        apiKey: local.apiKey || remote.api_key_openai || remote.apiKey || null,
        model: local.model || remote.openai_model || remote.model || null
      }
      source = 'localStorage + backend secrets'
    } catch (e) {
      console.warn('[API] Failed to load backend secrets, using localStorage only', e)
    }
  }

  console.info('[API] Resolved settings:', {
    source,
    provider: merged.provider,
    baseUrl: merged.baseUrl,
    model: merged.model,
    hasApiKey: Boolean(merged.apiKey)
  })

  return merged
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

export async function recordPreference({ userId, action, card }) {
  if (!action || !card || !String(card.content || '').trim()) {
    return { success: false, skipped: true }
  }

  try {
    const response = await api.post('/preferences/record', {
      userId: userId || getOrCreatePreferenceUserId(),
      action,
      card
    })
    return response.data
  } catch (error) {
    console.warn('[API] recordPreference failed:', error.response?.data || error.message)
    return { success: false, recorded: false }
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

// ---------------- 密钥管理 ----------------

export async function getApiSettings() {
  const response = await api.post('/chat/secrets/read')
  return response.data
}

export async function saveApiSettings(settings) {
  // 注意：这里建议后端支持一次性写入，如果不支持，则维持现状
  for (const [key, value] of Object.entries(settings)) {
    await api.post('/chat/secrets/write', { key, value })
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
export function getWritingContextDetail() {
  const context = {
    character: null,
    time: null,
    location: null,
    scene: null,
    activities: []
  }

  // 角色信息
  const character = getItem(STORAGE_KEYS.WRITING_CHARACTER) || {}
  if (character.name) {
    context.character = {
      name: character.name,
      gender: character.gender || null,
      age: character.age || null,
      traits: character.traits || [],
      description: character.description || null,
      goal: character.goal || null,
      mood: character.mood
    }
  }

  // 时间信息
  const time = getItem(STORAGE_KEYS.WRITING_TIME) || {}
  if (time.year) {
    context.time = {
      era: time.eraId === 'gregorian' ? '公元' : (time.eraName || ''),
      year: time.year,
      month: time.month || null,
      day: time.day || null
    }
  }

  // 当前位置
  const worldmap = getItem(STORAGE_KEYS.WRITING_WORLDMAP) || {}
  if (worldmap.currentCountry || worldmap.currentCity || worldmap.currentScene) {
    context.location = {
      country: worldmap.currentCountry || null,
      city: worldmap.currentCity || null,
      scene: worldmap.currentScene || null
    }
  }

  // 当前场景
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

  // 最近活动
  const activities = getItem(STORAGE_KEYS.WRITING_ACTIVITIES) || []
  if (activities.length > 0) {
    context.activities = activities.slice(-5).reverse().map(a => ({
      title: a.title,
      date: a.date || null,
      type: a.type || 'event'
    }))
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

/**
 * 将写作上下文作为系统消息注入
 */
export function buildContextMessage(dialogueCharacter = null) {
  const context = getWritingContextDetail()

  // 对话模式：使用角色口吻模板
  if (dialogueCharacter) {
    const situation = buildCurrentSituation(context)
    const contextStr = getWritingContext()

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
  if (!context.character && !context.time && !context.location && !context.scene && context.activities.length === 0) {
    return null
  }

  const contextStr = getWritingContext()
  const situation = buildCurrentSituation(context)

  return {
    role: 'system',
    content: SYSTEM_PROMPT_TEMPLATE
      .replace('{context}', contextStr ? `\n【背景信息】\n${contextStr}` : '')
      .replace('{current_situation}', situation)
  }
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

/**
 * 获取创作建议（OpenClaw 模式）
 * @param {object} context - 上下文数据对象
 * @param {string} question - 用户问题
 */
export async function getCreativeAdvice(context, question) {
  const response = await api.post('/openclaw/advice', { context, question })
  return response.data.advice || ''
}

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