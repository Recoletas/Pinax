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
        <button
          :class="['tab', { active: activeTab === 'memory' }]"
          @click="activeTab = 'memory'"
        >记忆系统</button>
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
                :disabled="isLoading"
                list="model-suggestions"
                placeholder="选择或手动输入模型名称..."
              />
              <datalist id="model-suggestions">
                <option v-for="m in detectedModels" :key="m" :value="m"></option>
              </datalist>
              <span v-if="isLoading" class="loading-indicator">获取模型中...</span>
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

        <!-- 记忆系统设置 -->
        <div v-if="activeTab === 'memory'" class="tab-panel">
          <div class="memory-status" :class="{ configured: mem0Configured }">
            <div class="status-icon">{{ mem0Configured ? '✓' : '!' }}</div>
            <div class="status-text">
              <strong>{{ mem0Configured ? '记忆系统已配置' : '记忆系统未配置' }}</strong>
              <p>{{ mem0Configured ? 'AI 会记住你的偏好和重要决策，提供更个性化的回复' : '配置 Mem0 API 后，AI 可以记住你的偏好和重要决策' }}</p>
            </div>
          </div>

          <div class="setting-item">
            <label>Mem0 API Key</label>
            <div class="api-key-input">
              <input
                :type="showMem0Key ? 'text' : 'password'"
                v-model="mem0Settings.apiKey"
                class="input"
                placeholder="m0-xxxxxxxxxxxxx"
              />
              <button class="toggle-visibility" @click="showMem0Key = !showMem0Key">
                {{ showMem0Key ? '隐藏' : '显示' }}
              </button>
            </div>
          </div>

          <div class="setting-item">
            <label>Mem0 Host (可选，默认使用官方 API)</label>
            <input
              v-model="mem0Settings.host"
              class="input"
              placeholder="https://api.mem0.ai"
            />
          </div>

          <div class="setting-info">
            <p>💡 <strong>获取 API Key：</strong>访问 <a href="https://mem0.ai" target="_blank">mem0.ai</a> 注册并创建 API Key</p>
            <p>📝 <strong>记忆系统作用：</strong></p>
            <ul>
              <li>记录你的写作风格偏好</li>
              <li>记住重要的创作决策</li>
              <li>让 AI 回复更贴合你的习惯</li>
            </ul>
          </div>

          <div v-if="memoryStats" class="memory-stats">
            <div class="stat-item">
              <span class="stat-label">已记录记忆</span>
              <span class="stat-value">{{ memoryStats.totalMemories || 0 }} 条</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">最后同步</span>
              <span class="stat-value">{{ memoryStats.lastSyncTime || '从未' }}</span>
            </div>
          </div>

          <div v-if="mem0TestResult" :class="['test-result', mem0TestResult.ok ? 'ok' : 'error']">
            {{ mem0TestResult.message }}
          </div>
        </div>
      </div>

      <div class="settings-actions">
        <button class="btn" @click="testConn" :disabled="testing || !apiSettings.baseUrl">
          {{ testing ? '测试中...' : '测试连接' }}
        </button>
        <button class="btn btn-primary" @click="saveAllAndClose">保存并关闭</button>
        <button class="btn" @click="$emit('close')">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted, computed } from 'vue'
import { useApiSettings } from '@/composables/useApiSettings'
import api from '@/services/api'

const emit = defineEmits(['close'])

const activeTab = ref('general')
const showApiKey = ref(false)
const showMem0Key = ref(false)
const isInitializing = ref(true)
const mem0TestResult = ref(null)

const {
  apiSettings,
  detectedModels,
  testResult,
  testing,
  currentProvider,
  providers,
  loadSettings,
  applyProvider,
  loadModels,
  testConn,
  saveAll
} = useApiSettings()

const settings = reactive({
  locale: 'zh-CN',
  textSpeed: 'normal',
  autoSave: true
})

const mem0Settings = reactive({
  apiKey: '',
  host: ''
})

const memoryStats = ref(null)

const mem0Configured = computed(() => Boolean(mem0Settings.apiKey))

onMounted(async () => {
  const saved = localStorage.getItem('gameSettings')
  if (saved) Object.assign(settings, JSON.parse(saved))
  await loadSettings()
  if (apiSettings.value?.baseUrl && apiSettings.value?.apiKey) {
    loadModels()
  } else {
    const p = providers.find(item => item.id === apiSettings.value?.provider)
    if (p?.baseUrl) apiSettings.value.baseUrl = p.baseUrl
  }

  // Load mem0 settings
  try {
    const secrets = await api.post('/chat/secrets/read').then(r => r.data)
    mem0Settings.apiKey = secrets.mem0_api_key || ''
    mem0Settings.host = secrets.mem0_host || ''
  } catch (e) {
    console.warn('Failed to load mem0 settings:', e)
  }

  // Load memory stats
  loadMemoryStats()

  isInitializing.value = false
})

watch(() => apiSettings.value?.provider, (newVal) => {
  if (isInitializing.value) return
  applyProvider(newVal)
  if (newVal === 'deepseek' && !apiSettings.value?.model) {
    apiSettings.value.model = 'deepseek-v4-flash'
  }
})

function onProviderChange() {
  const p = currentProvider.value
  if (p?.baseUrl) apiSettings.value.baseUrl = p.baseUrl
  loadModels()
}

async function onUrlChange() {
  if (apiSettings.value?.baseUrl && apiSettings.value?.apiKey) {
    loadModels()
  }
}

function loadMemoryStats() {
  try {
    const syncState = JSON.parse(localStorage.getItem('mem0_sync_state') || '{}')
    const cache = JSON.parse(localStorage.getItem('mem0_cache') || '{}')
    const totalMemories = Object.keys(cache).filter(k => !k.startsWith('search_')).length

    memoryStats.value = {
      totalMemories,
      lastSyncTime: syncState.lastSyncTime
        ? new Date(syncState.lastSyncTime).toLocaleString('zh-CN')
        : null
    }
  } catch (e) {
    memoryStats.value = null
  }
}

async function saveAllAndClose() {
  localStorage.setItem('gameSettings', JSON.stringify(settings))
  await saveAll()

  // Save mem0 settings
  try {
    if (mem0Settings.apiKey) {
      await api.post('/chat/secrets/write', { key: 'mem0_api_key', value: mem0Settings.apiKey })
    }
    if (mem0Settings.host) {
      await api.post('/chat/secrets/write', { key: 'mem0_host', value: mem0Settings.host })
    }
  } catch (e) {
    console.warn('Failed to save mem0 settings:', e)
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

.memory-status {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  margin-bottom: 16px;
}

.memory-status.configured {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.3);
}

.memory-status .status-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: bold;
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.memory-status.configured .status-icon {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.memory-status .status-text strong {
  display: block;
  font-size: 14px;
  margin-bottom: 4px;
}

.memory-status .status-text p {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.setting-info {
  padding: 12px;
  border-radius: 8px;
  background: var(--bg-tertiary);
  font-size: 13px;
}

.setting-info p {
  margin: 0 0 8px;
}

.setting-info ul {
  margin: 8px 0 0;
  padding-left: 20px;
}

.setting-info li {
  margin: 4px 0;
}

.setting-info a {
  color: var(--accent);
  text-decoration: none;
}

.setting-info a:hover {
  text-decoration: underline;
}

.memory-stats {
  display: flex;
  gap: 16px;
  margin-top: 16px;
  padding: 12px;
  border-radius: 8px;
  background: var(--bg-tertiary);
}

.memory-stats .stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.memory-stats .stat-label {
  font-size: 11px;
  color: var(--text-muted);
}

.memory-stats .stat-value {
  font-size: 14px;
  font-weight: 600;
}
</style>