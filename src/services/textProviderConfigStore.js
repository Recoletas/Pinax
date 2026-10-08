/**
 * 文本模型配置 store — 与 image/video 的「配置列表 + 新增」模式对齐。
 *
 * 存储形态 (2026-10-08 直连退役后):
 * - 一条「服务器模型」行由 createServerModelConfig() 计算得出, 永不落盘, 始终排第一且只读;
 *   它代表 pi-agent 内核当前持有的模型（所有链路共用的唯一模型）, 浏览器不接触密钥。
 * - 用户自定义配置存于 STORAGE_KEYS.TEXT_MODEL_CONFIGS; 选中 id 存于 TEXT_MODEL_SELECTED。
 *   选中用户配置即把它热切到内核（经 /api/storyagent/model, 见 ApiSettingsPanel）。
 * - 首次读取时把旧的单一对象 localStorage['apiSettings'] 迁移为一条可编辑用户配置
 *   (一次性、幂等), 之后旧 key 被移除; 无自带 key 的旧配置直接落回服务器模型行。
 *
 * getResolvedApiSettings() 经 toResolvedTextApiSettings() 拿到 { provider, baseUrl, apiKey, model, format }
 * 形状；服务器模型行以合同占位值满足消费方的非空校验（服务端不读取这些字段）。
 */
import { STORAGE_KEYS } from '../composables/useStorage'

export const BUILTIN_TEXT_CONFIG_ID = 'text-server-model'

// 文本 provider 的唯一前端目录；设置 UI 与生成调用都消费这里，避免多处漂移。
export const TEXT_PROVIDER_TYPES = Object.freeze([
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-v4-flash' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: '' },
  { id: 'siliconflow', name: 'SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1', defaultModel: '' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: '' },
  { id: 'ollama', name: 'Ollama (本地)', baseUrl: 'http://localhost:11434', defaultModel: '' },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: '' },
  { id: 'moonshot', name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', defaultModel: '' },
  { id: 'custom', name: '自定义', baseUrl: '', defaultModel: '' }
])

const LEGACY_API_SETTINGS_KEY = 'apiSettings'

// 服务器（pi-agent 内核）实时模型：仅内存态，绝不落盘/进浏览器缓存。
// 由设置面板从 /api/storyagent/model 读取后写入，用于让内置行显示真正的生效模型。
let serverTextModelOverride = null

export function setServerTextModel(model) {
  serverTextModelOverride = model && String(model.model || '').trim()
    ? {
        provider: String(model.provider || '').trim(),
        model: String(model.model || '').trim(),
        baseUrl: String(model.baseUrl || '').trim()
      }
    : null
  return serverTextModelOverride
}

export function getServerTextModel() {
  return serverTextModelOverride
}

/** 服务器模型行的合同占位：消费方的本地校验要求 provider 字段非空。
 *  直连退役后服务端不再读取这些字段（内容一律由 pi-agent 内核生成），填什么都不会被使用。 */
const SERVER_MODEL_PLACEHOLDER = Object.freeze({
  provider: 'kernel',
  baseUrl: 'https://kernel.invalid/v1',
  apiKey: 'kernel-managed',
  model: 'kernel'
})

export function createServerModelConfig() {
  const server = serverTextModelOverride
  return Object.freeze({
    id: BUILTIN_TEXT_CONFIG_ID,
    name: '服务器模型',
    providerId: server?.provider || '',
    baseUrl: server?.baseUrl || '',
    apiKey: '',
    model: server?.model || '',
    builtin: true,
    serverKey: true,
    description: '由 pi-agent 内核持有，所有链路共用'
  })
}

export function createTextProviderConfigDraft(providerId = 'custom') {
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
 * 列表 = [服务器模型, ...用户配置]。服务器模型行不落盘, 由 createServerModelConfig 计算。
 */
export function listTextProviderConfigs(options = {}) {
  const storage = resolveStorage(options.storage)
  migrateLegacyApiSettings({ storage })
  const userConfigs = readConfigs(storage).map(normalizeTextProviderConfig).filter(Boolean)
  return [createServerModelConfig(), ...userConfigs]
}

export function saveTextProviderConfig(input = {}, options = {}) {
  const storage = resolveStorage(options.storage)
  if (input?.builtin || input?.id === BUILTIN_TEXT_CONFIG_ID) {
    throw new Error('服务器模型行不可编辑')
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
    throw new Error('服务器模型行不可删除')
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
 * 解析当前生效的文本配置: 有选中且存在 → 选中项; 否则回退服务器模型行。
 */
export function resolveSelectedTextProviderConfig(options = {}) {
  const storage = resolveStorage(options.storage)
  migrateLegacyApiSettings({ storage })
  const all = listTextProviderConfigs({ storage })
  const selectedId = getSelectedTextProviderConfigId({ storage })
  return all.find((c) => c.id === selectedId) || createServerModelConfig()
}

/**
 * 单一映射点: 配置对象 → { provider, baseUrl, apiKey, model, format } 设置对象。
 * 服务器模型行返回合同占位值（真实模型经 /api/storyagent/model 由内核持有）。
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
  if (config.builtin === true) {
    const server = getServerTextModel()
    return {
      provider: server?.provider || SERVER_MODEL_PLACEHOLDER.provider,
      baseUrl: server?.baseUrl || SERVER_MODEL_PLACEHOLDER.baseUrl,
      apiKey: SERVER_MODEL_PLACEHOLDER.apiKey,
      model: server?.model || SERVER_MODEL_PLACEHOLDER.model,
      format: null,
      builtin: true,
      serverKey: true,
      configId: config.id || null
    }
  }
  const clientKey = String(config.apiKey || '').trim()
  return {
    provider: config.providerId || null,
    baseUrl: config.baseUrl || null,
    apiKey: clientKey || null,
    model: config.model || null,
    format: null,
    builtin: false,
    serverKey: false,
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

  // 无自带 key 的旧配置（含旧 MiniMax 内置默认）→ 服务器模型行；直连退役后无 key 配置不再有独立通路。
  if (!apiKey) {
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
