import { ref, computed } from 'vue'
import { getResolvedApiSettings, testApiConnection, fetchAvailableModels } from '@/services/api'
import { MINIMAX_SERVER_KEY_SENTINEL } from '../../shared/textModelKeys'
import {
  createTextProviderConfigDraft,
  resolveSelectedTextProviderConfig,
  saveSelectedTextProviderConfigId,
  saveTextProviderConfig
} from '@/services/textProviderConfigStore'

const providers = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { id: 'siliconflow', name: 'SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'ollama', name: 'Ollama (本地)', baseUrl: 'http://localhost:11434' },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'moonshot', name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1' },
  { id: 'MiniMax', name: 'MiniMax (Anthropic 兼容)', baseUrl: 'https://api.minimaxi.com/anthropic' },
  { id: 'custom', name: '自定义', baseUrl: '' }
]

const DEFAULT_API_SETTINGS = {
  // Phase D: 默认 MiniMax (Anthropic 兼容) — 用户开箱即用, 切其他模型仍自由
  provider: 'MiniMax',
  baseUrl: 'https://api.minimaxi.com/anthropic',
  apiKey: '',
  model: ''
}

// 哨兵不是用户真实 key — 不落盘、不触发「已配置」tip
function isClientKey(key) {
  const value = String(key || '').trim()
  return Boolean(value) && value !== MINIMAX_SERVER_KEY_SENTINEL
}

export function useApiSettings() {
  const apiSettings = ref({ ...DEFAULT_API_SETTINGS })
  const isLoading = ref(false)
  const detectedModels = ref([])
  const testResult = ref(null)
  const testing = ref(false)

  const currentProvider = computed(() => {
    return providers.find(p => p.id === apiSettings.value?.provider)
  })

  async function loadSettings() {
    isLoading.value = true
    try {
      const resolved = await getResolvedApiSettings()
      apiSettings.value = {
        ...DEFAULT_API_SETTINGS,
        ...(resolved || {})
      }
    } catch (e) {
      console.warn('[useApiSettings] loadSettings failed:', e)
      apiSettings.value = {
        ...DEFAULT_API_SETTINGS,
        ...(apiSettings.value || {})
      }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 持久化到新的文本配置 store (配置列表 + 新增模式)。
   * 不再写旧的单一对象 'apiSettings' key。内置被「原样保存」时保持内置选中。
   */
  function saveToLocal() {
    const value = apiSettings.value
    if (!value) return
    const current = resolveSelectedTextProviderConfig()
    const apiKey = isClientKey(value.apiKey) ? value.apiKey : ''

    // 选中用户配置 → 更新它
    if (current?.id && !current.builtin) {
      saveTextProviderConfig({
        ...current,
        providerId: value.provider,
        baseUrl: value.baseUrl,
        apiKey,
        model: value.model
      })
      return
    }

    // 内置被选中: 未实际改动 → 保持内置; 有改动 → 落成一条新用户配置并选中
    if (current?.builtin) {
      const unchanged =
        value.provider === current.providerId &&
        (!value.baseUrl || value.baseUrl === current.baseUrl) &&
        (!value.model || value.model === current.model) &&
        !apiKey
      if (unchanged) {
        saveSelectedTextProviderConfigId(current.id)
        return
      }
    }

    const draft = createTextProviderConfigDraft(value.provider)
    const config = saveTextProviderConfig({
      ...draft,
      name: value.provider === 'MiniMax' ? 'MiniMax (我的)' : '我的模型',
      providerId: value.provider,
      baseUrl: value.baseUrl || draft.baseUrl,
      apiKey,
      model: value.model || draft.model
    })
    saveSelectedTextProviderConfigId(config.id)
  }

  function saveAll() {
    // Settings 只存在用户浏览器 localStorage, 无后端持久化。
    saveToLocal()
    window.dispatchEvent(new CustomEvent('pinax:api-settings-updated', {
      detail: { settings: apiSettings.value }
    }))
    // Phase C2: 配置完成后弹 "去导入体验" tip (仅真实客户端 key 时弹)
    if (isClientKey(apiSettings.value?.apiKey)) {
      window.dispatchEvent(new CustomEvent('pinax:show-tip', {
        detail: {
          id: 'settings-to-import',
          title: '配置完成',
          body: '现在去素材库点 导入, 选一个世界书, 体验开场。',
          cta: {
            label: '去打素材',
            action: ({ router }) => router.push('/materials')
          },
          variant: 'success',
          autoHide: false,
          category: 'nav'
        }
      }))
    }
  }

  function applyProvider(providerId) {
    const p = providers.find(item => item.id === providerId)
    if (p && p.baseUrl) {
      apiSettings.value.baseUrl = p.baseUrl
    }
    if (providerId === 'deepseek' && !apiSettings.value.model) {
      apiSettings.value.model = 'deepseek-v4-flash'
    }
    // Phase D: 选 MiniMax 时自动填默认文本模型 (若 model 空)
    if (providerId === 'MiniMax' && !apiSettings.value.model) {
      apiSettings.value.model = 'MiniMax-Text-01'
    }
  }

  async function loadModels() {
    if (!apiSettings.value?.baseUrl || !apiSettings.value?.apiKey) return
    try {
      const models = await fetchAvailableModels(apiSettings.value)
      detectedModels.value = models
      if (!apiSettings.value.model && models.length > 0) {
        apiSettings.value.model = models[0]
      }
    } catch (e) {
      console.warn('[useApiSettings] loadModels failed:', e)
    }
  }

  async function testConn() {
    if (!apiSettings.value?.model) {
      testResult.value = { ok: false, message: '请先输入模型名称' }
      return
    }
    testing.value = true
    testResult.value = null
    try {
      testResult.value = await testApiConnection(apiSettings.value)
    } catch (e) {
      testResult.value = { ok: false, message: '网络异常或配置错误' }
    } finally {
      testing.value = false
    }
  }

  function maskKey(key) {
    if (!key || key.length < 6) return '***'
    return `${key.slice(0, 3)}***${key.slice(-3)}`
  }

  return {
    apiSettings,
    isLoading,
    detectedModels,
    testResult,
    testing,
    currentProvider,
    providers,
    loadSettings,
    saveToLocal,
    saveAll,
    applyProvider,
    loadModels,
    testConn,
    maskKey
  }
}
