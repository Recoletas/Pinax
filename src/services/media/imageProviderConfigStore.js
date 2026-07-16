import { STORAGE_KEYS } from '../../composables/useStorage'
import { createImageModelConfigDraft, IMAGE_MODEL_TYPES } from './imageProviderService'

const VALID_PROVIDER_TYPES = new Set(IMAGE_MODEL_TYPES.map((item) => item.value))

export function listImageProviderConfigs(options = {}) {
  const storage = resolveStorage(options.storage)
  const configs = readConfigs(storage)
  const normalized = configs.map(normalizeImageProviderConfig).filter(Boolean)

  if (JSON.stringify(configs) !== JSON.stringify(normalized)) {
    try {
      writeConfigs(storage, normalized)
    } catch {
      // Reading a usable normalized view must not depend on migration writeback.
    }
  }
  return normalized
}

export function saveImageProviderConfig(input = {}, options = {}) {
  const storage = resolveStorage(options.storage)
  const config = normalizeImageProviderConfig({
    ...input,
    id: String(input.id || createConfigId())
  })
  if (!config?.name) throw new Error('模型配置名称不能为空')

  const configs = listImageProviderConfigs({ storage })
  const index = configs.findIndex((item) => item.id === config.id)
  if (index >= 0) configs[index] = config
  else configs.push(config)
  writeConfigs(storage, configs)
  return config
}

export function deleteImageProviderConfig(configId, options = {}) {
  const storage = resolveStorage(options.storage)
  const id = String(configId || '').trim()
  const configs = listImageProviderConfigs({ storage }).filter((item) => item.id !== id)
  writeConfigs(storage, configs)
  return configs
}

export function normalizeImageProviderConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const defaults = createImageModelConfigDraft()
  const type = VALID_PROVIDER_TYPES.has(input.type) ? input.type : defaults.type

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
