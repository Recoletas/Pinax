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

    <p class="ai-settings-note" role="status" data-test="agent-engine-note">
      <template v-if="agentEngine.state === 'up'">{{ tr('Agent 引擎（kit 任务面）：{model}', { model: agentEngine.model }) }}</template>
      <template v-else-if="agentEngine.state === 'down'">{{ tr('Agent 引擎未运行：写作与修改将回落原生链，启动 kit 任务面（serve:pinax）后可用。') }}</template>
    </p>
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
const agentEngine = ref({ state: 'loading', model: '' })

const currentNote = computed(() => {
  const resolved = configs.value.find((config) => config.id === selectedId.value)
    || resolveSelectedTextProviderConfig()
  if (resolved?.builtin) {
    return tr('当前使用内置 MiniMax：能否生成取决于部署服务器状态，可在模型详情中测试。')
  }
  return tr('当前使用「{name}」，模型 {model}。', { name: resolved?.name || tr('自定义配置'), model: resolved?.model || '—' })
})

onMounted(() => {
  configs.value = listTextProviderConfigs()
  const resolved = resolveSelectedTextProviderConfig()
  selectedId.value = resolved.id
  // 选中失效时收敛回内置, 保持 store 干净
  if (getSelectedTextProviderConfigId() !== resolved.id) {
    saveSelectedTextProviderConfigId(resolved.id)
  }
  // Agent 引擎状态（P5 统一模型口径的可见面）：kit 任务面 healthz，一次即止、失败静默降级
  fetch('/api/storyagent/healthz')
    .then((response) => (response.ok ? response.json() : null))
    .then((body) => {
      if (body?.ok && body?.model) agentEngine.value = { state: 'up', model: body.model }
      else agentEngine.value = { state: 'down', model: '' }
    })
    .catch(() => { agentEngine.value = { state: 'down', model: '' } })
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
</style>
