import { STORAGE_KEYS } from '../../composables/useStorage'
import { createImageModelConfigDraft, IMAGE_MODEL_TYPES } from './imageProviderService'

const VALID_PROVIDER_TYPES = new Set(IMAGE_MODEL_TYPES.map((item) => item.value))

export const BUILTIN_IMAGE_CONFIG_ID = 'image-minimax-builtin'

/**
 * 内置 MiniMax 图片配置 — 与文本模型内置模式对齐:
 * 计算生成、永不落盘、默认选中、只读; API key 由服务器 .env 注入,
 * 生成经 /api/media/images 代理, 浏览器不接触真实 key。
 */
export function createBuiltinMinimaxImageConfig() {
  return Object.freeze({
    id: BUILTIN_IMAGE_CONFIG_ID,
    name: 'MiniMax (内置)',
    type: 'minimax_image',
    baseUrl: 'https://api.minimaxi.com',
    apiKey: '',
    defaultModel: 'image-01',
    responsePath: '',
    requestTemplate: '',
    builtin: true,
    serverKey: true,
    description: '由服务器提供密钥，开箱即用'
  })
}

export function listImageProviderConfigs(options = {}) {
  const storage = resolveStorage(options.storage)
  const configs = readConfigs(storage)
  let normalized = configs.map(normalizeImageProviderConfig).filter(Boolean)
  // 迁移: 旧版空 Key 的 minimax-default 被内置 MiniMax 取代, 不再展示/保留。
  // 用户已填 Key 自定义过的仍保留。
  normalized = normalized.filter((c) => !(c.id === 'minimax-default' && !c.apiKey))

  if (JSON.stringify(configs) !== JSON.stringify(normalized)) {
    try {
      writeConfigs(storage, normalized)
    } catch {
      // Reading a usable normalized view must not depend on migration writeback.
    }
  }
  return [createBuiltinMinimaxImageConfig(), ...normalized]
}

export function saveImageProviderConfig(input = {}, options = {}) {
  const storage = resolveStorage(options.storage)
  if (input?.builtin || input?.id === BUILTIN_IMAGE_CONFIG_ID) {
    throw new Error('内置 MiniMax 配置不可编辑')
  }
  const config = normalizeImageProviderConfig({
    ...input,
    id: String(input.id || createConfigId())
  })
  if (!config?.name) throw new Error('模型配置名称不能为空')

  const configs = listImageProviderConfigs({ storage }).filter(
    (item) => item.id !== BUILTIN_IMAGE_CONFIG_ID
  )
  const index = configs.findIndex((item) => item.id === config.id)
  if (index >= 0) configs[index] = config
  else configs.push(config)
  writeConfigs(storage, configs)
  return config
}

export function deleteImageProviderConfig(configId, options = {}) {
  const storage = resolveStorage(options.storage)
  const id = String(configId || '').trim()
  if (id === BUILTIN_IMAGE_CONFIG_ID) {
    throw new Error('内置 MiniMax 配置不可删除')
  }
  const configs = readConfigs(storage).filter((item) => item.id !== id)
  writeConfigs(storage, configs)
  // 返回完整列表 (含内置), 供 picker 直接刷新
  return listImageProviderConfigs({ storage })
}

/**
 * 内置 MiniMax 由 listImageProviderConfigs 计算提供, 开箱即用;
 * 不再需要落盘默认配置 (保留函数签名以兼容 App.vue 调用点)。
 */
export function ensureDefaultImageConfig() {
  return []
}

export function normalizeImageProviderConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const fallback = createImageModelConfigDraft()
  const type = VALID_PROVIDER_TYPES.has(input.type) ? input.type : fallback.type
  const defaults = createImageModelConfigDraft(type)

  return {
    ...defaults,
    id: String(input.id || '').trim(),
    name: String(input.name || '').trim(),
    type,
    baseUrl: String(input.baseUrl || defaults.baseUrl).trim().replace(/\/+$/, ''),
    apiKey: String(input.apiKey || '').trim(),
    defaultModel: String(input.defaultModel || '').trim(),
    responsePath: String(input.responsePath || '').trim(),
    requestTemplate: String(input.requestTemplate || '')
  }
}

function readConfigs(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEYS.IMAGE_MODEL_CONFIGS) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeConfigs(storage, configs) {
  storage.setItem(STORAGE_KEYS.IMAGE_MODEL_CONFIGS, JSON.stringify(configs))
}

function resolveStorage(storage) {
  const resolved = storage || globalThis.localStorage
  if (!resolved?.getItem || !resolved?.setItem) throw new Error('当前环境不支持配置存储')
  return resolved
}

function createConfigId() {
  return `model_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
