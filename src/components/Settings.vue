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
        <!-- 通用设置 -->
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

        <!-- API 设置 -->
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
            <label>Base URL (例如 https://api.deepseek.com/v1)</label>
            <input
              v-model="apiSettings.baseUrl"
              class="input"
              placeholder="请包含 /v1 路径"
              list="provider-urls"
              @blur="onUrlChange"
            />
            <datalist id="provider-urls">
              <option v-for="p in providers" :key="p.id" :value="p.baseUrl" />
            </datalist>
          </div>

          <div class="setting-item">
            <label>模型 (例如 deepseek-v4-flash)</label>
            <div class="model-select-wrapper">
              <input
                v-model="apiSettings.model"
                class="input"
                :disabled="loadingModels"
                list="model-suggestions"
                placeholder="选择或手动输入模型名称..."
              />
              <datalist id="model-suggestions">
                <option v-for="m in detectedModels" :key="m" :value="m"></option>
              </datalist>
              <span v-if="loadingModels" class="loading-indicator">获取模型中...</span>
            </div>
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

          <div class="setting-info">
            <p>{{ currentProvider?.description || '建议：DeepSeek 模型请确保 Base URL 以 /v1 结尾' }}</p>
          </div>

          <div v-if="testResult" :class="['test-result', testResult.ok ? 'ok' : 'error']">
            {{ testResult.message }}
          </div>
        </div>
      </div>

      <div class="settings-actions">
        <button class="btn" @click="testConn" :disabled="testing || !apiSettings.baseUrl">
          {{ testing ? '测试中...' : '测试连接' }}
        </button>
        <button class="btn btn-primary" @click="saveAll">保存并关闭</button>
        <button class="btn" @click="$emit('close')">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { testApiConnection, fetchAvailableModels, saveApiSettings } from '@/services/api.js' // 确保路径正确

const emit = defineEmits(['close'])

const activeTab = ref('general')
const showApiKey = ref(false)
const testing = ref(false)
const loadingModels = ref(false)
const testResult = ref(null)
const detectedModels = ref([])
const isInitializing = ref(true)

const providers = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { id: 'siliconflow', name: 'SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'ollama', name: 'Ollama (本地)', baseUrl: 'http://localhost:11434' },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'moonshot', name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1' },
  { id: 'custom', name: '自定义', baseUrl: '' },
]

const settings = reactive({
  locale: 'zh-CN',
  textSpeed: 'normal',
  autoSave: true
})

const apiSettings = reactive({
  provider: 'deepseek',
  apiKey: '',
  baseUrl: '',
  model: ''
})

const currentProvider = computed(() => {
  return providers.find(p => p.id === apiSettings.provider)
})

onMounted(async () => {
  // 加载通用设置
  const saved = localStorage.getItem('gameSettings')
  if (saved) Object.assign(settings, JSON.parse(saved))

  // 加载 API 设置
  const savedApi = localStorage.getItem('apiSettings')
  if (savedApi) {
    Object.assign(apiSettings, JSON.parse(savedApi))
    if (apiSettings.baseUrl && apiSettings.apiKey) {
      loadModels()
    }
  } else {
    onProviderChange()
  }

  isInitializing.value = false
})

// 监听供应商变化
watch(() => apiSettings.provider, (newVal) => {
  if (isInitializing.value) return
  const p = providers.find(item => item.id === newVal)
  if (p && p.baseUrl) {
    apiSettings.baseUrl = p.baseUrl
  }
  // 如果是 DeepSeek，默认给个提示模型名
  if (newVal === 'deepseek') apiSettings.model = 'deepseek-v4-flash'
})

function onProviderChange() {
  const p = currentProvider.value
  if (p && p.baseUrl) apiSettings.baseUrl = p.baseUrl
  loadModels()
}

function applyProvider(id) {
  apiSettings.provider = id
}

async function onUrlChange() {
  if (apiSettings.baseUrl && apiSettings.apiKey) {
    await loadModels()
  }
}

async function loadModels() {
  if (!apiSettings.baseUrl || !apiSettings.apiKey) return
  loadingModels.value = true
  try {
    const models = await fetchAvailableModels(apiSettings)
    detectedModels.value = models
    // 如果当前没选模型，自动选第一个
    if (!apiSettings.model && models.length > 0) {
      apiSettings.model = models[0]
    }
  } finally {
    loadingModels.value = false
  }
}

async function testConn() {
  if (!apiSettings.model) {
    testResult.value = { ok: false, message: '请先输入模型名称，例如 deepseek-v4-flash' }
    return
  }

  testing.value = true
  testResult.value = null

  try {
    const result = await testApiConnection(apiSettings)
    testResult.value = result
  } catch (e) {
    testResult.value = { ok: false, message: '网络异常或配置错误' }
  } finally {
    testing.value = false
  }
}

async function saveAll() {
  localStorage.setItem('gameSettings', JSON.stringify(settings))
  localStorage.setItem('apiSettings', JSON.stringify(apiSettings))
  
  // 如果后端需要保存 secrets
  try {
    await saveApiSettings(apiSettings)
  } catch (e) {
    console.warn('后端存储失败，已保存至本地缓存')
  }
  
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
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.settings-modal {
  width: 500px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
}

.panel-header {
  padding: 15px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
  font-weight: 600;
}

.settings-tabs {
  display: flex;
  background: var(--bg-tertiary);
}

.tab {
  flex: 1;
  padding: 10px;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.15s;
}

.tab:hover {
  color: var(--text-secondary);
}

.tab.active {
  color: var(--accent);
  border-bottom: 2px solid var(--accent);
}

.settings-content {
  padding: 20px;
  max-height: 60vh;
  overflow-y: auto;
}

.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-item label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.input {
  padding: 8px 10px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: 4px;
  font-size: 13px;
  transition: border-color 0.15s;
}

.input:focus {
  outline: none;
  border-color: var(--accent);
}

.input::placeholder {
  color: var(--text-muted);
}

.btn {
  padding: 8px 16px;
  cursor: pointer;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 13px;
  transition: all 0.15s;
}

.btn:hover {
  background: var(--bg-hover);
}

.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.btn-primary:hover {
  background: var(--accent-hover);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.test-result {
  margin-top: 10px;
  padding: 10px;
  border-radius: 4px;
  font-size: 13px;
}

.test-result.ok {
  background: var(--accent-light);
  color: var(--success);
}

.test-result.error {
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
}

.api-key-input {
  display: flex;
  gap: 8px;
}

.api-key-input .input {
  flex: 1;
}

.toggle-visibility {
  padding: 0 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.toggle-visibility:hover {
  background: var(--bg-hover);
}

.model-select-wrapper {
  position: relative;
}

.preset-btn {
  font-size: 11px;
  margin: 2px;
  padding: 4px 8px;
  cursor: pointer;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 4px;
  transition: all 0.15s;
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

.loading-indicator {
  font-size: 11px;
  color: var(--accent);
  margin-top: 4px;
}

.settings-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 15px;
  border-top: 1px solid var(--border);
}
</style>