import { STORAGE_KEYS } from '../../composables/useStorage'
import { MINIMAX_SERVER_KEY_SENTINEL } from '../../../shared/textModelKeys'

export const MINIMAX_VIDEO_MODELS = Object.freeze([
  'MiniMax-Hailuo-2.3',
  'MiniMax-Hailuo-02',
  'T2V-01-Director',
  'T2V-01'
])

export const VIDEO_PROVIDER_TYPES = Object.freeze([
  { value: 'minimax-video', label: 'MiniMax Video' },
  { value: 'generic-async-http', label: '自定义异步 HTTP' }
])

export const BUILTIN_VIDEO_CONFIG_ID = 'video-minimax-builtin'

/**
 * 内置 MiniMax 视频配置 — 与文本模型内置模式对齐:
 * 计算生成、永不落盘、默认选中、只读; API key 由服务器 .env 注入,
 * 客户端提交哨兵 key, 服务器 adapter 换成真 key。
 */
export function createBuiltinMinimaxVideoConfig() {
  return Object.freeze({
    id: BUILTIN_VIDEO_CONFIG_ID,
    name: 'MiniMax (内置)',
    providerId: 'minimax-video',
    model: MINIMAX_VIDEO_MODELS[0],
    baseUrl: 'https://api.minimaxi.com',
    apiKey: '',
    resolution: '768P',
    promptOptimizer: false,
    fastPretreatment: false,
    aigcWatermark: false,
    submitUrl: '',
    statusUrl: '',
    submitBodyTemplate: '',
    statusPath: '',
    outputUrlPath: '',
    builtin: true,
    serverKey: true,
    description: '由服务器提供密钥，开箱即用'
  })
}

export function createVideoProviderConfigDraft(providerId = 'minimax-video') {
  if (providerId === 'generic-async-http') {
    return {
      id: '',
      name: '',
      providerId,
      model: 'custom',
      baseUrl: '',
      apiKey: '',
      resolution: '',
      promptOptimizer: false,
      fastPretreatment: false,
      aigcWatermark: false,
      submitUrl: '',
      statusUrl: '',
      submitBodyTemplate: '{"prompt":"{{prompt}}","duration":{{duration}},"aspect_ratio":"{{aspectRatio}}"}',
      statusPath: 'id',
      outputUrlPath: 'output_url'
    }
  }
  return {
    id: '',
    name: '',
    providerId: 'minimax-video',
    model: MINIMAX_VIDEO_MODELS[0],
    baseUrl: 'https://api.minimaxi.com',
    apiKey: '',
    resolution: '768P',
    promptOptimizer: false,
    fastPretreatment: false,
    aigcWatermark: false,
    submitUrl: '',
    statusUrl: '',
    submitBodyTemplate: '',
    statusPath: '',
    outputUrlPath: ''
  }
}

export function listVideoProviderConfigs(options = {}) {
  const storage = resolveStorage(options.storage)
  const configs = readConfigs(storage)
  const normalized = configs.map(normalizeVideoProviderConfig).filter(Boolean)
  if (JSON.stringify(configs) !== JSON.stringify(normalized)) {
    try {
      writeConfigs(storage, normalized)
    } catch {
      // A normalized read remains usable when migration writeback is blocked.
    }
  }
  return [createBuiltinMinimaxVideoConfig(), ...normalized]
}

export function saveVideoProviderConfig(input = {}, options = {}) {
  const storage = resolveStorage(options.storage)
  if (input?.builtin || input?.id === BUILTIN_VIDEO_CONFIG_ID) {
    throw new Error('内置 MiniMax 配置不可编辑')
  }
  const config = normalizeVideoProviderConfig({
    ...input,
    id: String(input.id || createConfigId())
  })
  if (!config?.name) throw new Error('视频模型配置名称不能为空')
  if (config.providerId === 'minimax-video' && !config.apiKey) {
    throw new Error('MiniMax 视频配置缺少 API Key')
  }
  if (config.providerId === 'generic-async-http' && (!config.submitUrl || !config.statusUrl)) {
    throw new Error('自定义视频配置缺少提交地址或查询地址')
  }

  const configs = listVideoProviderConfigs({ storage }).filter(
    (item) => item.id !== BUILTIN_VIDEO_CONFIG_ID
  )
  const index = configs.findIndex((item) => item.id === config.id)
  if (index >= 0) configs[index] = config
  else configs.push(config)
  writeConfigs(storage, configs)
  return config
}

export function deleteVideoProviderConfig(configId, options = {}) {
  const storage = resolveStorage(options.storage)
  const id = String(configId || '').trim()
  if (id === BUILTIN_VIDEO_CONFIG_ID) {
    throw new Error('内置 MiniMax 配置不可删除')
  }
  const configs = readConfigs(storage).filter((item) => item.id !== id)
  writeConfigs(storage, configs)
  // 返回完整列表 (含内置), 供 picker 直接刷新
  return listVideoProviderConfigs({ storage })
}

export function resolveSelectedVideoProviderConfig(options = {}) {
  const storage = resolveStorage(options.storage)
  const all = listVideoProviderConfigs({ storage })
  const selectedId = getSelectedVideoProviderConfigId({ storage })
  return all.find((c) => c.id === selectedId) || createBuiltinMinimaxVideoConfig()
}

export function getSelectedVideoProviderConfigId(options = {}) {
  const storage = resolveStorage(options.storage)
  return String(storage.getItem(STORAGE_KEYS.VIDEO_MODEL_SELECTED) || '').trim()
}

export function saveSelectedVideoProviderConfigId(configId, options = {}) {
  const storage = resolveStorage(options.storage)
  const id = String(configId || '').trim()
  storage.setItem(STORAGE_KEYS.VIDEO_MODEL_SELECTED, id)
  return id
}

export function normalizeVideoProviderConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const providerId = input.providerId === 'generic-async-http' ? 'generic-async-http' : 'minimax-video'
  const defaults = createVideoProviderConfigDraft(providerId)
  const model = String(input.model || defaults.model).trim()
  const hailuoModel = ['MiniMax-Hailuo-2.3', 'MiniMax-Hailuo-02'].includes(model)
  const allowedResolutions = hailuoModel ? ['768P', '1080P'] : ['720P', '1080P']
  const requestedResolution = String(input.resolution || defaults.resolution).trim().toUpperCase()
  return {
    ...defaults,
    id: String(input.id || '').trim(),
    name: String(input.name || '').trim(),
    providerId,
    model,
    baseUrl: String(input.baseUrl || defaults.baseUrl).trim().replace(/\/+$/, ''),
    apiKey: String(input.apiKey || '').trim(),
    resolution: providerId === 'minimax-video' && !allowedResolutions.includes(requestedResolution)
      ? allowedResolutions[0]
      : requestedResolution,
    promptOptimizer: input.promptOptimizer === true,
    fastPretreatment: hailuoModel && input.fastPretreatment === true,
    aigcWatermark: input.aigcWatermark === true,
    submitUrl: String(input.submitUrl || defaults.submitUrl).trim(),
    statusUrl: String(input.statusUrl || defaults.statusUrl).trim(),
    submitBodyTemplate: String(input.submitBodyTemplate || defaults.submitBodyTemplate),
    statusPath: String(input.statusPath || defaults.statusPath).trim(),
    outputUrlPath: String(input.outputUrlPath || defaults.outputUrlPath).trim()
  }
}

export function toVideoProviderConfig(config = {}) {
  // 内置配置 → 提交哨兵 key, 服务器 adapter 换成真实 env key
  const builtin = config.builtin === true
  const common = {
    apiKey: builtin ? MINIMAX_SERVER_KEY_SENTINEL : config.apiKey,
    model: config.model
  }
  if (config.baseUrl) common.baseUrl = config.baseUrl
  if (config.providerId === 'minimax-video') {
    return {
      ...common,
      resolution: config.resolution || '768P',
      promptOptimizer: config.promptOptimizer === true,
      fastPretreatment: config.fastPretreatment === true,
      aigcWatermark: config.aigcWatermark === true
    }
  }
  return {
    ...common,
    submitUrl: config.submitUrl,
    statusUrl: config.statusUrl,
    submitBodyTemplate: config.submitBodyTemplate,
    statusPath: config.statusPath,
    outputUrlPath: config.outputUrlPath
  }
}

function readConfigs(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEYS.VIDEO_MODEL_CONFIGS) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeConfigs(storage, configs) {
  storage.setItem(STORAGE_KEYS.VIDEO_MODEL_CONFIGS, JSON.stringify(configs))
}

function resolveStorage(storage) {
  const resolved = storage || globalThis.localStorage
  if (!resolved?.getItem || !resolved?.setItem) throw new Error('当前环境不支持配置存储')
  return resolved
}

function createConfigId() {
  return `video_model_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
