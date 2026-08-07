/**
 * 文本模型配置 store — 与 image/video 的「配置列表 + 新增」模式对齐。
 *
 * 存储形态:
 * - 一条「内置 MiniMax」配置由 createBuiltinMinimaxConfig() 计算得出, 永不落盘,
 *   始终排在列表第一且只读; 它的 API key 由服务器 .env 注入, 客户端以哨兵占位。
 * - 用户自定义配置存于 STORAGE_KEYS.TEXT_MODEL_CONFIGS; 选中 id 存于 TEXT_MODEL_SELECTED。
 * - 首次读取时把旧的单一对象 localStorage['apiSettings'] 迁移为一条可编辑用户配置
 *   (一次性、幂等), 之后旧 key 被移除。
 *
 * getResolvedApiSettings() 经 toResolvedTextApiSettings() 拿到与旧版形状一致的
 * { provider, baseUrl, apiKey, model, format } (内置时 apiKey 为哨兵), 兼容全部消费方。
 */
import { STORAGE_KEYS } from '../composables/useStorage'
import { MINIMAX_SERVER_KEY_SENTINEL } from '../../shared/textModelKeys'

export const BUILTIN_TEXT_CONFIG_ID = 'text-minimax-builtin'

// 与 useApiSettings.providers 对齐; 单独维护以免与 composable → api.js → 本 store 形成循环依赖。
export const TEXT_PROVIDER_TYPES = Object.freeze([
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-v4-flash' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: '' },
  { id: 'siliconflow', name: 'SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1', defaultModel: '' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: '' },
  { id: 'ollama', name: 'Ollama (本地)', baseUrl: 'http://localhost:11434', defaultModel: '' },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: '' },
  { id: 'moonshot', name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', defaultModel: '' },
  { id: 'MiniMax', name: 'MiniMax (Anthropic 兼容)', baseUrl: 'https://api.minimaxi.com/anthropic', defaultModel: 'MiniMax-Text-01' },
  { id: 'custom', name: '自定义', baseUrl: '', defaultModel: '' }
])

const LEGACY_API_SETTINGS_KEY = 'apiSettings'

export function createBuiltinMinimaxConfig() {
  return Object.freeze({
    id: BUILTIN_TEXT_CONFIG_ID,
    name: 'MiniMax (内置)',
    providerId: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    apiKey: '',
    model: 'MiniMax-Text-01',
    builtin: true,
    serverKey: true,
    description: '由服务器提供密钥，开箱即用'
  })
}

export function createTextProviderConfigDraft(providerId = 'MiniMax') {
  const p = TEXT_PROVIDER_TYPES.find((item) => item.id === providerId)
  return {
    id: '',
    name: '',
    providerId: p ? p.id : 'custom',
    baseUrl: p ? p.baseUrl : '',
    apiKey: '',
    model: p ? p.defaultModel : ''
  }
}

/**
 * 列表 = [内置, ...用户配置]。内置不落盘, 由 createBuiltinMinimaxConfig 计算。
 */
export function listTextProviderConfigs(options = {}) {
  const storage = resolveStorage(options.storage)
  migrateLegacyApiSettings({ storage })
  const userConfigs = readConfigs(storage).map(normalizeTextProviderConfig).filter(Boolean)
  return [createBuiltinMinimaxConfig(), ...userConfigs]
}

export function saveTextProviderConfig(input = {}, options = {}) {
  const storage = resolveStorage(options.storage)
  if (input?.builtin || input?.id === BUILTIN_TEXT_CONFIG_ID) {
    throw new Error('内置 MiniMax 配置不可编辑')
  }
  const config = normalizeTextProviderConfig({
    ...input,
    id: String(input.id || createConfigId())
  })
  if (!config?.name) throw new Error('文本模型配置名称不能为空')

  const configs = listTextProviderConfigs({ storage }).filter(
    (item) => item.id !== BUILTIN_TEXT_CONFIG_ID
  )
  const index = configs.findIndex((item) => item.id === config.id)
  if (index >= 0) configs[index] = config
  else configs.push(config)
  writeConfigs(storage, configs)
  return config
}

export function deleteTextProviderConfig(configId, options = {}) {
  const storage = resolveStorage(options.storage)
  const id = String(configId || '').trim()
  if (id === BUILTIN_TEXT_CONFIG_ID) {
    throw new Error('内置 MiniMax 配置不可删除')
  }
  const configs = readConfigs(storage).filter((item) => item.id !== id)
  writeConfigs(storage, configs)
  return configs
}

export function getSelectedTextProviderConfigId(options = {}) {
  const storage = resolveStorage(options.storage)
  return String(storage.getItem(STORAGE_KEYS.TEXT_MODEL_SELECTED) || '').trim()
}

export function saveSelectedTextProviderConfigId(configId, options = {}) {
  const storage = resolveStorage(options.storage)
  const id = String(configId || '').trim()
  storage.setItem(STORAGE_KEYS.TEXT_MODEL_SELECTED, id)
  return id
}

/**
 * 解析当前生效的文本配置: 有选中且存在 → 选中项; 否则回退内置 MiniMax。
 */
export function resolveSelectedTextProviderConfig(options = {}) {
  const storage = resolveStorage(options.storage)
  migrateLegacyApiSettings({ storage })
  const all = listTextProviderConfigs({ storage })
  const selectedId = getSelectedTextProviderConfigId({ storage })
  return all.find((c) => c.id === selectedId) || createBuiltinMinimaxConfig()
}

/**
 * 单一映射点: 配置对象 → 与旧 getResolvedApiSettings 形状一致的设置对象。
 * 内置 MiniMax 时 apiKey 为哨兵 (让现存 Boolean(apiKey) 守卫通过), 服务器再替换为真 key。
 */
export function toResolvedTextApiSettings(config) {
  if (!config) {
    return {
      provider: null,
      baseUrl: null,
      apiKey: null,
      model: null,
      format: null,
      builtin: false,
      serverKey: false,
      configId: null
    }
  }
  const builtin = config.builtin === true
  const clientKey = String(config.apiKey || '').trim()
  return {
    provider: config.providerId || null,
    baseUrl: config.baseUrl || null,
    apiKey: builtin ? MINIMAX_SERVER_KEY_SENTINEL : clientKey || null,
    model: config.model || null,
    format: null,
    builtin,
    serverKey: builtin,
    configId: config.id || null
  }
}

export function normalizeTextProviderConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const providerId = TEXT_PROVIDER_TYPES.some((p) => p.id === input.providerId)
    ? input.providerId
    : 'custom'
  const defaults = createTextProviderConfigDraft(providerId)
  return {
    ...defaults,
    id: String(input.id || '').trim(),
    name: String(input.name || '').trim(),
    providerId,
    baseUrl: String(input.baseUrl || defaults.baseUrl).trim().replace(/\/+$/, ''),
    apiKey: String(input.apiKey || '').trim(),
    model: String(input.model || defaults.model).trim(),
    builtin: false,
    serverKey: false
  }
}

/**
 * 旧版单一对象迁移 (localStorage['apiSettings'] → 文本配置列表)。
 * - 列表已有用户配置 → 跳过 (幂等)。
 * - 旧配置是「MiniMax + 空 key」或「完全空配置」→ 直接用内置, 不留用户配置。
 * - 否则迁移为一条可编辑「我的模型」配置并选中。
 * 完成后移除旧 key。
 */
export function migrateLegacyApiSettings(options = {}) {
  const storage = resolveStorage(options.storage)
  let legacy = null
  try {
    legacy = JSON.parse(storage.getItem(LEGACY_API_SETTINGS_KEY) || 'null')
  } catch {
    legacy = null
  }
  if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return
  if (readConfigs(storage).length > 0) return

  const providerId = TEXT_PROVIDER_TYPES.some((p) => p.id === legacy.provider)
    ? legacy.provider
    : 'custom'
  const apiKey = String(legacy.apiKey || '').trim()
  const model = String(legacy.model || '').trim()

  const fallbackToBuiltin = () => {
    saveSelectedTextProviderConfigId(BUILTIN_TEXT_CONFIG_ID, { storage })
    try {
      storage.removeItem(LEGACY_API_SETTINGS_KEY)
    } catch {
      /* ignore */
    }
  }

  // MiniMax 无自己的 key → 内置即等价物; 完全空配置 → 默认内置
  if ((providerId === 'MiniMax' && !apiKey) || (!apiKey && !model)) {
    fallbackToBuiltin()
    return
  }

  const draft = createTextProviderConfigDraft(providerId)
  const config = normalizeTextProviderConfig({
    id: 'migrated-user-config',
    name: '我的模型',
    providerId,
    baseUrl: String(legacy.baseUrl || '').trim() || draft.baseUrl,
    apiKey,
    model: model || draft.model
  })
  if (!config) return
  writeConfigs(storage, [config])
  saveSelectedTextProviderConfigId(config.id, { storage })
  try {
    storage.removeItem(LEGACY_API_SETTINGS_KEY)
  } catch {
    /* ignore */
  }
}

function readConfigs(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEYS.TEXT_MODEL_CONFIGS) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeConfigs(storage, configs) {
  storage.setItem(STORAGE_KEYS.TEXT_MODEL_CONFIGS, JSON.stringify(configs))
}

function resolveStorage(storage) {
  const resolved = storage || globalThis.localStorage
  if (!resolved?.getItem || !resolved?.setItem) throw new Error('当前环境不支持配置存储')
  return resolved
}

function createConfigId() {
  return `text_model_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
