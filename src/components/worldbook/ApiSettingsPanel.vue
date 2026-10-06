<template>
  <div class="api-settings-panel">
    <div class="ai-settings-head">
      <strong>{{ tr('AI 文本模型') }}</strong>
      <p>{{ tr('选择经 Agent 通路服务的文本模型：所有链路（写作、讨论、审校、设定生成、推演）共用这一个模型。可添加自己的模型配置。') }}</p>
    </div>

    <TextModelPicker
      :model-value="selectedId"
      :configs="configs"
      @update:model-value="handleSelect"
      @configs-updated="handleConfigsUpdated"
    />

    <div class="agent-engine" data-test="agent-engine">
      <div class="agent-engine__head">
        <strong>{{ tr('Agent 引擎') }}</strong>
        <span v-if="engineState === 'up'" class="agent-engine__model" data-test="agent-engine-model">{{ engineModel }}</span>
        <span v-else-if="engineState === 'down'" class="agent-engine__down">{{ tr('未运行——启动 kit 任务面（serve:pinax）后所有链路经 Agent 通路') }}</span>
        <span v-else>{{ tr('检测中…') }}</span>
      </div>
      <p v-if="engineState === 'up' && syncState === 'mismatch'" class="ai-settings-note" role="status">
        {{ tr('Agent 引擎当前模型与所选配置不一致。') }}
        <button type="button" class="agent-engine__sync" data-test="agent-engine-sync" :disabled="syncing" @click="syncSelectedToEngine">{{ syncing ? tr('同步中…') : tr('同步到 Agent 通路') }}</button>
      </p>
      <p v-if="engineState === 'up' && syncState === 'synced'" class="ai-settings-note" role="status" data-test="agent-engine-synced">{{ tr('已与所选配置同步。') }}</p>
      <p v-if="engineMessage" role="status" data-test="agent-engine-message">{{ engineMessage }}</p>
    </div>

    <p v-if="currentNote" class="ai-settings-note" role="status">{{ currentNote }}</p>
  </div>
</template>

<script setup>
import { tr } from '../../i18n/index.js'
import { computed, onMounted, ref, watch } from 'vue'
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
const syncing = ref(false)
const syncState = ref('unknown') // unknown | synced | mismatch
const engineMessage = ref('')

const currentNote = computed(() => {
  const resolved = configs.value.find((config) => config.id === selectedId.value)
    || resolveSelectedTextProviderConfig()
  if (resolved?.builtin) {
    return tr('当前使用内置 MiniMax：能否生成取决于部署服务器状态，可在模型详情中测试。')
  }
  return tr('当前使用「{name}」，模型 {model}。', { name: resolved?.name || tr('自定义配置'), model: resolved?.model || '—' })
})

/** 所选配置映射为 kit /model patch。内置/服务器密钥配置不带 key（由服务器 env 注入）。 */
function modelPatchOf(config) {
  const resolved = config || resolveSelectedTextProviderConfig()
  if (!resolved) return null
  const baseUrl = String(resolved.baseUrl || '')
  const serverKeyed = !String(resolved.apiKey || '').trim() || resolved.apiKey === 'minimax-server-key'
  if (serverKeyed && /minimaxi?\.com/i.test(baseUrl)) {
    // 内置 MiniMax：走 OpenAI 兼容 v1 端点（kit 侧密钥由 env 注入）
    return { provider: 'minimax', model: resolved.model || 'MiniMax-Text-01', baseUrl: 'https://api.minimaxi.com/v1' }
  }
  const provider = String(resolved.providerId || resolved.provider || resolved.id || 'openai').replace(/[^a-zA-Z0-9_-]/g, '') || 'openai'
  return {
    provider,
    model: resolved.model || '',
    baseUrl,
    ...(resolved.apiKey ? { apiKey: resolved.apiKey } : {})
  }
}

function modelsDiffer(config) {
  const patch = modelPatchOf(config)
  if (!patch || !engineModel.value) return false
  const [engineProvider, ...rest] = engineModel.value.split('.')
  const engineName = rest.join('.')
  return patch.provider !== engineProvider || patch.model !== engineName
}

async function refreshEngine() {
  try {
    const response = await fetch('/api/storyagent/model')
    const body = await response.json().catch(() => null)
    if (response.ok && body?.ok) {
      engineState.value = 'up'
      engineModel.value = `${body.provider}.${body.model}`
    } else {
      engineState.value = 'down'
    }
  } catch {
    engineState.value = 'down'
  }
}

/** 把当前选中配置同步到 Agent 通路（/model 热切）。用户显式选择或点同步按钮时调用；挂载时不自动切模型。 */
async function syncSelectedToEngine() {
  if (syncing.value) return
  const resolved = resolveSelectedTextProviderConfig()
  const patch = modelPatchOf(resolved)
  if (!patch || !patch.model) return
  syncing.value = true
  engineMessage.value = ''
  try {
    const response = await fetch('/api/storyagent/model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    })
    const body = await response.json().catch(() => null)
    if (response.ok && body?.ok) {
      engineMessage.value = tr('已热生效：{model}', { model: body.model })
      await refreshEngine()
      syncState.value = 'synced'
    } else {
      engineMessage.value = body?.message || tr('同步失败，请检查 Agent 引擎状态。')
    }
  } catch (error) {
    engineMessage.value = error?.message || tr('同步失败，请检查 Agent 引擎状态。')
  } finally {
    syncing.value = false
  }
}

onMounted(() => {
  configs.value = listTextProviderConfigs()
  const resolved = resolveSelectedTextProviderConfig()
  selectedId.value = resolved.id
  if (getSelectedTextProviderConfigId() !== resolved.id) {
    saveSelectedTextProviderConfigId(resolved.id)
  }
  void refreshEngine().then(() => {
    syncState.value = engineState.value === 'up' && modelsDiffer(resolved) ? 'mismatch' : 'synced'
  })
})

function handleSelect(id) {
  const previous = selectedId.value
  selectedId.value = id
  saveSelectedTextProviderConfigId(id)
  // 用户显式换选 → 自动同步到 Agent 通路（统一模型：选什么，所有链路就用什么）
  if (id !== previous && engineState.value === 'up') {
    void syncSelectedToEngine()
  }
}

function handleConfigsUpdated(next) {
  configs.value = next
  const resolved = resolveSelectedTextProviderConfig()
  selectedId.value = resolved.id
}

watch(selectedId, () => {
  if (engineState.value === 'up') {
    syncState.value = modelsDiffer(resolveSelectedTextProviderConfig()) ? 'mismatch' : 'synced'
  }
})
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
  gap: 8px;
  padding: 10px 12px;
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

.agent-engine__sync {
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--archive-olive, var(--accent));
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--archive-olive, var(--accent));
  font: inherit;
  cursor: pointer;
}

.agent-engine__sync:disabled { opacity: 0.5; cursor: default; }
</style>
