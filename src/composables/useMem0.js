/**
 * useMem0 - 记忆力系统组合式函数
 *
 * 职责：
 * - mem0 API 客户端封装
 * - 记忆 CRUD 操作
 * - 事件驱动同步
 * - 本地缓存
 */

import { ref, computed, onUnmounted, getCurrentInstance } from 'vue'
import { getItem, setItem, STORAGE_KEYS } from './useStorage'

// 配置常量
const DEFAULT_API_URL = 'https://api.mem0.ai/v1'
const DEBOUNCE_MS = 2000
const BATCH_INTERVAL_MS = 500
const MAX_CONCURRENT = 3
const MAX_PER_MINUTE = 20
const CACHE_KEY = 'mem0_cache'
const SYNC_STATE_KEY = 'mem0_sync_state'
const MEMORY_SCOPE_VALUES = new Set(['global-author', 'project', 'session'])

// 记忆类型
export const MEMORY_TYPES = {
  CHARACTER: 'character',
  LOCATION: 'location',
  PREFERENCE: 'preference',
  DECISION: 'decision',
  RELATIONSHIP: 'relationship',
  EVENT: 'event'
}

// 同步队列状态
const syncQueue = new Map()
let processing = false
let requestCount = 0
let lastMinuteReset = Date.now()

function normalizeMemoryScope(scope) {
  const value = String(scope || '').trim()
  return MEMORY_SCOPE_VALUES.has(value) ? value : ''
}

function normalizeSearchMetadataFilter(metadataFilter = {}) {
  if (!metadataFilter || typeof metadataFilter !== 'object') return null

  const entries = Object.entries(metadataFilter)
    .map(([key, value]) => [String(key).trim(), value])
    .filter(([key, value]) => key && value !== undefined && value !== null && String(value).trim() !== '')
    .sort(([a], [b]) => a.localeCompare(b))

  if (!entries.length) return null

  return Object.fromEntries(entries.map(([key, value]) => [key, String(value)]))
}

function buildSearchMetadataFilter({ type = '', scope = '', scopeId = '', metadataFilter = {} } = {}) {
  const filter = normalizeSearchMetadataFilter(metadataFilter) || {}

  if (type) {
    filter.type = String(type)
  }

  if (scope) {
    filter.scope = String(scope)
  }

  if (scopeId) {
    filter.scopeId = String(scopeId)
  }

  return normalizeSearchMetadataFilter(filter)
}

function buildSearchCacheKey(query, options = {}) {
  return JSON.stringify({
    query: String(query || ''),
    limit: Number(options.limit) || 10,
    type: options.type || null,
    scope: options.scope || null,
    scopeId: options.scopeId || null,
    metadataFilter: normalizeSearchMetadataFilter(options.metadataFilter)
  })
}

/**
 * 创建 mem0 客户端
 * @param {object} config - 配置选项
 * @returns {object} mem0 客户端
 */
export function useMem0(config = {}) {
  const {
    apiUrl = DEFAULT_API_URL,
    userId = getDefaultUserId(),
    apiKey = ''
  } = config

  // 状态
  const isLoading = ref(false)
  const error = ref(null)
  const lastSyncTime = ref(getLastSyncTime())

  // 本地缓存
  const cache = ref(loadCache())

  // 计算属性
  const isConfigured = computed(() => {
    return Boolean(apiUrl && userId)
  })

  /**
   * 存储记忆
   * @param {object} memory - 记忆数据
   * @returns {Promise<object>} 存储结果
   */
  async function storeMemory(memory) {
    if (!isConfigured.value) {
      return { success: false, error: 'mem0 未配置' }
    }

    const memoryMetadata = memory?.metadata && typeof memory.metadata === 'object' ? memory.metadata : {}

    try {
      const response = await fetch('/api/chat/mem0/memories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          apiKey,
          host: apiUrl,
          userId,
          messages: [{ role: 'user', content: memory.content }],
          metadata: {
            ...memoryMetadata,
            type: memory.type || memoryMetadata.type || MEMORY_TYPES.EVENT,
            entityId: memory.entityId || memoryMetadata.entityId,
            scope: memory.scope || memoryMetadata.scope || '',
            scopeId: memory.scopeId || memoryMetadata.scopeId || '',
            importance: memory.importance || memoryMetadata.importance || 5
          }
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()

      // 更新缓存
      updateCache(memory.entityId, data)

      return { success: true, data }
    } catch (err) {
      console.error('mem0 storeMemory error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 检索记忆
   * @param {string} query - 查询字符串
   * @param {object} options - 检索选项
   * @returns {Promise<Array>} 记忆列表
   */
  async function searchMemories(query, options = {}) {
    if (!isConfigured.value) {
      return []
    }

    const {
      limit = 10,
      type,
      scope,
      scopeId,
      metadataFilter = {}
    } = options
    const normalizedScope = normalizeMemoryScope(scope)
    const normalizedScopeId = String(scopeId || '').trim()
    const mergedMetadataFilter = buildSearchMetadataFilter({
      type,
      scope: normalizedScope,
      scopeId: normalizedScopeId,
      metadataFilter
    })

    // 检查缓存
    const cacheKey = buildSearchCacheKey(query, {
      limit,
      type,
      scope: normalizedScope,
      scopeId: normalizedScopeId,
      metadataFilter: mergedMetadataFilter
    })
    const cached = getCachedSearch(cacheKey)
    if (cached && Date.now() - cached.timestamp < 60000) {
      return cached.results
    }

    try {
      const response = await fetch('/api/chat/mem0/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          apiKey,
          host: apiUrl,
          userId,
          query,
          limit,
          metadataFilter: mergedMetadataFilter
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()
      const results = result.data?.results || result.data?.memories || []

      // 更新缓存
      setCachedSearch(cacheKey, results)

      return results
    } catch (err) {
      console.error('mem0 searchMemories error:', err)
      return []
    }
  }

  /**
   * 删除记忆
   * @param {string} memoryId - 记忆 ID
   * @returns {Promise<boolean>} 是否成功
   */
  async function deleteMemory(memoryId) {
    if (!isConfigured.value || !memoryId) {
      return false
    }

    try {
      const response = await fetch('/api/chat/mem0/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          apiKey,
          host: apiUrl,
          memoryId
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      // 清除缓存
      clearCacheForMemory(memoryId)

      return true
    } catch (err) {
      console.error('mem0 deleteMemory error:', err)
      return false
    }
  }

  /**
   * 按类型获取记忆
   * @param {string} type - 记忆类型
   * @returns {Promise<Array>} 记忆列表
   */
  async function getMemoriesByType(type, options = {}) {
    return searchMemories('', {
      ...options,
      type,
      limit: options.limit || 50
    })
  }

  /**
   * 入队同步任务
   * @param {object} payload - 同步数据
   */
  function enqueueSync(payload) {
    const key = `${payload.entityId}_${payload.metadata?.source || 'unknown'}`
    const existing = syncQueue.get(key)

    if (existing && Date.now() - existing.timestamp < DEBOUNCE_MS) {
      // 覆盖已有条目
      syncQueue.set(key, { payload, timestamp: Date.now() })
    } else {
      syncQueue.set(key, { payload, timestamp: Date.now() })
    }

    // 触发处理
    scheduleQueueProcessing()
  }

  /**
   * 调度队列处理
   */
  function scheduleQueueProcessing() {
    if (processing) return
    setTimeout(processQueue, BATCH_INTERVAL_MS)
  }

  /**
   * 处理同步队列
   */
  async function processQueue() {
    if (processing || syncQueue.size === 0) return

    processing = true

    // 速率限制检查
    const now = Date.now()
    if (now - lastMinuteReset > 60000) {
      requestCount = 0
      lastMinuteReset = now
    }

    if (requestCount >= MAX_PER_MINUTE) {
      processing = false
      setTimeout(processQueue, 60000 - (now - lastMinuteReset))
      return
    }

    // 取出一批
    const batch = Array.from(syncQueue.entries())
      .slice(0, MAX_CONCURRENT)
      .map(([key, item]) => ({ key, ...item }))

    // 并发执行
    const results = await Promise.allSettled(
      batch.map(item => storeMemory(item.payload))
    )

    // 移除已处理的
    for (let i = 0; i < batch.length; i++) {
      if (results[i].status === 'fulfilled') {
        syncQueue.delete(batch[i].key)
        requestCount++
      }
    }

    // 更新同步时间
    lastSyncTime.value = Date.now()
    saveLastSyncTime(lastSyncTime.value)

    processing = false

    // 如果还有待处理的，继续
    if (syncQueue.size > 0) {
      setTimeout(processQueue, BATCH_INTERVAL_MS)
    }
  }

  /**
   * 构建记忆上下文
   * @param {string} currentSituation - 当前情境
   * @returns {Promise<string>} 记忆上下文
   */
  async function buildMemoryContext(currentSituation, options = {}) {
    const memories = await searchMemories(currentSituation, {
      limit: options.limit || 10,
      type: options.type,
      scope: options.scope,
      scopeId: options.scopeId,
      metadataFilter: options.metadataFilter
    })

    if (memories.length === 0) return ''

    const sections = memories.map(memory => {
      const type = memory.metadata?.type || 'unknown'
      const content = memory.memory || memory.content || ''
      return `【${type}】${content}`
    })

    return sections.join('\n')
  }

  // 清理
  if (getCurrentInstance()) {
    onUnmounted(() => {
      // 保存未同步的数据
      if (syncQueue.size > 0) {
        setItem(SYNC_STATE_KEY, {
          pending: Array.from(syncQueue.entries()),
          timestamp: Date.now()
        })
      }
    })
  }

  return {
    // 状态
    isLoading,
    error,
    lastSyncTime,
    cache,
    isConfigured,

    // 方法
    storeMemory,
    searchMemories,
    deleteMemory,
    getMemoriesByType,
    enqueueSync,
    buildMemoryContext
  }
}

// ========== 辅助函数 ==========

function getDefaultUserId() {
  let userId = getItem('mem0_user_id')
  if (!userId) {
    userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    setItem('mem0_user_id', userId)
  }
  return userId
}

function loadCache() {
  return getItem(CACHE_KEY) || {}
}

function updateCache(entityId, data) {
  const cache = loadCache()
  cache[entityId] = {
    data,
    timestamp: Date.now()
  }
  setItem(CACHE_KEY, cache)
}

function getCachedSearch(key) {
  const cache = loadCache()
  return cache[`search_${key}`]
}

function setCachedSearch(key, results) {
  const cache = loadCache()
  cache[`search_${key}`] = {
    results,
    timestamp: Date.now()
  }
  setItem(CACHE_KEY, cache)
}

function clearCacheForMemory(memoryId) {
  const cache = loadCache()
  for (const key of Object.keys(cache)) {
    if (key === memoryId || cache[key]?.data?.id === memoryId) {
      delete cache[key]
    }
  }
  setItem(CACHE_KEY, cache)
}

function getLastSyncTime() {
  const state = getItem(SYNC_STATE_KEY)
  return state?.lastSyncTime || 0
}

function saveLastSyncTime(time) {
  const state = getItem(SYNC_STATE_KEY) || {}
  state.lastSyncTime = time
  setItem(SYNC_STATE_KEY, state)
}

// ========== 记忆提取辅助函数 ==========

/**
 * 从角色卡提取记忆数据
 * @param {object} character - 角色卡数据
 * @returns {object} 记忆数据
 */
export function extractCharacterMemory(character) {
  const parts = []

  if (character.name) {
    parts.push(`角色：${character.name}`)
  }
  if (character.gender) {
    parts.push(`性别：${character.gender}`)
  }
  if (character.age) {
    parts.push(`年龄：${character.age}`)
  }
  if (character.personality) {
    parts.push(`性格：${character.personality}`)
  }
  if (character.background) {
    parts.push(`背景：${character.background}`)
  }
  if (character.relationships && character.relationships.length > 0) {
    parts.push(`关系：${character.relationships.join('、')}`)
  }

  return {
    type: MEMORY_TYPES.CHARACTER,
    entityId: character.id || `char_${Date.now()}`,
    content: parts.join(' | '),
    importance: character.importance || 7,
    metadata: {
      source: 'writing_character',
      version: character.version || 1,
      tags: extractTags(character)
    }
  }
}

/**
 * 从活动提取记忆数据
 * @param {object} activity - 活动数据
 * @returns {object} 记忆数据
 */
export function extractActivityMemory(activity) {
  return {
    type: MEMORY_TYPES.DECISION,
    entityId: activity.id || `act_${Date.now()}`,
    content: `决定：${activity.title || activity.description || ''}`,
    importance: activity.importance || 5,
    metadata: {
      source: 'important_activity',
      chapterId: activity.chapterId,
      sceneTags: activity.sceneTags || [],
      involvedCharacters: activity.involvedCharacters || []
    }
  }
}

/**
 * 从用户设置提取偏好记忆
 * @param {object} settings - 用户设置
 * @returns {object} 记忆数据
 */
export function extractPreferenceMemory(settings) {
  const parts = []

  if (settings.aiProvider) {
    parts.push(`AI 提供商：${settings.aiProvider}`)
  }
  if (settings.modelId) {
    parts.push(`模型：${settings.modelId}`)
  }
  if (settings.temperature !== undefined) {
    parts.push(`温度：${settings.temperature}`)
  }
  if (settings.narrativeStyle) {
    parts.push(`叙事风格：${settings.narrativeStyle}`)
  }
  if (settings.viewpoint) {
    parts.push(`叙事视角：${settings.viewpoint}`)
  }

  return {
    type: MEMORY_TYPES.PREFERENCE,
    entityId: 'user_api_settings',
    content: parts.join(' | '),
    importance: 7,
    metadata: {
      source: 'apiSettings',
      category: 'writing_style'
    }
  }
}

/**
 * 提取标签
 * @param {object} data - 数据
 * @returns {Array} 标签列表
 */
function extractTags(data) {
  const tags = []
  if (data.isProtagonist) tags.push('主角')
  if (data.gender === '女' || data.gender === 'female') tags.push('女性')
  if (data.gender === '男' || data.gender === 'male') tags.push('男性')
  return tags
}

export default useMem0
