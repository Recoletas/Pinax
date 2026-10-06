<template>
  <div class="api-settings-panel">
    <div class="ai-settings-head">
      <strong>{{ tr('AI 文本模型') }}</strong>
      <p>{{ tr('内置 MiniMax 由部署服务器提供密钥，无需作者填写；首次使用前可打开详情测试连通性。也可添加自己的模型配置。') }}</p>
    </div>

    <TextModelPicker
      :model-value="selectedId"
      :configs="configs"
      @update:model-value="handleSelect"
      @configs-updated="handleConfigsUpdated"
    />

    <p v-if="currentNote" class="ai-settings-note" role="status">{{ currentNote }}</p>
    <p class="ai-settings-note" role="status">{{ tr('上方为遗留链路（讨论故事 / 设定生成 / 审校）；服务器密钥配置已自动经 kit 漏斗与 Agent 引擎同源。') }}</p>

    <div class="agent-engine" data-test="agent-engine">
      <div class="agent-engine__head">
        <strong>{{ tr('Agent 引擎（kit 任务面）') }}</strong>
        <span v-if="engineState === 'up'" class="agent-engine__model" data-test="agent-engine-model">{{ engineModel }}</span>
        <span v-else-if="engineState === 'down'" class="agent-engine__down">{{ tr('未运行——启动 kit 任务面（serve:pinax）后可用') }}</span>
        <span v-else>{{ tr('检测中…') }}</span>
      </div>

      <template v-if="engineState === 'up'">
        <label class="agent-engine__field">
          <span>{{ tr('切换模型') }}</span>
          <select v-model="preset" data-test="agent-engine-preset" @change="applyPreset">
            <option v-for="option in presetOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            <option value="custom">{{ tr('自定义…') }}</option>
          </select>
        </label>
        <div v-if="preset === 'custom'" class="agent-engine__custom">
          <input v-model.trim="custom.provider" type="text" :placeholder="tr('provider（如 dots / openai）')" spellcheck="false">
          <input v-model.trim="custom.model" type="text" :placeholder="tr('model 名称')" spellcheck="false">
          <input v-model.trim="custom.baseUrl" type="text" :placeholder="tr('Base URL（OpenAI 兼容端点）')" spellcheck="false">
          <input v-model.trim="custom.apiKey" type="password" :placeholder="tr('API Key（留空沿用现有）')" autocomplete="off">
        </div>
        <button class="agent-engine__apply" type="button" data-test="agent-engine-apply" :disabled="!canApply || applying" @click="applyModel">
          {{ applying ? tr('切换中…') : tr('切换并热生效') }}
        </button>
        <p v-if="engineMessage" role="status" data-test="agent-engine-message">{{ engineMessage }}</p>
      </template>
    </div>
  </div>
</template>

<script setup>
import { tr } from '../../i18n/index.js'
import { computed, onMounted, ref } from 'vue'
import TextModelPicker from '../text/TextModelPicker.vue'
import {
  getSelectedTextProviderConfigId,
  listTextProviderConfigs,
  resolveSelectedTextProviderConfig,
  saveSelectedTextProviderConfigId
} from '../../services/textProviderConfigStore'

const selectedId = ref('')
const configs = ref([])
const engineState = ref('loading')
const engineModel = ref('')
const engineBaseUrl = ref('')
const preset = ref('keep')
const custom = ref({ provider: '', model: '', baseUrl: '', apiKey: '' })
const applying = ref(false)
const engineMessage = ref('')

const PRESETS = [
  { value: 'dots|dots3-note-prev', label: 'dots · dots3-note-prev', provider: 'dots', model: 'dots3-note-prev' },
  { value: 'zai|glm-5.3-flash', label: 'zai · glm-5.3-flash', provider: 'zai', model: 'glm-5.3-flash' },
  { value: 'minimax|MiniMax-Text-01', label: 'minimax · MiniMax-Text-01', provider: 'minimax', model: 'MiniMax-Text-01' }
]
const presetOptions = PRESETS

const currentNote = computed(() => {
  const resolved = configs.value.find((config) => config.id === selectedId.value)
    || resolveSelectedTextProviderConfig()
  if (resolved?.builtin) {
    return tr('当前使用内置 MiniMax：能否生成取决于部署服务器状态，可在模型详情中测试。')
  }
  return tr('当前使用「{name}」，模型 {model}。', { name: resolved?.name || tr('自定义配置'), model: resolved?.model || '—' })
})

const canApply = computed(() => {
  if (preset.value === 'keep') return false
  if (preset.value === 'custom') return Boolean(custom.value.provider && custom.value.model && custom.value.baseUrl)
  return true
})

function currentPresetValue() {
  const match = PRESETS.find((option) => option.model === engineModel.value.split('.').slice(1).join('.'))
  return match ? match.value : 'custom'
}

async function refreshEngine() {
  try {
    const response = await fetch('/api/storyagent/model')
    const body = await response.json().catch(() => null)
    if (response.ok && body?.ok) {
      engineState.value = 'up'
      engineModel.value = `${body.provider}.${body.model}`
      engineBaseUrl.value = body.baseUrl || ''
      preset.value = currentPresetValue()
      if (preset.value === 'custom') {
        custom.value.provider = body.provider
        custom.value.model = body.model
        custom.value.baseUrl = body.baseUrl || ''
      }
    } else {
      engineState.value = 'down'
    }
  } catch {
    engineState.value = 'down'
  }
}

async function applyModel() {
  if (applying.value || !canApply.value) return
  applying.value = true
  engineMessage.value = ''
  try {
    const patch = preset.value === 'custom'
      ? { provider: custom.value.provider, model: custom.value.model, baseUrl: custom.value.baseUrl, ...(custom.value.apiKey ? { apiKey: custom.value.apiKey } : {}) }
      : { ...PRESETS.find((option) => option.value === preset.value) }
    delete patch.value
    delete patch.label
    const response = await fetch('/api/storyagent/model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    })
    const body = await response.json().catch(() => null)
    if (response.ok && body?.ok) {
      engineMessage.value = tr('已热生效：{model}', { model: body.model })
      await refreshEngine()
    } else {
      engineMessage.value = body?.message || tr('切换失败，请检查 kit 任务面状态。')
    }
  } catch (error) {
    engineMessage.value = error?.message || tr('切换失败，请检查 kit 任务面状态。')
  } finally {
    applying.value = false
  }
}

onMounted(() => {
  configs.value = listTextProviderConfigs()
  const resolved = resolveSelectedTextProviderConfig()
  selectedId.value = resolved.id
  // 选中失效时收敛回内置, 保持 store 干净
  if (getSelectedTextProviderConfigId() !== resolved.id) {
    saveSelectedTextProviderConfigId(resolved.id)
  }
  void refreshEngine()
})

function handleSelect(id) {
  selectedId.value = id
  saveSelectedTextProviderConfigId(id)
}

function handleConfigsUpdated(next) {
  configs.value = next
  const resolved = resolveSelectedTextProviderConfig()
  selectedId.value = resolved.id
}
</script>

<style scoped>
.api-settings-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  font: 14px/1.6 var(--font-sans);
}

.ai-settings-head {
  display: grid;
  gap: 4px;
}

.ai-settings-head strong {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.ai-settings-head p {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-secondary);
}

.ai-settings-note {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}
.api-settings-panel :deep(.text-model-picker__trigger) {
  min-height: 60px;
  padding: 10px 14px;
  border: 1px solid var(--hairline-soft, var(--border));
  border-radius: var(--radius-control);
  background: var(--surface-workbench-input, var(--bg-secondary));
}
.api-settings-panel :deep(.text-model-picker__trigger small) { font-size: 12px; }
.api-settings-panel :deep(.text-model-picker__trigger strong) { font-size: 14px; font-weight: 500; }

.agent-engine {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--hairline-soft, var(--border));
  border-radius: var(--radius-control);
  background: var(--surface-workbench-input, var(--bg-secondary));
}

.agent-engine__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 13px;
}

.agent-engine__head strong {
  font-weight: 600;
  color: var(--text-primary);
}

.agent-engine__model {
  font: 12px/1.4 var(--font-mono, var(--font-sans));
  color: var(--accent);
}

.agent-engine__down { color: var(--text-muted, var(--text-secondary)); }

.agent-engine__field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}

.agent-engine__field select,
.agent-engine__custom input {
  box-sizing: border-box;
  min-height: 38px;
  border: 1px solid var(--hairline-soft, var(--border));
  border-radius: var(--radius-control);
  padding: 8px 12px;
  color: var(--text-primary);
  background: var(--bg-primary);
  font: inherit;
}

.agent-engine__custom {
  display: grid;
  gap: 8px;
}

.agent-engine__apply {
  justify-self: start;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--archive-olive, var(--accent));
  border-radius: var(--radius-control);
  background: var(--archive-olive, var(--accent));
  color: var(--archive-paper-soft, var(--bg-primary));
  font: inherit;
  cursor: pointer;
}

.agent-engine__apply:disabled { opacity: 0.45; cursor: default; }
</style>
