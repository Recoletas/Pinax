import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

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
 * 发送聊天请求
 */
export async function sendChat(messages, character = null, worldId = null, apiSettings = null) {
  try {
    // 确保 apiSettings 包含 model, baseUrl, apiKey
    const response = await api.post('/chat/chat', { 
      messages, 
      character, 
      worldId, 
      ...apiSettings 
    })
    return response.data
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * 测试 API 连接 (新增)
 * 解决你之前测试不通的问题：必须把 model 传给后端验证
 */
export async function testApiConnection(apiSettings) {
  try {
    const response = await api.post('/chat/test', {
      baseUrl: apiSettings.baseUrl,
      apiKey: apiSettings.apiKey,
      provider: apiSettings.provider,
      model: apiSettings.model // 关键：必须传递模型名称
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
 * 获取支持的模型列表 (新增)
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
    console.error('获取模型列表失败:', error)
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
  const message = errorData?.message || errorData?.error?.message || '请求失败，请检查网络或配置'
  throw new Error(message)
}