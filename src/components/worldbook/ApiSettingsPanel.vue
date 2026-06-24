<template>
  <div class="api-settings-panel">
    <div class="api-section">
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
            autocomplete="off"
          />
          <button class="toggle-visibility" type="button" @click="showApiKey = !showApiKey">
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
        <label>模型 (例如 deepseek-chat)</label>
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
          type="button"
          @click="applyProvider(p.id)"
        >
          {{ p.name }}
        </button>
      </div>

      <div class="setting-info">
        <p>{{ currentProvider?.description || '建议：DeepSeek 模型请确保 Base URL 以 /v1 结尾' }}</p>
      </div>

      <div v-if="testResult" :class="['test-result', testResult.ok ? 'test-ok' : 'test-error']">
        {{ testResult.message }}
      </div>

      <div class="panel-actions">
        <button class="btn" type="button" @click="testConn" :disabled="testing || !apiSettings.baseUrl">
          {{ testing ? '测试中...' : '测试连接' }}
        </button>
        <button class="btn btn-primary" type="button" @click="handleSave">
          {{ saveFeedback ? '已保存' : '保存设置' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useApiSettings } from '@/composables/useApiSettings'

const {
  apiSettings,
  isLoading,
  detectedModels,
  testResult,
  testing,
  currentProvider,
  providers,
  loadSettings,
  saveToLocal,
  applyProvider,
  loadModels,
  testConn
} = useApiSettings()

const showApiKey = ref(false)
const isInitializing = ref(true)
const saveFeedback = ref(false)

onMounted(async () => {
  await loadSettings()
  if (apiSettings.value?.baseUrl && apiSettings.value?.apiKey) {
    loadModels()
  } else {
    const p = providers.find(item => item.id === apiSettings.value?.provider)
    if (p?.baseUrl) apiSettings.value.baseUrl = p.baseUrl
  }
  isInitializing.value = false
})

function onProviderChange() {
  if (isInitializing.value) return
  applyProvider(apiSettings.value.provider)
  if (apiSettings.value.provider === 'deepseek' && !apiSettings.value.model) {
    apiSettings.value.model = 'deepseek-chat'
  }
  loadModels()
}

async function onUrlChange() {
  if (apiSettings.value?.baseUrl && apiSettings.value?.apiKey) {
    loadModels()
  }
}

function handleSave() {
  saveToLocal()
  saveFeedback.value = true
  setTimeout(() => { saveFeedback.value = false }, 1800)
}
</script>

<style scoped>
.api-settings-panel {
  max-width: 520px;
}

.api-section {
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

.input:disabled {
  opacity: 0.5;
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

.loading-indicator {
  font-size: 11px;
  color: var(--accent);
  margin-top: 4px;
  display: block;
}

.setting-presets {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.presets-label {
  font-size: 11px;
  color: var(--text-muted);
  margin-right: 4px;
}

.preset-btn {
  font-size: 11px;
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
  color: var(--surface-raised);
}

.setting-info {
  padding: 12px;
  border-radius: 4px;
  background: var(--bg-tertiary);
  font-size: 13px;
  color: var(--text-secondary);
}

.setting-info p {
  margin: 0;
}

.test-result {
  padding: 10px;
  border-radius: 4px;
  font-size: 13px;
}

.test-ok {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--text-primary);
}

.test-error {
  background: color-mix(in srgb, var(--danger, #ef4444) 14%, transparent);
  color: var(--danger, #ef4444);
}

.panel-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 8px;
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
  color: color-mix(in srgb, var(--surface-raised) 100%, transparent);
}

.btn-primary:hover {
  filter: brightness(1.12);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
