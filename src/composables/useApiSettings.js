import { ref, computed } from 'vue'
import { getResolvedApiSettings, testApiConnection, fetchAvailableModels, saveApiSettings } from '@/services/api'

const SETTINGS_KEY = 'apiSettings'

const providers = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { id: 'siliconflow', name: 'SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'ollama', name: 'Ollama (本地)', baseUrl: 'http://localhost:11434' },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'moonshot', name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1' },
  { id: 'custom', name: '自定义', baseUrl: '' }
]

const DEFAULT_API_SETTINGS = {
  provider: 'deepseek',
  baseUrl: '',
  apiKey: '',
  model: ''
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

  async function reloadFromBackend() {
    try {
      const remote = await getResolvedApiSettings()
      apiSettings.value = { ...apiSettings.value, ...remote }
    } catch (e) {
      console.warn('[useApiSettings] reloadFromBackend failed:', e)
    }
  }

  function saveToLocal() {
    if (apiSettings.value) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(apiSettings.value))
    }
  }

  async function saveToBackend() {
    try {
      await saveApiSettings(apiSettings.value)
    } catch (e) {
      console.warn('[useApiSettings] saveToBackend failed:', e)
    }
  }

  async function saveAll() {
    saveToLocal()
    await saveToBackend()
  }

  function applyProvider(providerId) {
    const p = providers.find(item => item.id === providerId)
    if (p && p.baseUrl) {
      apiSettings.value.baseUrl = p.baseUrl
    }
    if (providerId === 'deepseek' && !apiSettings.value.model) {
      apiSettings.value.model = 'deepseek-v4-flash'
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
    reloadFromBackend,
    saveToLocal,
    saveToBackend,
    saveAll,
    applyProvider,
    loadModels,
    testConn,
    maskKey
  }
}