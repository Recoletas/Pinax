<template>
  <div class="api-settings-panel">
    <div class="ai-settings-head">
      <strong>AI 文本模型</strong>
      <p>内置 MiniMax 开箱即用（密钥由服务器提供，不可编辑）。也可添加自己的模型配置，自定义配置可任意编辑、删除。</p>
    </div>

    <TextModelPicker
      :model-value="selectedId"
      :configs="configs"
      @update:model-value="handleSelect"
      @configs-updated="handleConfigsUpdated"
    />

    <p v-if="currentNote" class="ai-settings-note" role="status">{{ currentNote }}</p>
  </div>
</template>

<script setup>
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

const currentNote = computed(() => {
  const resolved = resolveSelectedTextProviderConfig()
  if (resolved?.builtin) {
    return '当前使用内置 MiniMax：密钥由服务器配置，开箱即用。'
  }
  return `当前使用「${resolved?.name || '自定义配置'}」，模型 ${resolved?.model || '—'}。`
})

onMounted(() => {
  configs.value = listTextProviderConfigs()
  const resolved = resolveSelectedTextProviderConfig()
  selectedId.value = resolved.id
  // 选中失效时收敛回内置, 保持 store 干净
  if (getSelectedTextProviderConfigId() !== resolved.id) {
    saveSelectedTextProviderConfigId(resolved.id)
  }
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
  gap: 12px;
}

.ai-settings-head {
  display: grid;
  gap: 4px;
}

.ai-settings-head strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.ai-settings-head p {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-secondary);
}

.ai-settings-note {
  margin: 0;
  padding: 8px 10px;
  border: 1px dashed color-mix(in srgb, var(--archive-gold, var(--accent)) 45%, var(--border));
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-paper-soft, var(--bg-tertiary)) 80%, transparent);
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary);
}
</style>
