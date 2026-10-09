<template>
  <div class="api-settings-panel">
    <div class="ai-settings-head">
      <strong>{{ tr('AI 文本模型') }}</strong>
      <p>{{ tr(readOnly ? '当前使用服务器提供的文本模型。' : '写作、助手、校对和设定生成共用当前模型，可添加自己的配置。') }}</p>
    </div>

    <TextModelPicker v-if="!readOnly && engineState !== 'loading'"
      :model-value="selectedId"
      :configs="configs"
      @update:model-value="handleSelect"
      @configs-updated="handleConfigsUpdated"
    />

    <p class="ai-settings-note" role="status" data-test="model-effective-line">
      <template v-if="engineState === 'up'">{{ tr('当前生效：{model}（所有链路共用）', { model: effectiveModel }) }}</template>
      <template v-else-if="engineState === 'down'">{{ tr(readOnly ? '模型服务暂不可用，请稍后重试。' : '模型运行器尚未启动，请检查本机配置。') }}</template>
      <template v-else>{{ tr('检测中…') }}</template>
    </p>
    <p v-if="applyMessage" class="ai-settings-note" role="alert" data-test="model-apply-message">{{ applyMessage }}</p>
    <p v-if="currentNote" class="ai-settings-note" role="status">{{ currentNote }}</p>
  </div>
</template>

<script setup>
import { tr } from '../../i18n/index.js'
import { computed, onMounted, ref } from 'vue'
import TextModelPicker from '../text/TextModelPicker.vue'
import {
  getSelectedTextProviderConfigId,
  getServerTextModel,
  listTextProviderConfigs,
  resolveSelectedTextProviderConfig,
  saveSelectedTextProviderConfigId,
  setServerTextModel
} from '../../services/textProviderConfigStore'

const readOnly = ref(false)
const selectedId = ref('')
const configs = ref([])
const engineState = ref('loading')
const effectiveModel = ref('')
const applying = ref(false)
const applyMessage = ref('')

const currentNote = computed(() => {
  if (readOnly.value) return ''
  const resolved = configs.value.find((config) => config.id === selectedId.value)
    || resolveSelectedTextProviderConfig()
  if (resolved?.builtin || !String(resolved?.apiKey || '').trim()) {
    const server = getServerTextModel()
    if (server) return `服务器模型由 pi-agent 内核持有（${server.model}），浏览器不接触密钥。`
    return tr('服务器模型由 pi-agent 内核持有；内核未运行时该选项不可用。')
  }
  return tr('当前使用「{name}」，模型 {model}。', { name: resolved?.name || tr('自定义配置'), model: resolved?.model || '—' })
})

/** 选择映射为 kit /model patch。服务器模型行由内核自持模型，永不推送 patch（否则会把内核模型改回硬编码）。 */
function modelPatchOf(config) {
  const resolved = config || resolveSelectedTextProviderConfig()
  if (!resolved) return { patch: null, reason: 'no-config' }
  const key = String(resolved.apiKey || '').trim()
  // 服务器模型行或空 Key 配置都是"内核拥有模型"：内核即为真源，不改写。
  if (resolved.builtin || !key) {
    return { patch: null, reason: 'server-owned' }
  }
  const baseUrl = String(resolved.baseUrl || '')
  const provider = String(resolved.providerId || resolved.provider || resolved.id || 'openai').replace(/[^a-zA-Z0-9_-]/g, '') || 'openai'
  if (!resolved.model || !baseUrl) return { patch: null, reason: 'incomplete' }
  // 协议轴：内核按 api 选传输。Anthropic 线（原生域或各家 /anthropic 兼容路径，以及显式选择 Anthropic 预设）
  // 走 pi-ai anthropic-messages，其余仍走 OpenAI 兼容线。
  const api = resolved.format === 'anthropic'
    || provider.toLowerCase() === 'anthropic'
    || /\/anthropic/i.test(baseUrl)
    || /api\.anthropic\.com/i.test(baseUrl)
    ? 'anthropic-messages'
    : 'openai-completions'
  return {
    patch: {
      provider,
      model: resolved.model,
      baseUrl,
      apiKey: resolved.apiKey,
      api
    }
  }
}

async function refreshEngine() {
  try {
    const response = await fetch('/api/storyagent/model')
    const body = await response.json().catch(() => null)
    readOnly.value = body?.readOnly === true
    if (response.ok && body?.ok) {
      engineState.value = 'up'
      effectiveModel.value = `${body.provider}.${body.model}`
      setServerTextModel({ provider: body.provider, model: body.model, baseUrl: body.baseUrl })
      configs.value = listTextProviderConfigs()
      return true
    }
    engineState.value = 'down'
    setServerTextModel(null)
    return false
  } catch {
    engineState.value = 'down'
    setServerTextModel(null)
    return false
  }
}

/** 选择即生效：把选中配置热切到 Agent 通路（所有链路共用）。服务器内置行为 no-op，内核保持自持模型。 */
async function applySelectedToEngine() {
  if (applying.value || readOnly.value) return
  const resolved = resolveSelectedTextProviderConfig()
  const { patch } = modelPatchOf(resolved)
  if (!patch) return
  applying.value = true
  applyMessage.value = ''
  try {
    const response = await fetch('/api/storyagent/model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    })
    const body = await response.json().catch(() => null)
    if (response.ok && body?.ok) {
      effectiveModel.value = body.model
    } else {
      applyMessage.value = body?.message || tr('应用失败，请检查 Agent 通路状态。')
    }
  } catch (error) {
    applyMessage.value = error?.message || tr('应用失败，请检查 Agent 通路状态。')
  } finally {
    applying.value = false
  }
}

onMounted(async () => {
  configs.value = listTextProviderConfigs()
  const resolved = resolveSelectedTextProviderConfig()
  selectedId.value = resolved.id
  if (getSelectedTextProviderConfigId() !== resolved.id) {
    saveSelectedTextProviderConfigId(resolved.id)
  }
  const up = await refreshEngine()
  // 只有自带 Key 的浏览器配置才需要把内核切过去；内置行为内核自持，不动。
  if (up) await applySelectedToEngine()
})

function handleSelect(id) {
  const changed = selectedId.value !== id
  selectedId.value = id
  saveSelectedTextProviderConfigId(id)
  if (changed) void applySelectedToEngine()
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
</style>
