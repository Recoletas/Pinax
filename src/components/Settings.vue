<template>
  <div class="settings-overlay" @click.self="$emit('close')">
    <div class="settings-modal">
      <div class="panel-header">
        <span>设置</span>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>

      <div class="settings-tabs">
        <button
          :class="['tab', { active: activeTab === 'general' }]"
          @click="activeTab = 'general'"
        >通用</button>
        <button
          :class="['tab', { active: activeTab === 'api' }]"
          @click="activeTab = 'api'"
        >AI API</button>
      </div>

      <div class="settings-content">
        <!-- General Settings -->
        <div v-if="activeTab === 'general'" class="tab-panel">
          <div class="setting-item">
            <label>语言</label>
            <select v-model="settings.locale" class="input">
              <option value="zh-CN">简体中文</option>
              <option value="en-US">English</option>
            </select>
          </div>
          <div class="setting-item">
            <label>文字速度</label>
            <select v-model="settings.textSpeed" class="input">
              <option value="fast">快速</option>
              <option value="normal">正常</option>
              <option value="slow">慢速</option>
            </select>
          </div>
          <div class="setting-item">
            <label>自动存档</label>
            <input type="checkbox" v-model="settings.autoSave" />
          </div>
        </div>

        <!-- API Settings -->
        <div v-if="activeTab === 'api'" class="tab-panel">
          <div class="setting-item">
            <label>API 提供商</label>
            <select v-model="apiSettings.provider" class="input" @change="onProviderChange">
              <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>

          <div class="setting-item">
            <label>API Key</label>
            <div class="api-key-input">
              <input
                :type="showApiKey ? 'text' : 'password'"
                v-model="apiSettings.apiKey"
                class="input"
                placeholder="输入 API Key..."
              />
              <button class="toggle-visibility" @click="showApiKey = !showApiKey">
                {{ showApiKey ? '隐藏' : '显示' }}
              </button>
            </div>
          </div>

          <div class="setting-item">
            <label>Base URL</label>
            <input
              v-model="apiSettings.baseUrl"
              class="input"
              placeholder="https://api.openai.com/v1"
              list="provider-urls"
              @blur="onUrlChange"
            />
            <datalist id="provider-urls">
              <option v-for="p in providers" :key="p.id" :value="p.baseUrl"></option>
            </datalist>
          </div>

          <div class="setting-item">
            <label>模型</label>
            <div class="model-select-wrapper">
              <select v-model="selectedModel" class="input" :disabled="loadingModels">
                <option value="">-- 选择模型 --</option>
                <option v-if="detectedModels.length === 0 && !loadingModels" value="__custom__">自定义...</option>
                <option v-for="m in detectedModels" :key="m" :value="m">{{ m }}</option>
              </select>
              <span v-if="loadingModels" class="loading-indicator">加载中...</span>
            </div>
            <input
              v-if="selectedModel === '__custom__'"
              v-model="apiSettings.model"
              class="input mt-2"
              placeholder="输入模型名称..."
            />
          </div>

          <div class="setting-presets">
            <span class="presets-label">快速选择：</span>
            <button
              v-for="p in providers.slice(0, 8)"
              :key="p.id"
              class="preset-btn"
              :class="{ active: apiSettings.provider === p.id }"
              @click="applyProvider(p.id)"
            >
              {{ p.name }}
            </button>
          </div>

          <div class="setting-presets mt-1">
            <button
              v-for="p in providers.slice(8)"
              :key="p.id"
              class="preset-btn"
              :class="{ active: apiSettings.provider === p.id }"
              @click="applyProvider(p.id)"
            >
              {{ p.name }}
            </button>
          </div>

          <div class="setting-info">
            <p>{{ currentProvider?.description || '选择一个提供商开始' }}</p>
            <p v-if="isCustomUrl" class="info-hint">
              检测到自定义 URL，将自动获取可用模型列表。
            </p>
          </div>

          <div v-if="testResult" :class="['test-result', testResult.ok ? 'ok' : 'error']">
            {{ testResult.message }}
          </div>
        </div>
      </div>

      <div class="settings-actions">
        <button class="btn" @click="testConnection" :disabled="testing || !apiSettings.baseUrl">
          {{ testing ? '测试中...' : '测试连接' }}
        </button>
        <button class="btn btn-primary" @click="saveSettings">保存</button>
        <button class="btn" @click="$emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'

const emit = defineEmits(['close'])

const activeTab = ref('general')
const showApiKey = ref(false)
const testing = ref(false)
const loadingModels = ref(false)
const testResult = ref(null)
const detectedModels = ref([])
const selectedModel = ref('')

const providers = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', modelsUrl: '/models' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', modelsUrl: '/models' },
  { id: 'claude', name: 'Claude', baseUrl: 'https://api.anthropic.com/v1', modelsUrl: '/models' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', modelsUrl: '/models' },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', modelsUrl: '/models' },
  { id: 'mistral', name: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1', modelsUrl: '/models' },
  { id: 'cohere', name: 'Cohere', baseUrl: 'https://api.cohere.ai/v1', modelsUrl: '/models' },
  { id: 'perplexity', name: 'Perplexity', baseUrl: 'https://api.perplexity.ai', modelsUrl: '/models' },
  { id: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434', modelsUrl: '/api/tags' },
  { id: 'lmstudio', name: 'LM Studio', baseUrl: 'http://localhost:1234/v1', modelsUrl: '/models' },
  { id: 'textgenwebui', name: 'Text Gen WebUI', baseUrl: 'http://localhost:5000', modelsUrl: '/v1/models' },
  { id: 'one-api', name: 'One API', baseUrl: '', modelsUrl: '/models' },
  { id: 'next-chat', name: 'NextChat', baseUrl: '', modelsUrl: '/models' },
  { id: 'custom', name: '自定义', baseUrl: '', modelsUrl: '/models' },
  { id: 'ai21', name: 'AI21', baseUrl: 'https://api.ai21.com/v1', modelsUrl: '/models' },
  { id: 'makersuite', name: 'Google AI', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', modelsUrl: '/models' },
  { id: 'vertexai', name: 'Vertex AI', baseUrl: 'https://dialogflow.googleapis.com/v3', modelsUrl: '/models' },
  { id: 'azure', name: 'Azure OpenAI', baseUrl: '', modelsUrl: '/openai/models' },
  { id: 'pollinations', name: 'Pollinations', baseUrl: 'https://gen.pollinations.ai', modelsUrl: '/models' },
  { id: 'moonshot', name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', modelsUrl: '/models' },
  { id: 'fireworks', name: 'Fireworks', baseUrl: 'https://api.fireworks.ai/inference/v1', modelsUrl: '/models' },
  { id: 'xai', name: 'xAI', baseUrl: 'https://api.x.ai/v1', modelsUrl: '/models' },
  { id: 'siliconflow', name: 'SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1', modelsUrl: '/models' },
]

const settings = reactive({
  locale: 'zh-CN',
  textSpeed: 'normal',
  autoSave: true
})

const apiSettings = reactive({
  provider: 'openai',
  apiKey: '',
  baseUrl: '',
  model: '',
  customModel: ''
})

const currentProvider = computed(() => {
  return providers.find(p => p.id === apiSettings.provider)
})

const isCustomUrl = computed(() => {
  const url = apiSettings.baseUrl
  if (!url) return false
  const knownUrls = providers.map(p => p.baseUrl).filter(Boolean)
  // Check if URL exactly matches a known URL or is a subpath of it
  return !knownUrls.some(known => url === known || url.startsWith(known + '/'))
})

onMounted(() => {
  const saved = localStorage.getItem('gameSettings')
  if (saved) {
    Object.assign(settings, JSON.parse(saved))
  }

  const savedApi = localStorage.getItem('apiSettings')
  if (savedApi) {
    Object.assign(apiSettings, JSON.parse(savedApi))
    if (apiSettings.baseUrl) {
      loadModelsFromUrl()
    }
  } else {
    onProviderChange()
  }
})

watch(() => apiSettings.provider, () => {
  selectedModel.value = ''
  apiSettings.model = ''
  if (apiSettings.baseUrl) {
    loadModelsFromUrl()
  } else {
    detectedModels.value = []
  }
})

function onProviderChange() {
  const provider = currentProvider.value
  if (provider && provider.baseUrl) {
    apiSettings.baseUrl = provider.baseUrl
  }
  apiSettings.model = ''
  apiSettings.customModel = ''
  detectedModels.value = []
  loadModelsFromUrl()
}

function applyProvider(id) {
  apiSettings.provider = id
  onProviderChange()
  loadModelsFromUrl()
}

async function onUrlChange() {
  if (isCustomUrl.value && apiSettings.baseUrl) {
    await loadModelsFromUrl()
  }
}

async function loadModelsFromUrl() {
  if (!apiSettings.baseUrl) return

  loadingModels.value = true
  detectedModels.value = []

  try {
    const response = await fetch('/api/chat/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: apiSettings.baseUrl,
        apiKey: apiSettings.apiKey,
        provider: apiSettings.provider
      })
    })

    if (response.ok) {
      const data = await response.json()
      if (data.models && Array.isArray(data.models)) {
        detectedModels.value = data.models
        // Auto-select first model if none selected AND no saved model to restore
        if (!apiSettings.model && !selectedModel.value && detectedModels.value.length > 0) {
          selectedModel.value = detectedModels.value[0]
        }
        // Restore saved model if it exists in the list
        if (apiSettings.model && detectedModels.value.includes(apiSettings.model)) {
          selectedModel.value = apiSettings.model
        }
      }
    }
  } catch (e) {
    console.error('Failed to load models:', e)
  } finally {
    loadingModels.value = false
  }
}

async function testConnection() {
  testing.value = true
  testResult.value = null

  try {
    const response = await fetch('/api/chat/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: apiSettings.baseUrl,
        apiKey: apiSettings.apiKey,
        provider: apiSettings.provider
      })
    })
    const data = await response.json()
    testResult.value = {
      ok: data.ok,
      message: data.message || (data.ok ? '连接成功' : '连接失败')
    }
  } catch (e) {
    testResult.value = {
      ok: false,
      message: '连接超时或地址无效'
    }
  } finally {
    testing.value = false
  }
}

function saveSettings() {
  localStorage.setItem('gameSettings', JSON.stringify(settings))
  // Use selectedModel for normal selection, or apiSettings.model for custom input
  const finalModel = selectedModel.value === '__custom__' ? apiSettings.model : selectedModel.value
  const finalSettings = {
    ...apiSettings,
    model: finalModel
  }
  localStorage.setItem('apiSettings', JSON.stringify(finalSettings))
  emit('close')
}
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.settings-modal {
  width: 520px;
  max-width: 90%;
  max-height: 90vh;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-bottom: 1px solid var(--border);
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.2rem;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.settings-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
}

.tab {
  flex: 1;
  padding: 0.75rem;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab:hover {
  color: var(--text-secondary);
}

.tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.settings-content {
  flex: 1;
  padding: 1rem;
  overflow-y: auto;
}

.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.setting-item label {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.input {
  padding: 0.5rem 0.75rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.85rem;
}

.input:focus {
  outline: none;
  border-color: var(--accent);
}

.input::placeholder {
  color: var(--text-muted);
}

select.input {
  cursor: pointer;
}

select.input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.mt-1 { margin-top: 0.5rem; }
.mt-2 { margin-top: 0.75rem; }

.api-key-input {
  display: flex;
  gap: 0.5rem;
}

.api-key-input .input {
  flex: 1;
}

.toggle-visibility {
  padding: 0.5rem 0.75rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.toggle-visibility:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.model-select-wrapper {
  position: relative;
}

.model-select-wrapper .input {
  width: 100%;
}

.loading-indicator {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.75rem;
  color: var(--accent);
}

.setting-presets {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
}

.presets-label {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.preset-btn {
  padding: 0.25rem 0.5rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 0.7rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.preset-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.preset-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.setting-info {
  padding: 0.75rem;
  background: var(--bg-primary);
  border-radius: 6px;
}

.setting-info p {
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.info-hint {
  margin-top: 0.5rem;
  font-style: italic;
}

.test-result {
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  font-size: 0.8rem;
  text-align: center;
}

.test-result.ok {
  background: rgba(34, 197, 94, 0.15);
  color: var(--success);
}

.test-result.error {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.settings-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  padding: 1rem;
  border-top: 1px solid var(--border);
}

.btn {
  padding: 0.5rem 1rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn:hover:not(:disabled) {
  border-color: var(--text-muted);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
}
</style>