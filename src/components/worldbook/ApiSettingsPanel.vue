<template>
  <div class="api-settings-panel">
    <div class="ai-settings-head">
      <strong>{{ tr('AI 文本模型') }}</strong>
      <p>{{ tr('所有链路（写作、讨论、审校、设定生成、推演）共用这一个模型——选择即生效。可添加自己的模型配置。') }}</p>
    </div>

    <TextModelPicker
      :model-value="selectedId"
      :configs="configs"
      @update:model-value="handleSelect"
      @configs-updated="handleConfigsUpdated"
    />

    <p class="ai-settings-note" role="status" data-test="model-effective-line">
      <template v-if="engineState === 'up'">{{ tr('当前生效：{model}（所有链路共用）', { model: effectiveModel }) }}</template>
      <template v-else-if="engineState === 'down'">{{ tr('Agent 通路未运行——启动 kit 任务面（serve:pinax）后此选择对所有链路生效。') }}</template>
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

const selectedId = ref('')
const configs = ref([])
const engineState = ref('loading')
const effectiveModel = ref('')
const applying = ref(false)
const applyMessage = ref('')

const currentNote = computed(() => {
  const resolved = configs.value.find((config) => config.id === selectedId.value)
    || resolveSelectedTextProviderConfig()
  if (resolved?.builtin || !String(resolved?.apiKey || '').trim()) {
    const server = getServerTextModel()
    if (server) return `服务器模型由 pi-agent 内核持有（${server.model}），浏览器不接触密钥。`
    return tr('内置服务器模型使用内核密钥；内核未运行时该选项不可用。')
  }
  return tr('当前使用「{name}」，模型 {model}。', { name: resolved?.name || tr('自定义配置'), model: resolved?.model || '—' })
})

/** 选择映射为 kit /model patch。服务器内置/无 Key 的配置由内核自持模型，永不推送 patch（否则会把内核模型改回硬编码）。 */
function modelPatchOf(config) {
  const resolved = config || resolveSelectedTextProviderConfig()
  if (!resolved) return { patch: null, reason: 'no-config' }
  const key = String(resolved.apiKey || '').trim()
  // 内置行或空 Key 配置都是"服务器拥有模型"：内核即为真源，不改写。
  if (resolved.builtin || !key || key === 'minimax-server-key') {
    return { patch: null, reason: 'server-owned' }
  }
  const baseUrl = String(resolved.baseUrl || '')
  // Anthropic 协议配置：kit 通路目前只讲 OpenAI 兼容线——保持该配置直连，不切 Agent 模型
  if (resolved.format === 'anthropic' || /\/anthropic/i.test(baseUrl)) {
    return { patch: null, reason: 'anthropic-protocol' }
  }
  const provider = String(resolved.providerId || resolved.provider || resolved.id || 'openai').replace(/[^a-zA-Z0-9_-]/g, '') || 'openai'
  if (!resolved.model || !baseUrl) return { patch: null, reason: 'incomplete' }
  return {
    patch: {
      provider,
      model: resolved.model,
      baseUrl,
      apiKey: resolved.apiKey
    }
  }
}

async function refreshEngine() {
  try {
    const response = await fetch('/api/storyagent/model')
    const body = await response.json().catch(() => null)
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
  if (applying.value) return
  const resolved = resolveSelectedTextProviderConfig()
  const { patch, reason } = modelPatchOf(resolved)
  if (!patch) {
    if (reason === 'anthropic-protocol') {
      applyMessage.value = tr('该配置为 Anthropic 协议：Agent 通路暂不支持，将按原直连方式使用。')
    }
    return
  }
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
